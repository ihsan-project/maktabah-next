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

Run the script with the XML file path, author name, and optional dataset ID:

```bash
node load-quran-to-elasticsearch.js path/to/quran.xml --author="Author Name" --id="unique-identifier"
```

If you don't specify an author, the filename (without extension) will be used as the author name.
If you don't specify an ID, one will be automatically generated based on the author name and timestamp.

### Example

```bash
node load-quran-to-elasticsearch.js translations/en.ahmedali.xml --author="Ahmed Ali" --id="en.ahmedali" --title="quran"
node load-quran-to-elasticsearch.js translations/en.ahmedraza.xml --author="Ahmed Raza Khan" --id="en.ahmedraza" --title="quran"
node load-quran-to-elasticsearch.js translations/en.arberry.xml --author="Arberry" --id="en.arberry" --title="quran"
node load-quran-to-elasticsearch.js translations/en.daryabadi.xml --author="Daryabadi" --id="en.daryabadi" --title="quran"
node load-quran-to-elasticsearch.js translations/en.hilali.xml --author="Hilali & Khan" --id="en.hilali" --title="quran"
node load-quran-to-elasticsearch.js translations/en.itani.xml --author="Itani" --id="en.itani" --title="quran"
node load-quran-to-elasticsearch.js translations/en.maududi.xml --author="Maududi" --id="en.maududi" --title="quran"
node load-quran-to-elasticsearch.js translations/en.mubarakpuri.xml --author="Mubarakpuri" --id="en.mubarakpuri" --title="quran"
node load-quran-to-elasticsearch.js translations/en.pickthall.xml --author="Pickthall" --id="en.pickthall" --title="quran"
node load-quran-to-elasticsearch.js translations/en.qarai.xml --author="Qarai" --id="en.qarai" --title="quran"
node load-quran-to-elasticsearch.js translations/en.qaribullah.xml --author="Qaribullah & Darwish" --id="en.qaribullah" --title="quran"
node load-quran-to-elasticsearch.js translations/en.sahih.xml --author="Saheeh International" --id="en.sahih" --title="quran"
node load-quran-to-elasticsearch.js translations/en.sarwar.xml --author="Sarwar" --id="en.sarwar" --title="quran"
node load-quran-to-elasticsearch.js translations/en.shakir.xml --author="Shakir" --id="en.shakir" --title="quran"
node load-quran-to-elasticsearch.js translations/en.wahiduddin.xml --author="Wahiduddin Khan" --id="en.wahiduddin" --title="quran"
node load-quran-to-elasticsearch.js translations/en.yusufali.xml --author="Yusuf Ali" --id="en.yusufali" --title="quran"
node load-quran-to-elasticsearch.js translations/en.transliteration.clean.xml --author="Transliteration" --id="en.transliteration" --title="quran"
node load-quran-to-elasticsearch.js translations/quran-simple.xml --author="Quran" --id="quran.simple" --title="quran"

node load-quran-to-elasticsearch.js translations/en.bukhari.vol01.xml --title="bukhari" --author="Dr. Muhammad Muhsin" --id="en.bukhari.vol01"  --volume=1
node load-quran-to-elasticsearch.js translations/en.bukhari.vol02.xml --title="bukhari" --author="Dr. Muhammad Muhsin" --id="en.bukhari.vol02"  --volume=2
node load-quran-to-elasticsearch.js translations/en.bukhari.vol03.xml --title="bukhari" --author="Dr. Muhammad Muhsin" --id="en.bukhari.vol03"  --volume=3
node load-quran-to-elasticsearch.js translations/en.bukhari.vol04.xml --title="bukhari" --author="Dr. Muhammad Muhsin" --id="en.bukhari.vol04"  --volume=4
node load-quran-to-elasticsearch.js translations/en.bukhari.vol05.xml --title="bukhari" --author="Dr. Muhammad Muhsin" --id="en.bukhari.vol05"  --volume=5
node load-quran-to-elasticsearch.js translations/en.bukhari.vol06.xml --title="bukhari" --author="Dr. Muhammad Muhsin" --id="en.bukhari.vol06"  --volume=6
node load-quran-to-elasticsearch.js translations/en.bukhari.vol07.xml --title="bukhari" --author="Dr. Muhammad Muhsin" --id="en.bukhari.vol07"  --volume=7
node load-quran-to-elasticsearch.js translations/en.bukhari.vol08.xml --title="bukhari" --author="Dr. Muhammad Muhsin" --id="en.bukhari.vol08"  --volume=8
node load-quran-to-elasticsearch.js translations/en.bukhari.vol09.xml --title="bukhari" --author="Dr. Muhammad Muhsin" --id="en.bukhari.vol09"  --volume=9
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
