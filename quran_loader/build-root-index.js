/**
 * build-root-index.js
 *
 * Reads all per-surah word files from public/quran/words/{1-114}.json
 * and builds a reverse index mapping each Arabic root to all its occurrences.
 *
 * Output: public/quran/words/roots.json
 *
 * Usage: node build-root-index.js
 */

const fs = require('fs');
const path = require('path');

const WORDS_DIR = path.join(__dirname, '..', 'public', 'quran', 'words');
const OUTPUT_FILE = path.join(WORDS_DIR, 'roots.json');

function main() {
  const rootIndex = {};

  for (let surah = 1; surah <= 114; surah++) {
    const filePath = path.join(WORDS_DIR, `${surah}.json`);
    if (!fs.existsSync(filePath)) {
      console.warn(`Warning: missing ${filePath}, skipping`);
      continue;
    }

    const data = JSON.parse(fs.readFileSync(filePath, 'utf-8'));

    for (const [verseNum, verse] of Object.entries(data.verses)) {
      for (const word of verse.words) {
        if (!word.root) continue;

        if (!rootIndex[word.root]) {
          rootIndex[word.root] = { occurrences: 0, verses: [] };
        }

        rootIndex[word.root].occurrences++;
        rootIndex[word.root].verses.push({
          s: surah,
          v: parseInt(verseNum),
          p: word.position,
        });
      }
    }
  }

  // Sort roots by occurrence count (descending) for convenience
  const sorted = Object.entries(rootIndex)
    .sort((a, b) => b[1].occurrences - a[1].occurrences);

  const output = {};
  for (const [root, data] of sorted) {
    output[root] = data;
  }

  fs.writeFileSync(OUTPUT_FILE, JSON.stringify(output, null, 2), 'utf-8');

  console.log(`Root index built: ${Object.keys(output).length} unique roots`);
  console.log(`Total word-root occurrences: ${Object.values(output).reduce((s, r) => s + r.occurrences, 0)}`);
  console.log(`Output: ${OUTPUT_FILE}`);

  // Show top 10 most common roots
  console.log('\nTop 10 roots by occurrence:');
  for (const [root, data] of sorted.slice(0, 10)) {
    console.log(`  ${root} — ${data.occurrences} occurrences`);
  }
}

main();
