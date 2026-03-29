#!/usr/bin/env node

/**
 * Upload word-by-word JSON, roots index, and Lane's Lexicon files
 * from public/quran/words/ to Firebase Storage so they're accessible
 * by Cloud Functions (MCP server tools).
 *
 * Usage:
 *   node upload-words-to-storage.js [--service-account="path/to/key.json"]
 */

const fs = require('fs');
const path = require('path');
const admin = require('firebase-admin');
require('dotenv').config();

const BUCKET_NAME = 'maktabah-8ac04.firebasestorage.app';
const PUBLIC_WORDS_DIR = path.resolve(__dirname, '../public/quran/words');

// Parse service account argument
const serviceAccountArg = process.argv.find(a => a.startsWith('--service-account='));
const serviceAccountPath = serviceAccountArg
  ? serviceAccountArg.split('=')[1].replace(/"/g, '')
  : null;

if (serviceAccountPath) {
  const serviceAccount = JSON.parse(fs.readFileSync(serviceAccountPath, 'utf8'));
  admin.initializeApp({ credential: admin.credential.cert(serviceAccount) });
} else {
  admin.initializeApp();
}

const bucket = admin.storage().bucket(BUCKET_NAME);

async function uploadFile(localPath, storagePath) {
  await bucket.upload(localPath, {
    destination: storagePath,
    metadata: {
      contentType: 'application/json',
      cacheControl: 'public, max-age=3600',
    },
  });
  console.log(`  ✓ ${storagePath}`);
}

async function main() {
  console.log('Uploading word-by-word files to Firebase Storage...\n');

  // Upload roots.json
  const rootsPath = path.join(PUBLIC_WORDS_DIR, 'roots.json');
  if (fs.existsSync(rootsPath)) {
    await uploadFile(rootsPath, 'quran/words/roots.json');
  }

  // Upload surah word files (1-114)
  for (let i = 1; i <= 114; i++) {
    const filePath = path.join(PUBLIC_WORDS_DIR, `${i}.json`);
    if (fs.existsSync(filePath)) {
      await uploadFile(filePath, `quran/words/${i}.json`);
    }
  }

  // Upload lanes lexicon files
  const lanesDir = path.join(PUBLIC_WORDS_DIR, 'lanes');
  if (fs.existsSync(lanesDir)) {
    const lanesFiles = fs.readdirSync(lanesDir).filter(f => f.endsWith('.json'));
    for (const file of lanesFiles) {
      await uploadFile(path.join(lanesDir, file), `quran/words/lanes/${file}`);
    }
  }

  console.log('\nDone!');
}

main().catch(err => {
  console.error('Error:', err.message);
  process.exit(1);
});
