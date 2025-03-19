# Quran Firebase Storage Loader

This script imports Quran translations from XML files into Firebase Storage, organizing them in a structured way for easy retrieval by ID, chapter, and verse.

## Features

- Uploads Quran translations from XML files to Firebase Storage
- Organizes content in a structured /{id}/chapter/verse format
- Creates chapter-level JSON files containing all verses
- Generates a book summary with metadata
- Supports authentication via service account or application default credentials

## Prerequisites

- Node.js 14 or later
- Firebase project with Storage enabled
- Appropriate permissions to write to Firebase Storage

## Installation

1. Install the required dependencies:

```bash
npm install
```

2. Set up environment variables:
   - Create a `.env` file based on `.env.example`
   - Set your Firebase Storage bucket name and other configuration

3. Set up Firebase authentication:
   - Option 1: Service account JSON file (specify with `--service-account` or in `.env`)
   - Option 2: Set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable in `.env`
   - Option 3: Use application default credentials

## Usage

```bash
node load-quran-to-storage.js <xml-file> --id="unique-identifier" --author="Author Name" [--service-account="path/to/serviceAccount.json"]
```

### Required Parameters

- `<xml-file>`: Path to the XML file containing the Quran translation
- `--id`: Unique identifier for the translation in storage (used in the file path)

### Optional Parameters

- `--author`: Name of the translation author (defaults to the XML filename)
- `--service-account`: Path to Firebase service account JSON file

### Environment Variables

You can configure the script using a `.env` file:

- `FIREBASE_STORAGE_BUCKET`: Firebase Storage bucket name (required if not using service account)
- `GOOGLE_APPLICATION_CREDENTIALS`: Path to service account file (if not specifying with `--service-account`)
- `NODE_ENV`: Environment name (`development` or `production`)

## Output Structure

The script creates the following structure in Firebase Storage:

```
/{book_id}/
  book.json                 # Book metadata and summary
  /{chapter_number}/
    chapter.json            # All verses in this chapter
    /{verse_number}.json    # Individual verse data
```

### File Structure

1. **Book Summary** (`/{book_id}/book.json`):
   - Book metadata including chapter count and verse count
   - List of chapters with names and verse counts

2. **Chapter Files** (`/{book_id}/{chapter}/chapter.json`):
   - Array of all verses in the chapter
   - Includes full text and metadata

3. **Verse Files** (`/{book_id}/{chapter}/{verse}.json`):
   - Individual verse data including text
   - Includes metadata like author and book_id

## Access Patterns

After uploading, verses can be accessed using these patterns:

1. Get a specific verse: `/{book_id}/{chapter}/{verse}.json`
2. Get all verses in a chapter: `/{book_id}/{chapter}/chapter.json`
3. Get book metadata and summary: `/{book_id}/book.json`

## Example

```bash
node load-quran-to-storage.js quran.xml --id="ahmed-ali" --author="Ahmed Ali" --service-account="./serviceAccount.json"
```

This will:
1. Parse the XML file
2. Upload all verses to Firebase Storage
3. Create the structured organization
4. Allow access to verses via paths like `/ahmed-ali/1/1.json` (first chapter, first verse)
