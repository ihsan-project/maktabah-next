'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { FiChevronRight, FiChevronDown, FiChevronLeft, FiShare2, FiCopy, FiBookOpen } from 'react-icons/fi';
import { SearchResultsProps, SearchResult } from '@/types';
import MixpanelTracking from '@/lib/mixpanel';
import ExpandedSearchResult from './ExpandedSearchResult';
import BookmarkButton from './BookmarkButton';
import NoteIcon from './NoteIcon';
import NotesModal from './NotesModal';
import ArabicText from './ArabicText';
import SkeletonResultCard from './SkeletonResultCard';
import { useBookmarks, generateVerseId } from '@/lib/bookmarks';
import { Bookmark } from '@/types';
import { buildContextUrl } from '@/lib/quran-utils';

const isDev = process.env.NODE_ENV === 'development';

const sourceColors: Record<string, string> = {
  keyword: 'bg-orange-100 text-orange-700',
  semantic: 'bg-blue-100 text-blue-700',
  both: 'bg-purple-100 text-purple-700',
};

/** Display labels and badge colors per book title */
const SOURCE_CONFIG: Record<string, { label: string; badgeClass: string }> = {
  quran: { label: 'Quran', badgeClass: 'bg-primary text-white' },
  bukhari: { label: 'Sahih al-Bukhari', badgeClass: 'bg-[#8C6564] text-white' },
};

/**
 * Renders HTML highlight fragments safely.
 * Only allows <mark> tags from OpenSearch — strips everything else.
 */
function HighlightedText({ html }: { html: string }) {
  // Sanitize: only allow <mark> and </mark>
  const sanitized = html
    .replace(/<(?!\/?mark>)[^>]+>/g, '');
  return (
    <span dangerouslySetInnerHTML={{ __html: sanitized }} />
  );
}

/**
 * Renders text, using highlighted version when available.
 * Falls back to plain text with newline support.
 */
function ResultText({ text, highlight }: { text: string; highlight?: string[] }) {
  if (highlight && highlight.length > 0) {
    return (
      <div>
        {highlight.map((fragment, i) => (
          <div key={i} className={i > 0 ? 'mt-2' : ''}>
            <HighlightedText html={fragment} />
          </div>
        ))}
      </div>
    );
  }
  return (
    <div>
      {text.split('\n').map((line, index) => (
        <div key={index} className={index > 0 ? 'mt-2' : ''}>
          {line}
        </div>
      ))}
    </div>
  );
}

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

/** Build a breadcrumb string from result metadata */
function getBreadcrumb(result: SearchResult): string | null {
  if (result.title === 'quran' || !result.title) {
    const parts: string[] = [];
    if (result.surah_name) {
      parts.push(result.surah_name);
      if (result.surah_name_english) parts.push(`(${result.surah_name_english})`);
    } else if (result.chapter_name) {
      parts.push(result.chapter_name);
    }
    if (result.juz) parts.push(`Juz ${result.juz}`);
    return parts.length > 0 ? parts.join(' · ') : null;
  }
  if (result.title === 'bukhari') {
    const parts: string[] = [];
    if (result.volume) parts.push(`Volume ${result.volume}`);
    if (result.chapter_name) parts.push(result.chapter_name);
    return parts.length > 0 ? parts.join(' · ') : null;
  }
  return null;
}

/** Format the reference string for a result */
function getReference(result: SearchResult): string {
  return `${result.chapter}:${result.verse}`;
}

/** Copy text to clipboard and show brief feedback */
async function copyToClipboard(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    // Fallback for older browsers
    const textarea = document.createElement('textarea');
    textarea.value = text;
    document.body.appendChild(textarea);
    textarea.select();
    document.execCommand('copy');
    document.body.removeChild(textarea);
  }
}

const CONTEXTUAL_MESSAGES = [
  'Searching across Quran and Hadith collections...',
  'Looking through the sources...',
  'Finding the best matches...',
];

type LoadingPhase = 'idle' | 'acknowledge' | 'skeleton';

