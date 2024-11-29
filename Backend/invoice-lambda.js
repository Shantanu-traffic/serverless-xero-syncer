const axios = require("axios");
const qs = require("qs");
var AWS = require("aws-sdk");

// Setting for invoking another lambda
AWS.config.region = process.env.DEFAULT_REGION;
let lambda = new AWS.Lambda();

const api_url = "https://api.xero.com/api.xro/2.0/Invoices/";

exports.handler = async (event) => {
  console.log("started the invoice Lambda!");
  const { tenantId, invoiceId } = JSON.parse(event.Records[0].body);

  try {
    // Step 1: Get Bearer Token (OAuth2)
    const xeroAccessToken = await getBearerToken();
    console.log("Token: ", xeroAccessToken.accessToken);

    // Step 2: Fetch Invoice from Xero using the access token and tenantId
    const invoiceResponse = await axios.get(`${api_url + invoiceId}`, {
      headers: {
        Authorization: `Bearer ${xeroAccessToken.accessToken}`,
        "Xero-Tenant-Id": tenantId,
        "Content-Type": "application/json",
      },
    });
    const fetchedInvoice = invoiceResponse.data.Invoices;
    console.log("Fetched Data from Xero: ", fetchedInvoice);
    const invoiceCreatedDate = fetchedInvoice[0].Date;
    const match = invoiceCreatedDate.match(/\/Date\((\d+)([+-]\d{4})\)\//);
    let fetchedDate;
    if (match) {
      // Extract the timestamp and timezone offset
      const timestamp = parseInt(match[1], 10); // Timestamp in milliseconds
      const timezoneOffset = match[2];
      fetchedDate = new Date(timestamp);
    }

    console.log("Invoice", {
      type: fetchedInvoice[0].Type,
      invoiceId: fetchedInvoice[0].InvoiceID,
      invoiceNo: fetchedInvoice[0].InvoiceNumber,
      date: fetchedDate,
      amountDue: fetchedInvoice[0].AmountDue,
      amountPaid: fetchedInvoice[0].AmountPaid,
      sendToContact: fetchedInvoice[0].Contact.EmailAddress,
      name: fetchedInvoice[0].Contact.Name,
      isSupplier: fetchedInvoice[0].Contact.IsSupplier,
      isCustomer: fetchedInvoice[0].Contact.IsCustomer,
      subtotal: fetchedInvoice[0].SubTotal,
      totalTax: fetchedInvoice[0].TotalTax,
      total: fetchedInvoice[0].Total,
      xero_status: fetchedInvoice[0].Status,
      tenantId: tenantId,
    });

    const invoiceDataForDb = {
      invoiceId: fetchedInvoice[0].InvoiceID,
      invoiceNo: fetchedInvoice[0].InvoiceNumber,
      createdDate: fetchedDate,
      amountDue: fetchedInvoice[0].AmountDue,
      amountPaid: fetchedInvoice[0].AmountPaid,
      sendToContact: fetchedInvoice[0].Contact.EmailAddress,
      name: fetchedInvoice[0].Contact.Name,
      isSupplier: fetchedInvoice[0].Contact.IsSupplier,
      isCustomer: fetchedInvoice[0].Contact.IsCustomer,
      subtotal: fetchedInvoice[0].SubTotal,
      totalTax: fetchedInvoice[0].TotalTax,
      total: fetchedInvoice[0].Total,
      xero_status: fetchedInvoice[0].Status,
      tenantId: tenantId,
    };

    const billsDataForDb = {
      poId: fetchedInvoice[0].InvoiceID,
      poNo: fetchedInvoice[0].InvoiceNumber,
      createdDate: fetchedDate,
      sendToContact: fetchedInvoice[0].SentToContact,
      name: fetchedInvoice[0].Contact.Name,
      contactId: fetchedInvoice[0].Contact.ContactID,
      constactStatus: fetchedInvoice[0].Contact.ContactStatus,
      subtotal: fetchedInvoice[0].SubTotal,
      totalTax: fetchedInvoice[0].TotalTax,
      total: fetchedInvoice[0].Total,
      xero_status: fetchedInvoice[0].Status,
      contactMailId: fetchedInvoice[0].Contact.EmailAddress,
      tenantId: tenantId,
    };

    let dbResponse;
    if (fetchedInvoice[0].Type == "ACCREC") {
      dbResponse = await storeInvoiceInDB(invoiceDataForDb);
    } else {
      // console.log("data from xero bill:",invoiceResponse.data);
      dbResponse = await storeBillsInDB(billsDataForDb);
    }
    console.log("DB Response:", dbResponse);
    return {
      statusCode: 200,
      body: JSON.stringify(invoiceResponse.data.Invoices),
    };
  } catch (error) {
    console.error("Error fetching invoice:", error);
    return {
      statusCode: 500,
      body: JSON.stringify({ error: "Failed to fetch invoice from Xero" }),
    };
  }
};

// Function to get Bearear Token
async function getBearerToken() {
  // Access token: We have to get it from Prod DB: Xero_app_user table
  try {
    const params = {
      FunctionName: process.env.GET_TOKEN_LAMBDA, // the lambda function we are invoking to get token of xero.
      InvocationType: "RequestResponse",
      LogType: "Tail",
      Payload: '{ "from" : "etl-invoice-lambda" }',
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

// Function to update the Invoices in DB
async function storeInvoiceInDB(fetchedData) {
  try {
    // Step 1: Check if the invoice number already exists in the database
    const checkParams = {
      FunctionName: process.env.STORE_INVOICE_LAMBDA,
      InvocationType: "RequestResponse",
      LogType: "Tail",
      Payload: JSON.stringify({
        query: `SELECT invoice_number FROM etl_xero_invoices WHERE invoice_id = $1 LIMIT 1;`,
        values: [fetchedData.invoiceId], // We are checking for the existence of the invoice number
      }),
    };

    // Invoke Lambda function to check if the invoice exists
    const checkResult = await lambda.invoke(checkParams).promise();

    if (checkResult.StatusCode === 200) {
      console.log("respo2:", JSON.stringify(checkResult));
      const checkResponsePayload = JSON.parse(checkResult.Payload);
      console.log("respo:", checkResponsePayload.length);

      let query, values;

      if (checkResponsePayload.length != 0) {
        // Step 2: If the record exists, update it
        query = `UPDATE etl_xero_invoices
                   SET  "date" = $1, amount_due = $2, amount_paid = $3, send_to_contact = $4, 
                       "name" = $5, is_supplier = $6, is_customer = $7, subtotal = $8, total_tax = $9, 
                       total = $10, xero_status = $11
                   WHERE invoice_id = $12;`;
        values = [
          fetchedData.date,
          fetchedData.amountDue,
          fetchedData.amountPaid,
          fetchedData.sendToContact,
          fetchedData.name,
          fetchedData.isSupplier,
          fetchedData.isCustomer,
          fetchedData.subtotal,
          fetchedData.totalTax,
          fetchedData.total,
          fetchedData.xero_status,
          fetchedData.invoiceId, // invoice number to match for update
        ];
      } else {
        // Step 3: If the record does not exist, insert it
        query = `INSERT INTO etl_xero_invoices 
                   (invoice_id, invoice_number, "date", amount_due, amount_paid, send_to_contact, "name", 
                    is_supplier, is_customer, subtotal, total_tax, total, xero_status, tenant_id)
                   VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14);`;
        values = [
          fetchedData.invoiceId,
          fetchedData.invoiceNo, // Make sure invoiceNo is passed as a string if it's required as such
          fetchedData.date,
          fetchedData.amountDue,
          fetchedData.amountPaid,
          fetchedData.sendToContact,
          fetchedData.name,
          fetchedData.isSupplier,
          fetchedData.isCustomer,
          fetchedData.subtotal,
          fetchedData.totalTax,
          fetchedData.total,
          fetchedData.xero_status,
          fetchedData.tenantId,
        ];
      }

      // Step 4: Execute the INSERT or UPDATE based on the check result
      const params = {
        FunctionName: process.env.STORE_INVOICE_LAMBDA,
        InvocationType: "RequestResponse",
        LogType: "Tail",
        Payload: JSON.stringify({ query, values }),
      };

      // Await the invocation result for the INSERT or UPDATE operation
      const result = await lambda.invoke(params).promise();

      // Check if the invocation was successful
      if (result.StatusCode === 200) {
        const responsePayload = JSON.parse(result.Payload);
        if (responsePayload) {
          return responsePayload;
        } else {
          throw new Error("Error occurred during DB operation");
        }
      } else {
        throw new Error(
          "Failed to invoke Lambda or received non-200 response status"
        );
      }
    } else {
      throw new Error(
        "Failed to check if the invoice exists or received non-200 response status"
      );
    }
  } catch (error) {
    console.error("Error during DB operation:", error);
    throw new Error("Failed to perform operation in DB");
  }
}

// Function to update the Bills in DB
async function storeBillsInDB(fetchedData) {
  try {
    // Step 1: Check if the invoice number already exists in the database
    const checkParams = {
      FunctionName: process.env.STORE_INVOICE_LAMBDA,
      InvocationType: "RequestResponse",
      LogType: "Tail",
      Payload: JSON.stringify({
        query: `SELECT po_number FROM etl_xero_billAndPo WHERE po_id = $1 LIMIT 1;`,
        values: [fetchedData.poId], // We are checking for the existence of the invoice number
      }),
    };

    // Invoke Lambda function to check if the Bills/Pos' exists
    const checkResult = await lambda.invoke(checkParams).promise();

    if (checkResult.StatusCode === 200) {
      console.log("respo2:", JSON.stringify(checkResult));
      const checkResponsePayload = JSON.parse(checkResult.Payload);
      console.log("respo:", checkResponsePayload.length);

      let query, values;

      if (checkResponsePayload.length != 0) {
        // Step 2: If the record exists, update it
        query = `UPDATE etl_xero_billAndPo
                   SET  date = $1, send_to_contact = $2, 
                       "name" = $3, contact_id = $4, contact_status = $5, subtotal = $6, total_tax = $7, 
                       total = $8, xero_status = $9,contact_mailId=$10
                   WHERE po_id = $11;`;
        values = [
          fetchedData.createdDate,
          fetchedData.sendToContact,
          fetchedData.name,
          fetchedData.contactId,
          fetchedData.constactStatus,
          fetchedData.subtotal,
          fetchedData.totalTax,
          fetchedData.total,
          fetchedData.xero_status,
          fetchedData.contactMailId,
          fetchedData.poId,
        ];
      } else {
        // Step 3: If the record does not exist, insert it
        query = ` INSERT INTO public.etl_xero_billAndPo
                  (po_id, po_number, "date", send_to_contact, "name", contact_id, contact_status, subtotal, total_tax, total, xero_status, tenant_id, contact_mailId)
                  VALUES($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12,$13)`;
        values = [
          fetchedData.poId,
          fetchedData.poNo,
          fetchedData.createdDate,
          fetchedData.sendToContact,
          fetchedData.name,
          fetchedData.contactId,
          fetchedData.constactStatus,
          fetchedData.subtotal,
          fetchedData.totalTax,
          fetchedData.total,
          fetchedData.xero_status,
          fetchedData.tenantId,
          fetchedData.contactMailId,
        ];
      }

      // Step 4: Execute the INSERT or UPDATE based on the check result
      const params = {
        FunctionName: process.env.STORE_INVOICE_LAMBDA,
        InvocationType: "RequestResponse",
        LogType: "Tail",
        Payload: JSON.stringify({ query, values }),
      };

      // Await the invocation result for the INSERT or UPDATE operation
      const result = await lambda.invoke(params).promise();

      // Check if the invocation was successful
      if (result.StatusCode === 200) {
        const responsePayload = JSON.parse(result.Payload);
        if (responsePayload) {
          return responsePayload;
        } else {
          throw new Error("Error occurred during DB operation");
        }
      } else {
        throw new Error(
          "Failed to invoke Lambda or received non-200 response status"
        );
      }
    } else {
      throw new Error(
        "Failed to check if the invoice exists or received non-200 response status"
      );
    }
  } catch (error) {
    console.error("Error during DB operation:", error);
    throw new Error("Failed to perform operation in DB");
  }
}
