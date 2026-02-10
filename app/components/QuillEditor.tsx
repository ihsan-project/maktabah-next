'use client';

import React, { useMemo } from 'react';
import dynamic from 'next/dynamic';

// Dynamically import ReactQuill to avoid SSR issues
const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });

interface QuillEditorProps {
  value: string; // HTML string
  onChange: (html: string) => void;
  placeholder?: string;
}

/**
 * Quill WYSIWYG editor component for taking notes
 * Stores content as HTML in Firestore
 */
export default function QuillEditor({ value, onChange, placeholder = 'Take notes here...' }: QuillEditorProps): JSX.Element {
  // Toolbar configuration - memoized to prevent recreation
  const modules = useMemo(() => ({
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'color': [] }, { 'background': [] }],
      ['blockquote', 'code-block'],
      ['link'],
      ['clean']
    ]
  }), []);

  const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'list', 'bullet',
    'color', 'background',
    'blockquote', 'code-block',
    'link'
  ];

  return (
    <div className="quill-editor-wrapper">
      <ReactQuill
        theme="snow"
        value={value}
        onChange={onChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
        className="bg-white"
      />
    </div>
  );
}
