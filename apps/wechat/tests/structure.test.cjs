const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const miniRoot = path.join(root, 'miniprogram');
const app = JSON.parse(fs.readFileSync(path.join(miniRoot, 'app.json'), 'utf8'));
const modules = require(path.join(miniRoot, 'data', 'modules.js'));

assert.deepStrictEqual(modules.map(({ id, path: modulePath }) => ({ id, path: modulePath })), [
  { id: 'words', path: '/words/pages/index/index' },
  { id: 'mt', path: '/mt/pages/index/index' }
]);
assert.ok(modules.every(module => /^(\d+|example)/.test(module.metric)), 'module metrics should be generated');

function requirePageFiles(base) {
  ['js', 'json', 'wxml', 'wxss'].forEach(extension => {
    assert.ok(fs.existsSync(`${base}.${extension}`), `missing page file: ${base}.${extension}`);
  });
}

app.pages.forEach(page => requirePageFiles(path.join(miniRoot, page)));
app.subPackages.forEach(pkg => pkg.pages.forEach(page => requirePageFiles(path.join(miniRoot, pkg.root, page))));

for (const moduleId of ['words', 'mt']) {
  const moduleRoot = path.join(miniRoot, moduleId);
  assert.ok(fs.existsSync(path.join(moduleRoot, 'GENERATED.md')));
  const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
  walk(moduleRoot).filter(file => /pages[\\/].+\.wxss$/.test(file)).forEach(file => {
    assert.ok(fs.readFileSync(file, 'utf8').startsWith('@import "../../module.wxss";'));
  });
}

for (const file of [
  'words/pages/index/index.wxml', 'words/pages/books/books.wxml', 'words/pages/me/me.wxml',
  'mt/pages/index/index.wxml', 'mt/pages/bank/bank.wxml', 'mt/pages/me/me.wxml'
]) {
  const source = fs.readFileSync(path.join(miniRoot, file), 'utf8');
  assert.ok(source.includes('module-tabbar'), `missing module navigation: ${file}`);
  assert.ok(source.includes('/pages/portal/portal'), `missing NaviStudy return link: ${file}`);
}

const passportPage = fs.readFileSync(path.join(miniRoot, 'pages/passport/passport.wxml'), 'utf8');
const passportLogic = fs.readFileSync(path.join(miniRoot, 'pages/passport/passport.js'), 'utf8');
assert.ok(passportPage.includes('NaviWords') || passportLogic.includes('NaviWords'));
assert.ok(passportPage.includes('NaviMT') || passportLogic.includes('NaviMT'));
assert.ok(passportLogic.includes('Promise.allSettled'));
assert.ok(passportLogic.includes('length < 6'));

console.log('structure.test: OK');
