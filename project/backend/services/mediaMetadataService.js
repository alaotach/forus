const { randomUUID } = require('crypto');
const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, DeleteCommand } = require('@aws-sdk/lib-dynamodb');

const region = process.env.AWS_REGION;
const tableName = process.env.AWS_MEDIA_TABLE;

const ddbClient = new DynamoDBClient({ region });
const docClient = DynamoDBDocumentClient.from(ddbClient, {
  marshallOptions: {
    removeUndefinedValues: true,
  },
});

function assertMetadataConfigured() {
  if (!region) {
    throw new Error('AWS_REGION is required for metadata service');
  }

  if (!tableName) {
    throw new Error('AWS_MEDIA_TABLE is required for metadata service');
  }
}

async function createMediaMetadata({ fileKey, type, ownerId, coupleCode, createdAt }) {
  assertMetadataConfigured();
  const id = randomUUID();
  const item = {
    id,
    fileKey,
    type,
    ownerId,
    coupleCode,
    createdAt: createdAt || new Date().toISOString(),
  };

  await docClient.send(
    new PutCommand({
      TableName: tableName,
      Item: item,
    })
  );

  return item;
}

async function getMediaMetadataById(id) {
  assertMetadataConfigured();
  if (!id) {
    throw new Error('id is required');
  }

  const output = await docClient.send(
    new GetCommand({
      TableName: tableName,
      Key: { id },
      ConsistentRead: true,
    })
  );

  return output.Item || null;
}

async function deleteMediaMetadataById(id) {
  assertMetadataConfigured();
  if (!id) {
    throw new Error('id is required');
  }

  await docClient.send(
    new DeleteCommand({
      TableName: tableName,
      Key: { id },
    })
  );
}

module.exports = {
  createMediaMetadata,
  getMediaMetadataById,
  deleteMediaMetadataById,
};
