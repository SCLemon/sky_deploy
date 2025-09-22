#!/bin/bash

# 啟動 https.js
echo "Starting https.js..."
nohup node ./https.js > ./logs/https.log 2>&1 &

# 啟動 backend/index.js
echo "Starting backend/index.js..."
nohup node ./backend/index.js > ./logs/backend.log 2>&1 &

echo "All services started."
