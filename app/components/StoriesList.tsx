'use client';

import React from 'react';
import Link from 'next/link';
import { ALLOWED_STORIES, getStoryMetadata } from '@/lib/story-config';
import MixpanelTracking from '@/lib/mixpanel';

interface StoriesListProps {
  source?: string; // To track where the click came from
}

export default function StoriesList({ source = 'unknown' }: StoriesListProps): JSX.Element {
  const trackStoryClick = (storyName: string) => {
    MixpanelTracking.track('Click Story', {
      story_name: storyName,
      source: source
    });
  };

  return (
    <div className="w-full max-w-4xl mb-12">
      <h2 className="text-2xl font-semibold text-primary mb-6 text-center">Explore Our Stories</h2>
      
      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        {ALLOWED_STORIES.map((storyName) => {
          const metadata = getStoryMetadata(storyName);
          return (
            <Link 
              href={`/story/${storyName}`} 
              key={storyName}
              className="block bg-white rounded-lg shadow-md hover:shadow-lg transition-shadow duration-200 overflow-hidden"
              onClick={() => trackStoryClick(storyName)}
            >
              <div className="p-6 border-l-4 border-l-primary">
                <h3 className="font-semibold text-lg text-primary-dark mb-2">
                  {metadata.title}
                </h3>
                <p className="text-gray-600 mb-3">
                  {metadata.description}
                </p>
                <div className="flex flex-wrap gap-2 mt-3">
                  {metadata.keywords.slice(0, 3).map((keyword) => (
                    <span 
                      key={keyword} 
                      className="inline-block bg-primary bg-opacity-10 text-primary-dark text-xs px-2 py-1 rounded"
                    >
                      {keyword}
                    </span>
                  ))}
                </div>
                <div className="mt-4 text-primary font-medium flex items-center">
                  <span>Read story</span>
                  <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4 ml-1" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                  </svg>
                </div>
              </div>
            </Link>
          );
        })}
      </div>
    </div>
  );
}
