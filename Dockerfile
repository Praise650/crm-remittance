# Use your app's base image
FROM node:20-alpine AS base

# Install Doppler CLI (works on Debian/Ubuntu/Alpine; adjust for other distros)
RUN apk add --no-cache curl gnupg && \
    curl -sLf --retry 3 --tlsv1.2 --proto "=https" \
      'https://packages.doppler.com/public/cli/gpg.DE2A7741A397C129.key' | \
      gpg --dearmor -o /usr/share/keyrings/doppler-archive-keyring.gpg && \
    echo "deb [signed-by=/usr/share/keyrings/doppler-archive-keyring.gpg] \
          https://packages.doppler.com/public/cli/deb/debian any-version main" \
          | tee /etc/apt/sources.list.d/doppler-cli.list > /dev/null && \
    apk add --no-cache doppler

# Copy your app code
WORKDIR /app
COPY . .

# Install dependencies (example for Node)
RUN npm ci --only=production

# Expose port (if needed)
EXPOSE 5000

# Start with Doppler: Fetches secrets and runs your app
CMD ["doppler", "run", "--token", "$DOPPLER_TOKEN", "--", "npm", "start"]