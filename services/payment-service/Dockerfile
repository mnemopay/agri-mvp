FROM node:18-alpine

WORKDIR /app

# Copy shared library first
COPY shared/events /app/shared/events
RUN cd /app/shared/events && npm install

WORKDIR /app/services/payment-service
COPY services/payment-service/package*.json ./
RUN npm install --omit=dev

COPY services/payment-service .

EXPOSE 3004

CMD ["sh", "-c", "npm run migrate && npm start"]