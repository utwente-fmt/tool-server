const PORT = 1234;

const util = require('./util');
const WSServer = require('websocket').server;
const http = require('http');
const fs = require('fs');
const uuid = require('uuid/v1');
const child_process = require('child_process');

let tool;
try {
  tool = require('./tool');
} catch(e) {
  console.log('Could not find tool definition.');
  console.log(e);
  process.exit(1);
}

const server = http.createServer((req, res) => {
  res.statusCode = 404;
  res.end();
});

server.listen(PORT, () => {
  console.log(`Server is listening on port ${PORT}`);
});

const wsServer = new WSServer({
  httpServer: server,
  maxReceivedFrameSize: 10 * 1024 * 1024,
  maxReceivedMessageSize: 10 * 1024 * 1024,
  autoAcceptConnections: false
});

wsServer.on('request', (req) => {
  let haveProtocol = false;
  for(let protocol of req.requestedProtocols) {
    if(protocol === 'fmt-tool') haveProtocol = true;
  }

  if(!haveProtocol) {
    req.reject(412, 'invalid protocol');
    return;
  }

  const conn = req.accept('fmt-tool', req.origin);

  conn.on('message', function(rawMessage) {
    if(rawMessage.type !== 'utf8') {
      conn.sendUTF(JSON.stringify({'type': 'error', 'errorDescription': 'can only accept text messages'}));
      return;
    }

    let message;

    try {
      message = JSON.parse(rawMessage.utf8Data);
    } catch(e) {
      conn.sendUTF(JSON.stringify({'type': 'error', 'errorDescription': 'message must be valid JSON'}));
      return;
    }

    if(message.type === undefined) {
      conn.sendUTF(JSON.stringify({'type': 'error', 'errorDescription': 'message must include a type'}));
      return;
    }

    switch(message.type) {
      case 'submit':
        submit(conn, message);
        break;
      default:
        conn.sendUTF(JSON.stringify({'type': 'error', 'errorDescription': 'message type not recognized'}));
    }

    if(rawMessage.type === 'utf8') {
      try {
        const message = JSON.parse(rawMessage.utf8Data);
        if(message.type === undefined) return;

        switch(message.type) {
          case 'submit':
            if(message.data === undefined) return;
            if(message.lang === undefined || LANGUAGES[message.lang] === undefined) return;
            submit(conn, message.lang, message.data);
            break;
        }
      } catch(e) {
        console.log(e);
      }
    }
  });
});

function validateFiles(files, depth) {
  if(depth == util.MAX_PATH_DEPTH) {
    return `file structure too nested: max depth is ${util.MAX_PATH_DEPTH}`;
  }
  if(typeof files === 'string') {
    if(files.length > util.MAX_FILE_NAME_LENGTH) {
      return 'filenames may not be longer than 64 characters';
    }

    if(!util.FILE_PATTERN.test(files)) {
      return 'Filenames may only contain letters, numbers, - and _. They must have a non-empty extension or no extension.';
    }
  } else if(typeof files === 'object') {
    for(let [name, child] of Object.entries(files)) {
      if(!util.FILE_PATTERN.test(name)) {
        return 'Directories may only contain letters, numbers, - and _.';
      }

      let err = validateFiles(child, depth+1);

      if(err) {
        return err;
      }
    }
  } else {
    return 'Invalid file structure';
  }
}

function storeFilesSync(path, files) {
  if(typeof files === 'string') {
    fs.writeFileSync(path, files);
  } else {
    fs.mkdirSync(path);

    for(let [name, child] of Object.entries(files)) {
      storeFilesSync(path + '/' + name, child);
    }
  }
}

function deleteFilesSync(path, files) {
  if(typeof files === 'string') {
    fs.unlinkSync(path);
  } else {
    for(let [name, child] of Object.entries(files)) {
      deleteFilesSync(path + '/' + name, child);
    }

    fs.rmdirSync(path);
  }
}

function submit(conn, message) {
  if(message.files === undefined) {
    conn.sendUTF(JSON.stringify({'type': 'error', 'errorDescription': 'files attribute not present'}));
    return;
  }
  if(message.arguments === undefined) {
    conn.sendUTF(JSON.stringify({'type': 'error', 'errorDescription': 'arguments attribute not present'}));
    return;
  }

  const files = message.files;
  const arguments = message.arguments;

  let err = validateFiles(files, 0);
  if(err) {
    conn.sendUTF(JSON.stringify({'type': 'error', 'errorDescription': err}));
    return;
  }

  const id = uuid();
  const path = '/tmp/' + id;
  try {
    storeFilesSync(path, files);
  } catch(e) {
    conn.sendUTF(JSON.stringify({'type': 'error', 'errorDescription': 'I/O error'}));
    return;
  }

  let procDef;
  try {
    procDef = tool.getProcess(arguments, path, files);
  } catch(e) {
    conn.sendUTF(JSON.stringify({'type': 'error', 'errorDescription': e.message}));
    return;
  }

  conn.sendUTF(JSON.stringify({'type': 'accept', 'id': id}));

  procDef.options.detached = true;

  let p;
  try {
    p = child_process.spawn(procDef.command, procDef.args, procDef.options);
  } catch(e) {
    conn.sendUTF(JSON.stringify({'type': 'error', 'errorDescription': e.message}));
  }

  p.stdout.on('data', (data) => {
    conn.sendUTF(JSON.stringify({'type': 'stdout', 'id': id, 'data': data.toString()}));
  });

  p.stderr.on('data', (data) => {
    conn.sendUTF(JSON.stringify({'type': 'stderr', 'id': id, 'data': data.toString()}));
  });

  p.on('close', (code) => {
    conn.sendUTF(JSON.stringify({'type': 'finished', 'id': id, 'error': false, 'exitCode': code}));
    deleteFilesSync(path, files);
  });
}
