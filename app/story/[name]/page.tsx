'use client';

import React from 'react';
import { notFound } from 'next/navigation';
import Link from 'next/link';
import fs from 'fs';
import path from 'path';
import { parseStringPromise } from 'xml2js';
import { ALLOWED_STORIES, getStoryMetadata } from '@/lib/story-config';
import type { Metadata } from 'next';
import StoryClient from './page.client';
import StoryContent from '@/app/components/StoryContent';

// Types for the story data
interface StoryVerse {
  $: {
    chapter: string;
    verse: string;
    author: string;
  };
  chapter_name: string[];
  book_id: string[];
  score: string[];
  text: string[];
  translations?: {
    translation: Array<{
      $: {
        book_id: string;
        author: string;
        available?: string;
      };
      _?: string; // Text content for translations that are available
    }>;
  }[];
}

interface StoryData {
  metadata: {
    title: string[];
    verses_count: string[];
  }[];
  verses: {
    verse: StoryVerse[];
  }[];
}

// Process a verse from XML format to component format
function processVerse(verse: StoryVerse) {
  // Process translations if they exist
  const translations = verse.translations?.[0]?.translation?.map(trans => ({
    book_id: trans.$.book_id,
    author: trans.$.author,
    available: trans.$.available || 'true',
    _text: trans._ || ''
  })) || [];
  
  const isBukhari = verse.book_id?.[0]?.includes('bukhari') || false;
  const volumeMatch = verse.book_id?.[0]?.match(/vol(\d+)/);
  const volume = isBukhari && volumeMatch ? parseInt(volumeMatch[1]) : undefined;
  
  return {
    chapter: verse.$.chapter,
    verse: verse.$.verse,
    author: verse.$.author,
    chapter_name: verse.chapter_name?.[0] || '',
    book_id: verse.book_id?.[0] || '',
    score: verse.score?.[0] || '',
    text: verse.text?.[0] || '',
    translations,
    title: isBukhari ? 'bukhari' : 'quran',
    volume
  };
}

// Server-side function to fetch and parse the XML file
async function getStoryData(name: string) {
  // Check if the story name is allowed
  if (!ALLOWED_STORIES.includes(name)) {
    return null;
  }
  
  try {
    // Read the XML file from the public directory
    const filePath = path.join(process.cwd(), 'public', 'stories', `${name}.xml`);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    
    // Parse the XML content
    const result = await parseStringPromise(fileContent);
    
    // Extract and return the story data
    return result.story as StoryData;
  } catch (error) {
    console.error(`Error reading story file for ${name}:`, error);
    return null;
  }
}

// Generate metadata for this page
export async function generateMetadata({ params }: { params: { name: string } }): Promise<Metadata> {
  const { name } = params;
  
  // Get metadata from our config
  const metadata = getStoryMetadata(name);
  
  // Try to get additional info from the XML file
  try {
    const filePath = path.join(process.cwd(), 'public', 'stories', `${name}.xml`);
    const fileContent = fs.readFileSync(filePath, 'utf8');
    const result = await parseStringPromise(fileContent);
    const storyData = result.story as StoryData;
    
    // Use the title from the XML file if available
    const title = storyData.metadata?.[0]?.title?.[0] || metadata.title;
    
    return {
      title,
      description: metadata.description,
      keywords: metadata.keywords,
      openGraph: {
        title,
        description: metadata.description,
        type: 'article',
        url: `${process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app'}/story/${name}`,
      }
    };
  } catch (error) {
    // Fall back to config metadata if file can't be read
    return {
      title: metadata.title,
      description: metadata.description,
      keywords: metadata.keywords,
    };
  }
}

// Next.js page component with TypeScript props
export interface StoryPageProps {
  params: {
    name: string;
  };
}

export default async function StoryPage({ params }: StoryPageProps) {
  const { name } = params;
  
  // Fetch story data
  const storyData = await getStoryData(name);
  
  // If story doesn't exist or isn't allowed, return 404
  if (!storyData) {
    notFound();
  }
  
  // Extract metadata and verses from the story data
  const title = storyData.metadata?.[0]?.title?.[0] || `Story about ${name}`;
  const versesCount = storyData.metadata?.[0]?.verses_count?.[0] || '0';
  const rawVerses = storyData.verses?.[0]?.verse || [];
  
  // Process verses for the component
  const processedVerses = rawVerses.map(processVerse);
  
  return (
    <div className="py-8">
      <h1 className="text-3xl font-bold text-center text-primary mb-2">{title}</h1>
      <p className="text-center text-gray-600 mb-6">
        A collection of {versesCount} Islamic verses about {name}
      </p>
      
      {/* Stories content with client component for tracking */}
      <StoryClient name={name} />
      
      {/* Story content with expandable verses - using client component */}
      <StoryContent verses={processedVerses} storyName={name} />
      
      {/* Footer - keeping this static in server component */}
      <div className="mt-12 text-center">
        <p className="mb-4">Want to explore more Islamic texts?</p>
        <Link 
          href="/" 
          className="btn btn-primary inline-block"
        >
          Sign in and start searching
        </Link>
      </div>
    </div>
  );
}

// Generate static parameters for stories that exist
export async function generateStaticParams() {
  return ALLOWED_STORIES.map(name => ({
    name,
  }));
}
