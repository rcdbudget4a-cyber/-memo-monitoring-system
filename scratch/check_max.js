const https = require('https');

https.get('https://docs.google.com/spreadsheets/d/166VH0J3B0kY9MBvP37x9NtV32Vsk_y0kDqfQrutRcxA/gviz/tq?tqx=out:csv&gid=767216694', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const lines = data.split('\n');
    console.log('Total lines:', lines.length);
    console.log('Line 1968:', lines[1967]); // 0-indexed row 1968
    
    // Check if any row has control number ORCD-1968 or similar
    const orcd1968 = lines.find(l => l.includes('ORCD-1968') || l.includes('1968'));
    console.log('Found 1968 line:', orcd1968 || 'Not found in CSV text');

    // Find highest ORCD-XXXX number in sheet
    let maxOrcd = 0;
    lines.forEach(l => {
      const match = l.match(/"ORCD-(\d+)"/);
      if (match) {
        const num = parseInt(match[1], 10);
        if (num > maxOrcd) maxOrcd = num;
      }
    });
    console.log('Max ORCD number found:', maxOrcd);
  });
});
