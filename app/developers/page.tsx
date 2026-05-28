import React from 'react';
import type { Metadata } from 'next';
import DevelopersKeysClient from './DevelopersKeysClient';
import { CopyButton } from './CopyButton';

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';
const MCP_SERVER_URL = process.env.NEXT_PUBLIC_MCP_URL || 'https://maktabah.app/mcp';

export const metadata: Metadata = {
  title: 'Developer Access — MCP Server',
  description:
    'Connect your LLM agent to Maktabah’s search engine, Quran translations, Hadith collections, and Arabic dictionary via the Maktabah MCP server.',
  alternates: { canonical: `${siteUrl}/developers` },
  openGraph: {
    title: 'Developer Access — Maktabah MCP Server',
    description:
      'Connect your LLM agent to Maktabah search, Quran translations, Hadith, and the Arabic dictionary.',
    type: 'website',
    url: `${siteUrl}/developers`,
  },
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

const tools = [
  { name: 'search', desc: 'Hybrid search across Quran and Sahih al-Bukhari with keyword, semantic, or hybrid modes' },
  { name: 'get_verse', desc: 'Retrieve a specific Quran verse with all translations and Arabic text' },
  { name: 'get_hadith', desc: 'Retrieve a specific hadith from Sahih al-Bukhari by volume and number' },
  { name: 'lookup_root', desc: "Look up an Arabic root in Lane's Lexicon with definitions and verse occurrences" },
  { name: 'get_word_morphology', desc: 'Get word-by-word breakdown of a Quran verse with root, POS, and transliteration' },
];

export default function DevelopersPage() {
  return (
    <div className="max-w-3xl mx-auto px-4 py-8">
      <h1 className="text-2xl font-bold text-gray-900 mb-2">Developer Access</h1>
      <p className="text-gray-600 mb-8">
        Connect your LLM agent to Maktabah&apos;s search engine, Quran translations, Hadith collections, and Arabic dictionary.
      </p>

      {/* Connection Info (public, SSR) */}
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
          <pre className="bg-gray-900 text-gray-100 text-sm rounded-md p-4 overflow-x-auto">{configSnippet}</pre>
        </div>
      </div>

      {/* API Keys (auth-gated client island) */}
      <DevelopersKeysClient />

      {/* Available Tools (public, SSR) */}
      <div className="bg-white border border-gray-200 rounded-lg p-5 mb-6">
        <h2 className="text-lg font-semibold text-gray-900 mb-3">Available Tools</h2>
        <div className="space-y-3">
          {tools.map((tool) => (
            <div key={tool.name} className="flex items-start space-x-3">
              <code className="text-sm font-mono text-primary bg-primary/5 px-2 py-0.5 rounded flex-shrink-0 mt-0.5">{tool.name}</code>
              <p className="text-sm text-gray-600">{tool.desc}</p>
            </div>
          ))}
        </div>
      </div>

      {/* Recommended System Prompt (public, SSR) */}
      <div className="bg-white border border-gray-200 rounded-lg p-5">
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-lg font-semibold text-gray-900">Recommended System Prompt</h2>
          <CopyButton text={recommendedPrompt} label="Copy" />
        </div>
        <p className="text-sm text-gray-600 mb-3">
          Add this to your LLM&apos;s system prompt to ensure it prioritizes Maktabah&apos;s sourced data over its training data for Islamic knowledge queries.
        </p>
        <pre className="bg-gray-900 text-gray-100 text-sm rounded-md p-4 overflow-x-auto whitespace-pre-wrap">{recommendedPrompt}</pre>
      </div>
    </div>
  );
}
