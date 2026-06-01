import {
  initializeApp,
  getApps,
  getApp,
  App,
} from 'firebase-admin/app';
import { getAuth, Auth } from 'firebase-admin/auth';
import { getFirestore, Firestore } from 'firebase-admin/firestore';
import { getStorage, Storage } from 'firebase-admin/storage';
import { getAppCheck, AppCheck } from 'firebase-admin/app-check';

const STORAGE_BUCKET = 'maktabah-8ac04.firebasestorage.app';

export function getAdminApp(): App {
  if (getApps().length) {
    return getApp();
  }
  // No args: uses Application Default Credentials on App Hosting (Cloud Run).
  // In local dev, the *_EMULATOR_HOST env vars route admin to the emulators.
  return initializeApp({ storageBucket: STORAGE_BUCKET });
}

export function getAdminAuth(): Auth {
  return getAuth(getAdminApp());
}

export function getAdminDb(): Firestore {
  return getFirestore(getAdminApp());
}

export function getAdminStorage(): Storage {
  return getStorage(getAdminApp());
}

export function getAdminAppCheck(): AppCheck {
  return getAppCheck(getAdminApp());
}

export { STORAGE_BUCKET };
