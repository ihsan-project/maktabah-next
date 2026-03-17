'use client';

import React from 'react';

export type SearchMode = 'text' | 'semantic' | 'hybrid';

interface SearchModeToggleProps {
  mode: SearchMode;
  onChange: (mode: SearchMode) => void;
}

const modes: { id: SearchMode; label: string }[] = [
  { id: 'text', label: 'Text' },
  { id: 'semantic', label: 'Semantic' },
  { id: 'hybrid', label: 'Hybrid' },
];

export default function SearchModeToggle({ mode, onChange }: SearchModeToggleProps): JSX.Element {
  return (
    <div className="flex rounded-md border border-gray-300 overflow-hidden">
      {modes.map((m) => (
        <button
          key={m.id}
          type="button"
          onClick={() => onChange(m.id)}
          className={`px-3 py-2 text-sm font-medium transition-colors ${
            mode === m.id
              ? 'bg-primary text-white'
              : 'bg-white text-gray-700 hover:bg-gray-50'
          } ${m.id !== 'text' ? 'border-l border-gray-300' : ''}`}
        >
          {m.label}
        </button>
      ))}
    </div>
  );
}
