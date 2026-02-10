'use client';

import React, { useState, useEffect } from 'react';
import { FiX, FiSave } from 'react-icons/fi';
import QuillEditor from './QuillEditor';
import { Bookmark } from '@/types';
import { useBookmarks } from '@/lib/bookmarks';
import MixpanelTracking from '@/lib/mixpanel';

interface NotesModalProps {
  bookmark: Bookmark;
  isOpen: boolean;
  onClose: () => void;
}

export default function NotesModal({ bookmark, isOpen, onClose }: NotesModalProps): JSX.Element | null {
  const { updateBookmarkNotes } = useBookmarks();
  const [notesHtml, setNotesHtml] = useState<string>(bookmark.notesHtml || '');
  const [isSaving, setIsSaving] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Track modal open
  useEffect(() => {
    if (isOpen) {
      MixpanelTracking.trackPageView('Bookmark Notes Modal');
      // Reset notes when modal opens
      setNotesHtml(bookmark.notesHtml || '');
      setHasUnsavedChanges(false);
    }
  }, [isOpen, bookmark.notesHtml]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }
    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  const handleNotesChange = (html: string) => {
    setNotesHtml(html);
    setHasUnsavedChanges(true);
  };

  const handleSave = async () => {
    if (!hasUnsavedChanges) return;

    setIsSaving(true);
    try {
      await updateBookmarkNotes(bookmark.verseId, notesHtml);
      setHasUnsavedChanges(false);
      
      // Track save event
      MixpanelTracking.track('Bookmark Notes Saved', {
        verseId: bookmark.verseId,
        chapter: bookmark.chapter,
        verse: bookmark.verse
      });

      // Show success feedback
      setTimeout(() => {
        onClose();
      }, 500);
    } catch (error) {
      console.error('Error saving notes:', error);
      alert('Failed to save notes. Please try again.');
    } finally {
      setIsSaving(false);
    }
  };

  const handleClose = () => {
    if (hasUnsavedChanges) {
      const confirmed = confirm('You have unsaved changes. Do you want to close without saving?');
      if (!confirmed) return;
    }
    onClose();
  };

  // Handle escape key
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, hasUnsavedChanges]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto">
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black bg-opacity-50 transition-opacity"
        onClick={handleClose}
      />
      
      {/* Modal */}
      <div className="flex min-h-full items-center justify-center p-4">
        <div 
          className="relative bg-white rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] flex flex-col"
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="flex items-center justify-between p-6 border-b border-gray-200">
            <div className="flex-1">
              <h2 className="text-2xl font-semibold text-gray-800">
                Notes for {bookmark.chapter}:{bookmark.verse}
              </h2>
              {bookmark.chapter_name && (
                <p className="text-sm text-gray-500 mt-1">
                  {bookmark.chapter_name}
                </p>
              )}
            </div>
            <button
              onClick={handleClose}
              className="ml-4 text-gray-400 hover:text-gray-600 transition-colors"
              aria-label="Close modal"
            >
              <FiX className="w-6 h-6" />
            </button>
          </div>

          {/* Content - Scrollable */}
          <div className="flex-1 overflow-y-auto p-6">
            {/* Notes Editor */}
            <div>
              <h3 className="text-lg font-semibold text-gray-800 mb-3">Your Notes</h3>
              <QuillEditor
                value={notesHtml}
                onChange={handleNotesChange}
                placeholder="Take notes about this verse..."
              />
              
              {hasUnsavedChanges && (
                <div className="mt-3 text-sm text-amber-600 flex items-center gap-2">
                  <span className="w-2 h-2 bg-amber-600 rounded-full"></span>
                  <span>You have unsaved changes</span>
                </div>
              )}
            </div>

            {/* Verse Text */}
            <div className="bg-gray-50 rounded-lg p-4 mb-6">
              <div className="flex items-center gap-3 mb-2">
                <span className="text-sm font-medium text-primary">
                  {bookmark.chapter}:{bookmark.verse}
                </span>
                {bookmark.title === 'bukhari' && (
                  <span className="px-2 py-0.5 text-xs rounded-full bg-[#8C6564] text-white">
                    Bukhari
                    {bookmark.volume && ` Vol ${bookmark.volume}`}
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-500 mb-2">{bookmark.author}</p>
              <p className="text-gray-800 leading-relaxed whitespace-pre-wrap">
                {bookmark.text}
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200">
            <button
              onClick={handleClose}
              className="px-4 py-2 text-gray-700 hover:text-gray-900 transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSave}
              disabled={!hasUnsavedChanges || isSaving}
              className={`flex items-center gap-2 px-6 py-2 rounded-lg transition-colors ${
                hasUnsavedChanges && !isSaving
                  ? 'bg-primary text-white hover:bg-primary-dark'
                  : 'bg-gray-300 text-gray-500 cursor-not-allowed'
              }`}
            >
              <FiSave className="w-4 h-4" />
              <span>{isSaving ? 'Saving...' : 'Save Notes'}</span>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
