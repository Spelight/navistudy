import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const repositoryRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(repositoryRoot, 'apps', 'reading-web', 'study-data.json');
const target = path.join(repositoryRoot, 'packages', 'reading-mini', 'miniprogram', 'data', 'study-data.js');
const data = JSON.parse(fs.readFileSync(source, 'utf8'));

if (!Array.isArray(data.units) || data.units.length !== 5) {
  throw new Error('Reading data must contain exactly five units.');
}

fs.mkdirSync(path.dirname(target), { recursive: true });
fs.writeFileSync(target, `// Generated from apps/reading-web/study-data.json.\nmodule.exports = ${JSON.stringify(data)};\n`, 'utf8');
console.log(`Synced reading data: ${data.units.reduce((sum, unit) => sum + unit.paragraphs.length, 0)} paragraphs`);
