#!/usr/bin/env node
'use strict';
/* global __dirname */

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const repositoryRoot = path.resolve(__dirname, '..');
const codemod = path.join(repositoryRoot, 'scripts', 'make-ui-values-responsive.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'keepflip-targeted-responsive-'));
const file = path.join(root, 'app', 'fixture.tsx');

try {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, [
    "import { StyleSheet, View } from 'react-native';",
    '',
    'export function Fixture() {',
    '  return <View style={{ fontSize: 12, height: 30, marginTop: 8, width: 90 }} />;',
    '}',
    '',
    'const styles = StyleSheet.create({',
    '  card: {',
    '    fontSize: 14,',
    '    height: 40,',
    '    lineHeight: 20,',
    '    margin: 10,',
    '    minHeight: 20,',
    '    padding: 12,',
    '    width: 80,',
    '  },',
    '});',
    '',
  ].join('\n'), 'utf8');

  const first = JSON.parse(childProcess.execFileSync(process.execPath, [
    codemod,
    `--root=${root}`,
    '--dirs=app',
    '--write',
    '--json',
  ], { encoding: 'utf8' }));
  const transformed = fs.readFileSync(file, 'utf8');

  assert.deepEqual(first.totals, {
    files: 1,
    fontSize: 1,
    height: 1,
    width: 1,
    values: 3,
  });
  assert.match(transformed, /import responsiveFont, \{ responsiveHeight, responsiveWidth \} from '@\/lib\/responsiveFont';/);
  assert.match(transformed, /fontSize: 14/);
  assert.match(transformed, /height: 40/);
  assert.match(transformed, /width: 80/);
  assert.match(transformed, /fontSize: responsiveFont\(12\)/);
  assert.match(transformed, /height: responsiveHeight\(30\)/);
  assert.match(transformed, /width: responsiveWidth\(90\)/);
  assert.match(transformed, /lineHeight: 20/);
  assert.match(transformed, /margin: 10/);
  assert.match(transformed, /minHeight: 20/);
  assert.match(transformed, /padding: 12/);

  const second = JSON.parse(childProcess.execFileSync(process.execPath, [
    codemod,
    `--root=${root}`,
    '--dirs=app',
    '--write',
    '--json',
  ], { encoding: 'utf8' }));
  assert.equal(second.totals.values, 0);
  assert.equal(second.totals.files, 0);

  console.log('Targeted responsive-value codemod fixture test passed.');
} finally {
  fs.rmSync(root, { force: true, recursive: true });
}
