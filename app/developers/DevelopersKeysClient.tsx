'use client';

import React, { useEffect, useState, useCallback } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { generateApiKey, revokeApiKey, listApiKeys, getApiKeyUsage } from '@/lib/api-keys';
import { ApiKey, GenerateApiKeyResponse, ApiKeyUsageResponse } from '@/types';
import { FiTrash2, FiPlus, FiKey, FiAlertCircle, FiChevronDown, FiChevronRight } from 'react-icons/fi';
import { CopyButton } from './CopyButton';

function NewKeyModal({ apiKey, onClose }: { apiKey: GenerateApiKeyResponse; onClose: () => void }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = async () => {
    await navigator.clipboard.writeText(apiKey.key);
    setCopied(true);
  };
  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center space-x-2 mb-4">
          <FiAlertCircle size={20} className="text-amber-500" />
          <h3 className="text-lg font-semibold">Save your API key</h3>
        </div>
        <p className="text-sm text-gray-600 mb-4">
          This is the only time your full API key will be shown. Copy it now and store it securely.
        </p>
        <div className="bg-gray-50 border border-gray-200 rounded-md p-3 mb-4">
          <div className="flex items-center justify-between">
            <code className="text-sm font-mono break-all">{apiKey.key}</code>
            <button onClick={handleCopy} className="ml-3 flex-shrink-0 px-3 py-1 bg-primary text-white text-sm rounded hover:bg-primary-dark transition-colors">
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>
        <p className="text-xs text-gray-500 mb-4">Key name: <span className="font-medium">{apiKey.name}</span></p>
        <button onClick={onClose} className="w-full py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors">Done</button>
      </div>
    </div>
  );
}

function UsageBar({ value, max }: { value: number; max: number }) {
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;
  return (
    <div className="flex items-center space-x-2">
      <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
        <div className="h-full bg-primary rounded-full transition-all" style={{ width: `${pct}%` }} />
      </div>
      <span className="text-xs text-gray-500 w-8 text-right">{value}</span>
    </div>
  );
}

