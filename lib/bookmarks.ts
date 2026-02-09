'use client';

import { useEffect, useState } from 'react';
import { 
  collection, 
  doc, 
  setDoc, 
  deleteDoc, 
  onSnapshot, 
  query,
  Timestamp,
  updateDoc
} from 'firebase/firestore';
import { db } from '@/firebaseConfig';
import { useAuth } from '@/app/components/AuthProvider';
import { SearchResult, Bookmark, BookmarkMetadata, UseBookmarksReturn } from '@/types';
import MixpanelTracking from './mixpanel';

/**
 * Generate a unique verse ID from a SearchResult
 * Format: {title}-{chapter}-{verse}[-{volume}]
 * Examples: "quran-2-255", "bukhari-1-3-7"
 */
export function generateVerseId(result: SearchResult): string {
  const titlePrefix = result.title || 'quran';
  const volumeSuffix = result.volume ? `-${result.volume}` : '';
  return `${titlePrefix}-${result.chapter}-${result.verse}${volumeSuffix}`;
}

/**
 * Custom hook for managing user bookmarks
 * Provides real-time synchronization with Firestore
 */
export function useBookmarks(): UseBookmarksReturn {
  const { user } = useAuth();
  const [bookmarks, setBookmarks] = useState<Bookmark[]>([]);
  const [bookmarkedVerses, setBookmarkedVerses] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState<boolean>(true);

  // Subscribe to user's bookmarks collection
  useEffect(() => {
    if (!user) {
      setBookmarks([]);
      setBookmarkedVerses(new Set());
      setLoading(false);
      return;
    }

    setLoading(true);
    
    // Reference to user's bookmarks collection
    const bookmarksRef = collection(db, 'users', user.uid, 'bookmarks');
    const bookmarksQuery = query(bookmarksRef);

    // Subscribe to real-time updates
    const unsubscribe = onSnapshot(
      bookmarksQuery,
      (snapshot) => {
        const bookmarksData: Bookmark[] = [];
        const verseIds = new Set<string>();

        snapshot.forEach((doc) => {
          const data = doc.data() as Bookmark;
          bookmarksData.push({ ...data, id: doc.id });
          verseIds.add(data.verseId);
        });

        // Sort by creation date (newest first)
        bookmarksData.sort((a, b) => {
          const aTime = a.createdAt?.toMillis?.() || 0;
          const bTime = b.createdAt?.toMillis?.() || 0;
          return bTime - aTime;
        });

        setBookmarks(bookmarksData);
        setBookmarkedVerses(verseIds);
        setLoading(false);

        // Track bookmarks loaded
        MixpanelTracking.track('Bookmarks Loaded', {
          count: bookmarksData.length
        });
      },
      (error) => {
        console.error('Error fetching bookmarks:', error);
        setLoading(false);
      }
    );

    // Cleanup subscription on unmount
    return () => unsubscribe();
  }, [user]);

  /**
   * Check if a verse is bookmarked
   */
  const isBookmarked = (verseId: string): boolean => {
    return bookmarkedVerses.has(verseId);
  };

  /**
   * Add a bookmark
   */
  const addBookmark = async (
    result: SearchResult, 
    metadata?: Partial<BookmarkMetadata>
  ): Promise<void> => {
    if (!user) {
      console.error('User must be logged in to add bookmarks');
      return;
    }

    const verseId = generateVerseId(result);
    
    // Check if already bookmarked
    if (isBookmarked(verseId)) {
      console.log('Verse is already bookmarked');
      return;
    }

    const bookmark: Omit<Bookmark, 'id'> = {
      ...result,
      verseId,
      notes: metadata?.notes || '',
      tags: metadata?.tags || [],
      priority: metadata?.priority || 0,
      createdAt: Timestamp.now(),
      updatedAt: Timestamp.now()
    };

    try {
      const bookmarkRef = doc(db, 'users', user.uid, 'bookmarks', verseId);
      await setDoc(bookmarkRef, bookmark);

      // Track Mixpanel event
      MixpanelTracking.track('Bookmark Added', {
        verseId,
        chapter: result.chapter,
        verse: result.verse,
        author: result.author,
        title: result.title,
        volume: result.volume,
        book_id: result.book_id
      });
    } catch (error) {
      console.error('Error adding bookmark:', error);
      throw error;
    }
  };

  /**
   * Remove a bookmark
   */
  const removeBookmark = async (verseId: string): Promise<void> => {
    if (!user) {
      console.error('User must be logged in to remove bookmarks');
      return;
    }

    try {
      // Find the bookmark to get its details for tracking
      const bookmark = bookmarks.find(b => b.verseId === verseId);
      
      const bookmarkRef = doc(db, 'users', user.uid, 'bookmarks', verseId);
      await deleteDoc(bookmarkRef);

      // Track Mixpanel event
      if (bookmark) {
        MixpanelTracking.track('Bookmark Removed', {
          verseId,
          chapter: bookmark.chapter,
          verse: bookmark.verse,
          author: bookmark.author,
          title: bookmark.title,
          volume: bookmark.volume,
          book_id: bookmark.book_id
        });
      }
    } catch (error) {
      console.error('Error removing bookmark:', error);
      throw error;
    }
  };

  /**
   * Update bookmark metadata (notes, tags, priority)
   */
  const updateBookmarkMetadata = async (
    verseId: string, 
    metadata: Partial<BookmarkMetadata>
  ): Promise<void> => {
    if (!user) {
      console.error('User must be logged in to update bookmarks');
      return;
    }

    try {
      const bookmarkRef = doc(db, 'users', user.uid, 'bookmarks', verseId);
      await updateDoc(bookmarkRef, {
        ...metadata,
        updatedAt: Timestamp.now()
      });

      // Track Mixpanel event
      MixpanelTracking.track('Bookmark Updated', {
        verseId,
        updatedFields: Object.keys(metadata)
      });
    } catch (error) {
      console.error('Error updating bookmark:', error);
      throw error;
    }
  };

  return {
    bookmarks,
    bookmarkedVerses,
    isBookmarked,
    addBookmark,
    removeBookmark,
    updateBookmarkMetadata,
    loading
  };
}
