#!/usr/bin/env bash
set -euo pipefail

APP_NAME="photo-server"
APP_DIR="/var/www/photo-server"
REMOTE="origin"
BRANCH="main"

cd "$APP_DIR"

# Avoid "dubious ownership" errors in /var/www
git config --global --add safe.directory "$APP_DIR" >/dev/null 2>&1 || true

echo "==> Stopping $APP_NAME (if running)..."
pm2 stop "$APP_NAME" >/dev/null 2>&1 || true

echo "==> Flushing PM2 logs..."
pm2 flush >/dev/null 2>&1 || true

# Ensure remote exists
if ! git remote get-url "$REMOTE" >/dev/null 2>&1; then
  git remote add "$REMOTE" "git@github.com:fasbitX/photo-server.git"
fi

OLD_REV="$(git rev-parse HEAD)"

# Auto-stash uncommitted/untracked local edits so they survive the pull
STASHED=0
if [[ -n "$(git status --porcelain)" ]]; then
  echo "==> Local changes detected; stashing them temporarily..."
  git stash push -u -m "auto-stash before pull $(date -Is)"
  STASHED=1
fi

echo "==> Pulling latest from $REMOTE/$BRANCH..."
# Use rebase to avoid merge commits on the server
git pull --rebase "$REMOTE" "$BRANCH"

# Restore local edits
if [[ "$STASHED" -eq 1 ]]; then
  echo "==> Restoring stashed local changes..."
  set +e
  git stash pop
  POP_RC=$?
  set -e
  if [[ "$POP_RC" -ne 0 ]]; then
    echo "!! Stash pop had conflicts. Resolve them, then run:"
    echo "   cd $APP_DIR && git status"
    echo "   (after resolving) pm2 restart $APP_NAME --update-env"
    exit 1
  fi
fi

NEW_REV="$(git rev-parse HEAD)"

# Optional: reinstall deps only if package files changed
if git diff --name-only "$OLD_REV..$NEW_REV" | grep -Eq '^(package.json|package-lock.json)$'; then
  echo "==> package.json/package-lock.json changed; installing production deps..."
  rm -rf node_modules
  npm ci --omit=dev || npm install --omit=dev
fi

echo "==> Starting via ecosystem..."
if pm2 describe "$APP_NAME" >/dev/null 2>&1; then
  pm2 restart "$APP_NAME" --update-env
else
  pm2 start ecosystem.config.js --only "$APP_NAME"
fi

pm2 save >/dev/null 2>&1 || true

echo "==> PM2 status:"
pm2 status

echo "==> Last 50 log lines:"
pm2 logs "$APP_NAME" --lines 50 
