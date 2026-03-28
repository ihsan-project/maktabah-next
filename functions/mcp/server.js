const { McpServer } = require('@modelcontextprotocol/sdk/server/mcp.js');
const { z } = require('zod');

/**
 * Create and configure the Maktabah MCP server with all tools registered.
 * @returns {McpServer}
 */
function createMcpServer() {
  const server = new McpServer({
    name: 'maktabah',
    version: '1.0.0',
  });

  // Ping tool — verifies end-to-end connectivity
  server.tool(
    'ping',
    'Check if the Maktabah MCP server is reachable and responding',
    {},
    async () => {
      return {
        content: [{
          type: 'text',
          text: JSON.stringify({
            status: 'ok',
            server: 'maktabah',
            version: '1.0.0',
            timestamp: new Date().toISOString(),
          }),
        }],
      };
    }
  );

  return server;
}

module.exports = { createMcpServer };
