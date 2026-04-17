/* eslint-disable no-console */
require('dotenv').config();

const {
  listMediaObjects,
  deleteMediaObject,
} = require('../services/s3Service');
const { listAllMediaMetadata } = require('../services/mediaMetadataService');

const ORPHAN_GRACE_HOURS = Number.parseInt(process.env.MEDIA_ORPHAN_GRACE_HOURS || '24', 10);

async function main() {
  const now = Date.now();
  const graceMs = ORPHAN_GRACE_HOURS * 60 * 60 * 1000;

  console.log(`Starting orphan media cleanup (grace=${ORPHAN_GRACE_HOURS}h)...`);

  const [objects, metadata] = await Promise.all([
    listMediaObjects('uploads/'),
    listAllMediaMetadata(),
  ]);

  const validKeys = new Set(
    (metadata || [])
      .map((item) => item.fileKey)
      .filter((k) => typeof k === 'string' && k.length > 0)
  );

  let scanned = 0;
  let deleted = 0;
  for (const obj of objects) {
    scanned += 1;
    if (!obj?.key) continue;
    if (validKeys.has(obj.key)) continue;

    const lastModifiedMs = obj.lastModified ? Date.parse(obj.lastModified) : 0;
    if (!lastModifiedMs || now - lastModifiedMs < graceMs) {
      continue;
    }

    try {
      await deleteMediaObject(obj.key);
      deleted += 1;
      console.log(`[deleted] orphan object ${obj.key}`);
    } catch (error) {
      console.error(`[failed] ${obj.key}`, error?.message || error);
    }
  }

  console.log('Orphan cleanup finished.');
  console.log(`Scanned objects: ${scanned}`);
  console.log(`Known metadata keys: ${validKeys.size}`);
  console.log(`Deleted orphan objects: ${deleted}`);
}

main().catch((error) => {
  console.error('Cleanup failed:', error);
  process.exitCode = 1;
});
