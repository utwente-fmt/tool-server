FROM node:12
COPY package.json ./
RUN npm install
COPY server.js util.js ./
CMD ["npm", "start"]
