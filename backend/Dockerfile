FROM node:20-bullseye-slim

WORKDIR /app

COPY package*.json ./
COPY prisma ./prisma
RUN apt-get update && apt-get install -y openssl && rm -rf /var/lib/apt/lists/* && npm install

COPY . .

EXPOSE 8080

CMD ["sh", "-c", "npm run prisma:generate && npx prisma db push --accept-data-loss && npm run db:seed && npm run dev"]
