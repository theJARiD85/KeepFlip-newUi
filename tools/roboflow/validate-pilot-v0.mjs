import { createHash } from 'node:crypto';
import { access, readFile } from 'node:fs/promises';
import path from 'node:path';
import process from 'node:process';

const CLASS_LABELS = new Set([
  'tools',
  'electronics_camera',
  'shoes_footwear',
  'handbags_accessories',
  'jewelry',
  'collectibles_toys_media',
  'sports_outdoor',
  'unknown_other',
]);

const SPLITS = new Set(['train', 'valid', 'test']);
const SOURCE_RIGHTS = new Set(['keepflip_owned', 'seller_consented', 'explicitly_licensed']);
const FRAMING = new Set(['full_item', 'near_full_item']);
const REQUIRED_COLUMNS = [
  'filename',
  'image_sha256',
  'batch',
  'item_id',
  'class_label',
  'split',
  'source_rights',
  'privacy_scrubbed',
  'capture_device',
  'capture_flow',
  'framing',
  'angle',
  'capture_conditions',
  'review_status',
];

function usage() {
  console.log(`Usage:
  node tools/roboflow/validate-pilot-v0.mjs --manifest <manifest.csv> --source-root <photos-directory>`);
}

function parseArgs(argv) {
  const values = new Map();
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === '--help' || argument === '-h') return { help: true };
    if (!argument.startsWith('--')) continue;
    const value = argv[index + 1];
    if (!value || value.startsWith('--')) {
      throw new Error(`Missing value for ${argument}.`);
    }
    values.set(argument, value);
    index += 1;
  }

  return {
    manifest: values.get('--manifest'),
    sourceRoot: values.get('--source-root'),
  };
}

function parseCsv(source) {
  const records = [];
  let record = [];
  let field = '';
  let quoted = false;

  for (let index = 0; index < source.length; index += 1) {
    const character = source[index];
    const next = source[index + 1];

    if (quoted) {
      if (character === '"' && next === '"') {
        field += '"';
        index += 1;
      } else if (character === '"') {
        quoted = false;
      } else {
        field += character;
      }
      continue;
    }

    if (character === '"') {
      quoted = true;
    } else if (character === ',') {
      record.push(field);
      field = '';
    } else if (character === '\n') {
      record.push(field.replace(/\r$/, ''));
      if (record.some((value) => value.trim() !== '')) records.push(record);
      record = [];
      field = '';
    } else {
      field += character;
    }
  }

  if (quoted) throw new Error('Manifest has an unclosed quoted CSV value.');
  record.push(field.replace(/\r$/, ''));
  if (record.some((value) => value.trim() !== '')) records.push(record);
  return records;
}

async function sha256(filePath) {
  const content = await readFile(filePath);
  return createHash('sha256').update(content).digest('hex');
}

function addToGroup(map, key, row) {
  if (!key) return;
  if (!map.has(key)) map.set(key, []);
  map.get(key).push(row);
}

function distinct(values) {
  return [...new Set(values.filter(Boolean))];
}

