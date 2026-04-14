FROM node:18-alpine

WORKDIR /app

# Copy shared library first
COPY shared/events /app/shared/events

RUN cd /app/shared/events && npm install

WORKDIR /app/services/marketplace-service
COPY services/marketplace-service/package*.json ./
RUN npm install --omit=dev

COPY services/marketplace-service .

EXPOSE 3001

CMD ["sh", "-c", "npm run migrate && npm start"]
