const https = require('https');

https.get('https://docs.google.com/spreadsheets/d/166VH0J3B0kY9MBvP37x9NtV32Vsk_y0kDqfQrutRcxA/gviz/tq?tqx=out:csv&gid=767216694', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const lines = data.split('\n');
    console.log('Total lines:', lines.length);
    for (let i = 0; i < lines.length; i++) {
      if (lines[i].includes('1968') || lines[i].includes('A1968') || lines[i].includes('1967') || lines[i].includes('1969')) {
        console.log(`Line ${i}:`, lines[i].substring(0, 150));
      }
    }
  });
});
