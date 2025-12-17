// ecosystem.config.js
module.exports = {
  apps: [{
    name: 'photo-server',
    script: './server.js',

    cwd: '/var/www/photo-server',

    exec_mode: 'fork',
    instances: 1,

    autorestart: true,
    watch: false,
    max_memory_restart: '500M',

    env: {
      NODE_ENV: 'production',
      HOST: '127.0.0.1',
      PORT: '4000'
    },

    error_file: '/var/www/photo-server/logs/error.log',
    out_file: '/var/www/photo-server/logs/output.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    time: true
  }]
};
