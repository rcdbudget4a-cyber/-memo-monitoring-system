const fs = require('fs');
const appJs = fs.readFileSync('js/app.js', 'utf8');

const match = appJs.match(/renderTable\(\)\s*\{[\s\S]*?\n  \}/);
if (match) {
  console.log(match[0].slice(0, 1500));
}
