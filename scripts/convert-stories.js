const fs = require('fs');
const path = require('path');
const { parseStringPromise } = require('xml2js');

const ALLOWED = [
  'adam', 'noah', 'abraham', 'ismail_ishaq', 'yusuf', 'ayyub', 'moses',
  'dawud', 'sulayman', 'yunus', 'maryam', 'jesus', 'khadija',
];
const SRC = path.join(process.cwd(), 'public', 'stories');
const OUT = path.join(process.cwd(), 'data', 'stories');

async function convert(name) {
  const xml = fs.readFileSync(path.join(SRC, `${name}.xml`), 'utf8');
  const result = await parseStringPromise(xml);
  const story = result.story;
  const title = story.metadata?.[0]?.title?.[0] || name;
  const rawVerses = story.verses?.[0]?.verse || [];
  const verses = rawVerses.map((v) => ({
    chapter: Number(v.$.chapter),
    verse: Number(v.$.verse),
    chapterName: v.chapter_name?.[0] || '',
    bookId: v.book_id?.[0] || '',
    translations: (v.translations?.[0]?.translation || []).map((t) => ({
      author: t.$.author,
      text: t.text[0],
    })),
  }));
  return { name, title, versesCount: verses.length, verses };
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const name of ALLOWED) {
    const data = await convert(name);
    fs.writeFileSync(path.join(OUT, `${name}.json`), JSON.stringify(data, null, 2));
    console.log(`✓ ${name}: ${data.versesCount} verses, ${data.verses.reduce((n, v) => n + v.translations.length, 0)} translations`);
  }
}

main().catch((e) => { console.error(e); process.exit(1); });
