#!/bin/bash
# Double-click this file to start Buddha Station.
# Keep the window it opens running while you use the station; close it to stop.

cd "$(dirname "$0")" || exit 1

pause() { read -r -p "Press Return to close this window. " _; }

if ! command -v node >/dev/null 2>&1; then
  echo "Buddha Station needs Node.js 22 or newer."
  echo "Get the LTS installer from https://nodejs.org, run it, then double-click this file again."
  pause
  exit 1
fi

major=$(node -p 'process.versions.node.split(".")[0]')
if [ "$major" -lt 22 ]; then
  echo "You have Node.js $(node -v). Buddha Station needs version 22 or newer."
  echo "Get the LTS installer from https://nodejs.org, run it, then try again."
  pause
  exit 1
fi

if [ ! -d node_modules/@anthropic-ai/sdk ]; then
  echo "First run: installing Anthropic's official library (the only one the station uses)..."
  # --ignore-scripts: nothing in the download gets to run install scripts.
  if ! npm ci --ignore-scripts --no-audit --no-fund; then
    echo "The install didn't work. Check your internet connection and try again."
    pause
    exit 1
  fi
fi

node src/main.js
status=$?
if [ "$status" -ne 0 ]; then pause; fi
exit "$status"
