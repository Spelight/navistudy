const fs = require('fs');
const path = require('path');

const repositoryRoot = path.resolve(__dirname, '..');
const manifestPath = path.join(repositoryRoot, 'config', 'versions.json');
const semverPattern = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;

function loadVersions() {
  const versions = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const entries = [
    ['release', versions.release],
    ...Object.entries(versions.modules || {}).map(([name, version]) => [`modules.${name}`, version]),
  ];

  if (versions.schemaVersion !== 1) throw new Error('不支持的版本清单格式');
  if (!['stable', 'beta', 'development'].includes(versions.channel)) throw new Error(`无效发布通道：${versions.channel}`);
  for (const [name, version] of entries) {
    if (!semverPattern.test(version || '')) throw new Error(`无效版本号 ${name}: ${version}`);
  }
  for (const moduleId of ['words', 'mt', 'reading', 'plan', 'tools']) {
    if (!versions.modules[moduleId]) throw new Error(`版本清单缺少模块：${moduleId}`);
  }
  return versions;
}

function replaceVersionField(file, field, version) {
  const source = fs.readFileSync(file, 'utf8');
  const pattern = new RegExp(`(${field}:\\s*['"])[^'"]+(['"])`);
  if (!pattern.test(source)) throw new Error(`找不到版本字段 ${field}: ${file}`);
  const updated = source.replace(pattern, `$1${version}$2`);
  if (updated !== source) fs.writeFileSync(file, updated, 'utf8');
}

function updatePackageVersion(relativePath, version) {
  const file = path.join(repositoryRoot, relativePath);
  const source = fs.readFileSync(file, 'utf8');
  const data = JSON.parse(source);
  data.version = version;
  const updated = `${JSON.stringify(data, null, 2)}\n`;
  if (updated !== source) fs.writeFileSync(file, updated, 'utf8');
}

function expectedTargets(versions) {
  return {
    packageVersions: [
      ['package.json', versions.release],
      ['apps/wechat/package.json', versions.release],
      ['packages/words-mini/package.json', versions.modules.words],
      ['packages/mt-mini/package.json', versions.modules.mt],
    ],
    runtimeFields: [
      ['packages/words-mini/miniprogram/app.js', 'version', versions.modules.words],
      ['packages/mt-mini/miniprogram/app.js', 'version', versions.modules.mt],
      ['packages/reading-mini/miniprogram/app.js', 'version', versions.modules.reading],
      ['apps/wechat/miniprogram/app.js', 'version', versions.release],
      ['apps/wechat/miniprogram/app.js', 'wordsVersion', versions.modules.words],
      ['apps/wechat/miniprogram/app.js', 'mtVersion', versions.modules.mt],
      ['apps/wechat/miniprogram/app.js', 'readingVersion', versions.modules.reading],
      ['apps/wechat/miniprogram/app.js', 'planVersion', versions.modules.plan],
      ['apps/wechat/miniprogram/app.js', 'toolsVersion', versions.modules.tools],
    ],
  };
}

function syncVersions() {
  const versions = loadVersions();
  const targets = expectedTargets(versions);
  targets.packageVersions.forEach(([file, version]) => updatePackageVersion(file, version));
  targets.runtimeFields.forEach(([file, field, version]) => replaceVersionField(path.join(repositoryRoot, file), field, version));
  return versions;
}

function checkVersions() {
  const versions = loadVersions();
  const targets = expectedTargets(versions);
  const errors = [];

  targets.packageVersions.forEach(([file, expected]) => {
    const actual = JSON.parse(fs.readFileSync(path.join(repositoryRoot, file), 'utf8')).version;
    if (actual !== expected) errors.push(`${file}: ${actual} != ${expected}`);
  });
  targets.runtimeFields.forEach(([file, field, expected]) => {
    const source = fs.readFileSync(path.join(repositoryRoot, file), 'utf8');
    const match = source.match(new RegExp(`${field}:\\s*['"]([^'"]+)['"]`));
    const actual = match && match[1];
    if (actual !== expected) errors.push(`${file}#${field}: ${actual || 'missing'} != ${expected}`);
  });

  if (errors.length) throw new Error(`版本号未同步：\n${errors.join('\n')}`);
  return versions;
}

if (require.main === module) {
  const command = process.argv[2] || 'check';
  const versions = command === 'sync' ? syncVersions() : checkVersions();
  console.log(`Version ${command === 'sync' ? 'sync' : 'check'}: NaviStudy ${versions.release} (${versions.channel})`);
}

module.exports = { checkVersions, loadVersions, syncVersions };
