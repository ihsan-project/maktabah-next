const fs = require('fs');
const path = require('path');

// Function to parse the Sahih Bukhari file and convert to multiple XML files by volume
function convertBukhariToXmlFiles(inputFilePath, outputDir) {
  try {
    // Create output directory if it doesn't exist
    if (!fs.existsSync(outputDir)) {
      fs.mkdirSync(outputDir, { recursive: true });
    }
    
    // Read the input file
    const data = fs.readFileSync(inputFilePath, 'utf8');
    
    // Regular expression to match the reference pattern (e.g., 1.01.003)
    const refRegex = /(\d+)\.(\d+)\.(\d+)/;
    
    // Split the data by lines
    const lines = data.split('\n');
    
    // Object to store data by volume
    const volumeData = {};
    
    let currentVolume = null;
    let currentBook = null;
    let currentText = '';
    let currentRef = null;
    
    // Process each line
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      // Skip empty lines
      if (!line) continue;
      
      // Check if the line contains a reference
      const refMatch = line.match(refRegex);
      
      if (refMatch) {
        // If we already have collected text for a previous reference, add it to the data structure
        if (currentRef) {
          const [_, volume, book, verse] = currentRef.match(refRegex);
          
          // Initialize volume object if it doesn't exist
          if (!volumeData[volume]) {
            volumeData[volume] = {};
          }
          
          // Initialize book array if it doesn't exist
          if (!volumeData[volume][book]) {
            volumeData[volume][book] = [];
          }
          
          // Add verse data
          volumeData[volume][book].push({
            verse: parseInt(verse),
            text: currentText.trim()
          });
          
          currentVolume = volume;
          currentBook = book;
        }
        
        // Start collecting text for the new reference
        currentRef = refMatch[0];
        currentText = line.substring(line.indexOf(':') + 1).trim();
      } else if (currentRef) {
        // Continue collecting text for the current reference
        currentText += ' ' + line;
      }
    }
    
    // Process the last entry if there is one
    if (currentRef) {
      const [_, volume, book, verse] = currentRef.match(refRegex);
      
      // Initialize volume object if it doesn't exist
      if (!volumeData[volume]) {
        volumeData[volume] = {};
      }
      
      // Initialize book array if it doesn't exist
      if (!volumeData[volume][book]) {
        volumeData[volume][book] = [];
      }
      
      // Add verse data
      volumeData[volume][book].push({
        verse: parseInt(verse),
        text: currentText.trim()
      });
    }
    
    // Create XML files for each volume
    for (const volume in volumeData) {
      // Format volume number with leading zeros if needed
      const paddedVolume = volume.padStart(2, '0');
      const outputFilePath = path.join(outputDir, `en.bukhari.vol${paddedVolume}.xml`);
      
      // Initialize the XML structure for this volume
      let xmlOutput = '<?xml version="1.0" encoding="UTF-8"?>\n';
      xmlOutput += `<hadith name="Sahih Bukhari Vol ${parseInt(volume)}">\n`;
      
      // Add chapters (previously called books) and verses
      for (const book in volumeData[volume]) {
        // Changed from "book" to "chapter" in the XML tag
        xmlOutput += ` <chapter index="${parseInt(book)}">\n`;
        
        // Add verses
        for (const verseData of volumeData[volume][book]) {
          xmlOutput += `  <verse index="${verseData.verse}" text="${escapeXml(verseData.text)}"/>\n`;
        }
        
        // Changed from "book" to "chapter" in the closing XML tag
        xmlOutput += ` </chapter>\n`;
      }
      
      // Close the root element
      xmlOutput += '</hadith>\n';
      
      // Write the output to a file
      fs.writeFileSync(outputFilePath, xmlOutput);
      
      console.log(`Volume ${volume} saved to ${outputFilePath}`);
    }
    
    console.log(`Conversion complete! Output saved to ${outputDir}`);
  } catch (error) {
    console.error('Error:', error.message);
  }
}

// Helper function to escape XML special characters
function escapeXml(unsafe) {
  return unsafe
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

// Check if the script is run directly
if (require.main === module) {
  // Get command line arguments
  const args = process.argv.slice(2);
  
  if (args.length < 2) {
    console.log('Usage: node script.js <input_file_path> <output_directory>');
  } else {
    const inputFilePath = args[0];
    const outputDir = args[1];
    
    convertBukhariToXmlFiles(inputFilePath, outputDir);
  }
}

// Export the function for use in other modules
module.exports = { convertBukhariToXmlFiles };
