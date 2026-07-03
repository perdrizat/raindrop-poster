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

# Approximate transfer size so the dd progress counter below can be eyeballed
# against a known total (dd can't show % — it doesn't know the stream length).
SIZE_MB=$(( $(docker image inspect raindrop-poster:latest --format '{{.Size}}') / 1000000 ))

echo "Streaming raindrop-poster:$VERSION and raindrop-poster:latest (~${SIZE_MB} MB) to $DEPLOY_TARGET."
echo "(docker save needs ~10s before the transfer counter appears)"
# dd status=progress gives a live bytes/throughput line (coreutils, stock Ubuntu).
# sudo -S -p '' suppresses the remote '[sudo] password' text, which otherwise looks
# like a pending prompt and tempts users to type their password into the open TTY.
{ echo "$SUDO_PASS"; docker save raindrop-poster:$VERSION raindrop-poster:latest; } \
  | dd bs=4M status=progress \
  | ssh "$DEPLOY_TARGET" "sudo -S -p '' docker load"
echo ""

# A running container is pinned to an image ID, not a tag — loading a new :latest
# is not enough, the app must be redeployed (recreated) to adopt it. TrueNAS
# exposes that as the middleware call app.redeploy.
APP_NAME="${DEPLOY_APP_NAME:-raindrop-poster}"
echo "Redeploying app '$APP_NAME' on $DEPLOY_TARGET…"
if { echo "$SUDO_PASS"; } | ssh "$DEPLOY_TARGET" "sudo -S -p '' midclt call app.redeploy $APP_NAME" >/dev/null; then
  echo "Done. App redeployed with the new image."
else
  echo "Redeploy call failed — recreate manually: TrueNAS UI → Apps → $APP_NAME → Edit → Save."
fi
