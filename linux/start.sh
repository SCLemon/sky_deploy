#!/bin/bash

echo "Starting HTTPS server..."
nohup node ./sky_deploy/https.js &

echo "Starting Backend server..."
nohup node ./sky_deploy/backend/index.js &

echo "All services started."
