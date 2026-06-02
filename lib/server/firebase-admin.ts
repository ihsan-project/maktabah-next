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
  // ADC supplies credentials on App Hosting (Cloud Run). Locally, no metadata
  // server means the SDK can't auto-discover the project — pass it explicitly
  // so App Check token verification works in `next dev` as well as production.
  return initializeApp({
    storageBucket: STORAGE_BUCKET,
    projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  });
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
