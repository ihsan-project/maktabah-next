// Firebase configuration for client-side usage
import { initializeApp, getApps, FirebaseApp } from 'firebase/app';
import { getAuth, connectAuthEmulator, Auth } from 'firebase/auth';
import { getFirestore, connectFirestoreEmulator, Firestore } from 'firebase/firestore';
import {
  initializeAppCheck,
  ReCaptchaEnterpriseProvider,
  AppCheck,
} from 'firebase/app-check';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
  measurementId: process.env.NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID,
};

let firebaseApp: FirebaseApp;
if (!getApps().length) {
  firebaseApp = initializeApp(firebaseConfig);
} else {
  firebaseApp = getApps()[0];
}

const auth: Auth = getAuth(firebaseApp);
const db: Firestore = getFirestore(firebaseApp);

// Connect to emulators in development
if (typeof window !== 'undefined' && process.env.NODE_ENV === 'development') {
  const w = window as any;
  if (!w.__maktabah_emulatorConnected) {
    connectAuthEmulator(auth, 'http://localhost:9099', { disableWarnings: true });
    connectFirestoreEmulator(db, 'localhost', 8080);
    w.__maktabah_emulatorConnected = true;
  }
}

// App Check — must be initialized after initializeApp and before any protected
// fetch. Browser-only. Skipped if the site key is missing so the app still
// renders in environments where App Check is not configured.
let appCheck: AppCheck | null = null;
if (typeof window !== 'undefined') {
  const siteKey = process.env.NEXT_PUBLIC_RECAPTCHA_SITE_KEY;
  if (siteKey) {
    // Debug-token opt-in for local dev. Must be set BEFORE initializeAppCheck.
    if (process.env.NEXT_PUBLIC_APP_CHECK_DEBUG === 'true') {
      (self as any).FIREBASE_APPCHECK_DEBUG_TOKEN = true;
    }
    try {
      appCheck = initializeAppCheck(firebaseApp, {
        provider: new ReCaptchaEnterpriseProvider(siteKey),
        isTokenAutoRefreshEnabled: true,
      });
    } catch (err) {
      // Re-initialization in HMR or duplicate init is non-fatal; surface for visibility.
      console.warn('App Check init skipped:', err);
    }
  } else {
    console.warn('App Check disabled: NEXT_PUBLIC_RECAPTCHA_SITE_KEY not set');
  }
}

export { auth, firebaseApp, db, appCheck };
