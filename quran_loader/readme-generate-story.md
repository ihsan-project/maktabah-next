# Quran XML HTML Entity Decoder

This tool connects to Elasti.co to run any `query` and generate an xml file of the results

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

`node generate-story.js "abraham, ibrahim" --output=../public/stories/abraham.xml`
`node generate-story.js "moses, musa, pharaoh', egypt" --output=../public/stories/moses.xml`
`node generate-story.js "jesus, isa, mary" --output=../public/stories/jesus.xml`
`node generate-story.js "muhammad, islam, quran, messenger" --output=../public/stories/muhammad.xml`