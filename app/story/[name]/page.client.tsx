'use client';

import React from 'react';
import Link from 'next/link';
import { FcGoogle } from 'react-icons/fc';
import MixpanelTracking from '@/lib/mixpanel';
import { useAuth } from '@/app/components/AuthProvider';

interface StoryClientProps {
  name: string;
}

export default function StoryClient({ name }: StoryClientProps) {
  // Get authentication state from AuthProvider
  const { user, loading } = useAuth();
  
  const trackSignIn = (location: string) => {
    MixpanelTracking.track('Click Sign In', {
      source: 'story_page',
      story_name: name,
      location: location
    });
  };
  
  // If the user is logged in or still loading authentication state, don't show login prompts
  if (user || loading) {
    return null;
  }
  
  return (
    <>
      {/* Login promotion section */}
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
    </>
  );
}
