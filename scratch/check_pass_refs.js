const fs = require('fs');

['js/config.js', 'js/auth.js', 'js/app.js'].forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  content.split('\n').forEach((line, idx) => {
    if (line.includes('VALID_PASSCODES') || line.includes('RCD_CUSTOM_AUTH_PASS')) {
      console.log(`${file}:L${idx+1}: ${line}`);
    }
  });
});
