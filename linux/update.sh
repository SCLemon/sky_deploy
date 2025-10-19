#!/bin/bash
set -e

# 移除舊版本
if [ -d "sky_deploy" ]; then
  echo "Removing previous version of sky_deploy..."
  rm -rf sky_deploy
fi

# 下載新版
echo "Downloading the latest version of sky_deploy..."
if ! git clone https://github.com/SCLemon/sky_deploy.git; then
  echo "❌ Git clone failed."
  exit 1
fi

# 安裝前端依賴
echo "Installing npm packages for sky_deploy..."
cd sky_deploy
npm install --legacy-peer-deps

# 安裝後端依賴
echo "Installing npm packages for backend..."
cd backend
npm install --legacy-peer-deps
cd ..

