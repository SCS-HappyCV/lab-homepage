# 专利系统部署指南

## 快速部署

### 首次部署

```bash
cd /var/www/lab-homepage/server
./deploy.sh
```

### 代码更新后

```bash
cd /var/www/lab-homepage/server
./update.sh
```

## 手动部署步骤

### 1. 构建后端

```bash
cd /var/www/lab-homepage/server
npm run build
```

### 2. 启动PM2服务

```bash
# 首次启动
pm2 start ecosystem.config.js

# 或者直接启动
pm2 start dist/src/server.js --name lab-homepage-server
```

### 3. 保存PM2配置

```bash
pm2 save
```

### 4. 设置开机自启

```bash
pm2 startup
```

## 常用PM2命令

### 服务管理

```bash
# 查看服务状态
pm2 status

# 启动服务
pm2 start lab-homepage-server

# 停止服务
pm2 stop lab-homepage-server

# 重启服务
pm2 restart lab-homepage-server

# 删除服务
pm2 delete lab-homepage-server
```

### 日志管理

```bash
# 查看实时日志
pm2 logs

# 查看最近100行日志
pm2 logs --lines 100

# 查看错误日志
pm2 logs --err

# 清空日志
pm2 flush
```

### 监控

```bash
# 实时监控面板
pm2 monit

# 查看详细信息
pm2 show lab-homepage-server
```

## 日志文件位置

- 综合日志: `/var/www/lab-homepage/server/logs/combined.log`
- 输出日志: `/var/www/lab-homepage/server/logs/out.log`
- 错误日志: `/var/www/lab-homepage/server/logs/error.log`

## 环境变量配置

在 `/var/www/lab-homepage/server/.env` 文件中配置：

```env
# 服务器配置
PORT=3003
NODE_ENV=production

# 数据库配置
SQLITE_PATH=./data/lab-homepage.db

# 认证配置
JWT_SECRET=your_jwt_secret_here
ADMIN_PASS_HASH=your_admin_pass_hash_here

# 专利识别配置
PATENT_UPLOAD_DIR=./data/patents
PATENT_TEMP_DIR=./data/patents/temp
PATENT_MAX_FILE_SIZE_MB=30
PATENT_PARSE_PAGE_COUNT=1

# OCR配置（默认禁用）
OCR_ENABLED=false

# 大模型配置
LLM_ENABLED=true
LLM_API_KEY=your_api_key_here
LLM_BASE_URL=https://api.openai.com/v1
LLM_MODEL=gpt-4o-mini
```

## 故障排查

### 1. 服务无法启动

```bash
# 查看错误日志
pm2 logs --err

# 检查端口是否被占用
lsof -i :3003

# 杀死占用端口的进程
kill -9 <PID>
```

### 2. 识别功能异常

```bash
# 查看详细日志
pm2 logs lab-homepage-server --lines 200

# 检查数据库
sqlite3 /var/www/lab-homepage/server/data/lab-homepage.db ".tables"
```

### 3. 内存溢出

```bash
# 查看内存使用
pm2 monit

# 调整内存限制（编辑ecosystem.config.js）
max_memory_restart: '2G'
```

## 生产环境优化

### 1. 启用集群模式

编辑 `ecosystem.config.js`：

```javascript
{
  instances: 'max',  // 使用所有CPU核心
  exec_mode: 'cluster'
}
```

### 2. 配置Nginx反向代理

```nginx
server {
    listen 80;
    server_name your-domain.com;

    location / {
        proxy_pass http://localhost:3003;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_cache_bypass $http_upgrade;
    }
}
```

### 3. 配置SSL证书

```bash
# 使用Let's Encrypt
sudo certbot --nginx -d your-domain.com
```

## 备份策略

### 1. 数据库备份

```bash
# 每日备份
sqlite3 /var/www/lab-homepage/server/data/lab-homepage.db ".backup /backup/lab-homepage-$(date +%Y%m%d).db"
```

### 2. 文件备份

```bash
# 备份上传的专利文件
tar -czf /backup/patents-$(date +%Y%m%d).tar.gz /var/www/lab-homepage/server/data/patents
```

### 3. 自动备份脚本

创建 `/var/www/lab-homepage/server/backup.sh`：

```bash
#!/bin/bash
DATE=$(date +%Y%m%d)
BACKUP_DIR="/backup/lab-homepage"

mkdir -p $BACKUP_DIR

# 备份数据库
sqlite3 /var/www/lab-homepage/server/data/lab-homepage.db ".backup $BACKUP_DIR/lab-homepage-$DATE.db"

# 备份文件
tar -czf $BACKUP_DIR/patents-$DATE.tar.gz /var/www/lab-homepage/server/data/patents

# 删除30天前的备份
find $BACKUP_DIR -name "*.db" -mtime +30 -delete
find $BACKUP_DIR -name "*.tar.gz" -mtime +30 -delete
```

添加到定时任务：

```bash
# 每天凌晨2点执行备份
crontab -e
0 2 * * * /var/www/lab-homepage/server/backup.sh
```
