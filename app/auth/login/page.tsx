'use client';

import React from 'react';
import LoginForm from '@/app/components/LoginForm';

export default function LoginPage(): JSX.Element {
  return (
    <div className="min-h-[80vh] flex items-center justify-center">
      <LoginForm />
    </div>
  );
}
