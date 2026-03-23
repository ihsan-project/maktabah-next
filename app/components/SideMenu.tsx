'use client';

import React, { useEffect, useRef, useCallback } from 'react';
import { useAuth } from './AuthProvider';
import { FiX, FiLogOut, FiSearch, FiBook, FiBookmark, FiCoffee } from 'react-icons/fi';
import { SideMenuProps } from '@/types';
import { getProfileImageUrl, getUserInitials } from '@/lib/user-utils';
import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function SideMenu({ isOpen, onClose }: SideMenuProps): JSX.Element {
  const { user, logout } = useAuth();
  const pathname = usePathname();
  const menuRef = useRef<HTMLDivElement>(null);
  const closeButtonRef = useRef<HTMLButtonElement>(null);

  // Focus trap + Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleKeyDown = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') {
        onClose();
        return;
      }

      if (e.key === 'Tab' && menuRef.current) {
        const focusableEls = menuRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])'
        );
        const firstEl = focusableEls[0];
        const lastEl = focusableEls[focusableEls.length - 1];

        if (e.shiftKey && document.activeElement === firstEl) {
          e.preventDefault();
          lastEl.focus();
        } else if (!e.shiftKey && document.activeElement === lastEl) {
          e.preventDefault();
          firstEl.focus();
        }
      }
    };

    document.addEventListener('keydown', handleKeyDown);
    // Focus close button on open
    closeButtonRef.current?.focus();

    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [isOpen, onClose]);

  // Lock body scroll when menu is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    return () => {
      document.body.style.overflow = '';
    };
  }, [isOpen]);

  // Swipe-to-close gesture
  const touchStartX = useRef<number | null>(null);
  const handleTouchStart = useCallback((e: React.TouchEvent) => {
    touchStartX.current = e.touches[0].clientX;
  }, []);
  const handleTouchEnd = useCallback((e: React.TouchEvent) => {
    if (touchStartX.current === null) return;
    const diff = touchStartX.current - e.changedTouches[0].clientX;
    // Swipe left to close (threshold 50px)
    if (diff > 50) onClose();
    touchStartX.current = null;
  }, [onClose]);

  const handleLogout = async (): Promise<void> => {
    await logout();
    onClose();
  };

  const navItems = [
    { href: '/search', label: 'Search', icon: FiSearch },
    { href: '/stories', label: 'Stories', icon: FiBook },
    { href: '/bookmarks', label: 'Bookmarks', icon: FiBookmark },
  ];

  return (
    <div
      className={`fixed inset-0 bg-black bg-opacity-50 z-50 transition-opacity duration-300 ${
        isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
      onClick={onClose}
      aria-hidden={!isOpen}
    >
      <div
        ref={menuRef}
        role="dialog"
        aria-modal="true"
        aria-label="Side menu"
        className={`side-menu fixed left-0 top-0 h-full w-72 bg-white shadow-xl transform transition-transform duration-300 ease-in-out flex flex-col ${
          isOpen ? 'translate-x-0' : '-translate-x-full'
        }`}
        onClick={(e) => e.stopPropagation()}
        onTouchStart={handleTouchStart}
        onTouchEnd={handleTouchEnd}
      >
        {/* Header with profile */}
        <div className="p-4 bg-primary text-white">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-lg font-semibold">Menu</h2>
            <button
              ref={closeButtonRef}
              onClick={onClose}
              className="text-white hover:text-primary-light focus:outline-none focus:ring-2 focus:ring-white rounded"
              aria-label="Close menu"
            >
              <FiX size={24} />
            </button>
          </div>

          {user && (
            <div className="flex items-center space-x-3">
              <div className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center text-white overflow-hidden flex-shrink-0">
                {getProfileImageUrl(user.photoURL) ? (
                  <img
                    src={getProfileImageUrl(user.photoURL) as string}
                    alt={user.displayName || 'User'}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <span className="text-base font-bold">{getUserInitials(user)}</span>
                )}
              </div>
              <div className="min-w-0">
                <p className="font-medium truncate">{user.displayName || user.email}</p>
                <p className="text-sm text-green-200 truncate">{user.email}</p>
              </div>
            </div>
          )}
        </div>

        {/* Navigation links */}
        <nav className="flex-1 py-2 overflow-y-auto">
          {navItems.map(({ href, label, icon: Icon }) => (
            <Link
              key={href}
              href={href}
              onClick={onClose}
              className={`flex items-center space-x-3 px-4 py-3 text-gray-700 hover:bg-gray-100 transition-colors ${
                pathname === href ? 'bg-gray-100 text-primary font-medium border-l-4 border-primary' : ''
              }`}
            >
              <Icon size={20} />
              <span>{label}</span>
            </Link>
          ))}

          <div className="border-t border-gray-200 my-2" />

          {/* Buy me a chai */}
          <a
            href="https://ko-fi.com/T6T51TDQN2"
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center space-x-3 px-4 py-3 text-gray-700 hover:bg-gray-100 transition-colors"
          >
            <FiCoffee size={20} />
            <span>Buy me a chai</span>
          </a>

        </nav>

        {/* Logout at bottom */}
        {user && (
          <div className="border-t border-gray-200 p-4">
            <button
              onClick={handleLogout}
              className="flex items-center space-x-3 w-full py-2 px-4 rounded-md hover:bg-gray-100 text-gray-700 transition-colors"
            >
              <FiLogOut size={20} />
              <span>Logout</span>
            </button>
          </div>
        )}
      </div>
    </div>
  );
}