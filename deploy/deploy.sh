#!/usr/bin/env bash
# Build and publish to /var/www/matthews.help/na (run on the server, or adjust DEST for rsync).
set -euo pipefail
cd "$(dirname "$0")/.."
DEST="${DEST:-/var/www/matthews.help/na}"

npm ci --no-audit --no-fund
npx ng build --configuration production   # baseHref /na/ is set in angular.json

mkdir -p "$DEST"
rsync -a --delete dist/tsml-ang/browser/ "$DEST/"
# AlmaLinux / SELinux: make sure nginx can read the files
command -v restorecon >/dev/null && restorecon -R "$DEST" || true
echo "Deployed to $DEST"
