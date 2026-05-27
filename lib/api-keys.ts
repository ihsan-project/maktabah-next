import { auth } from '@/firebaseConfig';
import { ApiKey, GenerateApiKeyResponse, ApiKeyUsageResponse } from '@/types';

async function authHeaders(): Promise<HeadersInit> {
  const user = auth.currentUser;
  if (!user) throw new Error('Must be logged in');
  const token = await user.getIdToken(true);
  return { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' };
}

async function parseError(res: Response): Promise<never> {
  let message = 'Request failed';
  try {
    const data = await res.json();
    message = data.error || message;
  } catch {
    /* non-JSON error body */
  }
  throw new Error(message);
}

export async function generateApiKey(name: string): Promise<GenerateApiKeyResponse> {
  const res = await fetch('/api/keys', {
    method: 'POST',
    headers: await authHeaders(),
    body: JSON.stringify({ name }),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}

export async function revokeApiKey(keyId: string): Promise<void> {
  const res = await fetch(`/api/keys/${keyId}`, {
    method: 'DELETE',
    headers: await authHeaders(),
  });
  if (!res.ok) return parseError(res);
}

export async function listApiKeys(): Promise<ApiKey[]> {
  const res = await fetch('/api/keys', { headers: await authHeaders() });
  if (!res.ok) return parseError(res);
  const data = await res.json();
  return data.keys;
}

export async function getApiKeyUsage(keyId: string, days: number = 7): Promise<ApiKeyUsageResponse> {
  const res = await fetch(`/api/keys/${keyId}/usage?days=${days}`, {
    headers: await authHeaders(),
  });
  if (!res.ok) return parseError(res);
  return res.json();
}
