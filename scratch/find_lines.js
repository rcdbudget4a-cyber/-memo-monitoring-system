const fs = require('fs');
const lines = fs.readFileSync('js/app.js', 'utf8').split('\n');
lines.forEach((line, idx) => {
  if (line.includes('openChangeCredentialsModal') || line.includes('change-credentials') || line.includes('pdf-viewer') || line.includes('RecycleBin')) {
    console.log(`L${idx+1}: ${line}`);
  }
});
