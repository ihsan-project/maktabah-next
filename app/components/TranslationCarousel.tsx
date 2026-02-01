'use client';

import React, { useRef, useState, useEffect } from 'react';
import { FiChevronLeft, FiChevronRight } from 'react-icons/fi';

interface Translation {
  author: string;
  text: string;
}

interface TranslationCarouselProps {
  translations: Translation[];
  verseRef: string; // e.g., "19:51" for display
}

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

export default function TranslationCarousel({ 
  translations, 
  verseRef 
}: TranslationCarouselProps) {
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Update scroll button states
  const updateScrollButtons = () => {
    if (!scrollContainerRef.current) return;
    
    const { scrollLeft, scrollWidth, clientWidth } = scrollContainerRef.current;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft < scrollWidth - clientWidth - 10);
  };

  // Calculate current index based on scroll position
  const updateCurrentIndex = () => {
    if (!scrollContainerRef.current) return;
    
    const { scrollLeft, clientWidth } = scrollContainerRef.current;
    const cardWidth = clientWidth >= 768 ? clientWidth / 2 : clientWidth;
    const index = Math.round(scrollLeft / cardWidth);
    setCurrentIndex(index);
  };

  useEffect(() => {
    updateScrollButtons();
    updateCurrentIndex();
  }, [translations]);

  const scrollToIndex = (index: number) => {
    if (!scrollContainerRef.current) return;
    
    const { clientWidth } = scrollContainerRef.current;
    const cardWidth = clientWidth >= 768 ? clientWidth / 2 : clientWidth;
    const scrollLeft = index * cardWidth;
    
    scrollContainerRef.current.scrollTo({
      left: scrollLeft,
      behavior: 'smooth'
    });
  };

  const scrollLeft = () => {
    const newIndex = Math.max(0, currentIndex - 1);
    scrollToIndex(newIndex);
  };

  const scrollRight = () => {
    const newIndex = Math.min(translations.length - 1, currentIndex + 1);
    scrollToIndex(newIndex);
  };

  const handleScroll = () => {
    updateScrollButtons();
    updateCurrentIndex();
  };

  if (translations.length === 0) {
    return (
      <div className="text-gray-500 italic text-sm">
        No translations available
      </div>
    );
  }

  return (
    <div className="my-4 relative">
      {/* Carousel Container */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="carousel-container flex overflow-x-auto snap-x snap-mandatory gap-4 pb-2 hide-scrollbar"
      >
        {translations.map((translation, index) => (
          <div
            key={index}
            className="carousel-card snap-start flex-shrink-0 w-full md:w-1/2 bg-white rounded-lg shadow-md p-4 border border-gray-200"
          >
            <div className="flex justify-between items-center mb-3">
              <h4 className="font-semibold text-primary text-sm">
                {translation.author}
              </h4>
              <span className="text-xs text-gray-500">
                {verseRef}
              </span>
            </div>
            <div className="text-gray-700 text-sm leading-relaxed">
              <TextWithLineBreaks text={translation.text} />
            </div>
          </div>
        ))}
      </div>

      {/* Navigation Arrows - only show if there are translations to navigate */}
      {translations.length > 1 && (
        <>
          {canScrollLeft && (
            <button
              onClick={scrollLeft}
              className="absolute left-0 top-1/2 -translate-y-1/2 -translate-x-2 bg-white rounded-full p-2 shadow-lg hover:shadow-xl transition-all z-10 border border-gray-200"
              aria-label="Scroll left"
            >
              <FiChevronLeft size={20} className="text-primary" />
            </button>
          )}
          
          {canScrollRight && (
            <button
              onClick={scrollRight}
              className="absolute right-0 top-1/2 -translate-y-1/2 translate-x-2 bg-white rounded-full p-2 shadow-lg hover:shadow-xl transition-all z-10 border border-gray-200"
              aria-label="Scroll right"
            >
              <FiChevronRight size={20} className="text-primary" />
            </button>
          )}
        </>
      )}

      {/* Dots Indicator */}
      {translations.length > 1 && (
        <div className="flex justify-center gap-2 mt-3">
          {translations.map((_, index) => (
            <button
              key={index}
              onClick={() => scrollToIndex(index)}
              className={`
                w-2 h-2 rounded-full transition-all
                ${index === currentIndex 
                  ? 'bg-primary w-4' 
                  : 'bg-gray-300 hover:bg-gray-400'
                }
              `}
              aria-label={`Go to translation ${index + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}

