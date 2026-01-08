#!/bin/bash

# Script để build và deploy Docker container trên GCP VM
# Usage: ./deploy-gcp.sh

set -e

echo "=========================================="
echo "Building Docker image for GCP VM"
echo "=========================================="

# Build Docker image
docker build -t telegram-content-bot:latest .

echo ""
echo "=========================================="
echo "Build completed successfully!"
echo "=========================================="
echo ""
echo "To run the container, use one of these options:"
echo ""
echo "Option 1: Using docker run"
echo "  docker run -d \\"
echo "    --name telegram-bot \\"
echo "    --restart unless-stopped \\"
echo "    -p 3333:3333 \\"
echo "    -v \$(pwd)/config.json:/app/config.json:ro \\"
echo "    telegram-content-bot:latest"
echo ""
echo "Option 2: Using docker-compose"
echo "  docker-compose up -d"
echo ""
echo "Option 3: Stop and remove old container, then start new one"
echo "  docker stop telegram-bot 2>/dev/null || true"
echo "  docker rm telegram-bot 2>/dev/null || true"
echo "  docker run -d \\"
echo "    --name telegram-bot \\"
echo "    --restart unless-stopped \\"
echo "    -p 3333:3333 \\"
echo "    -v \$(pwd)/config.json:/app/config.json:ro \\"
echo "    telegram-content-bot:latest"
echo ""
echo "To view logs:"
echo "  docker logs -f telegram-bot"
echo ""
echo "To stop the container:"
echo "  docker stop telegram-bot"
echo ""
