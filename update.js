const fs = require('fs');
const path = 'c:/Users/Administrator/dan-man-avukat/public/js/avukat-panel.js';
const newMethodsPath = 'c:/Users/Administrator/dan-man-avukat/new_methods.js';

let content = fs.readFileSync(path, 'utf8');
const newMethods = fs.readFileSync(newMethodsPath, 'utf8');

// Chunk 1: Replace avukatSection definition
content = content.replace(/function avukatSection\(name\)[ \S\s]*?if \(name === 'profil'\) \{ loadAvProfil\(\); document\.getElementById\('sbProfil'\)\?\.classList\.add\('active'\); \}\n\}/, `function avukatSection(name) {
  const sections = ['GelenTalepler', 'AktivDavalar', 'KapananDavalar', 'Mesajlar', 'Profil'];
  sections.forEach(s => {
    const el = document.getElementById(\`avSection\${s}\`);
    if (el) el.style.display = 'none';
  });

  const key = name.charAt(0).toUpperCase() + name.slice(1);
  const target = document.getElementById(\`avSection\${key}\`);
  if (target) target.style.display = 'block';
  else { console.warn('avSection bulunamadı:', \`avSection\${key}\`); return; }

  document.querySelectorAll('.sidebar-link').forEach(l => l.classList.remove('active'));

  if (avCurrentSection === 'mesajlar' && name !== 'mesajlar') {
    if (avMesajInterval) { clearInterval(avMesajInterval); avMesajInterval = null; }
  }
  avCurrentSection = name;

  if (name === 'gelenTalepler') { loadGelenTalepler(); document.getElementById('sbTalepler')?.classList.add('active'); }
  if (name === 'aktivDavalar') { loadAktivDavalar(); document.getElementById('sbAktif')?.classList.add('active'); }
  if (name === 'kapananDavalar') { loadAvKapananDavalar(); document.getElementById('sbKapanan')?.classList.add('active'); }
  if (name === 'mesajlar') {
    if (activeCaseId && document.getElementById('avMsgBody')) {
      activeCaseId = null;
    }
    loadAvMesajlar();
    document.getElementById('sbMesaj')?.classList.add('active');
    const avBadge = document.getElementById('avMesajBadge');
    if (avBadge) { avBadge.style.display = 'none'; avBadge.textContent = ''; }
  }
  if (name === 'profil') { loadAvProfil(); document.getElementById('sbProfil')?.classList.add('active'); }
}`);

// Change line 48 call from acikDavalar to gelenTalepler
content = content.replace(/avukatSection\('acikDavalar'\);/, `avukatSection('gelenTalepler');`);

// Replace big chunk
const regex = /\/\/\s*----\s*AÇIK DAVALAR\s*----[\S\s]*?\/\/\s*----\s*MESAJLAR\s*----/;
content = content.replace(regex, newMethods);

// Modify global bindings
content = content.replace(/window\.goTeklifVer = goTeklifVer;/, 'window.loadGelenTalepler = loadGelenTalepler;');
content = content.replace(/window\.toggleUcretFields = toggleUcretFields;/, '');
content = content.replace(/window\.submitTeklif = submitTeklif;/, '');
content = content.replace(/window\.avukatSection = avukatSection;/, 'window.avukatSection = avukatSection;\nwindow.iletisimTalebiKabulEt = iletisimTalebiKabulEt;\nwindow.iletisimTalebiReddet = iletisimTalebiReddet;');

fs.writeFileSync(path, content, 'utf8');
console.log("Successfully rewritten to: " + path);
