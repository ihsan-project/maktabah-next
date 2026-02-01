'use client';

import React from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import StoriesList from '@/app/components/StoriesList';

export default function StoriesPage(): JSX.Element {
  return (
    <ProtectedRoute>
      <div className="pb-8">
        <h1 className="text-3xl font-bold text-center text-primary mb-6 pt-8">Quranic Stories</h1>
        
        <div className="container mx-auto px-4">
          <p className="text-center text-gray-600 mb-8 max-w-2xl mx-auto">
            Explore the profound stories from the Quran. Each story is curated with relevant verses and context to help you understand the narrative better.
          </p>
          
          <div className="flex justify-center">
            <StoriesList source="stories_page" />
          </div>
        </div>
      </div>
    </ProtectedRoute>
  );
}

