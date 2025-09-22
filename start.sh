#!/bin/bash

# 啟動 https.js 背景程式
nohup node ./https.js >/dev/null 2>&1 &

# 啟動 backend/index.js 背景程式
nohup node ./backend/index.js >/dev/null 2>&1 &

echo "All services started."
