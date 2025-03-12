FROM node:23
COPY package.json ./
RUN npm install
COPY server.js util.js ./
CMD ["npm", "start"]
