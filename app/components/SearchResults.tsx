'use client';

import React, { useState } from 'react';
import { FiChevronRight, FiChevronDown, FiChevronLeft } from 'react-icons/fi';
import { SearchResultsProps, SearchResult } from '@/types';
import MixpanelTracking from '@/lib/mixpanel';
import ExpandedSearchResult from './ExpandedSearchResult';
import BookmarkButton from './BookmarkButton';
import NoteIcon from './NoteIcon';
import NotesModal from './NotesModal';
import { useBookmarks, generateVerseId } from '@/lib/bookmarks';
import { Bookmark } from '@/types';

// Helper function to render text with newlines
const TextWithLineBreaks = ({ text }: { text: string }) => {
  return (
    <>
      {text.split('\n').map((line, index) => (
        <div key={index} className={index > 0 ? "mt-2" : ""}>
          {line}
        </div>
      ))}
    </>
  );
};

const isDev = process.env.NODE_ENV === 'development';

const sourceColors: Record<string, string> = {
  keyword: 'bg-orange-100 text-orange-700',
  semantic: 'bg-blue-100 text-blue-700',
  both: 'bg-purple-100 text-purple-700',
};

/**
 * Build the list of page numbers to display.
 * Always shows first, last, current, and neighbors — with ellipsis gaps.
 */
function getPageNumbers(current: number, total: number): (number | 'ellipsis')[] {
  if (total <= 7) {
    return Array.from({ length: total }, (_, i) => i + 1);
  }

  const pages: Set<number> = new Set([1, total]);
  for (let i = Math.max(2, current - 1); i <= Math.min(total - 1, current + 1); i++) {
    pages.add(i);
  }

  const sorted = Array.from(pages).sort((a, b) => a - b);
  const result: (number | 'ellipsis')[] = [];

  for (let i = 0; i < sorted.length; i++) {
    if (i > 0 && sorted[i] - sorted[i - 1] > 1) {
      result.push('ellipsis');
    }
    result.push(sorted[i]);
  }

  return result;
}

