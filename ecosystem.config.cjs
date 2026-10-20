// pm2 process file: `pm2 start ecosystem.config.cjs` from the repo root.
// The API serves the built SPA (WEB_DIST) and the WebSocket on one port.
module.exports = {
  apps: [
    {
      name: 'hostly',
      cwd: __dirname,
      script: 'apps/api/dist/main.js',
      // One instance: Socket.IO rooms live in memory. Scale out only with a Redis adapter.
      instances: 1,
      exec_mode: 'fork',
      max_memory_restart: '512M',
      env: {
        NODE_ENV: 'production',
        WEB_DIST: 'apps/web/dist',
      },
      out_file: 'logs/hostly.out.log',
      error_file: 'logs/hostly.err.log',
      time: true,
    },
  ],
};