function displayRow(row) {
  return `row ${row.line} (${row.filename || 'missing filename'})`;
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    usage();
    return;
  }
  if (!options.manifest || !options.sourceRoot) {
    usage();
    process.exitCode = 2;
    return;
  }

  const manifestPath = path.resolve(options.manifest);
  const sourceRoot = path.resolve(options.sourceRoot);
  const errors = [];
  const warnings = [];

  let csv;
  try {
    csv = await readFile(manifestPath, 'utf8');
  } catch (error) {
    throw new Error(`Could not read manifest: ${error.message}`);
  }

  const records = parseCsv(csv);
  if (records.length < 2) {
    throw new Error('Manifest has no image rows.');
  }

  const headers = records[0].map((header) => header.trim());
  const missingColumns = REQUIRED_COLUMNS.filter((column) => !headers.includes(column));
  if (missingColumns.length) {
    throw new Error(`Manifest is missing required columns: ${missingColumns.join(', ')}.`);
  }

  const rows = records.slice(1).map((record, index) => {
    const row = Object.fromEntries(headers.map((header, column) => [header, (record[column] ?? '').trim()]));
    row.line = index + 2;
    return row;
  });

  const itemGroups = new Map();
  const familyGroups = new Map();
  const hashGroups = new Map();
  const itemsByClass = new Map();
  const unknownSubtypes = new Map();

  for (const row of rows) {
    for (const column of REQUIRED_COLUMNS) {
      if (!row[column]) errors.push(`${displayRow(row)} is missing ${column}.`);
    }

    if (row.batch && row.batch !== 'pilot-v0') errors.push(`${displayRow(row)} must use batch pilot-v0.`);
    if (row.class_label && !CLASS_LABELS.has(row.class_label)) errors.push(`${displayRow(row)} has invalid class_label ${row.class_label}.`);
    if (row.split && !SPLITS.has(row.split)) errors.push(`${displayRow(row)} has invalid split ${row.split}.`);
    if (row.source_rights && !SOURCE_RIGHTS.has(row.source_rights)) errors.push(`${displayRow(row)} has invalid source_rights ${row.source_rights}.`);
    if (row.privacy_scrubbed && row.privacy_scrubbed.toLowerCase() !== 'true') errors.push(`${displayRow(row)} is not privacy_scrubbed.`);
    if (row.capture_flow && row.capture_flow !== 'single_item') errors.push(`${displayRow(row)} must use capture_flow single_item.`);
    if (row.framing && !FRAMING.has(row.framing)) errors.push(`${displayRow(row)} must use framing full_item or near_full_item.`);
    if (row.review_status && row.review_status !== 'approved') errors.push(`${displayRow(row)} must have review_status approved.`);
    if (row.class_label === 'unknown_other' && !row.unknown_other_subtype) errors.push(`${displayRow(row)} needs unknown_other_subtype.`);
    if (row.class_label !== 'unknown_other' && row.unknown_other_subtype) warnings.push(`${displayRow(row)} has unknown_other_subtype outside unknown_other.`);

    addToGroup(itemGroups, row.item_id, row);
    addToGroup(familyGroups, row.product_family_id, row);
    addToGroup(hashGroups, row.image_sha256?.toLowerCase(), row);
    if (row.class_label && row.item_id) {
      if (!itemsByClass.has(row.class_label)) itemsByClass.set(row.class_label, new Set());
      itemsByClass.get(row.class_label).add(row.item_id);
    }
    if (row.class_label === 'unknown_other' && row.unknown_other_subtype) {
      unknownSubtypes.set(row.unknown_other_subtype, (unknownSubtypes.get(row.unknown_other_subtype) ?? 0) + 1);
    }

    if (!row.filename) continue;
    const filePath = path.resolve(sourceRoot, row.filename);
    if (!filePath.startsWith(`${sourceRoot}${path.sep}`) && filePath !== sourceRoot) {
      errors.push(`${displayRow(row)} points outside source-root.`);
      continue;
    }

    try {
      await access(filePath);
      const actualHash = await sha256(filePath);
      if (row.image_sha256 && actualHash !== row.image_sha256.toLowerCase()) {
        errors.push(`${displayRow(row)} image_sha256 does not match file bytes.`);
      }
    } catch (error) {
      errors.push(`${displayRow(row)} file check failed: ${error.message}`);
    }
  }

  for (const [itemId, group] of itemGroups) {
    const splits = distinct(group.map((row) => row.split));
    if (splits.length > 1) errors.push(`item_id ${itemId} appears in multiple splits: ${splits.join(', ')}.`);
  }

  for (const [familyId, group] of familyGroups) {
    const splits = distinct(group.map((row) => row.split));
    if (splits.length > 1) warnings.push(`product_family_id ${familyId} spans splits: ${splits.join(', ')}.`);
  }

  for (const [hash, group] of hashGroups) {
    if (!hash || hash.length !== 64) {
      for (const row of group) errors.push(`${displayRow(row)} has an invalid SHA-256 value.`);
      continue;
    }
    const splits = distinct(group.map((row) => row.split));
    if (splits.length > 1) errors.push(`SHA-256 ${hash.slice(0, 12)}… appears in multiple splits: ${splits.join(', ')}.`);
    if (group.length > 1 && splits.length === 1) warnings.push(`SHA-256 ${hash.slice(0, 12)}… is duplicated within ${splits[0]}.`);
  }

  const itemTargets = {
    tools: [20, 30],
    electronics_camera: [20, 30],
    shoes_footwear: [20, 30],
    handbags_accessories: [20, 30],
    jewelry: [20, 30],
    collectibles_toys_media: [20, 30],
    sports_outdoor: [20, 30],
    unknown_other: [40, 60],
  };

  console.log(`Validated ${rows.length} manifest row(s).`);
  for (const label of CLASS_LABELS) {
    const count = itemsByClass.get(label)?.size ?? 0;
    const [minimum, maximum] = itemTargets[label];
    console.log(`  ${label}: ${count} unique item(s) (pilot target ${minimum}-${maximum})`);
    if (count < minimum) warnings.push(`${label} has ${count} unique items; target is at least ${minimum}.`);
  }

  const unknownTotal = rows.filter((row) => row.class_label === 'unknown_other').length;
  for (const [subtype, count] of unknownSubtypes) {
    if (unknownTotal > 0 && count / unknownTotal > 0.2) {
      warnings.push(`unknown_other subtype ${subtype} is ${(count / unknownTotal * 100).toFixed(1)}% of its images; keep each subtype at or below about 20%.`);
    }
  }

  if (warnings.length) {
    console.log(`\nWarnings (${warnings.length}):`);
    for (const warning of warnings) console.log(`  - ${warning}`);
  }

  if (errors.length) {
    console.error(`\nValidation errors (${errors.length}):`);
    for (const error of errors) console.error(`  - ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log('\nPASS: The manifest meets the automated pilot-v0 safety and split-integrity checks. Review warnings before upload.');
}

main().catch((error) => {
  console.error(`Validation failed: ${error.message}`);
  process.exitCode = 1;
});
