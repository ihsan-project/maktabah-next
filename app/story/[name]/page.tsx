import React from 'react';
import { notFound } from 'next/navigation';
import fs from 'fs';
import path from 'path';
import { parseStringPromise } from 'xml2js';
import { ALLOWED_STORIES, getStoryMetadata } from '@/lib/story-config';
import type { Metadata } from 'next';
import StoryClient from './page.client';

// Types for the story data
interface Translation {
  $: {
    author: string;
  };
  text: string[];
}

interface StoryVerse {
  $: {
    chapter: string;
    verse: string;
  };
  chapter_name: string[];
  book_id: string[];
  score: string[];
  translations: {
    translation: Translation[];
  }[];
}

interface StoryData {
  metadata: {
    title: string[];
    verses_count: string[];
    translations_count?: string[];
  }[];
  verses: {
    verse: StoryVerse[];
  }[];
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
  const translationsCount = storyData.metadata?.[0]?.translations_count?.[0];
  const verses = storyData.verses?.[0]?.verse || [];
  
  // Process verses to extract translations
  const processedVerses = verses.map((verse, index) => {
    const translations = verse.translations?.[0]?.translation || [];
    return {
      key: index,
      chapter: verse.$.chapter,
      verse: verse.$.verse,
      chapterName: verse.chapter_name?.[0] || '',
      bookId: verse.book_id?.[0] || '',
      score: verse.score?.[0] || '0',
      translations: translations.map(t => ({
        author: t.$.author,
        text: t.text[0]
      }))
    };
  });
  
  return (
    <div className="py-8">
      <h1 className="text-3xl font-bold text-center text-primary mb-2">{title}</h1>
      <p className="text-center text-gray-600 mb-6">
        A collection of {versesCount} verses{translationsCount ? ` with ${translationsCount} translations` : ''} about {name}
      </p>
      
      {/* Client component that handles auth state and adds sign-in prompts if needed */}
      <StoryClient name={name} verses={processedVerses} />
      
      {/* The login prompt footer is now handled by the StoryClient component */}
      {/* It will only be displayed if the user is not logged in */}
    </div>
  );
}

// Generate static parameters for stories that exist
export async function generateStaticParams() {
  return ALLOWED_STORIES.map(name => ({
    name,
  }));
}
