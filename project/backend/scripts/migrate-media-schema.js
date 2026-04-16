/* eslint-disable no-console */
require('dotenv').config();

const admin = require('firebase-admin');
const { FieldValue } = require('firebase-admin/firestore');
const { getMediaMetadataById } = require('../services/mediaMetadataService');

function parseMediaIdFromUrl(mediaUrl) {
  if (!mediaUrl || typeof mediaUrl !== 'string') return null;
  const match = mediaUrl.match(/\/media\/([^/?#]+)/i);
  return match?.[1] || null;
}

async function migrateDocument(docRef, data, contextLabel) {
  if (!data || data.media || !data.mediaUrl) return false;

  const mediaId = parseMediaIdFromUrl(data.mediaUrl);
  if (!mediaId) {
    console.log(`[skip] ${contextLabel} (${docRef.path}) -> unsupported mediaUrl format`);
    return false;
  }

  const metadata = await getMediaMetadataById(mediaId);
  if (!metadata) {
    console.log(`[skip] ${contextLabel} (${docRef.path}) -> media metadata missing for id ${mediaId}`);
    return false;
  }

  await docRef.update({
    media: {
      mediaId,
      fileKey: metadata.fileKey,
      type: metadata.type,
      ownerId: metadata.ownerId,
      createdAt: metadata.createdAt,
    },
    mediaUrl: FieldValue.delete(),
  });

  console.log(`[migrated] ${contextLabel} (${docRef.path})`);
  return true;
}

async function migrateSharedDiary(db) {
  const snapshot = await db.collection('sharedDiary').get();
  let count = 0;

  for (const docSnap of snapshot.docs) {
    const changed = await migrateDocument(docSnap.ref, docSnap.data(), 'sharedDiary');
    if (changed) count += 1;
  }

  return count;
}

async function migrateCouplesChatAndVault(db) {
  const couplesSnapshot = await db.collection('couples').get();
  let count = 0;

  for (const coupleDoc of couplesSnapshot.docs) {
    const coupleCode = coupleDoc.id;

    const chatSnapshot = await db.collection('couples').doc(coupleCode).collection('chat').get();
    for (const chatDoc of chatSnapshot.docs) {
      const changed = await migrateDocument(chatDoc.ref, chatDoc.data(), 'chat');
      if (changed) count += 1;
    }

    const vaultSnapshot = await db.collection('vault').doc(coupleCode).collection('items').get();
    for (const vaultDoc of vaultSnapshot.docs) {
      const changed = await migrateDocument(vaultDoc.ref, vaultDoc.data(), 'vault');
      if (changed) count += 1;
    }
  }

  return count;
}

async function main() {
  if (!admin.apps.length) {
    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
    });
  }

  const db = admin.firestore();

  console.log('Starting legacy media URL -> media reference migration...');
  const sharedDiaryCount = await migrateSharedDiary(db);
  const scopedCount = await migrateCouplesChatAndVault(db);

  console.log('Migration completed.');
  console.log(`Migrated sharedDiary docs: ${sharedDiaryCount}`);
  console.log(`Migrated chat/vault docs: ${scopedCount}`);
  console.log(`Total migrated docs: ${sharedDiaryCount + scopedCount}`);
}

main()
  .catch((error) => {
    console.error('Migration failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (admin.apps.length) {
      await Promise.all(admin.apps.map((app) => app.delete()));
    }
  });
