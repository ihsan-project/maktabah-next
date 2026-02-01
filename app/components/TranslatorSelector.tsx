'use client';

import React, { useState, useEffect } from 'react';
import { FiCheck } from 'react-icons/fi';

interface TranslatorSelectorProps {
  availableTranslators: string[];
  onSelectionChange: (selected: string[]) => void;
}

const STORAGE_KEY = 'maktabah_selected_translators';

export default function TranslatorSelector({ 
  availableTranslators, 
  onSelectionChange 
}: TranslatorSelectorProps) {
  const [selectedTranslators, setSelectedTranslators] = useState<string[]>([]);
  const [isExpanded, setIsExpanded] = useState(false);

  // Load from localStorage on mount
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const stored = localStorage.getItem(STORAGE_KEY);
      if (stored) {
        try {
          const parsed = JSON.parse(stored);
          // Filter to only include translators that are available
          const valid = parsed.filter((t: string) => availableTranslators.includes(t));
          if (valid.length > 0) {
            setSelectedTranslators(valid);
            onSelectionChange(valid);
            return;
          }
        } catch (e) {
          console.error('Failed to parse stored translators:', e);
        }
      }
      // Default: all translators selected
      setSelectedTranslators(availableTranslators);
      onSelectionChange(availableTranslators);
    }
  }, [availableTranslators, onSelectionChange]);

  const toggleTranslator = (translator: string) => {
    const newSelection = selectedTranslators.includes(translator)
      ? selectedTranslators.filter(t => t !== translator)
      : [...selectedTranslators, translator];
    
    // Ensure at least one translator is selected
    if (newSelection.length === 0) {
      return;
    }
    
    setSelectedTranslators(newSelection);
    onSelectionChange(newSelection);
    
    // Persist to localStorage
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(newSelection));
    }
  };

  const selectAll = () => {
    setSelectedTranslators(availableTranslators);
    onSelectionChange(availableTranslators);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(availableTranslators));
    }
  };

  const deselectAll = () => {
    // Keep at least one selected
    const firstTranslator = [availableTranslators[0]];
    setSelectedTranslators(firstTranslator);
    onSelectionChange(firstTranslator);
    if (typeof window !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(firstTranslator));
    }
  };

  return (
    <div className="mb-6 bg-white rounded-lg shadow-md p-4">
      <div className="flex justify-between items-center mb-2">
        <h3 className="font-semibold text-lg text-primary">
          Select Translations ({selectedTranslators.length} of {availableTranslators.length})
        </h3>
        <button
          onClick={() => setIsExpanded(!isExpanded)}
          className="text-sm text-primary hover:text-primary-dark transition-colors"
        >
          {isExpanded ? 'Hide' : 'Show'}
        </button>
      </div>
      
      {isExpanded && (
        <div>
          <div className="flex gap-2 mb-3">
            <button
              onClick={selectAll}
              className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            >
              Select All
            </button>
            <button
              onClick={deselectAll}
              className="text-xs px-3 py-1 bg-gray-100 hover:bg-gray-200 rounded transition-colors"
            >
              Reset
            </button>
          </div>
          
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
            {availableTranslators.map((translator) => {
              const isSelected = selectedTranslators.includes(translator);
              return (
                <button
                  key={translator}
                  onClick={() => toggleTranslator(translator)}
                  className={`
                    flex items-center gap-2 px-3 py-2 rounded-md text-sm transition-all
                    ${isSelected 
                      ? 'bg-primary text-white shadow-md' 
                      : 'bg-gray-50 text-gray-700 hover:bg-gray-100'
                    }
                  `}
                >
                  <div className={`
                    w-4 h-4 rounded border flex items-center justify-center flex-shrink-0
                    ${isSelected 
                      ? 'bg-white border-white' 
                      : 'bg-white border-gray-300'
                    }
                  `}>
                    {isSelected && <FiCheck size={12} className="text-primary" />}
                  </div>
                  <span className="truncate">{translator}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}

