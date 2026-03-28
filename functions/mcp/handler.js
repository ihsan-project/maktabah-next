const { StreamableHTTPServerTransport } = require('@modelcontextprotocol/sdk/server/streamableHttp.js');
const { createMcpServer } = require('./server');
const { validateApiKey, ApiKeyError } = require('../lib/api-key-auth');
const logger = require('firebase-functions/logger');

/**
 * Handle an incoming MCP request over Streamable HTTP.
 *
 * Each request gets its own transport + server instance (stateless).
 * Auth is validated before the MCP protocol layer sees anything.
 *
 * @param {object} req Express-style request
 * @param {object} res Express-style response
 */
async function handleMcpRequest(req, res) {
  // CORS headers
  res.set('Access-Control-Allow-Origin', '*');
  res.set('Access-Control-Allow-Methods', 'GET, POST, DELETE, OPTIONS');
  res.set('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');

  if (req.method === 'OPTIONS') {
    res.status(204).send('');
    return;
  }

  // Validate API key
  let authResult;
  try {
    authResult = await validateApiKey(req);
  } catch (err) {
    if (err instanceof ApiKeyError) {
      if (err.headers) {
        Object.entries(err.headers).forEach(([k, v]) => res.set(k, v));
      }
      res.status(err.statusCode).json({
        jsonrpc: '2.0',
        error: { code: -32000, message: err.message },
        id: null,
      });
      return;
    }
    logger.error('Unexpected auth error:', err);
    res.status(500).json({
      jsonrpc: '2.0',
      error: { code: -32603, message: 'Internal server error' },
      id: null,
    });
    return;
  }

  // Set rate limit headers on successful auth
  res.set('X-RateLimit-Limit', String(authResult.rateLimit));
  res.set('X-RateLimit-Remaining', String(authResult.rateLimitRemaining));
  res.set('X-RateLimit-Reset', String(authResult.rateLimitReset));

  // Create a fresh server + transport per request (stateless)
  const server = createMcpServer();
  const transport = new StreamableHTTPServerTransport({
    sessionIdGenerator: undefined, // stateless — no session tracking
  });

  try {
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (err) {
    logger.error('MCP transport error:', err);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: { code: -32603, message: 'Internal server error' },
        id: null,
      });
    }
  } finally {
    // Clean up transport + server after request completes
    await transport.close().catch(() => {});
    await server.close().catch(() => {});
  }
}

module.exports = { handleMcpRequest };
