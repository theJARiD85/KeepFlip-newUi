import { execFileSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SITE_ORIGIN, SITEMAP_PAGES } from './sitemap-pages.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const key = process.env.INDEXNOW_KEY?.trim();

if (!key) {
  console.info('IndexNow ping skipped; configure the INDEXNOW_KEY GitHub secret.');
  process.exit(0);
}

if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) {
  throw new Error('INDEXNOW_KEY must be 8 to 128 letters, numbers, or hyphens.');
}

const before = process.env.GITHUB_EVENT_BEFORE ?? '';
const after = process.env.GITHUB_SHA ?? '';
const firstPush = !before || /^0+$/.test(before);
let changedFiles = [];

if (firstPush) {
  changedFiles = ['scripts/sitemap-pages.mjs'];
} else {
  changedFiles = execFileSync(
    'git',
    ['diff', '--name-only', '--diff-filter=ACMRD', before, after, '--'],
    { cwd: projectRoot, encoding: 'utf8' },
  )
    .split(/\r?\n/)
    .filter(Boolean)
    .map((file) => file.replaceAll('\\', '/'));
}

const pageListChanged = changedFiles.includes('scripts/sitemap-pages.mjs');
const changedUrls = SITEMAP_PAGES
  .filter((page) => pageListChanged || page.sourceFiles.some((file) => changedFiles.includes(file)))
  .map(({ path }) => `${SITE_ORIGIN}${path}`);

if (changedUrls.length === 0) {
  console.info('IndexNow ping skipped; no sitemap page content changed in this publish.');
  process.exit(0);
}

const host = new URL(SITE_ORIGIN).host;
const response = await fetch('https://api.indexnow.org/indexnow', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json; charset=utf-8' },
  body: JSON.stringify({
    host,
    key,
    keyLocation: `${SITE_ORIGIN}/${key}.txt`,
    urlList: changedUrls,
  }),
});

if (!response.ok) {
  const responseText = await response.text();
  throw new Error(`IndexNow returned HTTP ${response.status}: ${responseText}`);
}

console.info(`IndexNow accepted ${changedUrls.length} changed sitemap page(s) (HTTP ${response.status}).`);
