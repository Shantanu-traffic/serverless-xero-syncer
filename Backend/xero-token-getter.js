const { masterDB, dbCloseConnection } = require("./db/database/db-init");
var AWS = require("aws-sdk");

// Setting for invoking another lambda
AWS.config.region = process.env.DEFAULT_REGION;
var lambda = new AWS.Lambda();

/**
 * Fetch token sets from the database
 *
 * @returns {Promise<object>} - A promise that resolves to an object containing tokenset
 *
 */
const loadTokensFromDB = async () => {
  const query =
    "SELECT token_set FROM xero_app_user WHERE xero_app_user_id = 'a1a39f59-c94f-47a2-b48d-f40566681f07'";
  try {
    const dbResult = await masterDB.query(query);

    if (dbResult && dbResult.length > 0) {
      return dbResult[0].token_set;
    } else {
      throw new Error("No token set found from database!!");
    }
  } catch (error) {
    console.error("Error loading tokens from database:", error.message);
    return null;
  }
};

const updateXeroToken = async ()=>{
  try {
    const params = {
      FunctionName: process.env.SET_TOKEN_LAMBDA, // the lambda function we are invoking to set token of xero into DB.
      InvocationType: "RequestResponse",
      LogType: "Tail",
      Payload: '{ "from" : "etl-xero-token-getter" }',
    };

    // Await the invocation result
    const result = await lambda.invoke(params).promise();
    // Check if the invocation was successful
    if (result.StatusCode === 200) {
      const responsePayload = JSON.parse(result.Payload);
      if (responsePayload) {
        return responsePayload;
      } else {
        throw new Error("Access token not found in Lambda response");
      }
    } else {
      throw new Error("Failed to invoke Lambda or non-200 response status");
    }
  } catch (error) {
    console.error("Error obtaining bearer token:", error);
    throw new Error("Failed to obtain bearer token");
  }
}




/**
 * Main Script logic
 *
 * @returns {string} - A access token from the tokenSet object from DB
 *
 */
exports.handler = async () => {
  try {
    const updateToken = await updateXeroToken();
    console.log("Token Obtained from Setter Lambda: ", updateToken);
    const tokenSet = await loadTokensFromDB();
    if (tokenSet) {
      console.info(`Token fetched from DB success. accessToken: ${tokenSet.access_token}, refreshToken: ${tokenSet.refresh_token}`);
      return {"accessToken":tokenSet.access_token, "refreshToken":tokenSet.refresh_token};
    }
    return null;
  } catch (error) {
    console.error("Script execution failed:", error.message);
  } finally {

  }
};

