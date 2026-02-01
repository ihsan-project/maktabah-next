# Story Reorder Script

This script reorders verses in a story XML file based on a CSV specification file.

## Purpose

Takes an existing story XML file (generated from search results) and reorders the verses according to a CSV file that specifies:
- The desired order
- Section groupings
- Which verses to include (by chapter, verse range, and author)

## AI prompt

```
Using the given xml file, give me a csv of columns: 
- order
- section
- chapter
- verse_range
- type, (quran or hadith)
example row: (11,Breaking the Idols & Persecution,37,83-98,quran)
with a more narrative flow to reorder to
```

## Installation

First, install the required dependencies:

```bash
cd quran_loader
npm install
```

## Configuration

**Important:** By default, the script will fetch missing verses from Elasticsearch. To use this feature, create a `.env` file in the `quran_loader` directory:

```env
ELASTICSEARCH_URL=https://your-elasticsearch-instance.com
ELASTICSEARCH_APIKEY=your_elasticsearch_api_key
NODE_ENV=development
```

If you don't want to fetch missing verses, use the `--no-fetch-missing` flag (see examples below).

## Usage

```bash
node reorder-story.js <input-xml> <reorder-csv> <output-xml> [--no-fetch-missing]
```

### Using npm script

```bash
npm run reorder <input-xml> <reorder-csv> <output-xml> [--no-fetch-missing]
```

### Examples

**Default usage** (automatically fetches missing verses from Elasticsearch):
```bash
node reorder-story.js ../public/stories/abraham.xml ./stories_reorder/abraham_reorder.csv ../public/stories/abraham_reordered.xml
```

**Without auto-fetch** (only use verses from source XML):
```bash
node reorder-story.js ../public/stories/abraham.xml ./stories_reorder/abraham_reorder.csv ../public/stories/abraham_reordered.xml --no-fetch-missing
```

## CSV Format

The reorder CSV file should have the following columns:

| Column | Description | Example |
|--------|-------------|---------|
| `order` | Sequential order number | 1, 2, 3, ... |
| `section` | Section name for grouping | "Abraham's Background & Early Life" |
| `chapter` | Quran chapter number (or Hadith book number) | 21 |
| `verse_range` | Verse number or range | "51-67" or "4" |
| `type` | Type of verse: "quran" or "hadith" | "quran" or "hadith" |

### Example CSV

```csv
order,section,chapter,verse_range,type
1,Abraham's Background & Early Life,21,51-67,quran
2,Abraham's Background & Early Life,6,74-79,quran
3,Abraham's Background & Early Life,19,41-48,quran
4,Breaking the Idols & Persecution,21,51-67,quran
5,Breaking the Idols & Persecution,37,83-98,quran
6,Hadith References,93,608,hadith
7,Hadith References,55,116-117,hadith
```

## Fetching Missing Verses

**By default**, the script automatically fetches verses that aren't in the source XML file from Elasticsearch.

### How it works:
1. Script first tries to find the verse in the source XML
2. If not found (and auto-fetch is enabled by default):
   - Queries Elasticsearch for that specific verse
   - Matches by chapter, verse number, and type (Quran vs Hadith)
   - Adds the fetched verse to the output
3. If verse still can't be found, logs a warning and continues

### Benefits:
- Your CSV can include verses that weren't in the original search results
- Get a complete story without having to regenerate the entire source XML
- Include specific verses that might not match the original search query

### Requirements:
- Elasticsearch credentials must be configured in `.env` (see Configuration section)
- The 'kitaab' index must be accessible and populated

### To disable:
Use the `--no-fetch-missing` flag if you only want verses from the source XML

## How It Works

1. **Parse Input**: Reads the original XML story file and the CSV specification
2. **Match Verses**: For each row in the CSV:
   - Parses the verse range (e.g., "51-67" becomes verses 51, 52, ..., 67)
   - Finds matching verses in the XML by chapter, verse number, and type
   - If `--fetch-missing` is enabled and verse not found, fetches from Elasticsearch
   - Type matching:
     - `type: quran` → matches verses where `chapter_name` is empty
     - `type: hadith` → matches verses where `chapter_name` has a value
3. **Reorder**: Creates a new XML structure with verses in the specified order
4. **Add Metadata**: Updates the XML metadata with reorder information
5. **Output**: Writes the reordered XML to the output file

## Output

The output XML will:
- Contain verses in the order specified by the CSV
- Preserve all original verse data (translations, metadata, scores, etc.)
- Include updated metadata showing when it was reordered and from which CSV
- Have the same XML structure as the original file

