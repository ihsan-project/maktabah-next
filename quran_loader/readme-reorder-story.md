# Story Reorder Script

This script reorders verses in a story XML file based on a CSV specification file.

## Purpose

Takes an existing story XML file (generated from search results) and reorders the verses according to a CSV file that specifies:
- The desired order
- Section groupings
- Which verses to include (by chapter, verse range, and author)

## Installation

First, install the required dependencies:

```bash
cd quran_loader
npm install
```

## Usage

### Command Line

```bash
node reorder-story.js <input-xml> <reorder-csv> <output-xml>
```

### Using npm script

```bash
npm run reorder <input-xml> <reorder-csv> <output-xml>
```

### Example

```bash
node reorder-story.js ../public/stories/abraham.xml ../docs/abraham_reorder.csv ../public/stories/abraham_reordered.xml
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

## How It Works

1. **Parse Input**: Reads the original XML story file and the CSV specification
2. **Match Verses**: For each row in the CSV:
   - Parses the verse range (e.g., "51-67" becomes verses 51, 52, ..., 67)
   - Finds matching verses in the XML by chapter, verse number, and type
   - Type matching:
     - `type: quran` → matches verses where `chapter_name` is empty
     - `type: hadith` → matches verses where `chapter_name` has a value
3. **Reorder**: Creates a new XML structure with verses in the specified order
4. **Add Metadata**: Updates the XML metadata with reorder information
5. **Output**: Writes the reordered XML to the output file

## Output

The output XML will:
- Contain verses in the order specified by the CSV
- Preserve all original verse data (text, metadata, scores, etc.)
- Include updated metadata showing when it was reordered and from which CSV
- Have the same XML structure as the original file

## Notes

- The script preserves all verse attributes and content from the original XML
- Verse type matching is based on the `chapter_name` field (empty = Quran, has value = Hadith)
- If a verse cannot be found, a warning is printed but the script continues
- The generated timestamp is updated to reflect when the reordering was done
- Section information from the CSV is preserved in metadata but not as XML elements (you can modify the script to add section tags if needed)

## Troubleshooting

### "Could not find verse" warnings

If you see warnings like:
```
Warning: Could not find verse - Chapter 21, Verse 55, Type: quran
```

This means the verse specified in the CSV doesn't exist in the source XML. Check:
1. The chapter and verse numbers are correct
2. The type matches the verse type in the XML:
   - For Quran verses: use `type: quran`
   - For Hadith verses: use `type: hadith`
3. The verse actually exists in the original XML file

### Type matching

The script determines verse type based on the `chapter_name` field in the XML:
- **Quran verses**: `chapter_name` is empty or blank
- **Hadith verses**: `chapter_name` contains the hadith book name (e.g., "Sahih Bukhari")

If you're getting "could not find" warnings, open the source XML and check the `chapter_name` field for that verse to determine the correct type.

