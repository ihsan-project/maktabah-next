const functions = require('firebase-functions');
const admin = require('firebase-admin');
const { handleMcpRequest } = require('./mcp/handler');

// Initialize Firebase if not already initialized
if (!admin.apps.length) {
  admin.initializeApp();
}

// --- MCP Server ---
exports.mcpServer = functions.https.onRequest(
  {
    timeoutSeconds: 300,
    minInstances: 0,
    secrets: ['OPENSEARCH_URL', 'AWS_ACCESS_KEY_ID', 'AWS_SECRET_ACCESS_KEY'],
  },
  async (req, res) => {
    await handleMcpRequest(req, res);
  }
);
