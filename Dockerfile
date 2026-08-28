# Stage 1: build the React frontend
FROM node:22-alpine AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN VITE_API_URL="" npm run build

# Stage 2: run the backend and serve the built frontend
FROM node:22-alpine
WORKDIR /app/backend
COPY backend/package*.json ./
RUN npm ci --omit=dev
COPY backend/ .
COPY --from=frontend /app/dist /app/dist

RUN mkdir -p data

ENV PORT=3001
ENV DB_PATH=./data/finance.db

EXPOSE 3001
CMD ["node", "index.js"]
