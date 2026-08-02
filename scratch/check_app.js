const fs = require('fs');
const appJs = fs.readFileSync('js/app.js', 'utf8');

console.log("Includes openChangeCredentialsModal:", appJs.includes("openChangeCredentialsModal"));
console.log("Includes change-credentials-form:", appJs.includes("change-credentials-form"));
console.log("Includes viewAttachedFile:", appJs.includes("viewAttachedFile"));
