'use client';

import React, { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import ProtectedRoute from '@/app/components/ProtectedRoute';
import QuillEditor from '@/app/components/QuillEditor';
import { useBookmarks } from '@/lib/bookmarks';
import { Bookmark } from '@/types';
import { FiArrowLeft, FiSave } from 'react-icons/fi';
import MixpanelTracking from '@/lib/mixpanel';

function NotesPageContent(): JSX.Element {
  const params = useParams();
  const router = useRouter();
  const verseId = params.verseId as string;
  const { bookmarks, updateBookmarkNotes, loading } = useBookmarks();
  
  const [bookmark, setBookmark] = useState<Bookmark | null>(null);
  const [notesHtml, setNotesHtml] = useState<string>('');
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Track page view
  useEffect(() => {
    MixpanelTracking.trackPageView('Bookmark Notes Page');
  }, []);

  // Find the bookmark
  useEffect(() => {
    if (!loading && bookmarks.length > 0) {
      const foundBookmark = bookmarks.find(b => b.verseId === verseId);
      if (foundBookmark) {
        setBookmark(foundBookmark);
        setNotesHtml(foundBookmark.notesHtml || '');
      } else {
        // Bookmark not found, redirect to bookmarks page
        router.push('/bookmarks');
      }
    }
  }, [bookmarks, loading, verseId, router]);

  const handleNotesChange = (html: string) => {
    setNotesHtml(html);
    setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
    if (!bookmark || !hasUnsavedChanges) return;

    setIsSaving(true);
    try {
      await updateBookmarkNotes(verseId, notesHtml);
      setHasUnsavedChanges(false);
      
      // Track save event
      MixpanelTracking.track('Bookmark Notes Saved', {
        verseId,
        chapter: bookmark.chapter,
        verse: bookmark.verse
      });
    } catch (error) {
      console.error('Error saving notes:', error);
      alert('Failed to save notes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleBack = () => {
    if (hasUnsavedChanges) {
      const confirmed = confirm('You have unsaved changes. Do you want to leave without saving?');
      if (!confirmed) return;
    }
    router.push('/bookmarks');
  };

  if (loading || !bookmark) {
    return (
      <div className="min-h-screen bg-gray-50 flex justify-center items-center">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="container mx-auto px-4 py-8 max-w-4xl">
        {/* Header with back button */}
        <div className="mb-6 flex items-center justify-between">
          <button
            onClick={handleBack}
            className="flex items-center gap-2 text-gray-600 hover:text-gray-800 transition-colors"
          >
            <FiArrowLeft className="w-5 h-5" />
            <span>Back to Bookmarks</span>
          </button>
          
          <button
            onClick={handleSave}
            disabled={!hasUnsavedChanges || isSaving}
            className={`flex items-center gap-2 px-4 py-2 rounded-lg transition-colors ${
              hasUnsavedChanges && !isSaving
                ? 'bg-primary text-white hover:bg-primary-dark'
                : 'bg-gray-300 text-gray-500 cursor-not-allowed'
            }`}
          >
            <FiSave className="w-4 h-4" />
            <span>{isSaving ? 'Saving...' : 'Save Notes'}</span>
          </button>
        </div>

        {/* Verse Information */}
        <div className="bg-white rounded-lg shadow-md p-6 mb-6">
          <div className="mb-4">
            <div className="flex items-center gap-3 mb-2">
              <span className="text-sm font-medium text-primary">
                {bookmark.chapter}:{bookmark.verse}
              </span>
              {bookmark.chapter_name && (
                <span className="text-sm text-gray-500 italic">
                  ({bookmark.chapter_name})
                </span>
              )}
              {bookmark.title === 'bukhari' && (
                <span className="px-2 py-0.5 text-xs rounded-full bg-[#8C6564] text-white">
                  Bukhari
                  {bookmark.volume && ` Vol ${bookmark.volume}`}
                </span>
              )}
            </div>
            <p className="text-sm text-gray-500 mb-3">{bookmark.author}</p>
          </div>
          
          <div className="prose max-w-none">
            <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
              {bookmark.text}
            </p>
          </div>
        </div>

        {/* Notes Editor */}
        <div className="bg-white rounded-lg shadow-md p-6">
          <h2 className="text-xl font-semibold text-gray-800 mb-4">Your Notes</h2>
          <QuillEditor
            value={notesHtml}
            onChange={handleNotesChange}
            placeholder="Take notes about this verse..."
          />
          
          {hasUnsavedChanges && (
            <div className="mt-4 text-sm text-amber-600 flex items-center gap-2">
              <span className="w-2 h-2 bg-amber-600 rounded-full"></span>
              <span>You have unsaved changes</span>
            </div>
          )}
        </div>

        {/* Auto-save hint */}
        <div className="mt-4 text-center text-sm text-gray-500">
          Click "Save Notes" to save your changes
        </div>
      </div>
    </div>
  );
}

export default function NotesPage(): JSX.Element {
  return (
    <ProtectedRoute>
      <NotesPageContent />
    </ProtectedRoute>
  );
}
