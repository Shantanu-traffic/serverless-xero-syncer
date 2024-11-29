const MAX_BATCH_SIZE = 10; // Max number of messages per batch
const crypto = require("crypto");
const AWS = require("aws-sdk");

const sqs = new AWS.SQS();
const queueUrl = process.env.queueUrl; // Replace with your standard SQS queue URL
const xeroWebhookKey = process.env.xeroWebhookKey || "your-secret-key"; // Store your secret key in Lambda environment variables

exports.handler = async (event) => {
  let body = event.body.toString();

  // Xero Signature from headers
  const xeroSignature = event.headers["x-xero-signature"];
  if (event.isBase64Encoded) {
    body = Buffer.from(body, "base64").toString("utf-8");
  }

  const calculatedSignature = crypto
    .createHmac("sha256", xeroWebhookKey)
    .update(body)
    .digest("base64");

  if (xeroSignature !== calculatedSignature) {
    console.log("Invalid signature detected.");
    return {
      statusCode: 401,
      body: "Invalid signature",
    };
  } else {
    console.log("Valid signature detected.");
  }

  let webhookData;
  try {
    webhookData = JSON.parse(body);
  } catch (error) {
    console.log("Error parsing JSON body:", error);
    return {
      statusCode: 400,
      body: "Invalid JSON format",
    };
  }

  console.log("Received webhook:", webhookData);

  // Accumulate messages in batches
  const messages = [];
  webhookData.events.forEach((event) => {
    if (["CREATE", "UPDATE", "DELETE"].includes(event.eventType)) {
      const sqsMessage = {
        tenantId: event.tenantId,
        invoiceId: event.resourceId,
      };
      messages.push(sqsMessage);

      // If batch size limit is reached, send the batch and reset the list
      if (messages.length === MAX_BATCH_SIZE) {
        sendBatchToSQS(messages);
        messages.length = 0; // Reset the batch
      }
    }
  });

  // Send any remaining messages if the total is less than MAX_BATCH_SIZE
  if (messages.length > 0) {
    await sendBatchToSQS(messages);
  }

  return {
    statusCode: 200,
    body: "Webhook received",
  };
};

// Helper function to send a batch of messages to SQS
const sendBatchToSQS = async (messages) => {
  const entries = messages.map((message, index) => ({
    Id: `${index}`, // Unique ID for each message
    MessageBody: JSON.stringify(message),
  }));

  const params = {
    QueueUrl: queueUrl,
    Entries: entries,
  };

  try {
    const result = await sqs.sendMessageBatch(params).promise();
    console.log(`Successfully sent batch to SQS: ${JSON.stringify(result)}`);
  } catch (error) {
    console.error("Error sending batch to SQS:", error);
  }
};
