'use client';

import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from './AuthProvider';
import { useRouter } from 'next/navigation';
import { ProtectedRouteProps } from '@/types';

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isCheckingAuth, setIsCheckingAuth] = useState(true);
  const hasCheckedAuth = useRef(false);

  useEffect(() => {
    // Wait for the initial auth check to complete
    if (!loading) {
      // Mark that we've done at least one auth check
      hasCheckedAuth.current = true;
      
      // Give a brief moment for auth state to settle after navigation
      const timer = setTimeout(() => {
        setIsCheckingAuth(false);
        
        // Now redirect if user is still not authenticated
        if (!user) {
          router.push('/');
        }
      }, 200);
      
      return () => clearTimeout(timer);
    }
  }, [user, loading, router]);

  // Show loading state while checking auth
  if (loading || isCheckingAuth) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Only render children if user is authenticated
  return user ? <>{children}</> : null;
}
