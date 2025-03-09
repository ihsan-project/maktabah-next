/**
 * Utility functions for handling user data
 */

import { UserType } from '@/types';

/**
 * Gets user initials from display name or email
 */
export const getUserInitials = (user: UserType | null): string => {
  if (!user) return 'U';
  
  if (user.displayName) {
    const nameParts = user.displayName.split(' ');
    if (nameParts.length > 1) {
      // Get first and last name initials
      return `${nameParts[0][0]}${nameParts[nameParts.length - 1][0]}`.toUpperCase();
    } else {
      // Just use the first two letters of the name
      return user.displayName.substring(0, 2).toUpperCase();
    }
  } else if (user.email) {
    // Use the first character of the email
    return user.email[0].toUpperCase();
  }
  
  // Default fallback
  return 'U';
};

/**
 * Ensures profile image URL is properly handled
 * For Google profile images, this ensures they work with Firebase hosting
 */
export const getProfileImageUrl = (photoURL: string | null): string | null => {
  if (!photoURL) return null;
  
  // If it's a Google profile image, make sure it uses HTTPS
  if (photoURL.includes('googleusercontent.com')) {
    return photoURL.replace(/^http:\/\//i, 'https://');
  }
  
  return photoURL;
};
