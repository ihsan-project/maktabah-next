/**
 * More robust SQL parser for Quran translations
 * This parser can handle various SQL dump formats
 */

const fs = require('fs');
const { parse } = require('node-sql-parser');

/**
 * Parse SQL file and extract verse data
 * 
 * @param {string} filePath Path to SQL dump file
 * @param {string} translator Name of the translator
 * @returns {Array} Array of verse objects
 */
function parseSQL(filePath, translator) {
  console.log(`Parsing SQL file: ${filePath}`);
  
  try {
    const content = fs.readFileSync(filePath, 'utf8');
    
    // Try to identify table structure - look for CREATE TABLE statement
    const createTableMatch = content.match(/CREATE TABLE[\s\S]*?\(([\s\S]*?)\)/);
    
    if (!createTableMatch) {
      return parseBasic(content, translator);
    }
    
    // Extract column names from CREATE TABLE
    const columnsStr = createTableMatch[1];
    const columnMatches = columnsStr.match(/`([^`]+)`/g);
    
    if (!columnMatches) {
      return parseBasic(content, translator);
    }
    
    const columns = columnMatches.map(col => col.replace(/`/g, ''));
    
    // Find the indices for chapter, verse, and text
    let chapterIdx = columns.findIndex(col => 
      /chapter|surah|sura/i.test(col));
    let verseIdx = columns.findIndex(col => 
      /verse|ayah|aya/i.test(col));
    let textIdx = columns.findIndex(col => 
      /text|content|translation/i.test(col));
    
    // If indices are not found, use default positions
    if (chapterIdx === -1) chapterIdx = 1;
    if (verseIdx === -1) verseIdx = 2;
    if (textIdx === -1) textIdx = 3;
    
    console.log(`Column indices - Chapter: ${chapterIdx}, Verse: ${verseIdx}, Text: ${textIdx}`);
    
    // Extract INSERT statements
    const insertRegex = /INSERT INTO.*VALUES\s*\(([\s\S]*?)\);/g;
    const insertMatches = [...content.matchAll(insertRegex)];
    
    if (insertMatches.length === 0) {
      return parseBasic(content, translator);
    }
    
    const verses = [];
    
    for (const match of insertMatches) {
      const valuesStr = match[1];
      
      // Handle multiple rows in one INSERT statement
      const rows = valuesStr.split('),(').map(row => 
        row.replace(/^\(|\)$/g, ''));
      
      for (const row of rows) {
        const values = parseInsertRow(row);
        
        if (values.length > Math.max(chapterIdx, verseIdx, textIdx)) {
          // Extract the relevant values
          const chapter = parseInt(values[chapterIdx]) || 0;
          const verse = parseInt(values[verseIdx]) || 0;
          const text = cleanSqlString(values[textIdx]);
          
          if (chapter && verse && text) {
            verses.push({
              chapter,
              verse,
              text,
              translator
            });
          }
        }
      }
    }
    
    console.log(`Extracted ${verses.length} verses`);
    return verses;
  } catch (error) {
    console.error('Error parsing SQL file:', error);
    return [];
  }
}

/**
 * Parse SQL INSERT row, handling quoted values correctly
 */
function parseInsertRow(row) {
  const values = [];
  let currentValue = '';
  let inQuote = false;
  let quoteChar = '';
  
  for (let i = 0; i < row.length; i++) {
    const char = row[i];
    
    if ((char === "'" || char === '"') && (i === 0 || row[i-1] !== '\\')) {
      if (!inQuote) {
        inQuote = true;
        quoteChar = char;
      } else if (char === quoteChar) {
        inQuote = false;
      } else {
        currentValue += char;
      }
    } else if (char === ',' && !inQuote) {
      values.push(currentValue);
      currentValue = '';
    } else {
      currentValue += char;
    }
  }
  
  values.push(currentValue); // Add the last value
  return values;
}

/**
 * Clean SQL string by removing quotes and escaped characters
 */
function cleanSqlString(str) {
  if (!str) return '';
  
  // Remove surrounding quotes
  str = str.replace(/^['"]|['"]$/g, '');
  
  // Replace escaped characters
  str = str.replace(/\\'/g, "'")
    .replace(/\\"/g, '"')
    .replace(/\\n/g, '\n')
    .replace(/\\r/g, '\r')
    .replace(/\\t/g, '\t')
    .replace(/\\\\/g, '\\');
  
  return str;
}

/**
 * Fallback to basic parsing if structured parsing fails
 */
function parseBasic(content, translator) {
  console.log('Using basic SQL parsing');
  
  // Look for INSERT statements with values
  const insertRegex = /INSERT INTO.*VALUES\s*\(([\s\S]*?)\);/g;
  const insertMatches = [...content.matchAll(insertRegex)];
  
  if (insertMatches.length === 0) {
    console.error('No INSERT statements found');
    return [];
  }
  
  const verses = [];
  
  for (const match of insertMatches) {
    const valuesStr = match[1];
    
    // Handle multiple rows in one INSERT
    const rows = valuesStr.split('),(').map(row => 
      row.replace(/^\(|\)$/g, ''));
    
    for (const row of rows) {
      const values = parseInsertRow(row);
      
      // Assume default positions: chapter=1, verse=2, text=3
      if (values.length >= 4) {
        const chapter = parseInt(values[1]) || 0;
        const verse = parseInt(values[2]) || 0;
        const text = cleanSqlString(values[3]);
        
        if (chapter && verse && text) {
          verses.push({
            chapter,
            verse,
            text,
            translator
          });
        }
      }
    }
  }
  
  console.log(`Extracted ${verses.length} verses with basic parsing`);
  return verses;
}

module.exports = {
  parseSQL
};
