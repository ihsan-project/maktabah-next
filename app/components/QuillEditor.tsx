'use client';

import React, { useEffect, useRef } from 'react';
import dynamic from 'next/dynamic';
import 'react-quill/dist/quill.snow.css';

// Dynamically import ReactQuill to avoid SSR issues
const ReactQuill = dynamic(() => import('react-quill'), { ssr: false });

interface QuillEditorProps {
  value: any; // Quill Delta object
  onChange: (delta: any) => void;
  placeholder?: string;
}

/**
 * Quill WYSIWYG editor component for taking notes
 * Stores content in Delta format for optimal Firestore storage
 */
export default function QuillEditor({ value, onChange, placeholder = 'Take notes here...' }: QuillEditorProps): JSX.Element {
  const quillRef = useRef<any>(null);

  // Toolbar configuration
  const modules = {
    toolbar: [
      [{ 'header': [1, 2, 3, false] }],
      ['bold', 'italic', 'underline', 'strike'],
      [{ 'list': 'ordered'}, { 'list': 'bullet' }],
      [{ 'color': [] }, { 'background': [] }],
      ['blockquote', 'code-block'],
      ['link'],
      ['clean']
    ]
  };

  const formats = [
    'header',
    'bold', 'italic', 'underline', 'strike',
    'list', 'bullet',
    'color', 'background',
    'blockquote', 'code-block',
    'link'
  ];

  // Handle changes and convert to Delta format
  const handleChange = (content: string, delta: any, source: string, editor: any) => {
    if (source === 'user') {
      // Get Delta from editor
      const currentDelta = editor.getContents();
      onChange(currentDelta);
    }
  };

  // Initialize editor with existing Delta
  useEffect(() => {
    if (quillRef.current && value) {
      const editor = quillRef.current.getEditor();
      if (editor) {
        try {
          // Set contents from Delta
          editor.setContents(value);
        } catch (error) {
          console.error('Error setting Quill contents:', error);
        }
      }
    }
  }, []); // Only run once on mount

  return (
    <div className="quill-editor-wrapper">
      <ReactQuill
        ref={quillRef}
        theme="snow"
        onChange={handleChange}
        modules={modules}
        formats={formats}
        placeholder={placeholder}
        className="bg-white"
      />
    </div>
  );
}
