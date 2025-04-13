# Quran XML HTML Entity Decoder

This tool decodes HTML entities in Quran XML files. It processes XML files that contain HTML-encoded entities (like `&lt;` and `&gt;`) in the text attributes and converts them to their actual characters.

## Problem

In some Quran XML files, HTML tags and entities might be encoded, making the text look like:

```
Bismi All&lt;u&gt;a&lt;/U&gt;hi a&lt;b&gt;l&lt;/B&gt;rra&lt;u&gt;h&lt;/U&gt;m&lt;u&gt;a&lt;/U&gt;ni a&lt;b&gt;l&lt;/B&gt;rra&lt;u&gt;h&lt;/U&gt;eem&lt;b&gt;i&lt;/b&gt;
```

When what you actually want is:

```
Bismi All<u>a</u>hi a<b>l</b>rra<u>h</u>m<u>a</u>ni a<b>l</b>rra<u>h</u>eem<b>i</b>
```

## Installation

1. Clone this repository or download the files
2. Install dependencies:

```bash
npm install
```

## Usage

Run the script with the path to your XML file:

```bash
node decode-quran-xml.js path/to/quran.xml [output-path.xml]
```

The second parameter (output path) is optional. If not provided, the script will create a new file with ".clean" added to the original filename.

### Example

```bash
node decode-quran-xml.js translations/en.transliteration.xml
```

This will create a new file `translations/en.transliteration.clean.xml` with clean HTML entities.

## How It Works

The script:

1. Reads the XML file
2. Parses it using DOMParser
3. Finds all `<aya>` elements
4. Decodes HTML entities in the `text` attribute of each verse
5. Writes the updated XML to a new file

## Dependencies

- `@xmldom/xmldom`: XML parsing and serialization
- `xpath`: XPath query for XML navigation
- `he`: HTML entity decoding

## Limitations

This tool only decodes HTML entities in the `text` attribute of `<aya>` elements. If your XML structure is different, you may need to modify the script.
