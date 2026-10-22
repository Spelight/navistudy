const assert = require('assert');
const fs = require('fs');
const path = require('path');

const pagesRoot = path.resolve(__dirname, '..', 'miniprogram', 'pages');
const files = [];
for (const page of fs.readdirSync(pagesRoot)) {
  const file = path.join(pagesRoot, page, `${page}.wxml`);
  if (fs.existsSync(file)) files.push(file);
}

for (const file of files) {
  const source = fs.readFileSync(file, 'utf8').replace(/<!--[^]*?-->/g, '');
  const stack = [];
  const tags = source.match(/<\/?[a-zA-Z][^>]*>/g) || [];
  for (const raw of tags) {
    if (/\/>$/.test(raw)) continue;
    const match = raw.match(/^<\/?([a-zA-Z][\w-]*)/);
    if (!match) continue;
    const tag = match[1];
    if (/^<\//.test(raw)) {
      assert.strictEqual(stack.pop(), tag, `标签闭合顺序错误：${file}`);
    } else {
      stack.push(tag);
    }
  }
  assert.deepStrictEqual(stack, [], `存在未闭合标签：${file}`);
  assert.strictEqual((source.match(/{{/g) || []).length, (source.match(/}}/g) || []).length, `模板表达式未闭合：${file}`);
}

assert.strictEqual(files.length, 6, '应检查 6 个页面模板');
console.log('wxml-structure.test: OK');
