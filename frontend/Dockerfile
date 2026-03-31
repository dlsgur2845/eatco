# Build stage
FROM node:22-alpine AS build

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run build

# Production stage
FROM nginx:alpine

# Generate self-signed certificate (as root, then hand off)
RUN apk add --no-cache openssl \
    && mkdir -p /etc/nginx/certs /var/cache/nginx /var/run \
    && openssl req -x509 -nodes -days 3650 \
       -subj "/CN=eatco.local" \
       -addext "subjectAltName=DNS:localhost,DNS:*.sslip.io,DNS:*.nip.io,IP:127.0.0.1,IP:192.168.0.9" \
       -newkey rsa:2048 \
       -keyout /etc/nginx/certs/key.pem \
       -out /etc/nginx/certs/cert.pem \
    && apk del openssl \
    # Prepare dirs for non-root nginx
    && chown -R nginx:nginx /etc/nginx/certs /var/cache/nginx /var/run /usr/share/nginx/html \
    && chmod -R 755 /etc/nginx/certs \
    # Allow nginx to write pid file
    && touch /var/run/nginx.pid && chown nginx:nginx /var/run/nginx.pid

# Remove default config that listens on port 80
RUN rm /etc/nginx/conf.d/default.conf

COPY --from=build --chown=nginx:nginx /app/dist /usr/share/nginx/html
COPY --chown=nginx:nginx nginx/default.conf /etc/nginx/conf.d/default.conf

USER nginx

EXPOSE 8443 8080
CMD ["nginx", "-g", "daemon off;"]
