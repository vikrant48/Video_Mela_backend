# Use the official Node.js runtime as the base image (Node 22 LTS; Node 18 is end-of-life)
FROM node:22-alpine

# Set the working directory in the container
WORKDIR /app

# Copy package.json and package-lock.json (if available)
COPY package*.json ./

# Install production dependencies exactly as locked (--only=production is deprecated)
RUN npm ci --omit=dev

# Copy the rest of the application code
COPY . .

# Create a non-root user to run the application
RUN addgroup -g 1001 -S nodejs
RUN adduser -S videomela -u 1001

# Change ownership of the app directory to the nodejs user
RUN chown -R videomela:nodejs /app
USER videomela

# Expose the port the app runs on
EXPOSE 8000

# Define the command to run the application. node runs as PID 1 (no npm wrapper), so it receives
# SIGTERM directly and server.js shuts down gracefully on deploys/restarts.
CMD ["node", "server.js"]