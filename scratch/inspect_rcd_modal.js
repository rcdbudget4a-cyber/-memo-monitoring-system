const fs = require('fs');
const lines = fs.readFileSync('js/app.js', 'utf8').split('\n');
lines.forEach((line, idx) => {
  if (idx >= 1340 && idx <= 1480) {
    console.log(`L${idx+1}: ${line}`);
  }
});
