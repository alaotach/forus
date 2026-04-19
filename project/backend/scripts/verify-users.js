/* eslint-disable no-console */
const fs = require('fs');
const path = require('path');
const dotenv = require('dotenv');

function loadEnvFiles() {
  const cwd = process.cwd();
  const candidates = [
    path.resolve(cwd, '.env'),
    path.resolve(__dirname, '..', '.env'),
    path.resolve(__dirname, '..', '..', '.env'),
  ];

  for (const filePath of candidates) {
    if (fs.existsSync(filePath)) {
      dotenv.config({ path: filePath, override: false });
    }
  }
}

function resolveProjectId() {
  const envCandidates = [
    process.env.FIREBASE_PROJECT_ID,
    process.env.GOOGLE_CLOUD_PROJECT,
    process.env.GCLOUD_PROJECT,
    process.env.EXPO_PUBLIC_FIREBASE_PROJECT_ID,
  ].filter(Boolean);

  if (envCandidates.length > 0) {
    return String(envCandidates[0]).trim();
  }

  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (credentialsPath) {
    try {
      const raw = fs.readFileSync(credentialsPath, 'utf8');
      const parsed = JSON.parse(raw);
      if (parsed && parsed.project_id) {
        return String(parsed.project_id).trim();
      }
    } catch {
      // Ignore parse/read failures and surface a clear error later.
    }
  }

  return null;
}

loadEnvFiles();

const admin = require('firebase-admin');

async function getUserRecord(identifier) {
  const token = String(identifier || '').trim();
  if (!token) return null;

  if (token.includes('@')) {
    return admin.auth().getUserByEmail(token);
  }

  return admin.auth().getUser(token);
}

async function verifyIdentifier(identifier) {
  const user = await getUserRecord(identifier);
  if (!user) {
    throw new Error(`User not found for identifier: ${identifier}`);
  }

  if (user.emailVerified) {
    console.log(`[skip] already verified: ${user.email || user.uid}`);
    return;
  }

  await admin.auth().updateUser(user.uid, { emailVerified: true });
  console.log(`[ok] verified: ${user.email || user.uid} (${user.uid})`);
}

async function main() {
  const identifiers = process.argv.slice(2).map((v) => v.trim()).filter(Boolean);

  if (identifiers.length === 0) {
    console.error('Usage: node scripts/verify-users.js <email-or-uid> [more...]');
    process.exitCode = 1;
    return;
  }

  if (!admin.apps.length) {
    const projectId = resolveProjectId();
    if (!projectId) {
      throw new Error(
        'Unable to detect a Firebase Project Id. Set FIREBASE_PROJECT_ID (or GOOGLE_CLOUD_PROJECT / EXPO_PUBLIC_FIREBASE_PROJECT_ID).'
      );
    }

    admin.initializeApp({
      credential: admin.credential.applicationDefault(),
      projectId,
    });
  }

  for (const identifier of identifiers) {
    try {
      await verifyIdentifier(identifier);
    } catch (error) {
      console.error(`[error] ${identifier}:`, error.message || error);
      process.exitCode = 1;
    }
  }
}

main()
  .catch((error) => {
    console.error('Verification script failed:', error);
    process.exitCode = 1;
  })
  .finally(async () => {
    if (admin.apps.length) {
      await Promise.all(admin.apps.map((app) => app.delete()));
    }
  });
