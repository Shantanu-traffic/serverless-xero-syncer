const { masterDB } = require("./database/db-init");


exports.handler = async(dbQuery) => {
  try {
    // Destructure the dbQuery to get query and values
    const { query, values } = dbQuery;

    // Check if values exist before querying
    if (!Array.isArray(values) || values.length === 0) {
      throw new Error("No values provided for the query parameters");
    }

    // Execute the query with the provided values
    const dbResponse = await masterDB
      .query(query, values);
      console.log(`Query successfully executed! ${JSON.stringify(dbResponse)}`);
    return dbResponse;
  } catch (error) {
    console.log(`Error occurred during DB Operation: ${error}`);
    return error;
  }
};



