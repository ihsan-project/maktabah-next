'use client';

import React, { useState, useEffect } from 'react';
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

  useEffect(() => {
    // Create tip button in container
    const container = document.getElementById('kofi-widget-container');
    if (!container) return;

    const tipButtonHTML = `
      <a title="Support me on ko-fi.com" 
         class="bg-green-700 hover:bg-green-600 text-white font-semibold py-2 px-4 rounded-lg transition-colors shadow-sm text-sm" 
         href="https://ko-fi.com/T6T51TDQN2" 
         target="_blank">
        <span class="hidden sm:inline">Buy me a chai</span><span class="sm:hidden">Tip</span>
      </a>
    `;

    container.innerHTML = tipButtonHTML;

    return () => {
      container.innerHTML = '';
    };
  }, []);

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
            
            {/* Tip Button */}
            <div id="kofi-widget-container" className="flex items-center mr-4"></div>
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
              <Link 
                href="/bookmarks" 
                className={`text-sm font-medium hover:text-primary-light transition-colors ${
                  pathname === '/bookmarks' ? 'border-b-2 border-white pb-1' : ''
                }`}
              >
                Bookmarks
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
