#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const xpath = require('xpath');
const admin = require('firebase-admin');
const { Storage } = require('@google-cloud/storage');
require('dotenv').config(); // Load environment variables from .env file

// Parse command line arguments
const args = process.argv.slice(2);
if (args.length < 1) {
  console.error('Usage: node load-quran-to-storage.js <xml-file> --id="unique-identifier" --author="Author Name" [--service-account="path/to/serviceAccount.json"]');
  process.exit(1);
}

const xmlFile = args[0];

// Parse ID parameter - required identifier for storage
const idArg = args.find(arg => arg.startsWith('--id='));
if (!idArg) {
  console.error('Error: --id parameter is required');
  process.exit(1);
}
const bookId = idArg.split('=')[1].replace(/"/g, '');

// Parse author parameter
const authorArg = args.find(arg => arg.startsWith('--author='));
const author = authorArg 
  ? authorArg.split('=')[1].replace(/"/g, '') 
  : path.basename(xmlFile, path.extname(xmlFile));

// Parse service account parameter (optional)
const serviceAccountArg = args.find(arg => arg.startsWith('--service-account='));
const serviceAccountPath = serviceAccountArg 
  ? serviceAccountArg.split('=')[1].replace(/"/g, '') 
  : null;

// Initialize Firebase
let firebaseApp;
if (serviceAccountPath) {
  const serviceAccount = require(path.resolve(serviceAccountPath));
  firebaseApp = admin.initializeApp({
    credential: admin.credential.cert(serviceAccount),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET || `${serviceAccount.project_id}.appspot.com`
  });
} else {
  // Try to use application default credentials or GOOGLE_APPLICATION_CREDENTIALS env var
  firebaseApp = admin.initializeApp({
    credential: admin.credential.applicationDefault(),
    storageBucket: process.env.FIREBASE_STORAGE_BUCKET
  });
}

// Initialize Firebase Storage
const bucket = admin.storage().bucket();

/**
 * Parse XML file and extract verse data
 * @param {string} filePath Path to the XML file
 * @param {string} author Name of the author
 * @returns {Map<number, Map<number, object>>} Nested map of chapters and verses
 */
function parseXML(filePath, author) {
  console.log(`Parsing XML file: ${filePath}`);
  
  try {
    // Read and parse XML
    const xmlContent = fs.readFileSync(filePath, 'utf8');
    const doc = new DOMParser().parseFromString(xmlContent, 'text/xml');
    
    // Extract all suras
    const suras = xpath.select('//sura', doc);
    const chapterVerses = new Map();
    let totalVerses = 0;
    
    // Process each sura
    suras.forEach(sura => {
      const suraIndex = parseInt(sura.getAttribute('index'));
      const suraName = sura.getAttribute('name') || '';
      
      // Create a verses map for this chapter
      const verses = new Map();
      chapterVerses.set(suraIndex, verses);
      
      // Extract all ayas in this sura
      const ayas = xpath.select('./aya', sura);
      
      // Process each aya
      ayas.forEach(aya => {
        const ayaIndex = parseInt(aya.getAttribute('index'));
        const text = aya.getAttribute('text') || '';
        
        if (suraIndex && ayaIndex && text) {
          verses.set(ayaIndex, {
            chapter: suraIndex,
            verse: ayaIndex,
            text: text,
            author: author,
            chapter_name: suraName,
            book_id: bookId
          });
          totalVerses++;
        }
      });
    });
    
    console.log(`Extracted ${totalVerses} verses from ${suras.length} suras`);
    return chapterVerses;
  } catch (error) {
    console.error('Error parsing XML file:', error);
    return new Map();
  }
}

/**
 * Upload a single verse to Firebase Storage
 * @param {object} verse The verse data to upload
 * @returns {Promise<void>}
 */
async function uploadVerse(verse) {
  const filePath = `${bookId}/${verse.chapter}/${verse.verse}.json`;
  
  try {
    const file = bucket.file(filePath);
    await file.save(JSON.stringify(verse, null, 2), {
      contentType: 'application/json',
      metadata: {
        author: verse.author,
        bookId: verse.book_id,
        chapter: verse.chapter,
        verse: verse.verse
      }
    });
    return true;
  } catch (error) {
    console.error(`Error uploading ${filePath}:`, error);
    return false;
  }
}

/**
 * Upload a complete chapter to Firebase Storage with all verses
 * @param {number} chapterNum The chapter number
 * @param {Map<number, object>} verses Map of verse numbers to verse data
 * @returns {Promise<void>}
 */
async function uploadChapter(chapterNum, verses) {
  const filePath = `${bookId}/${chapterNum}/chapter.json`;
  const versesArray = Array.from(verses.values());
  
  try {
    const file = bucket.file(filePath);
    await file.save(JSON.stringify(versesArray, null, 2), {
      contentType: 'application/json',
      metadata: {
        author: versesArray[0].author,
        bookId: versesArray[0].book_id,
        chapter: chapterNum,
        verseCount: versesArray.length
      }
    });
    return true;
  } catch (error) {
    console.error(`Error uploading chapter ${chapterNum}:`, error);
    return false;
  }
}

/**
 * Upload the book summary with metadata
 * @param {Map<number, Map<number, object>>} chapterVerses Nested map of chapters and verses
 * @returns {Promise<void>}
 */
async function uploadBookSummary(chapterVerses) {
  const filePath = `${bookId}/book.json`;
  
  // Create a summary of the book
  const chapterSummaries = [];
  let totalVerses = 0;
  
  for (const [chapterNum, verses] of chapterVerses.entries()) {
    const verseCount = verses.size;
    totalVerses += verseCount;
    
    // Get a sample verse to extract metadata
    const sampleVerse = verses.values().next().value;
    
    chapterSummaries.push({
      chapter: chapterNum,
      chapter_name: sampleVerse.chapter_name,
      verse_count: verseCount
    });
  }
  
  const bookSummary = {
    book_id: bookId,
    author: author,
    chapter_count: chapterVerses.size,
    verse_count: totalVerses,
    chapters: chapterSummaries
  };
  
  try {
    const file = bucket.file(filePath);
    await file.save(JSON.stringify(bookSummary, null, 2), {
      contentType: 'application/json',
      metadata: {
        author: author,
        bookId: bookId,
        chapterCount: chapterVerses.size,
        verseCount: totalVerses
      }
    });
    return true;
  } catch (error) {
    console.error(`Error uploading book summary:`, error);
    return false;
  }
}

/**
 * Main function
 */
async function main() {
  try {
    console.log(`Starting upload process for ${author}'s translation (Book ID: ${bookId})`);
    
    // Check if file exists
    if (!fs.existsSync(xmlFile)) {
      console.error(`XML file not found: ${xmlFile}`);
      process.exit(1);
    }
    
    // Parse XML and extract verses
    const chapterVerses = parseXML(xmlFile, author);
    
    if (chapterVerses.size > 0) {
      // Upload book summary
      console.log('Uploading book summary...');
      await uploadBookSummary(chapterVerses);
      
      // Upload each chapter and its verses
      let chapterCount = 0;
      let verseCount = 0;
      let successCount = 0;
      
      for (const [chapterNum, verses] of chapterVerses.entries()) {
        chapterCount++;
        console.log(`Processing chapter ${chapterNum} (${verses.size} verses)...`);
        
        // Upload the complete chapter file
        await uploadChapter(chapterNum, verses);
        
        // Upload individual verse files
        for (const [verseNum, verse] of verses.entries()) {
          verseCount++;
          const success = await uploadVerse(verse);
          if (success) successCount++;
          
          // Show progress every 100 verses
          if (verseCount % 100 === 0) {
            console.log(`Processed ${verseCount} verses (${successCount} successful)...`);
          }
        }
      }
      
      console.log(`\nUpload complete: ${successCount}/${verseCount} verses uploaded successfully!`);
      console.log(`Access path format: /${bookId}/chapter/verse.json`);
    } else {
      console.error('No verses extracted from the XML file');
    }
  } catch (error) {
    console.error('Error in main process:', error);
  } finally {
    // Cleanup and exit
    process.exit(0);
  }
}

// Run the main function
main().catch(console.error);
