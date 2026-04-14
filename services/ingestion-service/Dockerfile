FROM node:18-alpine

WORKDIR /app

# Copy shared library first
COPY shared/events /app/shared/events

RUN cd /app/shared/events && npm install

WORKDIR /app/services/ingestion-service
COPY services/ingestion-service/package*.json ./
RUN npm install --omit=dev

COPY services/ingestion-service .

EXPOSE 3002

CMD ["npm", "start"]
