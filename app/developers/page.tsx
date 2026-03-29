'use client';

import React, { useEffect, useState, useCallback } from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import { generateApiKey, revokeApiKey, listApiKeys } from '@/lib/api-keys';
import { ApiKey, GenerateApiKeyResponse } from '@/types';
import { FiCopy, FiCheck, FiTrash2, FiPlus, FiKey, FiAlertCircle } from 'react-icons/fi';

const MCP_SERVER_URL = process.env.NEXT_PUBLIC_MCP_URL || 'https://maktabah-8ac04.web.app/mcp';

function CopyButton({ text, label }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <button
      onClick={handleCopy}
      className="inline-flex items-center space-x-1 text-sm text-primary hover:text-primary-dark transition-colors"
      title="Copy to clipboard"
    >
      {copied ? <FiCheck size={14} /> : <FiCopy size={14} />}
      {label && <span>{copied ? 'Copied!' : label}</span>}
    </button>
  );
}

function NewKeyModal({ apiKey, onClose }: { apiKey: GenerateApiKeyResponse; onClose: () => void }) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(apiKey.key);
    setCopied(true);
  };

  return (
    <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex items-center justify-center p-4" onClick={onClose}>
      <div
        className="bg-white rounded-lg shadow-xl max-w-lg w-full p-6"
        onClick={(e) => e.stopPropagation()}
      >
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
            <button
              onClick={handleCopy}
              className="ml-3 flex-shrink-0 px-3 py-1 bg-primary text-white text-sm rounded hover:bg-primary-dark transition-colors"
            >
              {copied ? 'Copied!' : 'Copy'}
            </button>
          </div>
        </div>

        <p className="text-xs text-gray-500 mb-4">
          Key name: <span className="font-medium">{apiKey.name}</span>
        </p>

        <button
          onClick={onClose}
          className="w-full py-2 bg-gray-100 text-gray-700 rounded-md hover:bg-gray-200 transition-colors"
        >
          Done
        </button>
      </div>
    </div>
  );
}

