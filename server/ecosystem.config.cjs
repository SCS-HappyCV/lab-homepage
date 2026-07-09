module.exports = {
  apps: [
    {
      name: 'lab-homepage-api',
      script: 'dist/src/server.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
