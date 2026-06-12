#!/usr/bin/env bash
set -e

# Load .env if it exists
if [ -f .env ]; then
  export $(grep -v '^#' .env | xargs)
fi

if [ -z "$DEPLOY_TARGET" ]; then
  echo "Error: DEPLOY_TARGET is not set in .env"
  exit 1
fi

VERSION=$(node -p "require('./package.json').version")

# Prompt for the sudo password interactively (does not echo to screen, does not save to disk)
echo "Please enter the sudo password for $DEPLOY_TARGET:"
read -s SUDO_PASS
echo ""

echo "Streaming raindrop:$VERSION to $DEPLOY_TARGET..."
{ echo "$SUDO_PASS"; docker save raindrop:$VERSION; } | ssh "$DEPLOY_TARGET" 'sudo -S docker load'
echo "Done. Please restart the container via TrueNAS Web UI."
