import fs from 'node:fs';
import path from 'node:path';
import process from 'node:process';
import { execFileSync } from 'node:child_process';

const root = path.resolve(import.meta.dirname, '..');
const ignoredDirectories = new Set(['.git', 'node_modules', 'dist', 'build', '.gradle', '.impeccable']);
const forbiddenNames = [
  /^\.env(?:\..+)?$/i,
  /^production\.env$/i,
  /^project\.private\.config\.json$/i,
  /\.(?:sqlite3?|db|pem|key|p12|pfx|jks|keystore)$/i,
];
const allowedNames = new Set(['.env.example']);
const textExtensions = new Set([
  '.cjs', '.conf', '.css', '.env', '.example', '.gradle', '.html', '.js', '.json', '.jsx',
  '.kts', '.md', '.mjs', '.php', '.properties', '.sh', '.sql', '.ts', '.tsx', '.txt',
  '.wxml', '.wxss', '.xml', '.yaml', '.yml',
]);
const credentialPatterns = [
  ['GitHub token', /\b(?:ghp_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{30,})\b/g],
  ['private key', /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g],
  ['AWS access key', /\bAKIA[0-9A-Z]{16}\b/g],
  ['JWT', /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\b/g],
];
const forbiddenPlatformPaths = [
  /^apps\/[^/]*android(?:\/|$)/i,
  /\.(?:apk|aab)$/i,
];

const walkedFiles = [];
function walk(directory) {
  for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
    if (entry.isDirectory() && ignoredDirectories.has(entry.name)) continue;
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else if (entry.isFile()) walkedFiles.push(target);
  }
}

function filesEligibleForCommit() {
  try {
    const output = execFileSync(
      'git',
      ['ls-files', '--cached', '--others', '--exclude-standard', '-z'],
      { cwd: root, encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] },
    );
    return output
      .split('\0')
      .filter(Boolean)
      .map(relative => path.join(root, relative));
  } catch {
    walk(root);
    return walkedFiles;
  }
}

const files = filesEligibleForCommit();

const findings = [];
for (const file of files) {
  if (!fs.existsSync(file)) continue;
  const name = path.basename(file);
  const relative = path.relative(root, file).replaceAll('\\', '/');
  if (forbiddenPlatformPaths.some(pattern => pattern.test(relative))) {
    findings.push(`${relative}: Android development is outside the NaviStudy platform scope`);
    continue;
  }
  if (!allowedNames.has(name) && forbiddenNames.some(pattern => pattern.test(name))) {
    findings.push(`${relative}: forbidden sensitive filename`);
    continue;
  }
  if (!textExtensions.has(path.extname(name).toLowerCase()) && !['Dockerfile', 'LICENSE'].includes(name)) continue;
  const source = fs.readFileSync(file, 'utf8');
  for (const [label, pattern] of credentialPatterns) {
    pattern.lastIndex = 0;
    if (pattern.test(source)) findings.push(`${relative}: possible ${label}`);
  }
}

if (findings.length) {
  console.error('Sensitive material scan failed:');
  findings.forEach(finding => console.error(`- ${finding}`));
  process.exit(1);
}
console.log(`security-scan: OK (${files.length} files checked)`);
