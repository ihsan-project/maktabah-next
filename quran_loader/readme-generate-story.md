# Generate Story Script

This tool connects to Elasticsearch to run a search query and generate an XML file of all matching verses with all their translations.

## Purpose

Searches the Elasticsearch 'kitaab' index and generates a story XML file containing:
- All verses matching your search query
- All available translations for each matching verse
- Metadata about the search and results

## Installation

1. Install dependencies:

```bash
cd quran_loader
npm install
```

2. Create a `.env` file in the `quran_loader` directory with your Elasticsearch credentials:

```env
ELASTICSEARCH_URL=https://your-elasticsearch-instance.com
ELASTICSEARCH_APIKEY=your_elasticsearch_api_key
NODE_ENV=development
```

## Usage

```bash
node generate-story.js <search-query> [--author="Author Name"] [--chapter=1] [--output="output.xml"]
```

### Parameters

- `<search-query>` (required): The search term to look for in the text
- `--author="Author Name"` (optional): Filter results by specific author/translator
- `--chapter=1` (optional): Filter results to a specific chapter number
- `--output="filename.xml"` (optional): Output filename (defaults to `story-{timestamp}.xml`)

### Examples

**Basic search:**
```bash
node generate-story.js "abraham, ibrahim" --output=../public/stories/abraham.xml
```

**Search in specific chapter:**
```bash
node generate-story.js "moses" --chapter=20 --output=moses_chapter20.xml
```

**Search by specific author:**
```bash
node generate-story.js "prayer" --author="Sahih International" --output=prayer_sahih.xml
```

**More story examples:**
```bash
node generate-story.js "moses, musa, pharaoh, egypt" --output=../public/stories/moses.xml
node generate-story.js "jesus, isa, mary" --output=../public/stories/jesus.xml
node generate-story.js "muhammad, islam, quran, messenger" --output=../public/stories/muhammad.xml
node generate-story.js "noah, nuh, ark" --output=../public/stories/noah.xml
node generate-story.js "khadija, khadijah, khadeejah" --output=../public/stories/khadija.xml
node generate-story.js "adam" --output=../public/stories/adam.xml
node generate-story.js "joseph, yusuf" --output=../public/stories/yusuf.xml
```

## Output Format

The script generates an XML file with the following structure:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<story query="abraham, ibrahim" generated="2026-01-31T23:41:17.471Z">
  <metadata>
    <title>Story generated from search: "abraham, ibrahim"</title>
    <verses_count>230</verses_count>
    <translations_count>1215</translations_count>
  </metadata>

  <verses>
    <verse chapter="11" verse="69">
      <chapter_name></chapter_name>
      <book_id>en.ahmedali</book_id>
      <score>0</score>
      <translations>
        <translation author="Ahmed Ali">
          <text>Our angels came to Abraham with good news...</text>
        </translation>
        <translation author="Yusuf Ali">
          <text>There came Our messengers to Abraham...</text>
        </translation>
        <!-- All other translations for this verse -->
      </translations>
    </verse>
    <!-- More verses -->
  </verses>
</story>
```

## Features

- **Multiple translations**: Automatically fetches all available translations for each matching verse
- **Deduplication**: Uses Elasticsearch aggregations to ensure each unique chapter/verse combination appears only once
- **Comprehensive search**: Searches using multiple analyzers (standard, Arabic-specific, prefix matching)
- **Sorted results**: Results are sorted by relevance score, then by chapter and verse number
- **Metadata tracking**: Includes verse count and translation count in output

## How It Works

1. Connects to Elasticsearch using credentials from `.env`
2. Builds a search query with multiple search strategies (match, Arabic match, prefix)
3. Uses aggregations to group results by chapter/verse and get all translations
4. Sorts results by score and chapter/verse order
5. Generates an XML file with all verses and their translations
6. Provides a summary of the results

## Notes

- The script searches the 'kitaab' index which should contain both Quran and Hadith texts
- Each verse can have up to 100 translations (adjust in code if needed)
- Results are limited to 10,000 total matches
- Empty `chapter_name` indicates Quran verses; non-empty indicates Hadith
- The `book_id` field contains the translation identifier (e.g., "en.sahih", "en.yusufali")
