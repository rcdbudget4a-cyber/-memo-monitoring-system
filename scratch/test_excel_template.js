const XLSX = require('xlsx');
const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, '..', 'data', 'PRO4A_RCD_Memo_Logbook_2026-08-04.xlsx');
console.log("File exists?", fs.existsSync(filePath));

const fileBuffer = fs.readFileSync(filePath);
const workbook = XLSX.read(fileBuffer, { type: 'buffer', cellStyles: true, cellFormulas: true, cellDates: true, cellNF: true });

console.log("Sheet names:", workbook.SheetNames);
const sheetName = workbook.SheetNames[0];
const worksheet = workbook.Sheets[sheetName];

console.log("Original !ref:", worksheet['!ref']);
console.log("Original !cols count:", worksheet['!cols'] ? worksheet['!cols'].length : 0);
console.log("Original !autofilter:", worksheet['!autofilter']);

// Inspect row 1 headers
const cols = ['A','B','C','D','E','F','G','H','I','J','K','L','M'];
const headers = cols.map(c => worksheet[c + '1'] ? worksheet[c + '1'].v : undefined);
console.log("Headers (Row 1):", headers);
