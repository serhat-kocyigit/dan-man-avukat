const fs = require('fs');
const path = require('path');

const routesDir = path.join(__dirname, 'routes');
const files = fs.readdirSync(routesDir).filter(f => f.endsWith('.js'));

for (const file of files) {
  console.log('\n--- ' + file + ' ---');
  const content = fs.readFileSync(path.join(routesDir, file), 'utf8');
  
  // pool.execute çağrılarını bul
  const matches = content.match(/pool\.execute\([\s\S]*?\)/g) || [];
  
  matches.forEach(match => {
    // SQL sorgusunu basitçe çıkar
    const sqlMatch = match.match(/execute\(\s*[\`\'\"]([\s\S]*?)[\`\'\"]/);
    if (sqlMatch) {
       console.log('SQL: ' + sqlMatch[1].trim().replace(/\n\s*/g, ' '));
    }
  });
}
