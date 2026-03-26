#!/usr/bin/env node

/**
 * Generates per-surah JSON files from Quran translation XMLs.
 * Output: public/quran/1.json, public/quran/2.json, ..., public/quran/114.json
 * Plus:   public/quran/metadata.json (surah names, verse counts, translator list)
 *
 * Usage: node quran_loader/generate-quran-json.js
 */

const fs = require('fs');
const path = require('path');
const { DOMParser } = require('@xmldom/xmldom');
const xpath = require('xpath');

const TRANSLATIONS_DIR = path.join(__dirname, 'translations');
const OUTPUT_DIR = path.join(__dirname, '..', 'public', 'quran');

// Quran translation files to include (excluding Bukhari hadith and raw transliteration)
const TRANSLATION_FILES = [
  'en.ahmedali.xml',
  'en.ahmedraza.xml',
  'en.arberry.xml',
  'en.daryabadi.xml',
  'en.hilali.xml',
  'en.itani.xml',
  'en.maududi.xml',
  'en.mubarakpuri.xml',
  'en.pickthall.xml',
  'en.qarai.xml',
  'en.qaribullah.xml',
  'en.sahih.xml',
  'en.sarwar.xml',
  'en.shakir.xml',
  'en.wahiduddin.xml',
  'en.yusufali.xml',
  'en.transliteration.clean.xml',
];

// Surah names (1-indexed, 114 surahs)
const SURAH_NAMES = [
  '', // placeholder for index 0
  'Al-Fatiha', 'Al-Baqarah', 'Aal-E-Imran', 'An-Nisa', 'Al-Maida',
  'Al-Anam', 'Al-Araf', 'Al-Anfal', 'At-Tawbah', 'Yunus',
  'Hud', 'Yusuf', 'Ar-Ra\'d', 'Ibrahim', 'Al-Hijr',
  'An-Nahl', 'Al-Isra', 'Al-Kahf', 'Maryam', 'Ta-Ha',
  'Al-Anbiya', 'Al-Hajj', 'Al-Mu\'minun', 'An-Nur', 'Al-Furqan',
  'Ash-Shu\'ara', 'An-Naml', 'Al-Qasas', 'Al-Ankabut', 'Ar-Rum',
  'Luqman', 'As-Sajdah', 'Al-Ahzab', 'Saba', 'Fatir',
  'Ya-Sin', 'As-Saffat', 'Sad', 'Az-Zumar', 'Ghafir',
  'Fussilat', 'Ash-Shura', 'Az-Zukhruf', 'Ad-Dukhan', 'Al-Jathiyah',
  'Al-Ahqaf', 'Muhammad', 'Al-Fath', 'Al-Hujurat', 'Qaf',
  'Adh-Dhariyat', 'At-Tur', 'An-Najm', 'Al-Qamar', 'Ar-Rahman',
  'Al-Waqiah', 'Al-Hadid', 'Al-Mujadila', 'Al-Hashr', 'Al-Mumtahanah',
  'As-Saff', 'Al-Jumuah', 'Al-Munafiqun', 'At-Taghabun', 'At-Talaq',
  'At-Tahrim', 'Al-Mulk', 'Al-Qalam', 'Al-Haqqah', 'Al-Ma\'arij',
  'Nuh', 'Al-Jinn', 'Al-Muzzammil', 'Al-Muddaththir', 'Al-Qiyamah',
  'Al-Insan', 'Al-Mursalat', 'An-Naba', 'An-Nazi\'at', 'Abasa',
  'At-Takwir', 'Al-Infitar', 'Al-Mutaffifin', 'Al-Inshiqaq', 'Al-Buruj',
  'At-Tariq', 'Al-A\'la', 'Al-Ghashiyah', 'Al-Fajr', 'Al-Balad',
  'Ash-Shams', 'Al-Layl', 'Ad-Duha', 'Ash-Sharh', 'At-Tin',
  'Al-Alaq', 'Al-Qadr', 'Al-Bayyinah', 'Az-Zalzalah', 'Al-Adiyat',
  'Al-Qariah', 'At-Takathur', 'Al-Asr', 'Al-Humazah', 'Al-Fil',
  'Quraysh', 'Al-Ma\'un', 'Al-Kawthar', 'Al-Kafirun', 'An-Nasr',
  'Al-Masad', 'Al-Ikhlas', 'Al-Falaq', 'An-Nas',
];

