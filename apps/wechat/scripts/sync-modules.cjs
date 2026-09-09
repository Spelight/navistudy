const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const miniprogramRoot = path.join(root, 'miniprogram');
const sources = {
  words: path.resolve(root, '..', '..', 'packages', 'words-mini', 'miniprogram'),
  mt: path.resolve(root, '..', '..', 'packages', 'mt-mini', 'miniprogram')
};

const moduleConfig = {
  words: {
    versionField: 'wordsVersion',
    tabs: [
      ['index', '学习', 'study'],
      ['books', '词表', 'books'],
      ['me', '我的', 'me']
    ]
  },
  mt: {
    versionField: 'mtVersion',
    tabs: [
      ['index', '练习', 'study'],
      ['bank', '题库', 'books'],
      ['me', '我的', 'me']
    ]
  }
};

function assertGeneratedTarget(target) {
  const relative = path.relative(miniprogramRoot, target);
  if (!relative || relative.startsWith('..') || path.isAbsolute(relative)) {
    throw new Error(`拒绝操作生成目录之外的路径：${target}`);
  }
}

function walk(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap(entry => {
    const target = path.join(directory, entry.name);
    return entry.isDirectory() ? walk(target) : [target];
  });
}

function copyDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  fs.readdirSync(source, { withFileTypes: true }).forEach(entry => {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) copyDirectory(sourcePath, targetPath);
    else if (entry.isFile()) fs.copyFileSync(sourcePath, targetPath);
  });
}

function moduleNavigation(moduleId, activePage) {
  const tabs = moduleConfig[moduleId].tabs.map(([page, label, icon]) => {
    const active = page === activePage ? ' active' : '';
    const activeSuffix = page === activePage ? '-active' : '';
    return `<navigator class="module-tab${active}" url="/${moduleId}/pages/${page}/${page}" open-type="redirect"><image class="module-tab-icon" src="/${moduleId}/assets/tab/${icon}${activeSuffix}.png" mode="aspectFit" /><text>${label}</text></navigator>`;
  }).join('');
  return `\n<view class="module-tabbar">${tabs}<navigator class="module-tab module-home" url="/pages/portal/portal" open-type="reLaunch"><view class="module-home-icon"><view></view></view><text>NaviStudy</text></navigator></view>\n`;
}

const navigationStyle = `
.page { padding-bottom: calc(158rpx + env(safe-area-inset-bottom)) !important; }
.module-tabbar { position: fixed; z-index: 100; left: 0; right: 0; bottom: 0; min-height: 112rpx; padding: 10rpx 10rpx calc(10rpx + env(safe-area-inset-bottom)); background: #1b1c1f; border-top: 1rpx solid #303238; display: grid; grid-template-columns: repeat(4, 1fr); }
.module-tab { min-width: 0; height: 92rpx; color: #7a8499; font-size: 20rpx; font-weight: 700; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7rpx; }
.module-tab.active { color: #5a9cf5; }
.module-tab-icon { width: 42rpx; height: 42rpx; }
.module-home { color: #98a0ad; }
.module-home-icon { width: 42rpx; height: 42rpx; border-radius: 12rpx; background: #243754; display: flex; align-items: center; justify-content: center; }
.module-home-icon view { width: 18rpx; height: 18rpx; border-left: 4rpx solid #70adff; border-bottom: 4rpx solid #70adff; transform: rotate(45deg); }
`;

