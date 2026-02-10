'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from './AuthProvider';
import { useRouter } from 'next/navigation';
import { ProtectedRouteProps } from '@/types';

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [minLoadTimePassed, setMinLoadTimePassed] = useState(false);
  const redirectTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Ensure a minimum time passes before making auth decisions
  // This prevents premature redirects during page load
  useEffect(() => {
    const timer = setTimeout(() => {
      setMinLoadTimePassed(true);
    }, 1000); // Wait at least 1 second

    return () => clearTimeout(timer);
  }, []);

  useEffect(() => {
    // Only consider redirecting if:
    // 1. Auth loading is complete
    // 2. Minimum load time has passed
    // 3. Still no user
    if (!loading && minLoadTimePassed && !user) {
      // Add a final small delay to handle race conditions
      redirectTimeoutRef.current = setTimeout(() => {
        router.push('/');
      }, 200);

      return () => {
        if (redirectTimeoutRef.current) {
          clearTimeout(redirectTimeoutRef.current);
        }
      };
    } else if (user && redirectTimeoutRef.current) {
      // User appeared, cancel any pending redirect
      clearTimeout(redirectTimeoutRef.current);
      redirectTimeoutRef.current = null;
    }
  }, [user, loading, minLoadTimePassed, router]);

  // Show loading state while checking auth
  if (loading || !minLoadTimePassed) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Only render children if user is authenticated
  return user ? <>{children}</> : null;
}
