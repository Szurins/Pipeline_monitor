# Stage 1: Build React App with Vite
FROM node:20-alpine AS build

WORKDIR /app

# Copy package config and lockfile
COPY package*.json ./
RUN npm ci

# Copy frontend source files
COPY . .

# Build application
RUN npm run build

# Stage 2: Serve React App with Nginx
FROM nginx:alpine

# Copy built assets to Nginx html directory
COPY --from=build /app/dist /usr/share/nginx/html

# Copy custom Nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

EXPOSE 80

CMD ["nginx", "-g", "daemon off;"]
