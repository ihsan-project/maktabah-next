'use client';

import React, { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useAuth } from './AuthProvider';
import SideMenu from './SideMenu';
import Link from 'next/link';
import { useRouter, usePathname, useSearchParams } from 'next/navigation';
import { FiMenu, FiSearch, FiX } from 'react-icons/fi';

const EDGE_THRESHOLD = 20; // pixels from left edge to start swipe
const SWIPE_MIN_DISTANCE = 50; // minimum swipe distance to trigger open

function NavbarSearch(): JSX.Element {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [navQuery, setNavQuery] = useState('');
  const [isMobileSearchOpen, setIsMobileSearchOpen] = useState(false);
  const mobileInputRef = useRef<HTMLInputElement>(null);
  const desktopInputRef = useRef<HTMLInputElement>(null);

  // Hide navbar search on the search hero page (search page with no query)
  const isSearchHero = pathname === '/search' && !searchParams.get('q');
  if (isSearchHero) return <></>;

  const handleNavSearch = (e: React.FormEvent<HTMLFormElement>): void => {
    e.preventDefault();
    if (!navQuery.trim()) return;
    router.push(`/search?q=${encodeURIComponent(navQuery.trim())}`);
    setNavQuery('');
    setIsMobileSearchOpen(false);
  };

  const openMobileSearch = (): void => {
    setIsMobileSearchOpen(true);
    // Focus input after overlay renders
    setTimeout(() => mobileInputRef.current?.focus(), 50);
  };

  const closeMobileSearch = (): void => {
    setIsMobileSearchOpen(false);
    setNavQuery('');
  };

  return (
    <>
      {/* Desktop: inline compact search */}
      <form
        onSubmit={handleNavSearch}
        className="hidden md:flex items-center flex-1 max-w-md ml-4"
      >
        <div className="relative w-full">
          <input
            ref={desktopInputRef}
            type="text"
            value={navQuery}
            onChange={(e) => setNavQuery(e.target.value)}
            placeholder="Search..."
            className="w-full py-1.5 pl-3 pr-9 text-sm text-gray-900 bg-white/90 border border-white/20 rounded-lg focus:outline-none focus:ring-2 focus:ring-white/50 placeholder-gray-400"
          />
          <button
            type="submit"
            disabled={!navQuery.trim()}
            className="absolute right-2 top-1/2 -translate-y-1/2 text-gray-400 hover:text-primary"
            aria-label="Search"
          >
            <FiSearch size={16} />
          </button>
        </div>
      </form>

      {/* Mobile: search icon button */}
      <button
        className="md:hidden flex items-center focus:outline-none focus:ring-2 focus:ring-white rounded p-1"
        onClick={openMobileSearch}
        aria-label="Open search"
      >
        <FiSearch size={22} />
      </button>

      {/* Mobile: full-screen search overlay */}
      {isMobileSearchOpen && (
        <div className="mobile-search-overlay fixed inset-0 z-[60] bg-primary flex flex-col">
          <div className="flex items-center gap-3 px-4 py-3">
            <button
              onClick={closeMobileSearch}
              className="text-white focus:outline-none focus:ring-2 focus:ring-white rounded p-1 flex-shrink-0"
              aria-label="Close search"
            >
              <FiX size={24} />
            </button>
            <form onSubmit={handleNavSearch} className="flex-1">
              <input
                ref={mobileInputRef}
                type="text"
                value={navQuery}
                onChange={(e) => setNavQuery(e.target.value)}
                placeholder="Search the Quran and Hadith..."
                className="w-full py-3 px-4 text-lg text-gray-900 bg-white rounded-lg focus:outline-none focus:ring-2 focus:ring-white/50"
                autoFocus
              />
            </form>
          </div>
          <div className="flex-1 px-4 pt-4">
            <p className="text-white/60 text-sm">
              Type a query and press Enter to search
            </p>
          </div>
        </div>
      )}
    </>
  );
}

export default function Navbar(): JSX.Element {
  const { user } = useAuth();
  const [isMenuOpen, setIsMenuOpen] = useState<boolean>(false);
  const touchStartRef = useRef<{ x: number; y: number } | null>(null);

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

            <Link href="/" className="font-bold text-xl flex-shrink-0">
              Maktabah
            </Link>
          </div>

          {/* Right side: Nav search (when logged in) */}
          {user && (
            <Suspense fallback={null}>
              <NavbarSearch />
            </Suspense>
          )}
        </div>
      </div>

      <SideMenu isOpen={isMenuOpen} onClose={closeMenu} />
    </header>
  );
}
