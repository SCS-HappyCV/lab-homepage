#!/bin/bash
# 项目重启脚本
# 从项目根目录运行：./restart.sh

set -e

export PM2_HOME=/var/www/lab-homepage/.pm2
umask 002

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"

echo "🌐 构建前端..."
cd "$SCRIPT_DIR"
npm run build

echo "📦 构建后端..."
cd "$SCRIPT_DIR/server"
npm run build

if pm2 describe lab-homepage-api > /dev/null 2>&1; then
  echo "🔄 重启 PM2 进程..."
  pm2 restart lab-homepage-api
else
  echo "🚀 进程未运行，启动新实例..."
  pm2 start "$SCRIPT_DIR/ecosystem.config.cjs"
fi

pm2 save

echo "✅ 项目构建与服务重启完成"
