const https = require('https');

https.get('https://docs.google.com/spreadsheets/d/166VH0J3B0kY9MBvP37x9NtV32Vsk_y0kDqfQrutRcxA/gviz/tq?tqx=out:csv&gid=767216694', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const lines = data.split('\n');
    console.log('Total lines:', lines.length);
    console.log('--- Lines 1960 to 1975 (Row 1968 in Sheet) ---');
    for (let i = 1960; i < Math.min(1975, lines.length); i++) {
      console.log(`Line ${i + 1} (Sheet Row ${i + 1}):`, lines[i].substring(0, 150));
    }
  });
});
