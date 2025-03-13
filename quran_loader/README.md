# Quran XML to Elasticsearch Loader

This tool imports Quran translations from XML files into Elasticsearch for efficient text search. It processes XML files in the Tanzil project format and indexes verses with chapter, verse, and translator information.

## Features

- Imports XML files containing Quran translations into Elasticsearch
- Supports multiple translations with the translator parameter
- Creates proper mapping for Arabic and English text search
- Handles the Tanzil XML format with sura and aya elements
- Bulk loading with batching for large datasets
- Test search functionality after import

## XML Format

The tool accepts XML files in the following format:

```xml
<quran>
  <sura index="1" name="Al-Fatiha">
    <aya index="1" text="In the name of Allah, most benevolent, ever-merciful."/>
    <aya index="2" text="ALL PRAISE BE to Allah, Lord of all the worlds,"/>
    <!-- More verses... -->
  </sura>
  <!-- More chapters... -->
</quran>
```

Where:
- `sura` element represents a chapter/surah with `index` and optional `name` attributes
- `aya` element represents a verse/ayah with `index` and `text` attributes

## Installation

1. Clone this repository or download the files
2. Install dependencies:

```bash
npm install
```

3. Create a `.env` file based on `.env.example` with your Elasticsearch credentials:

```
ELASTICSEARCH_URL=https://your-elasticsearch-instance.com
ELASTICSEARCH_APIKEY=your_elasticsearch_api_key
NODE_ENV=development
```

## Usage

Run the script with the XML file path and author name:

```bash
node load-quran-to-elasticsearch.js path/to/quran.xml --author="Author Name"
```

If you don't specify an author, the filename (without extension) will be used as the author name.

### Example

```bash
node load-quran-to-elasticsearch.js data/ahmed_ali.xml --author="Ahmed Ali"
```

## Elasticsearch Mapping

The script creates an Elasticsearch index named `kitaab` with the following features:

- Dual analyzers for both Arabic and English text
- Proper field mappings for efficient search
- Fields for chapter number, verse number, text, translator, and chapter name
- Unique document IDs based on chapter, verse, and translator

## Adding More Translations

You can run the script multiple times with different XML files and translator names. Each translation will be added to the same Elasticsearch index but with its own translator field, allowing you to:

1. Search across all translations
2. Search within a specific translation
3. Compare translations for the same verse

## Searching the Index

After loading, you can search the index with queries like:

```
GET /maktabah/_search
{
  "query": {
    "bool": {
      "must": [
        { "match": { "text": "mercy" } },
        { "term": { "translator": "Ahmed Ali" } }
      ]
    }
  }
}
```

## Troubleshooting

If you encounter errors:

1. **XML Parsing Issues**: Check your XML format. The XML must be well-formed and follow the expected structure.
2. **Elasticsearch Connection Errors**: Verify your Elasticsearch credentials and URL in the `.env` file.
3. **Memory Issues**: For very large files, adjust the `BATCH_SIZE` constant in the code.

## License

ISC
