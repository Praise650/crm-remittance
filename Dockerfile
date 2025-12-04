# Use the official Node.js runtime as the base image
# Use Alpine for a smaller image size
FROM node:20-alpine AS base

# Install Doppler CLI for secrets injection
RUN wget -q -t3 'https://packages.doppler.com/public/cli/rsa.8004D9FF50437357.key' -O /etc/apk/keys/cli@doppler-8004D9FF50437357.rsa.pub && \
    echo 'https://packages.doppler.com/public/cli/alpine/any-version/main' | tee -a /etc/apk/repositories && \
    apk add --no-cache doppler

# Set the working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Expose the port your app runs on (adjust if needed, e.g., 3000)
# EXPOSE 3000

# Expose port (if needed)
EXPOSE 5000

# Use Doppler to run the app with secrets injected
# Assumes your package.json has a "start" script (e.g., "node server.js")
# For Dokploy deployment, set DOPPLER_TOKEN as an environment variable in your Dokploy project
CMD ["doppler", "run", "--token", "$DOPPLER_TOKEN", "--", "npm", "start"]