#!/bin/sh
set -e

# Fix ownership of the data volume on first run.
# When Docker creates a new named volume, the mount point is owned by root.
# The app runs as node (uid 1000) and needs write access.
DATA_DIR="/app/server/data"
if [ -d "$DATA_DIR" ]; then
  OWNER=$(stat -c '%u' "$DATA_DIR" 2>/dev/null || stat -f '%u' "$DATA_DIR" 2>/dev/null)
  if [ "$OWNER" != "1000" ]; then
    chown -R node:node "$DATA_DIR"
  fi
fi

# Drop privileges and run the application
exec runuser -u node -- "$@"
