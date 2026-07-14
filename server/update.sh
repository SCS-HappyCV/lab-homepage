#!/bin/bash

# 快速更新脚本（代码修改后使用）
# 使用方法: ./update.sh

set -e

echo "🔄 开始更新..."

# 1. 构建
echo "📦 构建中..."
npm run build

# 2. 重启PM2
echo "🔄 重启服务..."
pm2 restart lab-homepage-api

echo "✅ 更新完成！"
echo ""
echo "查看日志: pm2 logs lab-homepage-api --lines 50"
