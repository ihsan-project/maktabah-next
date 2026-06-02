import { getToken } from 'firebase/app-check';
import { appCheck } from '@/firebaseConfig';

/**
 * fetch() wrapper that attaches the Firebase App Check attestation token as the
 * `X-Firebase-AppCheck` header. If App Check is not initialized (e.g. site key
 * missing) or token retrieval throws (network, reCAPTCHA blocked), the request
 * is sent without the header — the server will reject with 401 if enforcement
 * is on, or accept and log otherwise.
 *
 * Browser-only. Throws synchronously if called server-side.
 */
export async function appCheckFetch(
  input: RequestInfo | URL,
  init: RequestInit = {},
): Promise<Response> {
  if (typeof window === 'undefined') {
    throw new Error('appCheckFetch must only be called from the browser');
  }

  const headers = new Headers(init.headers || {});

  if (appCheck) {
    try {
      const { token } = await getToken(appCheck, /* forceRefresh */ false);
      headers.set('X-Firebase-AppCheck', token);
    } catch (err) {
      // Token retrieval failed (network, reCAPTCHA blocked by extension, etc.).
      // Proceed without the header; the server decides whether to 401.
      console.warn('App Check getToken failed; proceeding without header:', err);
    }
  }

  return fetch(input, { ...init, headers });
}
