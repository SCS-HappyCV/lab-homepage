module.exports = {
  apps: [
    {
      name: 'lab-homepage-api',
      script: '/var/www/lab-homepage/server/node_modules/.bin/tsx',
      args: 'src/server.ts',
      cwd: '/var/www/lab-homepage/server',
      instances: 1,
      exec_mode: 'fork',
      autorestart: true,
      watch: false,
      max_memory_restart: '500M',
      env: {
        NODE_ENV: 'production',
        PORT: '3003',
      },
    },
  ],
}
