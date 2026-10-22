const fs = require('fs');
const os = require('os');
const path = require('path');
const { loadVersions, syncVersions } = require('../../../scripts/versioning.cjs');

const appRoot = path.resolve(__dirname, '..');
const repositoryRoot = path.resolve(appRoot, '..', '..');
const miniprogramRoot = path.join(appRoot, 'miniprogram');
const sources = {
  words: path.join(repositoryRoot, 'packages', 'words-mini', 'miniprogram'),
  mt: path.join(repositoryRoot, 'packages', 'mt-mini', 'miniprogram'),
  reading: path.join(repositoryRoot, 'packages', 'reading-mini', 'miniprogram'),
  plan: path.join(repositoryRoot, 'apps', 'plan', 'miniprogram', 'plan'),
  tools: path.join(repositoryRoot, 'apps', 'tools', 'miniprogram', 'tools'),
};

const moduleConfig = {
  words: {
    versionField: 'wordsVersion',
    tabs: [
      ['index', '首页', 'study'],
      ['books', '大纲', 'books'],
      ['me', '我的', 'me'],
    ],
  },
  mt: {
    versionField: 'mtVersion',
    tabs: [
      ['index', '练习', 'study'],
      ['bank', '题库', 'books'],
      ['me', '我的', 'me'],
    ],
  },
  reading: {
    versionField: 'readingVersion',
    tabs: [
      ['index', '精读', 'study'],
      ['me', '书签', 'me'],
    ],
  },
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

function applySharedTheme(target) {
  walk(target).forEach(file => {
    const extension = path.extname(file);
    if (extension === '.wxml') {
      let content = fs.readFileSync(file, 'utf8');
      content = content.replace(/class="page(?![^"{]*theme-\{\{naviTheme\}\})/, 'class="page theme-{{naviTheme}}');
      fs.writeFileSync(file, content, 'utf8');
    }
    if (extension === '.js' && file.includes(`${path.sep}pages${path.sep}`)) {
      let content = fs.readFileSync(file, 'utf8');
      if (content.includes('Page({') && !content.includes("behaviors/theme")) {
        content = content.replace('Page({', "Page({\n  behaviors: [require('../../../behaviors/theme')],");
        fs.writeFileSync(file, content, 'utf8');
      }
    }
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
.page { padding-bottom: calc(166rpx + env(safe-area-inset-bottom)) !important; }
.module-tabbar { position: fixed; z-index: 100; left: 0; right: 0; bottom: 0; width: 100%; min-width: 0; min-height: 112rpx; box-sizing: border-box; padding: 10rpx 10rpx calc(10rpx + env(safe-area-inset-bottom)); background: #1b1c1f; border-top: 1rpx solid #303238; display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); }
.module-tab { min-width: 0; min-height: 92rpx; padding: 6rpx 2rpx; color: #7a8499; font-size: 20rpx; line-height: 1.2; font-weight: 700; display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 7rpx; text-align: center; }
.module-tab.active { color: #5a9cf5; }
.module-tab-icon { width: 42rpx; height: 42rpx; }
.module-home { color: #98a0ad; }
.module-home-icon { width: 42rpx; height: 42rpx; border-radius: 12rpx; background: #243754; display: flex; align-items: center; justify-content: center; }
.module-home-icon view { width: 18rpx; height: 18rpx; border-left: 4rpx solid #70adff; border-bottom: 4rpx solid #70adff; transform: rotate(45deg); }
`;

function mirrorDirectory(source, target) {
  fs.mkdirSync(target, { recursive: true });
  const sourceEntries = fs.readdirSync(source, { withFileTypes: true });
  const sourceNames = new Set(sourceEntries.map(entry => entry.name));

  sourceEntries.forEach(entry => {
    const sourcePath = path.join(source, entry.name);
    const targetPath = path.join(target, entry.name);
    if (entry.isDirectory()) {
      if (fs.existsSync(targetPath) && !fs.statSync(targetPath).isDirectory()) fs.rmSync(targetPath, { force: true });
      mirrorDirectory(sourcePath, targetPath);
    } else if (entry.isFile()) {
      if (fs.existsSync(targetPath) && fs.statSync(targetPath).isDirectory()) fs.rmSync(targetPath, { recursive: true, force: true });
      fs.copyFileSync(sourcePath, targetPath);
    }
  });

  fs.readdirSync(target, { withFileTypes: true })
    .filter(entry => !sourceNames.has(entry.name))
    .forEach(entry => fs.rmSync(path.join(target, entry.name), { recursive: entry.isDirectory(), force: true }));
}

function createStagingDirectory(moduleId) {
  const source = sources[moduleId];
  const target = path.join(miniprogramRoot, moduleId);
  if (!fs.existsSync(source)) throw new Error(`找不到模块源目录：${source}`);
  assertGeneratedTarget(target);
  const stagingRoot = fs.mkdtempSync(path.join(os.tmpdir(), `navistudy-${moduleId}-`));
  const stagingTarget = path.join(stagingRoot, moduleId);
  fs.mkdirSync(stagingTarget, { recursive: true });
  return { source, stagingRoot, stagingTarget, target };
}

function syncGeneratedModule(moduleId) {
  const { source, stagingRoot, stagingTarget, target } = createStagingDirectory(moduleId);
  try {
    copyDirectory(source, stagingTarget);
    applySharedTheme(stagingTarget);
    const sourceLabel = path.relative(repositoryRoot, source).replaceAll('\\', '/');
    fs.writeFileSync(
      path.join(stagingTarget, 'GENERATED.md'),
      `# Generated module\n\nSource: \`${sourceLabel}\`\n\nRun \`npm run sync:wechat\` from the repository root to regenerate this directory.\n`,
      'utf8',
    );
    mirrorDirectory(stagingTarget, target);
    console.log(`Synced ${moduleId} from ${sourceLabel}`);
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
}

function syncStandaloneModule(moduleId) {
  const { source, stagingRoot, stagingTarget, target } = createStagingDirectory(moduleId);
  try {
    ['assets', 'data', 'pages', 'utils'].forEach(name => {
      const sourcePath = path.join(source, name);
      if (fs.existsSync(sourcePath)) copyDirectory(sourcePath, path.join(stagingTarget, name));
    });
    fs.writeFileSync(
      path.join(stagingTarget, 'module.wxss'),
      `${fs.readFileSync(path.join(source, 'app.wxss'), 'utf8').trim()}\n${navigationStyle}`,
      'utf8',
    );

    walk(stagingTarget).forEach(file => {
      const extension = path.extname(file);
      if (!['.js', '.json', '.wxml', '.wxss'].includes(extension)) return;
      let content = fs.readFileSync(file, 'utf8');
      if (extension !== '.wxss') content = content.replace(/\/pages\//g, `/${moduleId}/pages/`);
      if (extension !== '.wxss') content = content.replace(`/${moduleId}/pages/passport/passport`, '/pages/passport/passport');
      if (extension === '.js') {
        content = content.replace(/wx\.switchTab\s*\(/g, 'wx.redirectTo(');
        content = content.replace(/getApp\(\)\.globalData\.version/g, `getApp().globalData.${moduleConfig[moduleId].versionField}`);
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
    applySharedTheme(stagingTarget);

    const sourceLabel = path.relative(repositoryRoot, source).replaceAll('\\', '/');
    fs.writeFileSync(
      path.join(stagingTarget, 'GENERATED.md'),
      `# Generated module\n\nSource: \`${sourceLabel}\`\n\nRun \`npm run sync:wechat\` from the repository root to regenerate this directory.\n`,
      'utf8',
    );
    mirrorDirectory(stagingTarget, target);
    console.log(`Synced ${moduleId} from ${sourceLabel}`);
  } finally {
    fs.rmSync(stagingRoot, { recursive: true, force: true });
  }
}

function syncManifest() {
  const wordsDataPath = path.join(sources.words, 'utils', 'data.js');
  delete require.cache[require.resolve(wordsDataPath)];
  const wordsData = require(wordsDataPath);
  const mtBank = require(path.join(sources.mt, 'data', 'question-bank.js'));
  const versions = loadVersions();
  const wordsVersion = versions.modules.words;
  const mtVersion = versions.modules.mt;
  const readingVersion = versions.modules.reading;
  const modules = [
    {
      id: 'words',
      name: 'NaviWords',
      subject: '英语词汇',
      summary: 'Book 3、Book 4、Book 5 与双学位词汇',
      metric: `${wordsData.getAllWords().length} 词 / ${wordsData.getAllPhrases().length} 组`,
      path: '/words/pages/index/index',
      webUrl: 'https://study.example.test/words/',
      serviceMode: 'sync',
      visibility: 'public',
    },
    {
      id: 'mt',
      name: 'NaviMT 军理通',
      subject: '军事理论',
      summary: '六章题库、错题与四类题型练习',
      metric: `${mtBank.questions.length} 题`,
      path: '/mt/pages/index/index',
      webUrl: 'https://study.example.test/mt/',
      serviceMode: 'sync',
      visibility: 'public',
    },
    {
      id: 'reading',
      name: 'NaviReading',
      subject: '现代大学英语 Book 5',
      summary: '五单元逐段对照、教材注释与个人批注',
      metric: '5 段',
      path: '/reading/pages/index/index',
      webUrl: 'https://study.example.test/reading/',
      serviceMode: 'sync',
      visibility: 'hidden',
    },
    {
      id: 'plan',
      name: 'NaviPlan',
      subject: '培养方案与毕业进度',
      summary: '学分审计、课程修正与选课建议',
      metric: '毕业规划',
      path: '/plan/pages/index/index',
      webUrl: 'https://study.example.test/naviplan/',
      serviceMode: 'sync',
      visibility: 'hidden',
    },
  ];
  const dataDirectory = path.join(miniprogramRoot, 'data');
  fs.mkdirSync(dataDirectory, { recursive: true });
  fs.writeFileSync(
    path.join(dataDirectory, 'modules.js'),
    `// Generated by scripts/sync-modules.cjs.\nmodule.exports = ${JSON.stringify(modules, null, 2)};\n`,
    'utf8',
  );

  const appPath = path.join(miniprogramRoot, 'app.js');
  const appSource = fs.readFileSync(appPath, 'utf8')
    .replace(/version:\s*['"][^'"]+['"]/, `version: '${versions.release}'`)
    .replace(/wordsVersion:\s*['"][^'"]+['"]/, `wordsVersion: '${wordsVersion}'`)
    .replace(/mtVersion:\s*['"][^'"]+['"]/, `mtVersion: '${mtVersion}'`)
    .replace(/readingVersion:\s*['"][^'"]+['"]/, `readingVersion: '${readingVersion}'`)
    .replace(/planVersion:\s*['"][^'"]+['"]/, `planVersion: '${versions.modules.plan}'`)
    .replace(/toolsVersion:\s*['"][^'"]+['"]/, `toolsVersion: '${versions.modules.tools}'`);
  fs.writeFileSync(appPath, appSource, 'utf8');
  console.log(`Updated manifest: NaviStudy ${versions.release}, Words ${wordsVersion}, MT ${mtVersion}, Reading ${readingVersion}, Plan ${versions.modules.plan}, Tools ${versions.modules.tools}`);
}

syncVersions();
syncStandaloneModule('words');
syncStandaloneModule('mt');
syncStandaloneModule('reading');
syncGeneratedModule('plan');
syncGeneratedModule('tools');
syncManifest();
