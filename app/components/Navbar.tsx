'use client';

import React, { useState } from 'react';
import { useAuth } from './AuthProvider';
import SideMenu from './SideMenu';
import Link from 'next/link';
import { FiMenu } from 'react-icons/fi';
import { getProfileImageUrl, getUserInitials } from '@/lib/user-utils';

export default function Navbar(): JSX.Element {
  const { user } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);

  const toggleMenu = (): void => {
    setIsMenuOpen(!isMenuOpen);
  };

  return (
    <header className="bg-primary text-white shadow-md">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Logo */}
          <Link href="/" className="font-bold text-xl">
            Maktabah
          </Link>

          {/* Desktop & Mobile Menu Button */}
          {user && (
            <div className="flex items-center">
              {/* Desktop User Info */}
              <div className="hidden md:flex items-center mr-4">
                <span className="text-sm">{user.displayName}</span>
              </div>
              
              {/* Menu Toggle Button - Works for both desktop and mobile */}
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
            </div>
          )}
        </div>
      </div>

      {/* Side Menu - Used for both mobile and desktop */}
      <SideMenu isOpen={isMenuOpen} onClose={toggleMenu} />
    </header>
  );
}
