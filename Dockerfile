# Stage 1: build the React frontend
FROM node:22-alpine AS frontend
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
ARG VITE_GOOGLE_CLIENT_ID
RUN VITE_API_URL="" VITE_GOOGLE_CLIENT_ID=$VITE_GOOGLE_CLIENT_ID npm run build

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
