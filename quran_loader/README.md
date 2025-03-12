# Quran Elasticsearch Loader

This tool imports Quran translations from SQL dumps into Elasticsearch for efficient text search. It processes SQL files and indexes the verses with chapter, verse, and translator information.

## Features

- Imports SQL dumps containing Quran translations into Elasticsearch
- Supports multiple translations with the translator parameter
- Creates proper mapping for Arabic and English text search
- Handles various SQL dump formats
- Bulk loading with batching for large datasets
- Test search functionality after import

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

Run the script with the SQL dump file path and translator name:

```bash
node load-quran-to-elasticsearch.js path/to/quran_dump.sql --translator="Translator Name"
```

If you don't specify a translator, the filename (without extension) will be used as the translator name.

### Example

```bash
node load-quran-to-elasticsearch.js data/sahih_international.sql --translator="Sahih International"
```

## SQL Dump Format

The script attempts to detect the structure of your SQL dump file. It works best with SQL dumps that include:

1. A `CREATE TABLE` statement that defines the columns
2. `INSERT INTO` statements with values for the verses

The script will try to identify columns for chapter number, verse number, and text content. If it can't determine the structure, it will fall back to a default format where:
- Column 1: ID (ignored)
- Column 2: Chapter number
- Column 3: Verse number
- Column 4: Text content

## Elasticsearch Mapping

The script creates an Elasticsearch index with the following features:

- Dual analyzers for both Arabic and English text
- Proper field mappings for efficient search
- Unique document IDs based on chapter, verse, and translator

## Adding More Translations

You can run the script multiple times with different SQL dumps and translator names. Each translation will be added to the same index but with its own translator field, allowing you to:

1. Search across all translations
2. Search within a specific translation
3. Compare translations for the same verse

## Troubleshooting

If you encounter errors:

1. **SQL Parsing Issues**: Check your SQL dump format. You may need to modify the parser for your specific format.
2. **Elasticsearch Connection Errors**: Verify your Elasticsearch credentials and URL in the `.env` file.
3. **Memory Issues**: For very large dumps, adjust the `BATCH_SIZE` constant in the code.

## License

ISC
