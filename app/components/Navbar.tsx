'use client';

import React, { useState, useEffect } from 'react';
import { useAuth } from './AuthProvider';
import SideMenu from './SideMenu';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { FiMenu } from 'react-icons/fi';
import { getProfileImageUrl, getUserInitials } from '@/lib/user-utils';

// Ko-fi button styles
const kofiStyles = `
  .kofi-button {
    box-shadow: 1px 1px 0px rgba(0, 0, 0, 0.2);
    line-height: 36px !important;
    min-width: 150px;
    display: inline-block !important;
    padding: 2px 12px !important;
    text-align: center !important;
    border-radius: 7px;
    color: #fff;
    cursor: pointer;
    overflow-wrap: break-word;
    vertical-align: middle;
    border: 0 none #fff !important;
    font-family: 'Quicksand', Helvetica, Century Gothic, sans-serif !important;
    text-decoration: none;
    text-shadow: none;
    font-weight: 700 !important;
    font-size: 14px !important;
    transition: opacity 0.2s;
  }
  .kofi-button:hover {
    opacity: 0.85;
  }
  .kofitext {
    color: #fff !important;
    letter-spacing: -0.15px !important;
    vertical-align: middle;
    line-height: 33px !important;
    padding: 0;
    text-align: center;
    text-decoration: none !important;
  }
  .kofiimg {
    display: initial !important;
    vertical-align: middle;
    height: 15px !important;
    width: 22px !important;
    padding-top: 0 !important;
    padding-bottom: 0 !important;
    border: none;
    margin-top: 0;
    margin-right: 5px !important;
    margin-left: 0 !important;
    margin-bottom: 3px !important;
  }
`;

export default function Navbar(): JSX.Element {
  const { user } = useAuth();
  const pathname = usePathname();
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);

  const toggleMenu = (): void => {
    setIsMenuOpen(!isMenuOpen);
  };

  useEffect(() => {
    // Inject Ko-fi styles
    const styleElement = document.createElement('style');
    styleElement.innerHTML = kofiStyles;
    document.head.appendChild(styleElement);

    // Create Ko-fi button in container
    const container = document.getElementById('kofi-widget-container');
    if (!container) return;

    const kofiHTML = `
      <a title="Support me on ko-fi.com" 
         class="kofi-button" 
         style="background-color:#7c946e;"
         href="https://ko-fi.com/T6T51TDQN2" 
         target="_blank">
        <span class="kofitext">
          <img src="https://storage.ko-fi.com/cdn/cup-border.png" 
               alt="Ko-fi donations" 
               class="kofiimg">Buy me a chai
        </span>
      </a>
    `;

    container.innerHTML = kofiHTML;

    return () => {
      if (document.head.contains(styleElement)) {
        document.head.removeChild(styleElement);
      }
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
            
            {/* Ko-fi Button */}
            <div id="kofi-widget-container" className="flex items-center"></div>
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
