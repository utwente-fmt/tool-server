const MAX_FILE_NAME_LENGTH = 64;
const MAX_PATH_DEPTH = 6;
const FILE_PATTERN = /[a-zA-Z0-9_-]+(\.[a-zA-Z0-9_-]+)?/;

function require(condition, errorMessage) {
  if(!condition) {
    throw Error(errorMessage);
  }
}

function requireBool(x) {
  require(typeof x === 'boolean', 'not a bool');
  return x;
}

function requireNum(x) {
  require(typeof x === 'number', 'not a number');
  return x;
}

function requireStr(x) {
  require(typeof x === 'string', 'not a string');
  return x;
}

function requireObj(x) {
  require(typeof x === 'object', 'not an object');
  return x;
}

function requireAttr(obj, attr) {
  requireObj(obj);
  require(obj[attr] !== undefined, 'object does not have attribute');
  return obj[attr];
}

function requireList(x) {
  require(Array.isArray(x), 'not a list');
  return x;
}

function requireIdx(list, idx) {
  requireList(list);
  require(list[idx] !== undefined, 'list does not have index');
  return list[idx];
}

function requirePath(path, files, rootPath) {
  require(path.length < (MAX_FILE_NAME_LENGTH + 1) * MAX_PATH_DEPTH, 'path too long');
  let parts = path.split('/');
  require(parts.length <= MAX_PATH_DEPTH, 'path too deep');
  for(let part of parts) {
    require(FILE_PATTERN.test(part), 'invalid file name');
    files = requireAttr(files, part);
  }

  return rootPath + '/' + path;
}

module.exports = {
  require: require,
  requireBool: requireBool,
  requireNum: requireNum,
  requireStr: requireStr,
  requireObj: requireObj,
  requireAttr: requireAttr,
  requireList: requireList,
  requireIdx: requireIdx,
  requirePath: requirePath,
  MAX_FILE_NAME_LENGTH: MAX_FILE_NAME_LENGTH,
  MAX_PATH_DEPTH: MAX_PATH_DEPTH,
  FILE_PATTERN: FILE_PATTERN,
};
