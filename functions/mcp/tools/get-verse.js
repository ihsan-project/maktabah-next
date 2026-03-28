const { z } = require('zod');
const { lookupDocuments } = require('../../lib/search-core');

/**
 * Register the get_verse tool on the MCP server.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 */
function registerGetVerseTool(server) {
  server.tool(
    'get_verse',
    'Retrieve a specific Quran verse by surah and ayah number. Returns all available English translations and the Arabic text with surah metadata.',
    {
      surah: z.number().int().min(1).max(114).describe('Surah number (1-114)'),
      ayah: z.number().int().min(1).describe('Ayah (verse) number within the surah'),
      translator: z.string().optional().describe('Return only this translator (e.g. "Yusuf Ali"). Omit for all translations.'),
    },
    async ({ surah, ayah, translator }) => {
      const filters = [
        { term: { title: 'quran' } },
        { term: { chapter: surah } },
        { term: { verse: ayah } },
      ];
      if (translator) {
        filters.push({ term: { author: translator } });
      }

      const docs = await lookupDocuments(filters, 20);

      if (docs.length === 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: `Verse not found: ${surah}:${ayah}` }),
          }],
        };
      }

      const first = docs[0];
      const result = {
        surah: first.chapter,
        ayah: first.verse,
        surah_name: first.surah_name || null,
        surah_name_arabic: first.surah_name_arabic || null,
        surah_name_english: first.surah_name_english || null,
        revelation_type: first.revelation_type || null,
        juz: first.juz || null,
        arabic: first.text_arabic_uthmani || null,
        translations: docs.map(d => ({
          translator: d.author,
          text: d.text,
        })),
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

module.exports = { registerGetVerseTool };
