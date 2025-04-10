#!/bin/bash
# Set Node.js options for OpenSSL legacy provider
export NODE_OPTIONS=--openssl-legacy-provider
# Run the build command
npm run build
