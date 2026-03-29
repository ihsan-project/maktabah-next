const { z } = require('zod');
const { lookupDocuments } = require('../../lib/search-core');

/**
 * Register the get_hadith tool on the MCP server.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 */
function registerGetHadithTool(server) {
  server.tool(
    'get_hadith',
    'Retrieve a specific hadith from Sahih al-Bukhari by volume and hadith number.',
    {
      volume: z.number().int().min(1).max(9).describe('Volume number (1-9)'),
      hadith: z.number().int().min(1).describe('Hadith number within the volume'),
    },
    async ({ volume, hadith }) => {
      const filters = [
        { term: { title: 'bukhari' } },
        { term: { volume } },
        { term: { verse: hadith } },
      ];

      const docs = await lookupDocuments(filters, 5);

      if (docs.length === 0) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: `Hadith not found: Bukhari Vol.${volume}, Hadith ${hadith}` }),
          }],
        };
      }

      const doc = docs[0];
      const result = {
        collection: 'Sahih al-Bukhari',
        volume: doc.volume,
        hadith: doc.verse,
        chapter_name: doc.chapter_name || null,
        text: doc.text,
        translator: doc.author,
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

module.exports = { registerGetHadithTool };
