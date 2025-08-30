# VideoMela Backend - Docker Deployment Guide

This guide will help you containerize and deploy the VideoMela backend application using Docker.

## Prerequisites

- Docker installed on your system
- Docker Hub account (for pushing images)
- Node.js 18+ (for local development)

## Quick Start

### 1. Environment Setup

Copy the example environment file and configure your variables:

```bash
cp .env.example .env
```

Edit `.env` with your actual configuration values:

- `MONGODB_URI`: Your MongoDB connection string
- `ACCESS_TOKEN_SECRET`: JWT access token secret
- `REFRESH_TOKEN_SECRET`: JWT refresh token secret
- `CLOUDINARY_*`: Your Cloudinary credentials
- `COOKIE_ORG`: Your frontend URL for CORS

### 2. Build and Run with Docker Compose

```bash
# Build and start the application
docker-compose up --build

# Run in detached mode
docker-compose up -d --build

# Stop the application
docker-compose down
```

### 3. Build Docker Image Manually

```bash
# Build the image
docker build -t videomela-backend .

# Run the container
docker run -d -p 8000:8000 --env-file .env videomela-backend
```

## Docker Hub Deployment

### Method 1: Using Deployment Scripts

**For Linux/Mac:**
```bash
# Make the script executable
chmod +x docker-deploy.sh

# Edit the script to set your Docker Hub username
# Then run:
./docker-deploy.sh
```

**For Windows (PowerShell):**
```powershell
# Edit docker-deploy.ps1 to set your Docker Hub username
# Then run:
.\docker-deploy.ps1
```

### Method 2: Manual Docker Hub Push

```bash
# Login to Docker Hub
docker login

# Build the image
docker build -t videomela-backend .

# Tag for Docker Hub (replace 'yourusername' with your Docker Hub username)
docker tag videomela-backend yourusername/videomela-backend:latest

# Push to Docker Hub
docker push yourusername/videomela-backend:latest
```

## Production Deployment

### Using Docker Compose in Production

1. Create a production `docker-compose.prod.yml`:

```yaml
version: '3.8'
services:
  videomela-backend:
    image: yourusername/videomela-backend:latest
    ports:
      - "8000:8000"
    environment:
      - NODE_ENV=production
    env_file:
      - .env
    restart: unless-stopped
```

2. Deploy:

```bash
docker-compose -f docker-compose.prod.yml up -d
```

### Environment Variables for Production

Ensure these environment variables are set:

```bash
PORT=8000
NODE_ENV=production
MONGODB_URI=your_mongodb_connection_string
ACCESS_TOKEN_SECRET=your_strong_secret
REFRESH_TOKEN_SECRET=your_strong_secret
CLOUDINARY_CLOUD_NAME=your_cloudinary_name
CLOUDINARY_API_KEY=your_api_key
CLOUDINARY_API_SECRET=your_api_secret
COOKIE_ORG=https://yourdomain.com
```

## Docker Image Details

- **Base Image**: `node:18-alpine`
- **Working Directory**: `/app`
- **Exposed Port**: `8000`
- **User**: Non-root user `videomela`
- **Health Check**: Built-in via `/api/v1/healthcheck`

## Troubleshooting

### Common Issues

1. **Port already in use**:
   ```bash
   # Check what's using port 8000
   lsof -i :8000
   # Kill the process or use a different port
   ```

2. **Environment variables not loading**:
   - Ensure `.env` file exists and has correct format
   - Check file permissions
   - Verify environment variable names match exactly

3. **MongoDB connection issues**:
   - Verify MongoDB URI format
   - Check network connectivity
   - Ensure MongoDB allows connections from Docker containers

### Logs and Debugging

```bash
# View container logs
docker logs videomela-backend

# Follow logs in real-time
docker logs -f videomela-backend

# Execute commands inside container
docker exec -it videomela-backend sh
```

## Security Considerations

- Never commit `.env` files to version control
- Use strong, unique secrets for JWT tokens
- Regularly update base images for security patches
- Use Docker secrets in production environments
- Implement proper network security and firewalls

## Performance Optimization

- Use multi-stage builds for smaller images
- Implement proper caching strategies
- Use `.dockerignore` to exclude unnecessary files
- Consider using Alpine Linux for smaller image size
- Implement health checks for better container orchestration

## Support

For issues related to:
- Docker setup: Check Docker documentation
- Application errors: Check application logs
- Environment configuration: Verify `.env` file
- Database connectivity: Check MongoDB Atlas/local setup