'use client';

import { useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import { useAuth } from './AuthProvider';

export default function HomeRedirect(): null {
  const { user, loading } = useAuth();
  const router = useRouter();
  // Only act on the first auth settle. We want to redirect logged-in users
  // who ARRIVE at `/`, not users who LOG IN while on `/` — that path is
  // handled by whatever triggered the login (side menu, hero button, etc.)
  // so any deferred-nav intent (e.g. clicking Bookmarks from the side menu)
  // isn't clobbered by this redirect racing against it.
  const didInitialCheckRef = useRef(false);

  useEffect(() => {
    if (loading) return;
    if (didInitialCheckRef.current) return;
    didInitialCheckRef.current = true;
    if (user) {
      router.push('/search');
    }
  }, [user, loading, router]);

  return null;
}
