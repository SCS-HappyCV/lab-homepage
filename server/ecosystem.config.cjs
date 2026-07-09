module.exports = {
  apps: [
    {
      name: 'lab-homepage-api',
      script: 'dist/src/index.js',
      cwd: __dirname,
      env: {
        NODE_ENV: 'production',
      },
    },
  ],
}
