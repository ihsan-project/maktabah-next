'use client';

import React, { useState, useEffect } from 'react';
import { FiCheck } from 'react-icons/fi';

interface BookFilterProps {
  selectedBooks: string[];
  onChange: (selectedBooks: string[]) => void;
}

export default function BookFilter({ selectedBooks, onChange }: BookFilterProps): JSX.Element {
  const bookOptions = [
    { id: 'quran', label: 'Quran' },
    { id: 'bukhari', label: 'Sahih Bukhari' }
  ];
  
  // Track which checkbox was last selected to prevent deselecting all
  const [lastSelected, setLastSelected] = useState<string | null>(null);

  const handleChange = (bookId: string) => {
    let newSelection = [...selectedBooks];
    
    if (selectedBooks.includes(bookId)) {
      // If this is the only selected item, prevent deselection
      if (selectedBooks.length === 1) {
        return; // Don't allow deselecting the last item
      }
      
      // Otherwise, remove the book from selection
      newSelection = newSelection.filter(id => id !== bookId);
      // Update the last selected if we're removing the current last selected
      if (lastSelected === bookId) {
        setLastSelected(newSelection[0]);
      }
    } else {
      // Add the book to selection
      newSelection.push(bookId);
      setLastSelected(bookId);
    }
    
    // Notify parent component about the change
    onChange(newSelection);
  };

  return (
    <div className="flex space-x-4 items-center">
      <span className="text-gray-700 font-medium">Filter:</span>
      <div className="flex space-x-2">
        {bookOptions.map(book => (
          <div key={book.id} className="relative">
            <button
              type="button"
              onClick={() => handleChange(book.id)}
              className={`px-3 py-2 rounded-md border font-medium flex items-center ${
                selectedBooks.includes(book.id)
                  ? 'bg-primary text-white border-primary'
                  : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
              }`}
              aria-pressed={selectedBooks.includes(book.id)}
            >
              <span className="mr-2">{book.label}</span>
              {selectedBooks.includes(book.id) && <FiCheck size={16} />}
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}
