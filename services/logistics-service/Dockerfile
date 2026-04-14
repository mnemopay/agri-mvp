FROM node:18-alpine

WORKDIR /app

# Copy shared library first
COPY shared/events /app/shared/events

RUN cd /app/shared/events && npm install

WORKDIR /app/services/logistics-service
COPY services/logistics-service/package*.json ./
RUN npm install --omit=dev

COPY services/logistics-service .

EXPOSE 3003

CMD ["sh", "-c", "npm run migrate && npm start"]
