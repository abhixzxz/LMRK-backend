#!/bin/bash
# Fix permissions for node_modules/.bin files
echo "Fixing permissions for node_modules/.bin files..."
chmod +x node_modules/.bin/* 2>/dev/null || true
echo "Permissions fixed successfully!"
