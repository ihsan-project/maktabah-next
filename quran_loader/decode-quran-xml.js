#!/usr/bin/env node

const fs = require('fs');
const path = require('path');
const { DOMParser, XMLSerializer } = require('@xmldom/xmldom');
const xpath = require('xpath');
const he = require('he'); // HTML entity decoder

/**
 * Decode HTML entities in Quran XML files and strip HTML tags
 * @param {string} inputFilePath - Path to the input XML file
 * @param {string} outputFilePath - Path to the output XML file (optional)
 */
function decodeQuranXml(inputFilePath, outputFilePath) {
  try {
    // Generate output file path if not provided
    if (!outputFilePath) {
      const fileDir = path.dirname(inputFilePath);
      const fileName = path.basename(inputFilePath, path.extname(inputFilePath));
      outputFilePath = path.join(fileDir, `${fileName}.clean${path.extname(inputFilePath)}`);
    }

    console.log(`Reading file: ${inputFilePath}`);
    
    // Read and parse XML
    const xmlContent = fs.readFileSync(inputFilePath, 'utf8');
    const doc = new DOMParser().parseFromString(xmlContent, 'text/xml');
    
    // Extract all ayas
    const ayas = xpath.select('//aya', doc);
    let modifiedCount = 0;
    
    console.log(`Found ${ayas.length} verses to process`);
    
    // Process each aya
    ayas.forEach(aya => {
      const text = aya.getAttribute('text');
      
      if (text) {
        // First decode HTML entities
        const decodedText = he.decode(text);
        
        // Then strip out all HTML tags
        const strippedText = decodedText.replace(/<\/?[^>]+(>|$)/g, '');
        
        // Only update if there's a change
        if (strippedText !== text) {
          modifiedCount++;
          aya.setAttribute('text', strippedText);
        }
      }
    });
    
    // Serialize the document back to XML
    const serializer = new XMLSerializer();
    const outputXml = serializer.serializeToString(doc);
    
    // Write the output to a file
    fs.writeFileSync(outputFilePath, outputXml, 'utf8');
    
    console.log(`Processed ${modifiedCount} verses with HTML tags or entities`);
    console.log(`Output saved to: ${outputFilePath}`);
    
    return {
      success: true,
      modifiedCount,
      outputFilePath
    };
  } catch (error) {
    console.error('Error processing XML file:', error);
    return {
      success: false,
      error: error.message
    };
  }
}

// Check if script is run directly
if (require.main === module) {
  const args = process.argv.slice(2);
  
  if (args.length < 1) {
    console.error('Usage: node decode-quran-xml.js <input-xml-file> [output-xml-file]');
    process.exit(1);
  }
  
  const inputFilePath = args[0];
  const outputFilePath = args[1]; // Optional
  
  const result = decodeQuranXml(inputFilePath, outputFilePath);
  
  if (!result.success) {
    process.exit(1);
  }
}

// Export for use as a module
module.exports = { decodeQuranXml };
