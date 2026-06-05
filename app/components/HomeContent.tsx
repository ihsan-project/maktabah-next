'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import MixpanelTracking from '@/lib/mixpanel';
import { useAuth } from './AuthProvider';
import SearchHero from './SearchHero';
import StoriesList from './StoriesList';

export default function HomeContent(): JSX.Element {
  const router = useRouter();
  const { loading, signInWithGoogle } = useAuth();

  const handleHeroSearch = (query: string) => {
    const trimmed = query.trim();
    if (!trimmed) return;
    MixpanelTracking.track('Search', {
      query: trimmed,
      page: 1,
      source: 'home_page',
    });
    router.push(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const handleBottomSignInClick = () => {
    MixpanelTracking.track('Click Sign In', {
      source: 'home_page',
      location: 'bottom_section',
    });
    signInWithGoogle();
  };

  return (
    <>
      {/* Search Hero */}
      <div className="w-full mt-6 mb-8">
        <SearchHero onSearch={handleHeroSearch} />
      </div>

      {/* Quran Reader Section */}
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-md p-6 mb-8">
        <h2 className="text-xl font-semibold text-primary mb-2 text-center">Quran Reader</h2>
        <p className="text-gray-600 text-center mb-4">
          Browse the Quran with 17 English translations side by side.
        </p>
        <div className="flex justify-center">
          <Link
            href="/quran"
            className="px-6 py-2 bg-primary text-white rounded-md hover:bg-primary-dark transition-colors text-sm font-medium"
          >
            Open Quran Reader
          </Link>
        </div>
      </div>

      {/* Stories Section */}
      <StoriesList source="home_page" />

      <div className="text-center mt-10">
        <p className="text-gray-600 mb-4">
          Sign in to search through the complete collection and create your own stories.
        </p>
        <button
          onClick={handleBottomSignInClick}
          className="btn btn-primary"
          disabled={loading}
        >
          {loading ? (
            <span className="flex items-center">
              <span className="animate-spin rounded-full h-4 w-4 border-t-2 border-b-2 border-white mr-2"></span>
              Loading...
            </span>
          ) : (
            "Get Started"
          )}
        </button>
      </div>
    </>
  );
}
