'use client';

import React, { useEffect } from 'react';
import { useAuth } from './components/AuthProvider';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { FcGoogle } from 'react-icons/fc';
import { ALLOWED_STORIES, getStoryMetadata } from '@/lib/story-config';

export default function HomePage(): JSX.Element {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/search');
    }
  }, [user, loading, router]);

  return (
    <div className="flex flex-col items-center">
      {/* Login Section */}
      <div className="w-full max-w-2xl bg-white rounded-lg shadow-md p-8 mb-8 mt-6">
        <div className="text-center mb-6">
          <h1 className="text-3xl font-bold text-primary mb-2">Maktabah</h1>
          <p className="text-gray-600 mb-4">Your Gateway to Islamic Knowledge</p>
          <p className="mb-6">Sign in to access the complete collection and search through Islamic texts.</p>
          
          <button
            onClick={signInWithGoogle}
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

        <div className="text-center mt-10">
          <p className="text-gray-600 mb-4">
            Sign in to search through the complete collection and create your own stories.
          </p>
          <button
            onClick={signInWithGoogle}
            className="btn btn-primary"
          >
            Get Started
          </button>
        </div>
      </div>
    </div>
  );
}
