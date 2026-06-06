# Auto DCA — multi-stage: build the static site, serve it with nginx.
FROM node:22-alpine AS build
WORKDIR /src
COPY . .
RUN npm ci && npm run build   # build:engine + vite build -> app/dist

FROM nginx:alpine
COPY --from=build /src/app/dist /usr/share/nginx/html
COPY deploy/nginx.conf /etc/nginx/conf.d/default.conf
EXPOSE 80
