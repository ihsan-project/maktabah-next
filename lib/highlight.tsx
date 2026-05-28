import React from 'react';

export function highlightMatches(text: string, term: string): React.ReactNode[] {
  if (!term) return [text];
  const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'gi');
  return text.split(regex).map((part, i) => (regex.test(part) ? <mark key={i}>{part}</mark> : part));
}

export function TextWithLineBreaks({ text, highlightTerm }: { text: string; highlightTerm?: string }) {
  return (
    <>
      {text.split('\n').map((line, index) => (
        <div key={index} className={index > 0 ? 'mt-2' : ''}>
          {highlightTerm ? highlightMatches(line, highlightTerm) : line}
        </div>
      ))}
    </>
  );
}
