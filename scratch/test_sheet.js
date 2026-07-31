const https = require('https');

https.get('https://docs.google.com/spreadsheets/d/166VH0J3B0kY9MBvP37x9NtV32Vsk_y0kDqfQrutRcxA/gviz/tq?tqx=out:csv&gid=767216694', (res) => {
  let data = '';
  res.on('data', chunk => data += chunk);
  res.on('end', () => {
    const lines = data.split('\n');
    console.log('Total lines:', lines.length);
    const vacant = [];
    for (const line of lines) {
      const match = line.match(/"(ORCD-\d+)"/);
      if (match) {
        const parts = line.split('","').map(s => s.replace(/^"|"$/g, '').trim());
        const ctrl = parts[0];
        const date = parts[1] || '';
        const duty = parts[3] || '';
        const subject = parts[4] || '';
        if (!subject || subject === '') {
          vacant.push({ ctrl, date, duty, subject });
        }
      }
    }
    console.log('Found vacant count:', vacant.length);
    console.log('First 10 vacant Control Nos:', vacant.slice(0, 10));
  });
});
