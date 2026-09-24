import { execFileSync } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

import { SITE_ORIGIN, SITEMAP_PAGES } from './sitemap-pages.mjs';

const projectRoot = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const distDirectory = resolve(projectRoot, 'dist');
const key = process.env.INDEXNOW_KEY?.trim();

process.chdir(projectRoot);

function getLastModifiedDate(sourceFiles) {
  const uncommittedSources = execFileSync(
    'git',
    ['status', '--porcelain', '--untracked-files=no', '--', ...sourceFiles],
    { encoding: 'utf8' },
  ).trim();

  if (uncommittedSources) {
    throw new Error(
      `Commit sitemap content sources before generating lastmod values:\n${uncommittedSources}`,
    );
  }

  const dates = sourceFiles.map((sourceFile) => {
    const date = execFileSync(
      'git',
      ['log', '-1', '--format=%cs', '--', sourceFile],
      { encoding: 'utf8' },
    ).trim();

    if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
      throw new Error(`No committed modification date found for ${sourceFile}`);
    }

    return date;
  });

  return dates.sort().at(-1);
}

function escapeXml(value) {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&apos;');
}

const urls = SITEMAP_PAGES.map(({ path, sourceFiles }) => {
  const lastmod = getLastModifiedDate(sourceFiles);
  return `  <url>\n    <loc>${escapeXml(`${SITE_ORIGIN}${path}`)}</loc>\n    <lastmod>${lastmod}</lastmod>\n  </url>`;
});

const sitemap = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
  ...urls,
  '</urlset>',
  '',
].join('\n');

mkdirSync(distDirectory, { recursive: true });
writeFileSync(resolve(distDirectory, 'sitemap.xml'), sitemap, 'utf8');
writeFileSync(
  resolve(distDirectory, 'robots.txt'),
  `User-agent: *\nAllow: /\nSitemap: ${SITE_ORIGIN}/sitemap.xml\n`,
  'utf8',
);

if (key) {
  if (!/^[A-Za-z0-9-]{8,128}$/.test(key)) {
    throw new Error('INDEXNOW_KEY must be 8 to 128 letters, numbers, or hyphens.');
  }

  writeFileSync(resolve(distDirectory, `${key}.txt`), `${key}\n`, 'utf8');
} else {
  console.info('INDEXNOW_KEY is not configured; no IndexNow key file was generated.');
}

console.info(`Generated sitemap.xml with ${SITEMAP_PAGES.length} public pages.`);
