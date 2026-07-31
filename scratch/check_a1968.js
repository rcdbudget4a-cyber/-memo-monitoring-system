const https = require('https');

https.get('https://docs.google.com/spreadsheets/d/166VH0J3B0kY9MBvP37x9NtV32Vsk_y0kDqfQrutRcxA/gviz/tq?tqx=out:csv&gid=767216694', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const lines = data.split('\n');
    console.log('Total lines:', lines.length);
    console.log('Row 1968 (index 1967):', lines[1967]);
    
    // Find first vacant row starting from row 1968 (index 1967)
    for (let i = 1967; i < lines.length; i++) {
      const line = lines[i];
      if (line.includes('"ORCD-') || line.includes('"A')) {
        const parts = line.split('","').map(s => s.replace(/^"|"$/g, '').trim());
        const ctrl = parts[0];
        const subject = parts[4] || '';
        if (!subject || subject === '') {
          console.log(`First vacant starting at row 1968 (Row ${i + 1}):`, ctrl);
          break;
        }
      }
    }
  });
});