function syncModule(moduleId) {
  const source = sources[moduleId];
  const target = path.join(miniprogramRoot, moduleId);
  if (!fs.existsSync(source)) throw new Error(`找不到模块源目录：${source}`);
  assertGeneratedTarget(target);
  fs.rmSync(target, { recursive: true, force: true });
  fs.mkdirSync(target, { recursive: true });

  ['assets', 'data', 'pages', 'utils'].forEach(name => {
    const sourcePath = path.join(source, name);
    if (fs.existsSync(sourcePath)) copyDirectory(sourcePath, path.join(target, name));
  });
  fs.writeFileSync(path.join(target, 'module.wxss'), `${fs.readFileSync(path.join(source, 'app.wxss'), 'utf8').trim()}\n${navigationStyle}`, 'utf8');

  walk(target).forEach(file => {
    const extension = path.extname(file);
    if (!['.js', '.json', '.wxml', '.wxss'].includes(extension)) return;
    let content = fs.readFileSync(file, 'utf8');
    if (extension !== '.wxss') {
      content = content.replace(/\/pages\//g, `/${moduleId}/pages/`);
    }
    if (extension === '.js') {
      content = content.replace(/wx\.switchTab\s*\(/g, 'wx.redirectTo(');
      content = content.replace(/getApp\(\)\.globalData\.version/g, `getApp().globalData.${moduleConfig[moduleId].versionField}`);
      content = content.replaceAll('../../../../examples/', '../../../../../examples/');
    }
    if (extension === '.wxss' && file.includes(`${path.sep}pages${path.sep}`)) {
      content = `@import "../../module.wxss";\n${content}`;
    }
    if (extension === '.wxml') {
      const page = path.basename(file, '.wxml');
      if (moduleConfig[moduleId].tabs.some(([tab]) => tab === page)) {
        content = `${content.trim()}${moduleNavigation(moduleId, page)}`;
      }
    }
    fs.writeFileSync(file, content, 'utf8');
  });

  fs.writeFileSync(path.join(target, 'GENERATED.md'), `# Generated module\n\nSource: ${source}\n\nRun \`npm run sync-modules\` from the NaviStudy root to regenerate this directory.\n`, 'utf8');
  console.log(`Synced ${moduleId} from ${source}`);
}

function readVersion(source) {
  const appSource = fs.readFileSync(path.join(source, 'app.js'), 'utf8');
  const match = appSource.match(/version:\s*['"]([^'"]+)['"]/);
  if (!match) throw new Error(`无法读取模块版本：${source}`);
  return match[1];
}

function syncManifest() {
  const wordsDataPath = path.join(sources.words, 'utils', 'data.js');
  delete require.cache[require.resolve(wordsDataPath)];
  const wordsData = require(wordsDataPath);
  const mtBank = require(path.join(sources.mt, 'data', 'question-bank.js'));
  const wordsVersion = readVersion(sources.words);
  const mtVersion = readVersion(sources.mt);
  const modules = [
    {
      id: 'words',
      name: 'NaviWords',
      subject: '英语词汇',
      summary: 'Book 3、Book 4、Book 5 与双学位词汇',
      metric: `${wordsData.getAllWords().length} 词`,
      path: '/words/pages/index/index'
    },
    {
      id: 'mt',
      name: 'NaviMT 军理通',
      subject: '军事理论',
      summary: '六章题库、错题与四类题型练习',
      metric: `${mtBank.questions.length} 题`,
      path: '/mt/pages/index/index'
    }
  ];
  const dataDirectory = path.join(miniprogramRoot, 'data');
  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(dataDirectory, 'modules.js'),
    `// Generated by scripts/sync-modules.cjs.\nmodule.exports = ${JSON.stringify(modules, null, 2)};\n`,
    'utf8'
  );

  const appPath = path.join(miniprogramRoot, 'app.js');
  const appSource = fs.readFileSync(appPath, 'utf8')
    .replace(/wordsVersion:\s*['"][^'"]+['"]/, `wordsVersion: '${wordsVersion}'`)
    .replace(/mtVersion:\s*['"][^'"]+['"]/, `mtVersion: '${mtVersion}'`);
  fs.writeFileSync(appPath, appSource, 'utf8');
  console.log(`Updated manifest: NaviWords ${wordsVersion}, NaviMT ${mtVersion}`);
}

syncModule('words');
syncModule('mt');
syncManifest();
