const admin = require('firebase-admin');
const logger = require('firebase-functions/logger');

/**
 * Record a tool invocation for a given API key.
 * Updates daily aggregate doc: apiKeys/{hash}/usage/{YYYY-MM-DD}
 * Fire-and-forget — errors are logged but don't block the request.
 *
 * @param {string} keyHash The hashed API key
 * @param {string} toolName The MCP tool that was called
 */
function trackToolUsage(keyHash, toolName) {
  const db = admin.firestore();
  const today = new Date().toISOString().slice(0, 10); // YYYY-MM-DD
  const usageRef = db.collection('apiKeys').doc(keyHash).collection('usage').doc(today);

  usageRef.set({
    requests: admin.firestore.FieldValue.increment(1),
    [`tools.${toolName}`]: admin.firestore.FieldValue.increment(1),
    date: today,
  }, { merge: true }).catch(err => {
    logger.warn('Failed to track tool usage:', err.message);
  });
}

/**
 * Fetch usage data for a given API key over the last N days.
 *
 * @param {string} keyHash The hashed API key
 * @param {number} days Number of days to fetch (default 7)
 * @returns {Promise<Array<{date: string, requests: number, tools: object}>>}
 */
async function getUsageData(keyHash, days = 7) {
  const db = admin.firestore();

  // Build list of date strings for the last N days
  const dates = [];
  for (let i = 0; i < days; i++) {
    const d = new Date();
    d.setDate(d.getDate() - i);
    dates.push(d.toISOString().slice(0, 10));
  }

  const snapshot = await db.collection('apiKeys').doc(keyHash).collection('usage')
    .where('date', 'in', dates.slice(0, 10)) // Firestore 'in' max is 10
    .get();

  const usageMap = new Map();
  snapshot.docs.forEach(doc => {
    const data = doc.data();
    // Extract tools from flat fields like "tools.search" -> { search: N }
    const tools = {};
    Object.entries(data).forEach(([key, value]) => {
      if (key.startsWith('tools.')) {
        tools[key.slice(6)] = value;
      }
    });
    usageMap.set(data.date, {
      date: data.date,
      requests: data.requests || 0,
      tools,
    });
  });

  // Return all dates, filling in zeros for missing days
  return dates.map(date => usageMap.get(date) || { date, requests: 0, tools: {} }).reverse();
}

module.exports = { trackToolUsage, getUsageData };
