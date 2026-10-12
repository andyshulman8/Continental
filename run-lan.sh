#!/bin/bash
# Serve the Continental web client on the LAN (0.0.0.0:5190). Foreground.
cd "$(dirname "$0")/web" || exit 1
echo "Continental on http://$(ipconfig getifaddr en1):5190/"
exec python3 -m http.server 5190 --bind 0.0.0.0
