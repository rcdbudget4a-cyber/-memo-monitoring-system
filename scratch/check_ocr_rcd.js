const fs = require('fs');
const appJs = fs.readFileSync('js/app.js', 'utf8');

const lines = appJs.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('OCR') || line.includes('openOCR') || line.includes('openOutgoing') || line.includes('btn-scan') || line.includes('btn-ocr') || line.includes('btn-rcd') || line.includes('btn-input')) {
    console.log(`L${idx+1}: ${line}`);
  }
});