/**
 * Parse translator name from XML comment header.
 * Falls back to filename-based ID if not found.
 */
function parseTranslatorName(xmlContent, filename) {
  const nameMatch = xmlContent.match(/#\s*Name:\s*(.+)/);
  if (nameMatch) return nameMatch[1].trim();
  // Fallback: derive from filename
  return filename.replace('en.', '').replace('.clean', '').replace('.xml', '');
}

/**
 * Parse a single translation XML file.
 * Returns: { translatorName, surahs: { [surahIndex]: { [ayaIndex]: text } } }
 */
function parseTranslationFile(filename) {
  const filePath = path.join(TRANSLATIONS_DIR, filename);
  const content = fs.readFileSync(filePath, 'utf8');
  const translatorName = parseTranslatorName(content, filename);

  const doc = new DOMParser().parseFromString(content, 'text/xml');
  const suraNodes = xpath.select('//sura', doc);

  const surahs = {};
  for (const sura of suraNodes) {
    const surahIndex = parseInt(sura.getAttribute('index'), 10);
    const ayaNodes = xpath.select('aya', sura);
    const verses = {};
    for (const aya of ayaNodes) {
      const ayaIndex = parseInt(aya.getAttribute('index'), 10);
      verses[ayaIndex] = aya.getAttribute('text');
    }
    surahs[surahIndex] = verses;
  }

  return { translatorName, surahs };
}

function main() {
  console.log('Parsing translation files...');

  // Parse all translation files
  const translations = TRANSLATION_FILES.map(filename => {
    console.log(`  Parsing ${filename}...`);
    return parseTranslationFile(filename);
  });

  const translatorNames = translations.map(t => t.translatorName);
  console.log(`\nFound ${translatorNames.length} translators:`, translatorNames);

  // Ensure output directory exists
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });

  // Determine surah count and verse counts from the first translation
  const firstTranslation = translations[0];
  const surahIndices = Object.keys(firstTranslation.surahs).map(Number).sort((a, b) => a - b);

  const metadata = {
    translators: translatorNames,
    surahCount: surahIndices.length,
    surahs: [],
  };

  // Generate per-surah JSON files
  for (const surahIndex of surahIndices) {
    const surahName = SURAH_NAMES[surahIndex] || `Surah ${surahIndex}`;
    const firstSurahVerses = firstTranslation.surahs[surahIndex];
    const verseIndices = Object.keys(firstSurahVerses).map(Number).sort((a, b) => a - b);

    const verses = {};
    for (const verseIndex of verseIndices) {
      verses[verseIndex] = translations.map(t => ({
        author: t.translatorName,
        text: (t.surahs[surahIndex] && t.surahs[surahIndex][verseIndex]) || '',
      })).filter(t => t.text); // Skip empty translations
    }

    const surahData = {
      index: surahIndex,
      name: surahName,
      verseCount: verseIndices.length,
      verses,
    };

    const outputPath = path.join(OUTPUT_DIR, `${surahIndex}.json`);
    fs.writeFileSync(outputPath, JSON.stringify(surahData));
    console.log(`  Generated ${outputPath} (${verseIndices.length} verses)`);

    metadata.surahs.push({
      index: surahIndex,
      name: surahName,
      verseCount: verseIndices.length,
    });
  }

  // Write metadata file
  const metadataPath = path.join(OUTPUT_DIR, 'metadata.json');
  fs.writeFileSync(metadataPath, JSON.stringify(metadata));
  console.log(`\nGenerated ${metadataPath}`);
  console.log(`Done! Generated ${surahIndices.length} surah files + metadata.`);
}

main();
