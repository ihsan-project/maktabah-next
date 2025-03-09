'use client';

import React, { useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { FcGoogle } from 'react-icons/fc';
import { useRouter } from 'next/navigation';

export default function LoginForm(): JSX.Element {
  const { user, loading, signInWithGoogle } = useAuth();
  const router = useRouter();

  // Redirect if already logged in
  useEffect(() => {
    if (user && !loading) {
      router.push('/search');
    }
  }, [user, loading, router]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen p-4">
      <div className="card w-full max-w-md">
        <div className="mb-8 text-center">
          <h1 className="text-3xl font-bold text-primary mb-2">Maktabah</h1>
          <p className="text-gray-600">Sign in to start your search journey</p>
        </div>
        
        <button
          onClick={signInWithGoogle}
          disabled={loading}
          className="flex items-center justify-center gap-2 w-full py-3 px-4 bg-white text-gray-700 rounded-md shadow-md hover:shadow-lg transition-shadow duration-200 border border-gray-300"
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
  );
}