export default function SearchResults({
  results,
  loading,
  currentPage,
  totalPages,
  onPageChange,
}: SearchResultsProps): JSX.Element {
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [openNotesModal, setOpenNotesModal] = useState<Bookmark | null>(null);
  const { bookmarks, isBookmarked } = useBookmarks();

  // Handle opening notes modal
  const handleOpenNotes = (verseId: string) => {
    const bookmark = bookmarks.find(b => b.verseId === verseId);
    if (bookmark) {
      setOpenNotesModal(bookmark);
    }
  };

  // Toggle expanded state for a result item
  const toggleExpand = (id: string, result: SearchResult): void => {
    const newState = !expandedItems[id];

    setExpandedItems(prev => ({
      ...prev,
      [id]: newState
    }));

    // Track expand/collapse event
    MixpanelTracking.track(newState ? 'Expand Result' : 'Collapse Result', {
      resultId: id,
      chapter: result.chapter,
      verse: result.verse,
      author: result.author,
      book_id: result.book_id,
      title: result.title,
      volume: result.volume
    });
  };

  if (loading) {
    return (
      <div className="flex justify-center py-8">
        <div className="animate-spin rounded-full h-10 w-10 border-t-2 border-b-2 border-primary"></div>
      </div>
    );
  }

  if (!results.length) {
    return (
      <div className="text-center py-8">
        <p className="text-gray-500 text-lg">No results found. Try a different search term.</p>
      </div>
    );
  }

  // Get border color based on title
  const getBorderColor = (title?: string): string => {
    if (title === 'bukhari') {
      return 'border-l-[#8C6564]'; // Burgundy/maroon color for Bukhari
    }
    return 'border-l-primary'; // Default green for Quran
  };

  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <div className="space-y-6">
      {results.map((result: SearchResult) => {
        const isExpanded = expandedItems[result.id] || false;
        const borderColor = getBorderColor(result.title);

        return (
          <div
            key={result.id}
            className={`card border-l-4 ${borderColor} hover:shadow-lg transition-shadow duration-200`}
          >
            <div
              className="flex flex-col cursor-pointer"
              onClick={() => toggleExpand(result.id, result)}
            >
              <div className="flex justify-between items-center mb-2">
                <div className="flex items-center gap-2">
                  <div className="font-medium text-primary">
                    {result.chapter}:{result.verse}
                  </div>
                  {(() => {
                    const verseId = generateVerseId(result);
                    const bookmarked = isBookmarked(verseId);
                    if (bookmarked) {
                      const bookmark = bookmarks.find(b => b.verseId === verseId);
                      const hasNotes = bookmark?.notesHtml && bookmark.notesHtml.trim().length > 0;
                      return (
                        <NoteIcon
                          hasNotes={!!hasNotes}
                          onClick={() => handleOpenNotes(verseId)}
                        />
                      );
                    }
                    return null;
                  })()}
                </div>
                <div className="flex items-center gap-2">
                  {isDev && result.source && (
                    <span className={`px-2 py-0.5 rounded-full text-[10px] font-mono ${sourceColors[result.source]}`}>
                      {result.source}
                    </span>
                  )}
                  <div className="flex items-center text-xs text-gray-500">
                    {result.title === 'bukhari' && (
                      <span className="px-2 py-0.5 mr-2 rounded-full bg-[#8C6564] text-white">
                        Bukhari
                        {result.volume && ` Vol ${result.volume}`}
                      </span>
                    )}
                    {result.author}
                  </div>
                  <BookmarkButton result={result} />
                </div>
              </div>

              <div className="text-gray-700">
                {isExpanded ? (
                  <>
                    <div className="mb-4">
                      <TextWithLineBreaks text={result.text} />
                    </div>

                    {result.title === 'bukhari' && result.volume && (
                      <div className="mt-2 mb-2">
                        <a
                          href={`https://quranx.com/hadith/Bukhari/USC-MSA/Volume-${result.volume}/Book-${result.chapter}/Hadith-${result.verse}/`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-block px-4 py-2 bg-[#8C6564] text-white rounded text-sm hover:bg-opacity-80 transition-colors"
                          onClick={(e) => {
                            e.stopPropagation();
                            // Track quranx.com link click
                            MixpanelTracking.track('QuranX Link Click', {
                              chapter: result.chapter,
                              verse: result.verse,
                              author: result.author,
                              book_id: result.book_id,
                              volume: result.volume
                            });
                          }}
                        >
                          View on QuranX.com
                        </a>
                      </div>
                    )}

                    {result.title !== 'bukhari' && (
                      <ExpandedSearchResult result={result} />
                    )}
                  </>
                ) : (
                  <div>
                    <TextWithLineBreaks text={result.text} />
                  </div>
                )}
              </div>

              <div className="flex justify-end mt-2 text-gray-400">
                {isExpanded ? (
                  <FiChevronDown size={20} />
                ) : (
                  <FiChevronRight size={20} />
                )}
              </div>
            </div>
          </div>
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav aria-label="Search results pagination" className="flex justify-center items-center gap-1 pt-4 pb-2">
          {/* Previous */}
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="p-2 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Previous page"
          >
            <FiChevronLeft size={20} />
          </button>

          {/* Page numbers */}
          {pageNumbers.map((item, idx) =>
            item === 'ellipsis' ? (
              <span key={`ellipsis-${idx}`} className="px-2 text-gray-400 select-none">...</span>
            ) : (
              <button
                key={item}
                onClick={() => onPageChange(item)}
                disabled={item === currentPage}
                className={`min-w-[36px] h-9 rounded-md text-sm font-medium transition-colors ${
                  item === currentPage
                    ? 'bg-primary text-white cursor-default'
                    : 'text-gray-700 hover:bg-gray-100'
                }`}
                aria-label={`Page ${item}`}
                aria-current={item === currentPage ? 'page' : undefined}
              >
                {item}
              </button>
            )
          )}

          {/* Next */}
          <button
            onClick={() => onPageChange(currentPage + 1)}
            disabled={currentPage >= totalPages}
            className="p-2 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Next page"
          >
            <FiChevronRight size={20} />
          </button>
        </nav>
      )}

      {/* Notes Modal */}
      {openNotesModal && (
        <NotesModal
          bookmark={openNotesModal}
          isOpen={!!openNotesModal}
          onClose={() => setOpenNotesModal(null)}
        />
      )}
    </div>
  );
}
