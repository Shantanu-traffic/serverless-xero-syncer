const axios = require("axios");

const { masterDB } = require("./database/db-init");

const { CLIENT_ID, CLIENT_SECRET, TOKEN_URL, API_URL } = process.env;

/**
 * Save tokenSet to the database
 *
 * @param {object} tokenSetObject token set object
 *
 */
const saveTokensToDB = async (tokenSetObject) => {
  const query = `
    UPDATE xero_app_user
    SET token_set = $1
    WHERE xero_app_user_id = 'a1a39f59-c94f-47a2-b48d-f40566681f07';
  `;
  try {
    await masterDB.query(query, [tokenSetObject]);
    console.info("Tokens saved to database successfully.");
  } catch (error) {
    console.error("Error saving tokens to database:", error.message);
  }
};

/**
 * Fetch token sets from the database
 *
 * @returns {Promise<object>} The Xero API tokenset object
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
    console.error("Error loading tokens from database:", error);
    return null;
  }
};

/**
 * The function refresh the tokenset and provide the new tokenset of Xero API
 *
 * @returns {Promise<string>} The newly generated access token.
 *
 */
const refreshXeroToken = async () => {
  const tokens = await loadTokensFromDB();
  try {
    const response = await axios.post(
      TOKEN_URL,
      new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: tokens.refresh_token,
      }),
      {
        auth: {
          username: CLIENT_ID,
          password: CLIENT_SECRET,
        },
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
      }
    );
    console.info("Tokens refreshed successfully.");
    await saveTokensToDB(response.data);
    return response.data.access_token;
  } catch (error) {
    console.error(
      "Error refreshing tokens:",
      error.response?.data || error.message
    );
    throw error;
  }
};

/**
 * The function makes a call to Xero API
 * just to validate the token
 *
 * @param {string} accessToken access token string
 *
 * @returns {Promise<boolean>} true/false if the API call was successfull or not
 *
 */
const testXeroToken = async (accessToken) => {
  try {
    const response = await axios.get(`${API_URL}/connections`, {
      headers: {
        Authorization: `Bearer ${accessToken}`,
      },
    });
    console.info("Token is valid:", response.data[0]);
    return true;
  } catch (error) {
    console.error(
      "Token validation failed:",
      error.response?.data || error.message
    );
    return false;
  }
};

/**
 * The main function which loads the Xero API token set from DB or refreshes
 * it (if unauthorized) and update to DB
 *
 * @returns {object|null} The token set object for Xero API Authorization
 *
 */
exports.handler = async () => {
  try {
    const tokenSet = await loadTokensFromDB();

    if (tokenSet) {
      // Test the current token
      let accessToken = tokenSet.access_token;
      const isValid = await testXeroToken(accessToken);

      if (!isValid) {
        console.info("Refreshing tokens...");
        accessToken = await refreshXeroToken();
        await testXeroToken(accessToken);
      }

      console.info("Ready to make Xero API calls with valid token.");
      console.info({"Access Token ":tokenSet.access_token});
      return tokenSet.access_token
    }
    return null;
  } catch (error) {
    console.error("Script execution failed:", error.message);
  }
};
