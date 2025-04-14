'use client';

import React, { useEffect } from 'react';
import { useAuth } from './components/AuthProvider';
import { useRouter } from 'next/navigation';
import HomeContent from './components/HomeContent';

export default function HomePage(): JSX.Element {
  const { user, loading } = useAuth();
  const router = useRouter();

  useEffect(() => {
    if (!loading && user) {
      router.push('/search');
    }
  }, [user, loading, router]);

  return (
    <div className="flex flex-col items-center">
      <HomeContent />
    </div>
  );
}
