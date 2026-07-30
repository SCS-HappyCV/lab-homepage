module.exports = {
  apps: [
    {
      name: 'lab-homepage-api',
      script: 'dist/src/server.js',
      cwd: '/var/www/lab-homepage/server',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
        PORT: 3003,
      },
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      // 优雅重启
      kill_timeout: 5000,
      listen_timeout: 10000,
    },
  ],
}
