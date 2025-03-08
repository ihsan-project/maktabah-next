'use client';

import React, { useState } from 'react';
import { useAuth } from './AuthProvider';
import MobileMenu from './MobileMenu';
import Link from 'next/link';
import Image from 'next/image';
import { FiMenu } from 'react-icons/fi';

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
                {user.photoURL && (
                  <div className="relative w-8 h-8 mr-2 rounded-full overflow-hidden">
                    <Image 
                      src={user.photoURL} 
                      alt={user.displayName || 'User'} 
                      fill
                      className="object-cover"
                    />
                  </div>
                )}
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