### XML Format with Multiple Translations

The script now supports the new XML format where each verse includes all available translations:

```xml
<verse chapter="11" verse="69">
  <chapter_name></chapter_name>
  <book_id>en.ahmedali</book_id>
  <score>0</score>
  <translations>
    <translation author="Ahmed Ali">
      <text>Our angels came to Abraham...</text>
    </translation>
    <translation author="Yusuf Ali">
      <text>There came Our messengers to Abraham...</text>
    </translation>
    <!-- More translations -->
  </translations>
</verse>
```

When fetching missing verses from Elasticsearch, the script automatically retrieves **all available translations** for that verse and includes them in the output.

### Unused Verses Report

After generating the output file, the script provides a detailed report of all verses from the source XML that were **not** included in the reordered output. This helps you:
- Identify verses you might have missed in your CSV
- Understand what content was excluded from the original story
- Decide if you want to add any of these verses to your reordered story

The report shows:
- Total number of unused verses vs total verses in source
- Separate lists for Quran and Hadith verses
- Each verse with chapter:verse reference, author (from first translation), translation count, and first 80 characters of text
- Sorted by chapter and verse number for easy reference

Example output:
```
================================================================================
UNUSED VERSES FROM SOURCE XML
================================================================================
Total unused: 45 out of 230 verses

Unused Quran verses (42):
  2:133 (Hilali & Khan) [16 translations] - "Or were you witnesses when death approached Ya'qub (Jacob)? When he sai..."
  3:84 (Hilali & Khan) [16 translations] - "Say (O Muhammad): \"We believe in Allah and in what has been sent down..."
  ...

Unused Hadith verses (3):
  93:573 (Bukhari) [1 translations] - "Narrated Ibn 'Abbas: The Prophet said, 'If anyone of you, when having..."
  ...

================================================================================
```

## Notes

- **Auto-fetch is enabled by default**: Missing verses are automatically fetched from Elasticsearch with all their translations
- **Multiple translations**: Each verse includes all available translations from Elasticsearch
- **Unused verses report**: At the end of execution, the script shows which verses from the source XML weren't included in the output
- The script preserves all verse attributes and content (including all translations) from the original XML
- Verse type matching is based on the `chapter_name` field (empty = Quran, has value = Hadith)
- If a verse cannot be found (even after fetching), a warning is printed but the script continues
- The generated timestamp is updated to reflect when the reordering was done
- The output metadata includes both `verses_count` and `translations_count` for tracking
- Section information from the CSV is preserved in metadata but not as XML elements (you can modify the script to add section tags if needed)
- Use `--no-fetch-missing` if you want to disable auto-fetching and only use verses from the source XML

## Troubleshooting

### "Could not find verse" warnings

If you see warnings like:
```
Warning: Could not find verse - Chapter 21, Verse 55, Type: quran
```

This means the verse couldn't be found in the source XML or in Elasticsearch (auto-fetch is enabled by default).

**Possible causes:**
1. The verse doesn't exist in Elasticsearch's 'kitaab' index
2. The chapter and verse numbers in the CSV are incorrect
3. The type doesn't match:
   - For Quran verses: use `type: quran`
   - For Hadith verses: use `type: hadith`
4. Elasticsearch credentials are missing or incorrect

**To debug:**
1. Check that your `.env` file has valid Elasticsearch credentials
2. Verify the verse exists in your Elasticsearch index
3. Double-check the chapter and verse numbers in your CSV
4. If you only want to use verses from the source XML (no fetching), run with `--no-fetch-missing`

### Type matching

The script determines verse type based on the `chapter_name` field in the XML:
- **Quran verses**: `chapter_name` is empty or blank
- **Hadith verses**: `chapter_name` contains the hadith book name (e.g., "Sahih Bukhari")

If you're getting "could not find" warnings, open the source XML and check the `chapter_name` field for that verse to determine the correct type.

### Elasticsearch connection issues

If you see errors like:
```
Error: Elasticsearch credentials not found in .env file
```

Make sure you have a `.env` file in the `quran_loader` directory with:
```env
ELASTICSEARCH_URL=https://your-elasticsearch-instance.com
ELASTICSEARCH_APIKEY=your_elasticsearch_api_key
NODE_ENV=development
```

If you see "Could not fetch verse from Elasticsearch" warnings:
1. Check that your Elasticsearch credentials are correct
2. Verify the 'kitaab' index exists and is populated
3. Ensure you have network access to the Elasticsearch instance
4. Check that the verse actually exists in the Elasticsearch index

