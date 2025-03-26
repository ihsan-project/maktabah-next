'use client';

import React, { useEffect, useState } from 'react';
import { fetchVerse } from '@/lib/fetchVerse';

interface TranslationViewProps {
  bookId: string;
  authorName: string;
  chapter: number;
  verse: number;
}

export default function TranslationView({ 
  bookId, 
  authorName, 
  chapter, 
  verse 
}: TranslationViewProps): JSX.Element {
  const [text, setText] = useState<string | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    const loadTranslation = async () => {
      setLoading(true);
      setError(false);
      
      try {
        const data = await fetchVerse(bookId, chapter, verse);
        
        if (data && data.text) {
          setText(data.text);
        } else {
          setError(true);
        }
      } catch (err) {
        console.error(`Error fetching ${bookId} translation:`, err);
        setError(true);
      } finally {
        setLoading(false);
      }
    };

    loadTranslation();
  }, [bookId, chapter, verse]);

  if (loading) {
    return (
      <div className="py-2">
        <div className="flex items-center space-x-2">
          <h4 className="font-medium text-primary-dark">{authorName}:</h4>
          <div className="h-4 w-4 border-t-2 border-b-2 border-primary animate-spin rounded-full"></div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="border-b pb-2 last:border-b-0">
        <h4 className="font-medium text-primary-dark mb-1">{authorName}:</h4>
        <p className="text-gray-500 italic">Translation not available</p>
      </div>
    );
  }

  return (
    <div className="border-b pb-2 last:border-b-0">
      <h4 className="font-medium text-primary-dark mb-1">{authorName}:</h4>
      <p>{text}</p>
    </div>
  );
}
