'use client';

import React, { useState } from 'react';
import { useAuth } from './AuthProvider';
import SideMenu from './SideMenu';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FiMenu } from 'react-icons/fi';
import { getProfileImageUrl, getUserInitials } from '@/lib/user-utils';

export default function Navbar(): JSX.Element {
  const { user } = useAuth();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);

  const toggleMenu = (): void => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header className="bg-primary text-white shadow-md">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Left side: Profile Icon and Logo */}
          <div className="flex items-center gap-4">
            {/* Menu Toggle Button - Profile Icon */}
            {user && (
              <button 
                className="flex items-center focus:outline-none" 
                onClick={toggleMenu}
              >
                <div className="w-8 h-8 rounded-full overflow-hidden bg-primary-light flex items-center justify-center text-white">
                  {getProfileImageUrl(user.photoURL) ? (
                    <img 
                      src={getProfileImageUrl(user.photoURL) as string} 
                      alt={user.displayName || 'User'} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-bold">{getUserInitials(user)}</span>
                  )}
                </div>
              </button>
            )}
            
            {/* Logo */}
            <Link href="/" className="font-bold text-xl">
              Maktabah
            </Link>
          </div>

          {/* Right side: Navigation Links */}
          {user && (
            <nav className="flex items-center gap-4">
              <Link 
                href="/search" 
                className={`text-sm font-medium hover:text-primary-light transition-colors ${
                  pathname === '/search' ? 'border-b-2 border-white pb-1' : ''
                }`}
              >
                Search
              </Link>
              <Link 
                href="/stories" 
                className={`text-sm font-medium hover:text-primary-light transition-colors ${
                  pathname === '/stories' ? 'border-b-2 border-white pb-1' : ''
                }`}
              >
                Stories
              </Link>
            </nav>
          )}
        </div>
      </div>

      {/* Side Menu - Used for both mobile and desktop */}
      <SideMenu isOpen={isMenuOpen} onClose={toggleMenu} />
    </header>
  );
}
