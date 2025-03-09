'use client';

import React, { useEffect } from 'react';
import { useAuth } from './AuthProvider';
import { FiX, FiLogOut, FiUser } from 'react-icons/fi';
import { MobileMenuProps } from '@/types';
import { getProfileImageUrl, getUserInitials } from '@/lib/user-utils';

export default function MobileMenu({ isOpen, onClose }: MobileMenuProps): JSX.Element {
  const { user, logout } = useAuth();

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      const target = event.target as HTMLElement;
      if (isOpen && !target.closest('.mobile-menu') && !target.closest('button')) {
        onClose();
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
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

  const handleLogout = async (): Promise<void> => {
    await logout();
    onClose();
  };

  return (
    <div
      className={`fixed inset-0 bg-black bg-opacity-50 z-50 transition-opacity duration-300 ${
        isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
      }`}
    >
      <div
        className={`mobile-menu fixed right-0 top-0 h-full w-64 bg-white transform transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <div className="p-4 border-b border-gray-200">
          <div className="flex items-center justify-between">
            <h2 className="text-lg font-semibold text-primary">Menu</h2>
            <button
              onClick={onClose}
              className="text-gray-500 hover:text-primary focus:outline-none"
            >
              <FiX size={24} />
            </button>
          </div>
        </div>

        {user && (
          <div className="p-4">
            <div className="flex items-center space-x-3 mb-6 pb-4 border-b border-gray-200">
              <div className="w-10 h-10 rounded-full bg-primary-light flex items-center justify-center text-white overflow-hidden">
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
              <div>
                <p className="font-medium text-gray-800">{user.displayName || user.email}</p>
                <p className="text-sm text-gray-500">{user.email}</p>
              </div>
            </div>

            <button
              onClick={handleLogout}
              className="flex items-center space-x-3 w-full py-2 px-4 rounded-md hover:bg-gray-100 text-gray-700"
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
