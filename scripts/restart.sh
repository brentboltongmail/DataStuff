#!/usr/bin/env bash
set -e

echo "🛑 Stopping any running DataStuff instances..."
pkill -f "DataStuff" 2>/dev/null || true
pkill -f "electron .*dist-electron/main.js" 2>/dev/null || true

echo "🔍 Checking process status..."
for i in {1..20}; do
  PIDS=$(pgrep -f "DataStuff" | grep -v "$$" || true)
  if [ -z "$PIDS" ]; then
    echo "✅ DataStuff is fully stopped."
    break
  fi
  if [ $i -ge 8 ]; then
    echo "⚠️ Force killing lingering processes..."
    echo "$PIDS" | xargs kill -9 2>/dev/null || true
  fi
  sleep 0.2
done

echo "🚀 Starting DataStuff..."
npm run build
npx electron . &
