const fs = require('fs');
const appJs = fs.readFileSync('js/app.js', 'utf8');

const lines = appJs.split('\n');
lines.forEach((line, idx) => {
  if (line.includes('checkSecurityAuth') || line.includes('AUTH_LOCAL') || line.includes('login(')) {
    console.log(`L${idx+1}: ${line}`);
  }
});
