'use client';

import React, { useEffect, useState } from 'react';
import { useAuth } from './AuthProvider';
import { useRouter } from 'next/navigation';
import { ProtectedRouteProps } from '@/types';

const AUTH_CHECK_KEY = 'maktabah_auth_status';

export default function ProtectedRoute({ children }: ProtectedRouteProps) {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [isVerifying, setIsVerifying] = useState(true);

  useEffect(() => {
    // When user is authenticated, store in session
    if (user) {
      if (typeof window !== 'undefined') {
        sessionStorage.setItem(AUTH_CHECK_KEY, 'true');
      }
      setIsVerifying(false);
    }
  }, [user]);

  useEffect(() => {
    if (!loading) {
      // Check if we have auth state
      const wasAuthenticated = typeof window !== 'undefined' 
        ? sessionStorage.getItem(AUTH_CHECK_KEY) === 'true'
        : false;

      if (user) {
        // User is present, all good
        setIsVerifying(false);
      } else if (!wasAuthenticated) {
        // Never was authenticated in this session, redirect immediately
        setIsVerifying(false);
        router.push('/');
      } else {
        // Was authenticated but user is temporarily null
        // Wait a bit for auth to recover
        const timer = setTimeout(() => {
          if (!user) {
            // Still no user after waiting, clear session and redirect
            if (typeof window !== 'undefined') {
              sessionStorage.removeItem(AUTH_CHECK_KEY);
            }
            router.push('/');
          }
          setIsVerifying(false);
        }, 1500);

        return () => clearTimeout(timer);
      }
    }
  }, [user, loading, router]);

  // Show loading state
  if (loading || isVerifying) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  // Only render children if user is authenticated
  return user ? <>{children}</> : null;
}
