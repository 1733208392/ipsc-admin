module.exports = {
  apps: [{
    name: "ipsc-api",
    script: "dist/index.js",
    cwd: "/home/ipsc-backend",
    instances: "max",
    exec_mode: "cluster",
    autorestart: true,
    watch: false,
    max_memory_restart: "200M",
    env: {
      NODE_ENV: "production",
    },
    min_uptime: "10s",
    max_restarts: 10,
    restart_delay: 3000,
  }]
};
