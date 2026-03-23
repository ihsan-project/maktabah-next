'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { useAuth } from './AuthProvider';
import SideMenu from './SideMenu';
import Link from 'next/link';
import { FiMenu } from 'react-icons/fi';

const EDGE_THRESHOLD = 20; // pixels from left edge to start swipe
const SWIPE_MIN_DISTANCE = 50; // minimum swipe distance to trigger open

export default function Navbar(): JSX.Element {
  const { user } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

  const openMenu = useCallback(() => setIsMenuOpen(true), []);
  const closeMenu = useCallback(() => setIsMenuOpen(false), []);
  const toggleMenu = useCallback(() => setIsMenuOpen((prev) => !prev), []);

  // Swipe from left edge to open menu (PRD-MENU-007)
  useEffect(() => {
    const handleTouchStart = (e: TouchEvent): void => {
      const touch = e.touches[0];
      if (touch.clientX <= EDGE_THRESHOLD) {
        touchStartRef.current = { x: touch.clientX, y: touch.clientY };
      }
    };

    const handleTouchEnd = (e: TouchEvent): void => {
      if (!touchStartRef.current) return;
      const touch = e.changedTouches[0];
      const dx = touch.clientX - touchStartRef.current.x;
      const dy = Math.abs(touch.clientY - touchStartRef.current.y);
      // Must swipe right more than threshold, and not be a vertical scroll
      if (dx > SWIPE_MIN_DISTANCE && dy < dx) {
        setIsMenuOpen(true);
      }
      touchStartRef.current = null;
    };

    document.addEventListener('touchstart', handleTouchStart, { passive: true });
    document.addEventListener('touchend', handleTouchEnd, { passive: true });
    return () => {
      document.removeEventListener('touchstart', handleTouchStart);
      document.removeEventListener('touchend', handleTouchEnd);
    };
  }, []);

  return (
    <header className="bg-primary text-white shadow-md">
      <div className="container mx-auto px-4">
        <div className="flex items-center justify-between h-16">
          {/* Left side: Hamburger and Logo */}
          <div className="flex items-center gap-4">
            {user && (
              <button
                className="flex items-center focus:outline-none focus:ring-2 focus:ring-white rounded p-1"
                onClick={toggleMenu}
                aria-label={isMenuOpen ? 'Close menu' : 'Open menu'}
                aria-expanded={isMenuOpen}
              >
                <FiMenu size={24} />
              </button>
            )}

            <Link href="/" className="font-bold text-xl">
              Maktabah
            </Link>
          </div>
        </div>
      </div>

      <SideMenu isOpen={isMenuOpen} onClose={closeMenu} />
    </header>
  );
}
