import React from 'react';
import HomeContent from './components/HomeContent';
import HomeRedirect from './components/HomeRedirect';

export default function HomePage() {
  return (
    <div className="flex flex-col items-center">
      <HomeRedirect />
      <HomeContent />
    </div>
  );
}
