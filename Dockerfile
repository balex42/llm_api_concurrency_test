# Official Node 18 image (alpine for small size)
FROM node:18-alpine

# Create app directory
WORKDIR /app

# Copy package manifests and install dependencies first to leverage Docker cache
COPY package*.json ./

# Prefer npm ci when lockfile exists; fall back to npm install
RUN if [ -f package-lock.json ]; then npm ci --only=production; else npm install --only=production; fi

# Copy app source
COPY . .

# Set production environment
ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# Start the app
CMD ["node", "server.js"]