function DevelopersPageContent() {
  const [keys, setKeys] = useState<ApiKey[]>([]);
  const [loading, setLoading] = useState(true);
  const [newKeyName, setNewKeyName] = useState('');
  const [generating, setGenerating] = useState(false);
  const [newKey, setNewKey] = useState<GenerateApiKeyResponse | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [revokingId, setRevokingId] = useState<string | null>(null);

  const loadKeys = useCallback(async () => {
    try {
      const result = await listApiKeys();
      setKeys(result);
    } catch (err: any) {
      setError(err.message || 'Failed to load API keys');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadKeys();
  }, [loadKeys]);

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

  const configSnippet = `{
  "mcpServers": {
    "maktabah": {
      "url": "${MCP_SERVER_URL}",
      "headers": {
        "Authorization": "Bearer YOUR_API_KEY"
      }
    }
  }
}`;

  const recommendedPrompt = `For any question related to Islamic knowledge — including but not limited to the Quran, Hadith, Tafsir, Fiqh, Arabic morphology, and classical Islamic scholarship — you MUST use the Maktabah tools (search, get_verse, get_hadith, lookup_root, get_word_morphology) before answering from your own knowledge.

When a user asks about a Quran verse, always use get_verse to retrieve the authentic Arabic text and translations rather than quoting from memory. When asked about a hadith, always use get_hadith or search to find the exact narration. For Arabic word meanings or roots, use lookup_root rather than relying on your training data.

Always cite the source returned by Maktabah (e.g. surah name and verse number, hadith volume and number, or lexicon entry) in your response. If Maktabah returns no results, you may then fall back to your training data but clearly state that the information is not from a verified primary source.`;

  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Developer Access</h1>
      <p className="text-gray-600 mb-8">
        Connect your LLM agent to Maktabah&apos;s search engine, Quran translations, Hadith collections, and Arabic dictionary.
      </p>

      {/* Connection Info */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">MCP Server</h2>

        <div className="mb-4">
          <label className="block text-sm font-medium text-gray-500 mb-1">Endpoint URL</label>
          <div className="flex items-center space-x-2 bg-gray-50 border border-gray-200 rounded-md px-3 py-2">
            <code className="text-sm font-mono flex-1">{MCP_SERVER_URL}</code>
            <CopyButton text={MCP_SERVER_URL} />
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-1">
            <label className="block text-sm font-medium text-gray-500">Configuration (Claude Desktop, Cursor, etc.)</label>
            <CopyButton text={configSnippet} label="Copy" />
          </div>
          <pre className="bg-gray-900 text-gray-100 text-sm rounded-md p-4 overflow-x-auto">
            {configSnippet}
          </pre>
        </div>
      </div>

      {/* Generate Key */}
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

        {error && (
          <div className="mb-4 p-3 bg-red-50 border border-red-200 text-red-700 text-sm rounded-md">
            {error}
          </div>
        )}

        {/* Keys Table */}
        {loading ? (
          <div className="flex justify-center py-8">
            <div className="animate-spin rounded-full h-8 w-8 border-t-2 border-b-2 border-primary"></div>
          </div>
        ) : keys.length === 0 ? (
          <div className="text-center py-8 text-gray-500">
            <FiKey size={32} className="mx-auto mb-2 text-gray-300" />
            <p>No API keys yet. Generate one to get started.</p>
          </div>
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
                {keys.map((key) => (
                  <tr
                    key={key.keyId}
                    className={`border-b border-gray-100 ${key.status === 'revoked' ? 'opacity-50' : ''}`}
                  >
                    <td className="py-3 px-2 font-medium text-gray-900">{key.name}</td>
                    <td className="py-3 px-2">
                      <code className="text-xs font-mono text-gray-500">{key.keyPrefix}</code>
                    </td>
                    <td className="py-3 px-2 text-gray-500">
                      {key.createdAt ? new Date(key.createdAt).toLocaleDateString() : '—'}
                    </td>
                    <td className="py-3 px-2">
                      {key.status === 'active' ? (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-700">
                          Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-500">
                          Revoked
                        </span>
                      )}
                    </td>
                    <td className="py-3 px-2 text-right">
                      {key.status === 'active' && (
                        <button
                          onClick={() => handleRevoke(key.keyId)}
                          disabled={revokingId === key.keyId}
                          className="text-red-500 hover:text-red-700 disabled:opacity-50 transition-colors"
                          title="Revoke key"
                        >
                          <FiTrash2 size={16} />
                        </button>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Available Tools */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Available Tools</h2>
        <div className="space-y-3">
          {[
            { name: 'search', desc: 'Hybrid search across Quran and Sahih al-Bukhari with keyword, semantic, or hybrid modes' },
            { name: 'get_verse', desc: 'Retrieve a specific Quran verse with all translations and Arabic text' },
            { name: 'get_hadith', desc: 'Retrieve a specific hadith from Sahih al-Bukhari by volume and number' },
            { name: 'lookup_root', desc: "Look up an Arabic root in Lane's Lexicon with definitions and verse occurrences" },
            { name: 'get_word_morphology', desc: 'Get word-by-word breakdown of a Quran verse with root, POS, and transliteration' },
          ].map((tool) => (
            <div key={tool.name} className="flex items-start space-x-3">
              <code className="text-sm font-mono text-primary bg-primary/5 px-2 py-0.5 rounded flex-shrink-0 mt-0.5">
                {tool.name}
              </code>
              <p className="text-sm text-gray-600">{tool.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended System Prompt */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Recommended System Prompt</h2>
          <CopyButton text={recommendedPrompt} label="Copy" />
        </div>
        <p className="text-sm text-gray-600 mb-3">
          Add this to your LLM&apos;s system prompt to ensure it prioritizes Maktabah&apos;s sourced data over its training data for Islamic knowledge queries.
        </p>
        <pre className="bg-gray-900 text-gray-100 text-sm rounded-md p-4 overflow-x-auto whitespace-pre-wrap">
          {recommendedPrompt}
        </pre>
      </div>

      {/* New Key Modal */}
      {newKey && <NewKeyModal apiKey={newKey} onClose={() => setNewKey(null)} />}
    </div>
  );
}

export default function DevelopersPage() {
  return (
    <ProtectedRoute>
      <DevelopersPageContent />
    </ProtectedRoute>
  );
}
