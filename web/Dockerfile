FROM node:22-alpine AS build
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --no-audit --no-fund
COPY . .
# the browser talks to the data service directly, so its URL is baked in at build time
ARG NEXT_PUBLIC_DATA_URL=http://localhost:8000
ENV NEXT_PUBLIC_DATA_URL=$NEXT_PUBLIC_DATA_URL
RUN npm run build

FROM node:22-alpine
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app ./
USER node
EXPOSE 3000
CMD ["npm", "start"]
