'use client';

import React from 'react';
import Link from 'next/link';
import { FcGoogle } from 'react-icons/fc';
import MixpanelTracking from '@/lib/mixpanel';
import { useAuth } from './AuthProvider';
import StoriesList from './StoriesList';

export default function HomeContent(): JSX.Element {
  const { loading, signInWithGoogle } = useAuth();

  const trackSignIn = (location: string) => {
    MixpanelTracking.track('Click Sign In', {
      source: 'home_page',
      location: location
    });
  };

  const handleSignInClick = () => {
    trackSignIn('top_section');
    signInWithGoogle();
  };

  const handleBottomSignInClick = () => {
    trackSignIn('bottom_section');
    signInWithGoogle();
  };

  return (
    <>
      {/* Login Section */}
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-md p-8 mb-8 mt-6">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-primary mb-2">Maktabah</h1>
          <p className="text-gray-600 mb-4">Your Gateway to Islamic Knowledge</p>
          <p className="mb-6">Sign in to access the complete collection and search through Islamic texts.</p>
          
          <button
            onClick={handleSignInClick}
            disabled={loading}
            className="flex items-center justify-center gap-2 w-full max-w-md mx-auto py-3 px-4 bg-white text-gray-700 rounded-md shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-300"
          >
            {loading ? (
              <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-primary"></div>
            ) : (
              <>
                <FcGoogle className="text-xl" />
                <span>Sign in with Google</span>
              </>
            )}
          </button>
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
