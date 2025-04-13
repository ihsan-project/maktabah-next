'use client';

import React from 'react';
import DOMPurify from 'dompurify';

interface TextWithLineBreaksProps {
  text: string;
}

export default function TextWithLineBreaks({ text }: TextWithLineBreaksProps): JSX.Element {
  // Function to normalize HTML and handle line breaks
  const processText = (input: string): string => {
    if (!input) return '';

    // Convert line breaks to <br> tags
    let processedText = input.replace(/\n/g, '<br />');

    // Normalize HTML tag casing (convert closing tags to lowercase)
    // This handles cases like </U> being rendered as </u>
    processedText = processedText.replace(/<\/[A-Z]+>/g, (match) => match.toLowerCase());

    // Sanitize the HTML to prevent XSS
    return DOMPurify.sanitize(processedText);
  };

  return (
    <div dangerouslySetInnerHTML={{ __html: processText(text) }} />
  );
}
