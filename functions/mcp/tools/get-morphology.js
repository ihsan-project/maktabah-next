const { z } = require('zod');
const { getCachedJson } = require('../../lib/storage-cache');

/**
 * Register the get_word_morphology tool on the MCP server.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 */
function registerGetMorphologyTool(server) {
  server.tool(
    'get_word_morphology',
    'Get word-by-word morphological breakdown of a Quran verse. Returns each word\'s Arabic text, transliteration, English translation, root, part of speech, and full morphology string.',
    {
      surah: z.number().int().min(1).max(114).describe('Surah number (1-114)'),
      ayah: z.number().int().min(1).describe('Ayah (verse) number within the surah'),
    },
    async ({ surah, ayah }) => {
      let surahData;
      try {
        surahData = await getCachedJson(`quran/words/${surah}.json`);
      } catch {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: `Word data not found for surah ${surah}` }),
          }],
        };
      }

      const verseKey = String(ayah);
      const verse = surahData.verses?.[verseKey];

      if (!verse) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: `Verse not found: ${surah}:${ayah}` }),
          }],
        };
      }

      const words = (verse.words || []).map(w => ({
        position: w.position,
        arabic: w.text_uthmani,
        simple: w.text_simple,
        transliteration: w.transliteration,
        translation: w.translation,
        root: w.root || null,
        lemma: w.lemma || null,
        part_of_speech: w.pos || null,
        morphology: w.morphology || null,
      }));

      const result = {
        surah,
        ayah,
        word_count: words.length,
        words,
      };

      return {
        content: [{
          type: 'text',
          text: JSON.stringify(result, null, 2),
        }],
      };
    }
  );
}

module.exports = { registerGetMorphologyTool };
