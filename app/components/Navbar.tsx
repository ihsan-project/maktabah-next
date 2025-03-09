'use client';

import React, { useState } from 'react';
import { useAuth } from './AuthProvider';
import MobileMenu from './MobileMenu';
import Link from 'next/link';
import { FiMenu, FiUser } from 'react-icons/fi';
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
          <Link href={user ? '/search' : '/'} className="font-bold text-xl">
            Maktabah
          </Link>

          {/* Desktop Navigation */}
          {user && (
            <div className="hidden md:flex items-center space-x-4">
              <div className="flex items-center">
                <div className="w-8 h-8 mr-2 rounded-full overflow-hidden bg-primary-light flex items-center justify-center text-white">
                  {getProfileImageUrl(user.photoURL) ? (
                    <img 
                      src={getProfileImageUrl(user.photoURL) as string} 
                      alt={user.displayName || 'User'} 
                      className="w-full h-full object-cover"
                    />
                  ) : (
                    <span className="text-sm font-bold">{getUserInitials(user)}</span>
                  )}
                </div>}
                <span className="text-sm">{user.displayName}</span>
              </div>
            </div>
          )}

          {/* Mobile Menu Button */}
          {user && (
            <button 
              className="md:hidden flex items-center text-white focus:outline-none" 
              onClick={toggleMenu}
            >
              <FiMenu className="h-6 w-6" />
            </button>
          )}
        </div>
      </div>

      {/* Mobile Menu Slider */}
      <MobileMenu isOpen={isMenuOpen} onClose={toggleMenu} />
    </header>
  );
}
