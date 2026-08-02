const fs = require('fs');
const lines = fs.readFileSync('js/app.js', 'utf8').split('\n');
lines.forEach((line, idx) => {
  if (line.includes('viewAttachedFile') || line.includes('View PDF')) {
    console.log(`L${idx+1}: ${line}`);
  }
});
