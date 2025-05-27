#!/bin/bash

# XLN Docker Build Script
set -e

echo "=== XLN Docker Build Script ==="

# Configuration
IMAGE_NAME="xln-node"
VERSION="${VERSION:-1.0.0}"
DOCKERFILE="${DOCKERFILE:-Dockerfile}"
BUILD_CONTEXT="${BUILD_CONTEXT:-.}"

# Parse command line arguments
PUSH=false
LATEST=false
FORCE_REBUILD=false

while [[ $# -gt 0 ]]; do
    case $1 in
        --push)
            PUSH=true
            shift
            ;;
        --latest)
            LATEST=true
            shift
            ;;
        --force-rebuild)
            FORCE_REBUILD=true
            shift
            ;;
        --version)
            VERSION="$2"
            shift 2
            ;;
        --image-name)
            IMAGE_NAME="$2"
            shift 2
            ;;
        -h|--help)
            echo "Usage: $0 [OPTIONS]"
            echo "Options:"
            echo "  --push              Push image to registry after build"
            echo "  --latest            Tag image as latest"
            echo "  --force-rebuild     Force rebuild without cache"
            echo "  --version VERSION   Set version tag (default: 1.0.0)"
            echo "  --image-name NAME   Set image name (default: xln-node)"
            echo "  -h, --help          Show this help message"
            exit 0
            ;;
        *)
            echo "Unknown option: $1"
            exit 1
            ;;
    esac
done

# Validate Docker is available
if ! command -v docker &> /dev/null; then
    echo "Error: Docker is not installed or not in PATH"
    exit 1
fi

# Build arguments
BUILD_ARGS=""
if [ "$FORCE_REBUILD" = true ]; then
    BUILD_ARGS="--no-cache"
fi

echo "Building Docker image..."
echo "  Image: $IMAGE_NAME"
echo "  Version: $VERSION"
echo "  Dockerfile: $DOCKERFILE"
echo "  Context: $BUILD_CONTEXT"

# Build the image
echo "Running: docker build $BUILD_ARGS -t $IMAGE_NAME:$VERSION -f $DOCKERFILE $BUILD_CONTEXT"
docker build $BUILD_ARGS -t "$IMAGE_NAME:$VERSION" -f "$DOCKERFILE" "$BUILD_CONTEXT"

# Tag as latest if requested
if [ "$LATEST" = true ]; then
    echo "Tagging as latest..."
    docker tag "$IMAGE_NAME:$VERSION" "$IMAGE_NAME:latest"
fi

# Push to registry if requested
if [ "$PUSH" = true ]; then
    echo "Pushing to registry..."
    docker push "$IMAGE_NAME:$VERSION"
    
    if [ "$LATEST" = true ]; then
        docker push "$IMAGE_NAME:latest"
    fi
fi

echo "Build completed successfully!"
echo "Image: $IMAGE_NAME:$VERSION"

# Show image size
echo "Image size:"
docker images "$IMAGE_NAME:$VERSION" --format "table {{.Repository}}\t{{.Tag}}\t{{.Size}}"