const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const sourceDir = path.join(root, 'public');
const publishDir = path.join(root, 'dist');
const uploadsDir = path.join(root, 'uploads');
const siteUrl = (process.env.URL || 'https://netshopug.netlify.app').replace(/\/+$/, '');

fs.rmSync(publishDir, { recursive: true, force: true });
fs.cpSync(sourceDir, publishDir, { recursive: true });

const publishUploadsDir = path.join(publishDir, 'uploads');
fs.mkdirSync(publishUploadsDir, { recursive: true });
if (fs.existsSync(uploadsDir)) {
  for (const entry of fs.readdirSync(uploadsDir, { withFileTypes: true })) {
    if (entry.isFile()) {
      fs.copyFileSync(path.join(uploadsDir, entry.name), path.join(publishUploadsDir, entry.name));
    }
  }
}

for (const filename of ['index.html', 'robots.txt', 'sitemap.xml']) {
  const filePath = path.join(publishDir, filename);
  const contents = fs.readFileSync(filePath, 'utf8');
  fs.writeFileSync(filePath, contents.replaceAll('__SITE_URL__', siteUrl), 'utf8');
}
