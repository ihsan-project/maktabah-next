'use client';

import React, { useState } from 'react';
import { FiCopy, FiCheck } from 'react-icons/fi';

export function CopyButton({ text, label }: { text: string; label?: string }) {
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
