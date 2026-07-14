#!/bin/bash

# 专利系统部署脚本
# 使用方法: ./deploy.sh

set -e

echo "============================================================"
echo "🚀 专利系统部署脚本"
echo "============================================================"
echo ""

# 1. 进入server目录
cd /var/www/lab-homepage/server

# 2. 构建后端
echo "📦 步骤1: 构建后端..."
npm run build
echo "✅ 构建完成"
echo ""

# 3. 创建日志目录
echo "📁 步骤2: 创建日志目录..."
mkdir -p logs
echo "✅ 日志目录已创建"
echo ""

# 4. 检查PM2是否安装
if ! command -v pm2 &> /dev/null; then
    echo "❌ PM2未安装，正在安装..."
    npm install -g pm2
    echo "✅ PM2安装完成"
else
    echo "✅ PM2已安装"
fi
echo ""

# 5. 停止旧服务（如果存在）
echo "🛑 步骤3: 停止旧服务..."
pm2 delete lab-homepage-server 2>/dev/null || echo "没有旧服务需要停止"
echo ""

# 6. 启动新服务
echo "🚀 步骤4: 启动新服务..."
pm2 start ecosystem.config.js
echo ""

# 7. 保存PM2配置
echo "💾 步骤5: 保存PM2配置..."
pm2 save
echo ""

# 8. 显示服务状态
echo "📊 服务状态:"
pm2 status
echo ""

# 9. 显示日志位置
echo "📝 日志位置:"
echo "  - 综合日志: /var/www/lab-homepage/server/logs/combined.log"
echo "  - 输出日志: /var/www/lab-homepage/server/logs/out.log"
echo "  - 错误日志: /var/www/lab-homepage/server/logs/error.log"
echo ""

echo "============================================================"
echo "✅ 部署完成！"
echo ""
echo "常用命令:"
echo "  pm2 status              # 查看服务状态"
echo "  pm2 logs                # 查看实时日志"
echo "  pm2 restart lab-homepage-server  # 重启服务"
echo "  pm2 stop lab-homepage-server     # 停止服务"
echo "  pm2 monit               # 监控面板"
echo "============================================================"
