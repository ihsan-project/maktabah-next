'use client';

import React from 'react';

interface BookFilterProps {
  selectedBooks: string[];
  onChange: (selectedBooks: string[]) => void;
}

export default function BookFilter({ selectedBooks, onChange }: BookFilterProps): JSX.Element {
  const bookOptions = [
    { id: 'quran', label: 'Quran' },
    { id: 'bukhari', label: 'Sahih Bukhari' }
  ];

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const options = Array.from(e.target.selectedOptions).map(option => option.value);
    onChange(options);
  };

  return (
    <div className="relative">
      <select
        className="input py-3 pl-4 pr-8 text-lg shadow-sm focus:ring-primary focus:border-primary"
        multiple={false}
        value={selectedBooks.length > 0 ? selectedBooks[0] : ''}
        onChange={handleChange}
        aria-label="Filter by source"
      >
        <option value="">All Sources</option>
        {bookOptions.map(book => (
          <option key={book.id} value={book.id}>
            {book.label}
          </option>
        ))}
      </select>
      <div className="pointer-events-none absolute inset-y-0 right-0 flex items-center px-2 text-gray-700">
        <svg className="fill-current h-4 w-4" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20">
          <path d="M9.293 12.95l.707.707L15.657 8l-1.414-1.414L10 10.828 5.757 6.586 4.343 8z" />
        </svg>
      </div>
    </div>
  );
}
