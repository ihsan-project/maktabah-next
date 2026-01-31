'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { FcGoogle } from 'react-icons/fc';
import { FiChevronRight, FiChevronDown } from 'react-icons/fi';
import MixpanelTracking from '@/lib/mixpanel';
import { useAuth } from '@/app/components/AuthProvider';

interface Translation {
  author: string;
  text: string;
}

interface ProcessedVerse {
  key: number;
  chapter: string;
  verse: string;
  chapterName: string;
  bookId: string;
  score: string;
  translations: Translation[];
}

interface StoryClientProps {
  name: string;
  verses: ProcessedVerse[];
}

// Helper function to render text with newlines
const TextWithLineBreaks = ({ text }: { text: string }) => {
  return (
    <>
      {text.split('\n').map((line, index) => (
        <div key={index} className={index > 0 ? "mt-2" : ""}>
          {line}
        </div>
      ))}
    </>
  );
};

export default function StoryClient({ name, verses }: StoryClientProps) {
  // Get authentication state from AuthProvider
  const { user, loading } = useAuth();
  
  // State to track expanded verses
  const [expandedVerses, setExpandedVerses] = useState<Record<number, boolean>>({});
  
  // State to track expanded translations within each verse
  const [expandedTranslations, setExpandedTranslations] = useState<Record<string, boolean>>({});
  
  const trackSignIn = (location: string) => {
    MixpanelTracking.track('Click Sign In', {
      source: 'story_page',
      story_name: name,
      location: location
    });
  };
  
  const toggleVerse = (verseKey: number) => {
    setExpandedVerses(prev => ({
      ...prev,
      [verseKey]: !prev[verseKey]
    }));
  };
  
  const toggleTranslation = (verseKey: number, author: string) => {
    const key = `${verseKey}-${author}`;
    setExpandedTranslations(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };
  
  return (
    <>
      {/* Login promotion section - only shown if not logged in */}
      {!user && !loading && (
        <div className="mb-8 p-6 bg-primary-light bg-opacity-10 rounded-lg text-center">
          <h2 className="text-xl font-semibold text-primary mb-2">Discover More Islamic Knowledge</h2>
          <p className="mb-4">
            Sign in to search the full collection of Islamic texts and create your own stories.
          </p>
          <Link 
            href="/" 
            className="inline-flex items-center gap-2 py-3 px-6 bg-white text-gray-700 rounded-md shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-300"
            onClick={() => trackSignIn('top_banner')}
          >
            <FcGoogle className="text-xl" />
            <span>Sign in with Google</span>
          </Link>
        </div>
      )}
      
      {/* Story verses */}
      <div className="space-y-6">
        {verses.map((verse) => {
          const isExpanded = expandedVerses[verse.key] || false;
          const firstTranslation = verse.translations[0];
          
          return (
            <div 
              key={verse.key} 
              className="card border-l-4 border-l-primary hover:shadow-lg transition-shadow duration-200"
            >
              <div 
                className="cursor-pointer"
                onClick={() => toggleVerse(verse.key)}
              >
                <div className="flex justify-between items-center mb-2">
                  <div className="font-medium text-primary">
                    {verse.chapter}:{verse.verse}
                  </div>
                  <div className="text-xs text-gray-500">
                    {firstTranslation?.author}
                  </div>
                </div>
                
                <div className="text-gray-700">
                  {firstTranslation && (
                    <p>
                      <TextWithLineBreaks text={firstTranslation.text} />
                    </p>
                  )}
                </div>
                
                {verse.chapterName && (
                  <div className="mt-2 text-sm text-gray-500">
                    From: {verse.chapterName}
                  </div>
                )}
                
                <div className="flex justify-end mt-2 text-gray-400">
                  {isExpanded ? (
                    <FiChevronDown size={20} />
                  ) : (
                    <FiChevronRight size={20} />
                  )}
                </div>
              </div>
              
              {/* Expanded translations view */}
              {isExpanded && verse.translations.length > 1 && (
                <div className="mt-4 pt-4 border-t">
                  <div className="flex justify-between items-center mb-4">
                    <h3 className="font-medium text-lg text-primary">All Translations</h3>
                    <a 
                      href={`https://tanzil.net/#trans/${verse.bookId}/${verse.chapter}:${verse.verse}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1 bg-primary text-white rounded text-sm hover:bg-primary-dark"
                      onClick={(e) => {
                        e.stopPropagation();
                        MixpanelTracking.track('Tanzil Link Click', {
                          chapter: verse.chapter,
                          verse: verse.verse,
                          source: 'story_page',
                          story_name: name
                        });
                      }}
                    >
                      View on tanzil.net
                    </a>
                  </div>
                  
                  <div className="space-y-3">
                    {verse.translations.map((translation, idx) => {
                      const translationKey = `${verse.key}-${translation.author}`;
                      const isTranslationExpanded = expandedTranslations[translationKey] || idx === 0;
                      
                      return (
                        <div 
                          key={idx} 
                          className="border rounded-md overflow-hidden"
                        >
                          <div 
                            className="flex justify-between items-center p-3 bg-gray-50 cursor-pointer hover:bg-gray-100"
                            onClick={(e) => {
                              e.stopPropagation();
                              toggleTranslation(verse.key, translation.author);
                            }}
                          >
                            <h4 className="font-medium">{translation.author}</h4>
                            <span className="text-gray-500">
                              {isTranslationExpanded ? '▼' : '▶'}
                            </span>
                          </div>
                          
                          {isTranslationExpanded && (
                            <div className="p-3 border-t text-gray-700">
                              <TextWithLineBreaks text={translation.text} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </>
  );
}