export default function SearchResults({
  results,
  loading,
  currentPage,
  totalPages,
  onPageChange,
}: SearchResultsProps): JSX.Element {
  const searchParams = useSearchParams();
  const searchQuery = searchParams.get('q') || '';
  const [expandedItems, setExpandedItems] = useState<Record<string, boolean>>({});
  const [openNotesModal, setOpenNotesModal] = useState<Bookmark | null>(null);
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const { bookmarks, isBookmarked } = useBookmarks();

  // Phased loading state
  const [loadingPhase, setLoadingPhase] = useState<LoadingPhase>('idle');
  const [contextMessage, setContextMessage] = useState(CONTEXTUAL_MESSAGES[0]);
  const [showResults, setShowResults] = useState(true);
  const phaseTimersRef = useRef<ReturnType<typeof setTimeout>[]>([]);

  // Manage loading phase transitions
  useEffect(() => {
    // Clear any pending timers
    phaseTimersRef.current.forEach(clearTimeout);
    phaseTimersRef.current = [];

    if (loading) {
      // Phase 1: immediate acknowledgment
      setLoadingPhase('acknowledge');
      setShowResults(false);
      setContextMessage(CONTEXTUAL_MESSAGES[Math.floor(Math.random() * CONTEXTUAL_MESSAGES.length)]);

      // Phase 2: after 300ms, show skeletons
      const skeletonTimer = setTimeout(() => {
        setLoadingPhase('skeleton');
      }, 300);
      phaseTimersRef.current.push(skeletonTimer);
    } else {
      // Phase 3: loading done — fade in results
      setLoadingPhase('idle');
      // Small delay before showing so the fade-in class applies
      const fadeTimer = setTimeout(() => setShowResults(true), 50);
      phaseTimersRef.current.push(fadeTimer);
    }

    return () => {
      phaseTimersRef.current.forEach(clearTimeout);
      phaseTimersRef.current = [];
    };
  }, [loading]);

  const handleOpenNotes = (verseId: string) => {
    const bookmark = bookmarks.find(b => b.verseId === verseId);
    if (bookmark) {
      setOpenNotesModal(bookmark);
    }
  };

  const toggleExpand = (id: string, result: SearchResult): void => {
    const newState = !expandedItems[id];
    setExpandedItems(prev => ({ ...prev, [id]: newState }));
    MixpanelTracking.track(newState ? 'Expand Result' : 'Collapse Result', {
      resultId: id,
      chapter: result.chapter,
      verse: result.verse,
      author: result.author,
      book_id: result.book_id,
      title: result.title,
      volume: result.volume,
    });
  };

  const handleCopyReference = (result: SearchResult) => {
    const ref = getReference(result);
    const sourceLabel = SOURCE_CONFIG[result.title || '']?.label || 'Quran';
    copyToClipboard(`${sourceLabel} ${ref}`);
    setCopiedId(result.id);
    setTimeout(() => setCopiedId(null), 1500);
  };

  const handleShare = (result: SearchResult) => {
    const ref = getReference(result);
    const url = `${window.location.origin}/search?q=${ref}`;
    copyToClipboard(url);
    setCopiedId(`share-${result.id}`);
    setTimeout(() => setCopiedId(null), 1500);
  };

  // Phase 1: acknowledge — progress bar + dimmed old results
  if (loadingPhase === 'acknowledge') {
    return (
      <div>
        <div className="search-progress-bar mb-4" />
        <p className="text-sm text-gray-500 mb-4">{contextMessage}</p>
        {results.length > 0 && (
          <div className="space-y-4 opacity-40 pointer-events-none transition-opacity duration-200">
            {results.map((result) => (
              <div key={result.id} className="card result-card">
                <div className="flex items-center gap-2 mb-3">
                  <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${(SOURCE_CONFIG[result.title || ''] || SOURCE_CONFIG.quran).badgeClass}`}>
                    {(SOURCE_CONFIG[result.title || ''] || SOURCE_CONFIG.quran).label}
                  </span>
                  <span className="font-semibold text-primary text-base">{getReference(result)}</span>
                </div>
                <div className="text-gray-700 leading-relaxed line-clamp-3">{result.text}</div>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Phase 2: skeleton cards
  if (loadingPhase === 'skeleton') {
    return (
      <div>
        <div className="search-progress-bar mb-4" />
        <p className="text-sm text-gray-500 mb-4">{contextMessage}</p>
        <div className="space-y-4">
          {Array.from({ length: 5 }).map((_, i) => (
            <SkeletonResultCard key={i} />
          ))}
        </div>
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

  const pageNumbers = getPageNumbers(currentPage, totalPages);

  return (
    <div className="space-y-4">
      {results.map((result: SearchResult, index: number) => {
        const isExpanded = expandedItems[result.id] || false;
        const sourceConfig = SOURCE_CONFIG[result.title || ''] || SOURCE_CONFIG.quran;
        const breadcrumb = getBreadcrumb(result);
        const reference = getReference(result);
        const verseId = generateVerseId(result);
        const bookmarked = isBookmarked(verseId);
        const bookmark = bookmarked ? bookmarks.find(b => b.verseId === verseId) : null;
        const hasNotes = bookmark?.notesHtml && bookmark.notesHtml.trim().length > 0;

        return (
          <div
            key={result.id}
            className={`card result-card hover:shadow-lg transition-shadow duration-200 ${showResults ? 'result-fade-in' : 'opacity-0'}`}
            style={{ animationDelay: showResults ? `${index * 50}ms` : undefined }}
          >
            {/* Header: source badge + reference + breadcrumb */}
            <div className="flex flex-wrap items-center gap-2 mb-3">
              <span className={`px-2.5 py-0.5 rounded-full text-xs font-semibold ${sourceConfig.badgeClass}`}>
                {sourceConfig.label}
              </span>
              <span className="font-semibold text-primary text-base">
                {reference}
              </span>
              {result.title === 'bukhari' && result.volume && (
                <span className="text-xs text-gray-500">
                  Vol. {result.volume}
                </span>
              )}
              {breadcrumb && (
                <span className="text-xs text-gray-400">
                  {breadcrumb}
                </span>
              )}
              {isDev && result.source && (
                <span className={`ml-auto px-2 py-0.5 rounded-full text-[10px] font-mono ${sourceColors[result.source]}`}>
                  {result.source}
                </span>
              )}
            </div>

            {/* Main content — clickable to expand */}
            <div
              className="cursor-pointer"
              onClick={() => toggleExpand(result.id, result)}
            >
              {/* English text with highlights */}
              <div className="text-gray-700 leading-relaxed">
                <ResultText
                  text={result.text}
                  highlight={result.highlight?.text}
                />
              </div>

              {/* Arabic text (when available from Phase 1 data) */}
              {result.text_arabic_uthmani && (
                <div className="mt-3 pt-3 border-t border-gray-100">
                  <ArabicText size="lg" className="text-gray-800">
                    {result.text_arabic_uthmani}
                  </ArabicText>
                </div>
              )}

              {/* Narrator line for hadith */}
              {result.title === 'bukhari' && result.author && (
                <p className="mt-2 text-sm text-gray-500 italic">
                  Narrated by {result.author}
                </p>
              )}

              {/* Expanded content */}
              {isExpanded && (
                <div className="mt-4">
                  {result.title === 'bukhari' && result.volume && (
                    <div className="mb-2">
                      <a
                        href={`https://quranx.com/hadith/Bukhari/USC-MSA/Volume-${result.volume}/Book-${result.chapter}/Hadith-${result.verse}/`}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-block px-4 py-2 bg-[#8C6564] text-white rounded text-sm hover:bg-opacity-80 transition-colors"
                        onClick={(e) => {
                          e.stopPropagation();
                          MixpanelTracking.track('QuranX Link Click', {
                            chapter: result.chapter,
                            verse: result.verse,
                            author: result.author,
                            book_id: result.book_id,
                            volume: result.volume,
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
                </div>
              )}
            </div>

            {/* Footer: action links */}
            <div className="flex items-center justify-between mt-3 pt-3 border-t border-gray-100">
              <div className="flex items-center gap-3">
                <button
                  className="action-link"
                  onClick={(e) => { e.stopPropagation(); handleShare(result); }}
                  title="Copy share link"
                >
                  <FiShare2 size={14} />
                  <span>{copiedId === `share-${result.id}` ? 'Copied!' : 'Share'}</span>
                </button>
                <button
                  className="action-link"
                  onClick={(e) => { e.stopPropagation(); handleCopyReference(result); }}
                  title="Copy reference"
                >
                  <FiCopy size={14} />
                  <span>{copiedId === result.id ? 'Copied!' : 'Copy Ref'}</span>
                </button>
                <div onClick={(e) => e.stopPropagation()}>
                  <BookmarkButton result={result} />
                </div>
                {(result.title === 'quran' || !result.title) && (
                  <Link
                    href={buildContextUrl(result.chapter, result.verse, searchQuery)}
                    className="action-link"
                    onClick={(e) => {
                      e.stopPropagation();
                      MixpanelTracking.track('Read in Context', {
                        chapter: result.chapter,
                        verse: result.verse,
                        query: searchQuery,
                      });
                    }}
                    title="Read in context"
                  >
                    <FiBookOpen size={14} />
                    <span>Read in Context</span>
                  </Link>
                )}
                {bookmarked && hasNotes && (
                  <div onClick={(e) => e.stopPropagation()}>
                    <NoteIcon
                      hasNotes={true}
                      onClick={() => handleOpenNotes(verseId)}
                    />
                  </div>
                )}
              </div>
              <div
                className="text-gray-400 cursor-pointer"
                onClick={() => toggleExpand(result.id, result)}
              >
                {isExpanded ? <FiChevronDown size={20} /> : <FiChevronRight size={20} />}
              </div>
            </div>
          </div>
        );
      })}

      {/* Pagination */}
      {totalPages > 1 && (
        <nav aria-label="Search results pagination" className="flex justify-center items-center gap-1 pt-4 pb-2">
          <button
            onClick={() => onPageChange(currentPage - 1)}
            disabled={currentPage <= 1}
            className="p-2 rounded-md text-gray-600 hover:bg-gray-100 disabled:opacity-30 disabled:cursor-not-allowed"
            aria-label="Previous page"
          >
            <FiChevronLeft size={20} />
          </button>

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
