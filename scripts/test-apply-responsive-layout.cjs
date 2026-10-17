#!/usr/bin/env node
'use strict';
/* global __dirname */

const assert = require('node:assert/strict');
const childProcess = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const script = path.join(__dirname, 'apply-responsive-layout.cjs');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'keepflip-responsive-layout-'));
const nested = path.join(root, 'components', 'nested', 'deeper', 'card.tsx');
const route = path.join(root, 'app', '(app)', 'home.web.tsx');
const existing = path.join(root, 'app', '(app)', 'already-responsive.tsx');
const generated = path.join(root, 'components', 'nested', 'generated.tsx');
const native = path.join(root, 'components', 'nested', 'camera.native.tsx');
const nativeRoute = path.join(root, 'app', '(app)', 'profile.native.tsx');
const webComponent = path.join(root, 'components', 'nested', 'banner.web.tsx');
const android = path.join(root, 'components', 'nested', 'camera.android.tsx');
const ios = path.join(root, 'components', 'nested', 'camera.ios.tsx');
const legacy = path.join(root, 'components', 'legacy.jsx');

function run(...options) {
  return JSON.parse(childProcess.execFileSync(process.execPath, [script, `--root=${root}`, '--json', ...options], {
    encoding: 'utf8',
  }));
}

try {
  fs.mkdirSync(path.dirname(nested), { recursive: true });
  fs.mkdirSync(path.dirname(route), { recursive: true });
  fs.writeFileSync(nested, [
    "import { StyleSheet, Text, View } from 'react-native';",
    '',
    'const styles = StyleSheet.create({',
    '  title: { fontSize: 20, lineHeight: 26, opacity: 0.5 },',
    '  card: { width: 200, minHeight: 44, paddingHorizontal: 12, gap: 8, borderWidth: 1 },',
    '});',
    '',
    'export function Card() {',
    '  return <View style={[styles.card, { marginTop: 10, opacity: 0.8 }]}><Text style={styles.title}>Hi</Text></View>;',
    '}',
    '',
    'function createResponsiveStyles(layout: ReturnType<typeof useResponsiveLayout>) {',
    '  return StyleSheet.create({ caption: { fontSize: 16, paddingVertical: 6 } });',
    '}',
    '',
  ].join('\n'), 'utf8');
  fs.writeFileSync(route, [
    "import { Text } from 'react-native';",
    'export default function Home() { return <Text style={{ fontSize: 14, height: 32 }}>Hello</Text>; }',
  ].join('\n'), 'utf8');
  fs.writeFileSync(existing, [
    "import { Text } from 'react-native';",
    "import { useResponsiveLayout } from '@/hooks/use-responsive-layout';",
    'export function Existing() {',
    '  const layout = useResponsiveLayout();',
    '  return <Text style={{ width: layout.isWeb ? layout.webResponsiveWidth(120) : 120 }}>Already responsive</Text>;',
    '}',
  ].join('\n'), 'utf8');
  fs.writeFileSync(generated, [
    "import { StyleSheet } from 'react-native';",
    "import { useResponsiveLayout } from '@/hooks/use-responsive-layout';",
    'const styles = StyleSheet.create({ card: { width: 100 } });',
    'function createStylesWebResponsive(layout: ReturnType<typeof useResponsiveLayout>) {',
    '  return StyleSheet.create({ ...styles, card: { ...styles["card"], width: layout.isWeb ? layout.webResponsiveWidth(100) : 100 } });',
    '}',
  ].join('\n'), 'utf8');
  fs.writeFileSync(native, [
    "import { Text } from 'react-native';",
    'export function Camera() { return <Text style={{ fontSize: 14 }}>Camera</Text>; }',
  ].join('\n'), 'utf8');
  for (const [file, component] of [
    [nativeRoute, 'Profile'],
    [webComponent, 'Banner'],
    [android, 'AndroidCamera'],
    [ios, 'IosCamera'],
  ]) {
    fs.writeFileSync(file, [
      "import { Text } from 'react-native';",
      `export function ${component}() { return <Text style={{ fontSize: 14 }}>${component}</Text>; }`,
    ].join('\n'), 'utf8');
  }
  fs.writeFileSync(legacy, [
    "import { StyleSheet, View } from 'react-native';",
    'const styles = StyleSheet.create({ tile: { width: 90 } });',
    'export function Legacy() { return <View style={styles.tile} />; }',
  ].join('\n'), 'utf8');
  fs.writeFileSync(path.join(root, 'components', 'nested', 'README.md'), 'not source', 'utf8');

  const before = fs.readFileSync(nested, 'utf8');
  const preview = run();
  assert.equal(preview.applied, false);
  assert.equal(preview.directoriesVisited, 5);
  assert.equal(preview.sourceFilesScanned, 10);
  assert.equal(preview.nonSourceFiles, 1);
  assert.equal(preview.totals.files, 10);
  for (const file of [route, native, nativeRoute, webComponent, android, ios]) {
    const name = path.relative(root, file).split(path.sep).join('/');
    assert.ok(preview.changedFiles.some((item) => item.file === name), `${name} was not checked`);
  }
  assert.equal(fs.readFileSync(nested, 'utf8'), before);

  const written = run('--write');
  assert.equal(written.applied, true);
  const card = fs.readFileSync(nested, 'utf8');
  const home = fs.readFileSync(route, 'utf8');
  const alreadyResponsive = fs.readFileSync(existing, 'utf8');
  const generatedFactory = fs.readFileSync(generated, 'utf8');
  assert.match(card, /useResponsiveStyles\(createStylesWebResponsive\)/);
  assert.match(card, /layout\.isWeb \? layout\.webResponsiveFont\(20\) : layout\.responsiveFont\(20\)/);
  assert.match(card, /layout\.isWeb \? layout\.webResponsiveWidth\(200\) : layout\.responsiveWidth\(200\)/);
  assert.match(card, /layout\.isWeb \? layout\.webResponsiveHeight\(44\) : layout\.responsiveHeight\(44\)/);
  assert.match(card, /responsiveLayout\.isWeb \? responsiveLayout\.webResponsiveHeight\(10\) : responsiveLayout\.responsiveHeight\(10\)/);
  assert.match(card, /layout\.isWeb \? layout\.webResponsiveFont\(16\) : layout\.responsiveFont\(16\)/);
  assert.match(card, /layout\.isWeb \? layout\.webResponsiveHeight\(6\) : layout\.responsiveHeight\(6\)/);
  assert.match(card, /opacity: 0\.5/);
  assert.match(card, /borderWidth: 1/);
  assert.match(home, /responsiveLayout\.isWeb \? responsiveLayout\.webResponsiveFont\(14\) : responsiveLayout\.responsiveFont\(14\)/);
  assert.match(alreadyResponsive, /layout\.isWeb \? layout\.webResponsiveWidth\(120\) : layout\.responsiveWidth\(120\)/);
  assert.equal((alreadyResponsive.match(/useResponsiveLayout\(\)/g) || []).length, 1);
  assert.match(generatedFactory, /layout\.isWeb \? layout\.webResponsiveWidth\(100\) : layout\.responsiveWidth\(100\)/);
  assert.match(fs.readFileSync(legacy, 'utf8'), /function createStylesWebResponsive\(layout\)/);
  assert.match(fs.readFileSync(legacy, 'utf8'), /layout\.isWeb \? layout\.webResponsiveWidth\(90\) : layout\.responsiveWidth\(90\)/);
  for (const file of [native, nativeRoute, webComponent, android, ios]) {
    assert.match(fs.readFileSync(file, 'utf8'), /responsiveLayout\.isWeb \? responsiveLayout\.webResponsiveFont\(14\) : responsiveLayout\.responsiveFont\(14\)/);
  }
  assert.equal(run('--write').totals.files, 0);
  console.log('Responsive layout recursive write and idempotence fixtures passed.');
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
