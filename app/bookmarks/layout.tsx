import React from 'react';
import ProtectedRoute from '@/app/components/ProtectedRoute';

export default function BookmarksLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <ProtectedRoute>
      {children}
    </ProtectedRoute>
  );
}
