// Get configuration from either the app global variable or the config json file.
const databaseConfig = require("./db-config");

// Crate database instances.
const { dbInstance: masterDB, dbCloseConnection } = require("./db-connect")(
  databaseConfig.masterDB
);

module.exports = {
  masterDB,
  databaseConfig,
  dbCloseConnection,
};
