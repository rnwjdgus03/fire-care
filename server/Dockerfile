FROM node:22-bookworm-slim

WORKDIR /app
ENV NODE_ENV=production

COPY package*.json ./
RUN npm ci

COPY tsconfig.json ./
COPY src ./src
COPY sql ./sql

EXPOSE 4000
CMD ["npm", "run", "start"]
