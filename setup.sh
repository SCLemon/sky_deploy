#!/bin/bash

echo "Installing npm packages for sky_deploy..."
npm install

echo "Installing npm packages for backend..."
cd backend
npm install

echo "All dependencies installed successfully."
