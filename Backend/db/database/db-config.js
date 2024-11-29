module.exports = {
  masterDB: {
    postgres: {
      database: process.env.DB_NAME,
      host: process.env.DB_HOST,
      password: process.env.DB_PASSWORD,
      port: process.env.DB_PORT,
      schema: "public",
      splitThreads: "15",
      user: process.env.DB_USER,
    },
    pgDefault: {
      monitor: "true",
      poolIdleTimeout: "30000",
      poolSize: "50",
    },
  },
};
