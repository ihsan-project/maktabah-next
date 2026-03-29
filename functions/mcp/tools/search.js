const { z } = require('zod');
const { searchDocuments } = require('../../lib/search-core');

/**
 * Register the search tool on the MCP server.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 */
function registerSearchTool(server) {
  server.tool(
    'search',
    'Search the Quran and Sahih al-Bukhari across 15+ English translations using keyword, semantic, or hybrid search. Returns matching verses/hadiths with Arabic text, translations, and metadata.',
    {
      query: z.string().describe('Search query in English or Arabic'),
      mode: z.enum(['text', 'semantic', 'hybrid']).default('hybrid').describe('Search mode: "text" (keyword/BM25), "semantic" (vector/conceptual), or "hybrid" (both merged with RRF). Default: hybrid'),
      collection: z.enum(['quran', 'bukhari', 'all']).default('all').describe('Filter by collection. Default: all'),
      translator: z.string().optional().describe('Filter by translator name (e.g. "Yusuf Ali", "Sahih International")'),
      chapter: z.number().int().optional().describe('Filter by surah number (1-114) for Quran or chapter for Bukhari'),
      limit: z.number().int().min(1).max(20).default(10).describe('Number of results to return (1-20). Default: 10'),
    },
    async ({ query, mode, collection, translator, chapter, limit }) => {
      const titles = collection === 'all' ? null : collection;
      const results = await searchDocuments(query, {
        page: 1,
        size: limit,
        author: translator || null,
        chapter: chapter || null,
        titles: titles ? [titles] : null,
        mode,
      });

      const formatted = results.results.map(r => {
        const ref = r.title === 'quran'
          ? `Quran ${r.surah_name || ''} ${r.chapter}:${r.verse}`
          : `Bukhari Vol.${r.volume || ''} Hadith ${r.verse}`;
        return {
          reference: ref.trim(),
          text: r.text,
          arabic: r.text_arabic_uthmani || null,
          translator: r.author,
          collection: r.title,
          surah_name: r.surah_name || null,
          surah_name_arabic: r.surah_name_arabic || null,
          revelation_type: r.revelation_type || null,
          juz: r.juz || null,
          chapter: r.chapter,
          verse: r.verse,
        };
      });

      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            query,
            mode,
            total: results.total,
            results: formatted,
          }, null, 2),
        }],
      };
    }
  );
}

module.exports = { registerSearchTool };
