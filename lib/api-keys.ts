import { httpsCallable } from 'firebase/functions';
import { functions } from '@/firebaseConfig';
import { ApiKey, GenerateApiKeyResponse, ApiKeyUsageResponse } from '@/types';

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

export async function getApiKeyUsage(keyId: string, days: number = 7): Promise<ApiKeyUsageResponse> {
  const fn = httpsCallable<{ keyId: string; days: number }, ApiKeyUsageResponse>(functions, 'getApiKeyUsage');
  const result = await fn({ keyId, days });
  return result.data;
}
