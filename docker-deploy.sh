#!/bin/bash

# Docker deployment script for VideoMela Backend
# Make sure you're logged in to Docker Hub: docker login

# Set your Docker Hub username
DOCKER_USERNAME="vikrant48"
IMAGE_NAME="videomela-backend"
TAG="latest"

# Build the Docker image
echo "Building Docker image..."
docker build -t $IMAGE_NAME:$TAG .

# Tag the image for Docker Hub
echo "Tagging image for Docker Hub..."
docker tag $IMAGE_NAME:$TAG $DOCKER_USERNAME/$IMAGE_NAME:$TAG

# Push to Docker Hub
echo "Pushing to Docker Hub..."
docker push $DOCKER_USERNAME/$IMAGE_NAME:$TAG

echo "Deployment complete!"
echo "Your image is available at: $DOCKER_USERNAME/$IMAGE_NAME:$TAG"

# Optional: Run the container locally for testing
# echo "Starting container locally for testing..."
# docker run -d -p 8000:8000 --name videomela-backend-test $DOCKER_USERNAME/$IMAGE_NAME:$TAG