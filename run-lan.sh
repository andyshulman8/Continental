#!/bin/bash
# Serve Continental v2 on the LAN (0.0.0.0:5190). Foreground.
cd "$(dirname "$0")" || exit 1
IP=$(ipconfig getifaddr en0 2>/dev/null || ipconfig getifaddr en1 2>/dev/null)
echo "Continental on http://${IP:-localhost}:5190/"
exec node web2/server/server.js
