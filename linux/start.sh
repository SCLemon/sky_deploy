#!/bin/bash
set -e  # 若有指令失敗，腳本會立即停止

LOG_DIR="./logs"

# 檢查 logs 資料夾是否存在，不存在就建立
if [ ! -d "$LOG_DIR" ]; then
  echo "Log directory not found. Creating $LOG_DIR ..."
  mkdir -p "$LOG_DIR"
fi

echo "Starting HTTPS server..."
node ./sky_deploy/https.js > "$LOG_DIR/https.log" 2>&1 &

echo "Starting Backend server..."
node ./sky_deploy/backend/index.js > "$LOG_DIR/backend.log" 2>&1 &

echo "All services started successfully."