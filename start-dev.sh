#!/bin/bash
cd /home/z/my-project
export NODE_OPTIONS="--max-old-space-size=1536"
exec npx next dev -p 3000
