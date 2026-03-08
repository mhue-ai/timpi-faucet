const fs = require('fs');
const path = require('path');

const DIST = path.join(__dirname, 'dist');
const LOCALES = path.join(__dirname, 'locales');
const TEMPLATE = fs.readFileSync(path.join(__dirname, 'template.html'), 'utf8');
const DOMAIN = 'https://get.clawpurse.ai';
const LANGS = ['en', 'ja', 'ko', 'es', 'fr', 'hi', 'zh', 'id'];

// Clean dist
if (fs.existsSync(DIST)) fs.rmSync(DIST, { recursive: true });
fs.mkdirSync(DIST, { recursive: true });

const locales = {};
for (const lang of LANGS) {
  const file = path.join(LOCALES, `${lang}.json`);
  locales[lang] = JSON.parse(fs.readFileSync(file, 'utf8'));
}

// Generate hreflang tags
function hreflang() {
  const tags = LANGS.map(l =>
    `<link rel="alternate" hreflang="${l}" href="${DOMAIN}/${l}/">`
  );
  tags.push(`<link rel="alternate" hreflang="x-default" href="${DOMAIN}/en/">`);
  return tags.join('\n  ');
}

// Build each language
for (const lang of LANGS) {
  const data = locales[lang];
  const dir = path.join(DIST, lang);
  fs.mkdirSync(dir, { recursive: true });

  let html = TEMPLATE;

  // Replace all {{key}} placeholders
  for (const [key, val] of Object.entries(data)) {
    html = html.replace(new RegExp(`\\{\\{${key}\\}\\}`, 'g'), val);
  }

  // Hreflang
  html = html.replace('{{hreflang}}', hreflang());

  // Language selector — mark current as selected
  for (const l of LANGS) {
    html = html.replace(`{{sel_${l}}}`, l === lang ? 'selected' : '');
  }

  fs.writeFileSync(path.join(dir, 'index.html'), html);
  console.log(`  ✓ /${lang}/index.html`);
}

// Root redirect → /en/
const rootRedirect = `<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta http-equiv="refresh" content="0;url=/en/">
  <link rel="canonical" href="${DOMAIN}/en/">
  <title>Redirecting…</title>
  <script>
    // Detect browser language and redirect
    const lang = (navigator.language || '').slice(0, 2).toLowerCase();
    const supported = ${JSON.stringify(LANGS)};
    const target = supported.includes(lang) ? lang : 'en';
    window.location.replace('/' + target + '/');
  </script>
</head>
<body><p>Redirecting…</p></body>
</html>`;
fs.writeFileSync(path.join(DIST, 'index.html'), rootRedirect);

// robots.txt
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *
Allow: /

Sitemap: ${DOMAIN}/sitemap.xml
`);

// sitemap.xml — with hreflang annotations for multilingual SEO
const today = new Date().toISOString().slice(0, 10);
const urls = LANGS.map(l => {
  const hreflangs = LANGS.map(alt =>
    `    <xhtml:link rel="alternate" hreflang="${alt}" href="${DOMAIN}/${alt}/"/>`
  );
  hreflangs.push(`    <xhtml:link rel="alternate" hreflang="x-default" href="${DOMAIN}/en/"/>`);
  return `  <url>
    <loc>${DOMAIN}/${l}/</loc>
    <lastmod>${today}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.8</priority>
${hreflangs.join('\n')}
  </url>`;
}).join('\n');

fs.writeFileSync(path.join(DIST, 'sitemap.xml'), `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"
        xmlns:xhtml="http://www.w3.org/1999/xhtml">
${urls}
</urlset>
`);

// 404 page
fs.writeFileSync(path.join(DIST, '404.html'), `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Not Found — get.clawpurse.ai</title>
  <style>
    body { font-family: 'Outfit', sans-serif; background: #0c0e13; color: #e2e4ea; display: flex; align-items: center; justify-content: center; min-height: 100vh; }
    .box { text-align: center; }
    h1 { font-size: 48px; color: #f47458; margin-bottom: 8px; }
    p { color: #8b8f9e; }
    a { color: #f47458; }
  </style>
</head>
<body>
  <div class="box">
    <h1>404</h1>
    <p>Page not found. <a href="/en/">Go to get.clawpurse.ai</a></p>
  </div>
</body>
</html>
`);

console.log(`\\nBuild complete: ${LANGS.length} languages → dist/`);
console.log('Files: CNAME, robots.txt, sitemap.xml, 404.html, index.html (root redirect)');
