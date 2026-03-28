import { getFunctions, httpsCallable } from 'firebase/functions';
import { firebaseApp } from '@/firebaseConfig';
import { ApiKey, GenerateApiKeyResponse } from '@/types';

const functions = getFunctions(firebaseApp);

export async function generateApiKey(name: string): Promise<GenerateApiKeyResponse> {
  const fn = httpsCallable<{ name: string }, GenerateApiKeyResponse>(functions, 'generateApiKey');
  const result = await fn({ name });
  return result.data;
}

export async function revokeApiKey(keyId: string): Promise<void> {
  const fn = httpsCallable<{ keyId: string }, { success: boolean }>(functions, 'revokeApiKey');
  await fn({ keyId });
}

export async function listApiKeys(): Promise<ApiKey[]> {
  const fn = httpsCallable<Record<string, never>, { keys: ApiKey[] }>(functions, 'listApiKeys');
  const result = await fn({});
  return result.data.keys;
}
