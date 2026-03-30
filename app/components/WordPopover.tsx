'use client';

import React, { useEffect, useCallback } from 'react';
import {
  useFloating,
  offset,
  flip,
  shift,
  size,
  autoUpdate,
  FloatingPortal,
} from '@floating-ui/react';
import { QuranWord } from '@/types';
import WordMorphologyContent from './WordMorphologyContent';

/** Detect mobile viewport */
function useIsMobile(breakpoint = 640) {
  const [isMobile, setIsMobile] = React.useState(false);
  useEffect(() => {
    const mq = window.matchMedia(`(max-width: ${breakpoint - 1}px)`);
    setIsMobile(mq.matches);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [breakpoint]);
  return isMobile;
}

interface WordPopoverProps {
  word: QuranWord;
  anchorEl: HTMLElement | null;
  onClose: () => void;
}

export default function WordPopover({ word, anchorEl, onClose }: WordPopoverProps) {
  const isMobile = useIsMobile();

  const { refs, floatingStyles } = useFloating({
    placement: 'top',
    middleware: [
      offset(8),
      flip(),
      shift({ padding: 12 }),
      size({
        padding: 12,
        apply({ availableHeight, elements }) {
          Object.assign(elements.floating.style, {
            maxHeight: `${Math.min(availableHeight, window.innerHeight * 0.7)}px`,
          });
        },
      }),
    ],
    whileElementsMounted: autoUpdate,
    elements: { reference: anchorEl },
  });

  // Close on Escape
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Close on click outside (desktop only)
  useEffect(() => {
    if (isMobile) return;
    const handleClickOutside = (e: MouseEvent) => {
      const floating = refs.floating.current;
      if (
        floating &&
        !floating.contains(e.target as Node) &&
        anchorEl &&
        !anchorEl.contains(e.target as Node)
      ) {
        onClose();
      }
    };
    const timer = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 0);
    return () => {
      clearTimeout(timer);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [onClose, anchorEl, refs.floating, isMobile]);

  // Lock body scroll on mobile when modal is open
  useEffect(() => {
    if (!isMobile) return;
    document.body.style.overflow = 'hidden';
    return () => { document.body.style.overflow = ''; };
  }, [isMobile]);

  const handleBackdropClick = useCallback((e: React.MouseEvent) => {
    if (e.target === e.currentTarget) onClose();
  }, [onClose]);

  // Mobile: bottom-sheet modal with backdrop
  if (isMobile) {
    return (
      <FloatingPortal>
        <div
          className="fixed inset-0 z-50 bg-black/40 word-modal-backdrop"
          onClick={handleBackdropClick}
        >
          <div
            className="absolute bottom-0 left-0 right-0 bg-white rounded-t-2xl shadow-2xl word-modal-sheet max-h-[85vh] flex flex-col"
            dir="ltr"
          >
            <div className="flex justify-center pt-3 pb-1 shrink-0">
              <div className="w-10 h-1 rounded-full bg-gray-300" />
            </div>
            <button
              onClick={onClose}
              className="absolute top-3 right-4 text-gray-400 hover:text-gray-600 text-xl leading-none"
              aria-label="Close"
            >
              &times;
            </button>
            <div className="overflow-y-auto px-5 pb-6 pt-1">
              <WordMorphologyContent word={word} />
            </div>
          </div>
        </div>
      </FloatingPortal>
    );
  }

  // Desktop: floating popover
  return (
    <FloatingPortal>
      <div
        ref={refs.setFloating}
        style={floatingStyles}
        className="z-50 bg-white rounded-lg shadow-xl border border-gray-200 p-4 w-80 word-popover-enter overflow-y-auto"
        dir="ltr"
      >
        <WordMorphologyContent word={word} />
      </div>
    </FloatingPortal>
  );
}
