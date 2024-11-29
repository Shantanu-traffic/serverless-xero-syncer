const promise = require("bluebird"); // ES6 Promise.

module.exports = (config) => {
  // Set up pg-promise options.
  const initOptions = {
    promiseLib: promise, // Overriding the default (ES6 Promise).

    error: (error, e) => {
      if (e.cn) {
        // A connection-related error.
        console.error("CN:", e.cn);
        console.error("EVENT:", error.message);
      }
    },
  };

  if (config.pgDefault.monitor === "true") {
    // See API: https://github.com/vitaly-t/pg-monitor#log
    const monitor = require("pg-monitor");

    monitor.attach(initOptions); // Attach to all query events.
    // See API: https://github.com/vitaly-t/pg-monitor#attachoptions-events-override

    monitor.setTheme("matrix"); // Change the default theme.
    // Other themes: https://github.com/vitaly-t/pg-monitor/wiki/Color-Themes

    // Save the screen messages into your own log file.
    monitor.setLog = (msg, info) => {}; // eslint-disable-line no-unused-vars
    // See API: https://github.com/vitaly-t/pg-monitor#log
  }

  const pgp = require("pg-promise")(initOptions);
  // See all options: https://github.com/vitaly-t/pg-promise#initialization-options

  /**
   * Database pool size and timeout.
   */
  pgp.pg.defaults.max = config.pgDefault.poolSize; // Use `max` instead of `poolSize` in pg-promise 11+
  pgp.pg.defaults.poolIdleTimeout = config.pgDefault.poolIdleTimeout;

  // Return the database instance.
  return { dbInstance: pgp(config.postgres), dbCloseConnection: pgp.end };

  // And if in some module you need to use the library's root, you can access it via property $config:
  // - http://vitaly-t.github.io/pg-promise/Database.html#$config
  // const pgp = db.$config.pgp; // the library's root after initialization
};
