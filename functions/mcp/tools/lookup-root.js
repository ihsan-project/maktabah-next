const { z } = require('zod');
const { getCachedJson } = require('../../lib/storage-cache');

/**
 * Register the lookup_root tool on the MCP server.
 * @param {import('@modelcontextprotocol/sdk/server/mcp.js').McpServer} server
 */
function registerLookupRootTool(server) {
  server.tool(
    'lookup_root',
    'Look up an Arabic root in Lane\'s Arabic-English Lexicon. Returns the scholarly definition, occurrence count in the Quran, morphological forms, and sample verse references. Roots are 3-letter Arabic separated by spaces (e.g. "ر ح م" for mercy).',
    {
      root: z.string().describe('Arabic root letters separated by spaces (e.g. "ر ح م")'),
    },
    async ({ root }) => {
      const normalizedRoot = root.trim();

      // Load roots index for occurrence data
      const rootsIndex = await getCachedJson('quran/words/roots.json');
      const rootEntry = rootsIndex[normalizedRoot];

      if (!rootEntry) {
        return {
          content: [{
            type: 'text',
            text: JSON.stringify({ error: `Root not found: "${normalizedRoot}". Roots should be Arabic letters separated by spaces (e.g. "ر ح م").` }),
          }],
        };
      }

      // Determine the first letter for the lanes file
      const firstLetter = normalizedRoot.split(' ')[0];
      let lanesEntry = null;

      try {
        const lanesData = await getCachedJson(`quran/words/lanes/${firstLetter}.json`);
        lanesEntry = lanesData[normalizedRoot] || null;
      } catch {
        // Lane's data may not exist for all roots
      }

      // Limit sample verses to 10
      const sampleVerses = (rootEntry.verses || []).slice(0, 10).map(v => ({
        surah: v.s,
        ayah: v.v,
        word_position: v.p,
      }));

      const result = {
        root: normalizedRoot,
        root_arabic: lanesEntry?.root_ar || normalizedRoot.replace(/ /g, ''),
        occurrences: rootEntry.occurrences,
        total_verses: (rootEntry.verses || []).length,
        definition: lanesEntry ? {
          summary: lanesEntry.summary || null,
          full: lanesEntry.definition || lanesEntry.preview || null,
          source: lanesEntry.source || 'lane',
        } : null,
        morphological_forms: lanesEntry?.morphological_forms || [],
        sample_verses: sampleVerses,
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

module.exports = { registerLookupRootTool };