function UsagePanel({ keyId }: { keyId: string }) {
  const [usage, setUsage] = useState<ApiKeyUsageResponse | null>(null);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    getApiKeyUsage(keyId, 7).then(setUsage).catch(() => {}).finally(() => setLoading(false));
  }, [keyId]);
  if (loading) {
    return <div className="py-4 flex justify-center"><div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-primary" /></div>;
  }
  if (!usage) return <p className="text-sm text-gray-500 py-2">Failed to load usage data.</p>;
  const maxRequests = Math.max(...usage.usage.map((d) => d.requests), 1);
  const toolTotals: Record<string, number> = {};
  usage.usage.forEach((day) => {
    Object.entries(day.tools).forEach(([tool, count]) => {
      toolTotals[tool] = (toolTotals[tool] || 0) + count;
    });
  });
  const sortedTools = Object.entries(toolTotals).sort((a, b) => b[1] - a[1]);
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 py-3">
      <div className="space-y-1">
        <div className="flex justify-between text-xs text-gray-500"><span>Total requests</span><span className="font-medium text-gray-900">{usage.requestCount.toLocaleString()}</span></div>
        <div className="flex justify-between text-xs text-gray-500"><span>Rate limit</span><span className="font-medium text-gray-900">{usage.rateLimit} req/min</span></div>
        <div className="flex justify-between text-xs text-gray-500"><span>Last used</span><span className="font-medium text-gray-900">{usage.lastUsedAt ? new Date(usage.lastUsedAt).toLocaleDateString() : 'Never'}</span></div>
        {sortedTools.length > 0 && (
          <div className="pt-2">
            <p className="text-xs font-medium text-gray-500 mb-1">Tools (7 days)</p>
            {sortedTools.map(([tool, count]) => (
              <div key={tool} className="flex justify-between text-xs text-gray-500"><code className="text-xs font-mono">{tool}</code><span>{count}</span></div>
            ))}
          </div>
        )}
      </div>
      <div>
        <p className="text-xs font-medium text-gray-500 mb-2">Requests (last 7 days)</p>
        <div className="space-y-1">
          {usage.usage.map((day) => (
            <div key={day.date} className="flex items-center space-x-2">
              <span className="text-xs text-gray-400 w-10 flex-shrink-0">{new Date(day.date + 'T00:00:00').toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}</span>
              <div className="flex-1"><UsageBar value={day.requests} max={maxRequests} /></div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function KeysManager() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [newKey, setNewKey] = useState<GenerateApiKeyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);
  const [collapsedKeys, setCollapsedKeys] = useState<Set<string>>(new Set());

  const loadKeys = useCallback(async () => {
    try {
      setKeys(await listApiKeys());
    } catch (err: any) {
      setError(err.message || 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { loadKeys(); }, [loadKeys]);

  const handleGenerate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newKeyName.trim();
    if (!name) return;
    setGenerating(true);
    setError(null);
    try {
      const result = await generateApiKey(name);
      setNewKey(result);
      setNewKeyName('');
      await loadKeys();
    } catch (err: any) {
      setError(err.message || 'Failed to generate API key');
    } finally {
      setGenerating(false);
    }
  };

  const handleRevoke = async (keyId: string) => {
    if (!confirm('Are you sure you want to revoke this API key? This cannot be undone.')) return;
    setRevokingId(keyId);
    setError(null);
    try {
      await revokeApiKey(keyId);
      await loadKeys();
    } catch (err: any) {
      setError(err.message || 'Failed to revoke API key');
    } finally {
      setRevokingId(null);
    }
  };

  return (
    <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
      <h2 className="text-lg font-semibold text-gray-900 mb-3">API Keys</h2>
      <form onSubmit={handleGenerate} className="flex items-center space-x-3 mb-4">
        <input
          type="text"
          value={newKeyName}
          onChange={(e) => setNewKeyName(e.target.value)}
          placeholder="Key name (e.g. Claude Desktop)"
          className="flex-1 px-3 py-2 border border-gray-300 rounded-md text-sm focus:outline-none focus:ring-2 focus:ring-primary focus:border-transparent"
          maxLength={100}
          required
        />
        <button
          type="submit"
          disabled={generating || !newKeyName.trim()}
          className="inline-flex items-center space-x-1 px-4 py-2 bg-primary text-white text-sm font-medium rounded-md hover:bg-primary-dark disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          <FiPlus size={16} />
          <span>{generating ? 'Generating...' : 'Generate'}</span>
        </button>
      </form>

      {error && <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">{error}</div>}

      {loading ? (
        <div className="flex justify-center py-8"><div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary" /></div>
      ) : keys.length === 0 ? (
        <div className="text-center py-8 text-gray-500"><FiKey size={32} className="mx-auto mb-2 text-gray-300" /><p>No API keys yet. Generate one to get started.</p></div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-200">
                <th className="text-left py-2 px-2 font-medium text-gray-500">Name</th>
                <th className="text-left py-2 px-2 font-medium text-gray-500">Key</th>
                <th className="text-left py-2 px-2 font-medium text-gray-500">Created</th>
                <th className="text-left py-2 px-2 font-medium text-gray-500">Status</th>
                <th className="text-right py-2 px-2 font-medium text-gray-500"></th>
              </tr>
            </thead>
            <tbody>
              {keys.map((key) => {
                const isExpanded = key.status === 'active' && !collapsedKeys.has(key.keyId);
                const toggleExpanded = () => {
                  setCollapsedKeys((prev) => {
                    const next = new Set(prev);
                    if (next.has(key.keyId)) next.delete(key.keyId);
                    else next.add(key.keyId);
                    return next;
                  });
                };
                return (
                  <React.Fragment key={key.keyId}>
                    <tr className={`border-b border-gray-100 ${key.status === 'revoked' ? 'opacity-50' : 'cursor-pointer hover:bg-gray-50'}`} onClick={() => key.status === 'active' && toggleExpanded()}>
                      <td className="py-3 px-2 font-medium text-gray-900">
                        <span className="inline-flex items-center space-x-1">
                          {key.status === 'active' && (isExpanded ? <FiChevronDown size={14} className="text-gray-400" /> : <FiChevronRight size={14} className="text-gray-400" />)}
                          <span>{key.name}</span>
                        </span>
                      </td>
                      <td className="py-3 px-2"><code className="text-xs font-mono text-gray-500">{key.keyPrefix}</code></td>
                      <td className="py-3 px-2 text-gray-500">{key.createdAt ? new Date(key.createdAt).toLocaleDateString() : '—'}</td>
                      <td className="py-3 px-2">
                        {key.status === 'active' ? (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">Active</span>
                        ) : (
                          <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">Revoked</span>
                        )}
                      </td>
                      <td className="py-3 px-2 text-right">
                        {key.status === 'active' && (
                          <button onClick={(e) => { e.stopPropagation(); handleRevoke(key.keyId); }} disabled={revokingId === key.keyId} className="text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors" title="Revoke key">
                            <FiTrash2 size={16} />
                          </button>
                        )}
                      </td>
                    </tr>
                    {isExpanded && (
                      <tr><td colSpan={5} className="px-2 bg-gray-50 border-b border-gray-100"><UsagePanel keyId={key.keyId} /></td></tr>
                    )}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {newKey && <NewKeyModal apiKey={newKey} onClose={() => setNewKey(null)} />}
    </div>
  );
}

export default function DevelopersKeysClient() {
  return (
    <ProtectedRoute>
      <KeysManager />
    </ProtectedRoute>
  );
}
