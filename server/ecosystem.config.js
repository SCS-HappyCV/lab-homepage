module.exports = {
  apps: [
    {
      name: 'lab-homepage-server',
      script: 'dist/src/server.js',
      cwd: '/var/www/lab-homepage/server',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
      },
      env_production: {
        NODE_ENV: 'production',
        PORT: 3003,
      },
      // 日志配置
      log_file: '/var/www/lab-homepage/server/logs/combined.log',
      out_file: '/var/www/lab-homepage/server/logs/out.log',
      error_file: '/var/www/lab-homepage/server/logs/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // 优雅重启
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
};
