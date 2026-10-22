const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const miniRoot = path.join(root, 'miniprogram');
const app = JSON.parse(fs.readFileSync(path.join(miniRoot, 'app.json'), 'utf8'));
const modules = require(path.join(miniRoot, 'data', 'modules.js'));
const mtMaterials = require(path.join(miniRoot, 'mt', 'data', 'material-files.js'));
const versions = require(path.resolve(root, '..', '..', 'config', 'versions.json'));
const { checkVersions } = require(path.resolve(root, '..', '..', 'scripts', 'versioning.cjs'));

checkVersions();
assert.match(versions.release, /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/, '微信小程序发布版本不是合法 SemVer');

assert.deepStrictEqual(
  modules.map(({ id, metric, path: modulePath }) => ({ id, metric, path: modulePath })),
  [
    { id: 'words', metric: '300 词 / 4 组', path: '/words/pages/index/index' },
    { id: 'mt', metric: '4 题', path: '/mt/pages/index/index' },
    { id: 'reading', metric: '5 段', path: '/reading/pages/index/index' },
    { id: 'plan', metric: '毕业规划', path: '/plan/pages/index/index' }
  ],
  'NaviStudy 入口清单与源模块数据不一致'
);
assert.ok(app.subPackages.find(pkg => pkg.root === 'mt').pages.includes('pages/materials/materials'), 'NaviMT 分包未登记参考资料页');
assert.deepStrictEqual(app.subPackages.find(pkg => pkg.root === 'plan').pages, ['pages/index/index', 'pages/requirements/requirements', 'pages/courses/courses', 'pages/course/course', 'pages/source/source'], 'NaviPlan 分包仍包含旧日程页面');
assert.deepStrictEqual(app.subPackages.find(pkg => pkg.root === 'tools').pages, ['pages/index/index', 'pages/availability/availability', 'pages/fill/fill', 'pages/stats/stats'], 'NaviTools 分包页面不完整');
assert.ok(app.subPackages.find(pkg => pkg.root === 'reading').pages.includes('pages/reader/reader'), 'NaviReading 分包未登记阅读页');
assert.strictEqual(app.subPackages.find(pkg => pkg.root === 'reading').name, 'NaviReading', 'NaviReading 分包品牌名不一致');
assert.strictEqual(modules.find(module => module.id === 'reading').name, 'NaviReading', 'NaviStudy 入口未使用 NaviReading 品牌名');
assert.strictEqual(Object.keys(mtMaterials.files).length, 0, 'NaviMT 参考资料下载清单不完整');

function requirePageFiles(base) {
  ['js', 'json', 'wxml', 'wxss'].forEach(extension => {
    assert.ok(fs.existsSync(`${base}.${extension}`), `缺少页面文件：${base}.${extension}`);
  });
}

app.pages.forEach(page => requirePageFiles(path.join(miniRoot, page)));
app.subPackages.forEach(pkg => {
  pkg.pages.forEach(page => requirePageFiles(path.join(miniRoot, pkg.root, page)));
});

const forbiddenHtmlTag = /<(?:br|div|p|span|strong)(?:\s|\/?>)/i;
fs.readdirSync(miniRoot, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile() && entry.name.endsWith('.wxml'))
  .forEach(entry => {
    const file = path.join(entry.parentPath || entry.path, entry.name);
    assert.ok(!forbiddenHtmlTag.test(fs.readFileSync(file, 'utf8')), `WXML 包含微信不支持的 HTML 标签：${file}`);
  });

for (const moduleId of ['words', 'mt', 'reading', 'plan', 'tools']) {
  const moduleRoot = path.join(miniRoot, moduleId);
  assert.ok(fs.existsSync(path.join(moduleRoot, 'GENERATED.md')));
  const files = [];
  const walk = directory => fs.readdirSync(directory, { withFileTypes: true }).forEach(entry => {
    const target = path.join(directory, entry.name);
    if (entry.isDirectory()) walk(target);
    else files.push(target);
  });
  walk(moduleRoot);
  files.filter(file => /\.(js|json|wxml)$/.test(file)).forEach(file => {
    const source = fs.readFileSync(file, 'utf8');
    const withoutMainPackageRoutes = app.pages.reduce((value, page) => value.replaceAll(`/${page}`, ''), source);
    assert.ok(!/[`'"]\/pages\//.test(withoutMainPackageRoutes), `存在未登记的主包路由：${file}`);
    assert.ok(!/wx\.switchTab\s*\(/.test(source), `分包中不能使用原生 tabBar 跳转：${file}`);
  });
  files.filter(file => /pages[\\/].+\.wxss$/.test(file)).forEach(file => {
    assert.ok(fs.readFileSync(file, 'utf8').startsWith('@import "../../module.wxss";'), `页面未引入模块样式：${file}`);
  });
  files.filter(file => file.endsWith('.js') && !file.includes(`${path.sep}data${path.sep}`) && !file.includes(`${path.sep}vendor${path.sep}`)).forEach(file => {
    assert.ok(!/\.\.\.[A-Za-z_(]/.test(fs.readFileSync(file, 'utf8')), `小程序业务代码不能使用会注入外部 SWC 运行时的展开语法：${file}`);
  });
}

const navPages = [
  'words/pages/index/index.wxml',
  'words/pages/books/books.wxml',
  'words/pages/me/me.wxml',
  'mt/pages/index/index.wxml',
  'mt/pages/bank/bank.wxml',
  'mt/pages/me/me.wxml',
  'reading/pages/index/index.wxml',
  'reading/pages/me/me.wxml',
  'plan/pages/index/index.wxml',
  'plan/pages/requirements/requirements.wxml',
  'plan/pages/courses/courses.wxml',
  'plan/pages/source/source.wxml'
];
navPages.forEach(file => {
  const source = fs.readFileSync(path.join(miniRoot, file), 'utf8');
  assert.ok(source.includes('module-tabbar'), `主页面缺少模块导航：${file}`);
  assert.ok(source.includes('/pages/portal/portal'), `主页面缺少 NaviStudy 返回入口：${file}`);
});
const toolsIndex = fs.readFileSync(path.join(miniRoot, 'tools/pages/index/index.wxml'), 'utf8');
assert.ok(toolsIndex.includes('bindtap="goHome"') && toolsIndex.includes('NaviStudy'), 'NaviTools 首页缺少 NaviStudy 功能切换入口');

const passportPage = fs.readFileSync(path.join(miniRoot, 'pages/passport/passport.wxml'), 'utf8');
const services = require(path.join(miniRoot, 'data', 'services.js'));
const passportStyles = fs.readFileSync(path.join(miniRoot, 'pages/passport/passport.wxss'), 'utf8');
const passportLogic = fs.readFileSync(path.join(miniRoot, 'pages/passport/passport.js'), 'utf8');
const portalPage = fs.readFileSync(path.join(miniRoot, 'pages/portal/portal.wxml'), 'utf8');
const portalLogic = fs.readFileSync(path.join(miniRoot, 'pages/portal/portal.js'), 'utf8');
const syncScript = fs.readFileSync(path.join(root, 'scripts', 'sync-modules.cjs'), 'utf8');
const brandMark = fs.readFileSync(path.join(miniRoot, 'assets/navistudy-mark.svg'), 'utf8');
for (const marker of ['确认密码', '复制恢复码', 'togglePassword']) {
  assert.ok(passportPage.includes(marker) || passportLogic.includes(marker), `Passport 页面缺少交互：${marker}`);
}
assert.deepStrictEqual(services.filter(service => service.visibility === 'public').map(service => service.id), ['words', 'mt', 'tools'], '公开服务清单不正确');
assert.deepStrictEqual(services.filter(service => service.visibility === 'hidden').map(service => service.id), ['reading', 'plan'], '隐藏服务清单不正确');
assert.ok(passportLogic.includes('toolsProfile') && passportPage.includes('services'), 'Passport 未展示 NaviTools 授权或统一服务状态');
assert.ok(passportLogic.includes('Promise.allSettled'), 'Passport 同步未分别处理四项结果');
assert.ok(passportLogic.includes("length < 6"), 'Passport 前端密码规则不是至少 6 个字符');
assert.ok(passportLogic.includes("initializeProduct('plan'"), 'Passport 登录后未初始化 NaviPlan');
assert.ok(passportLogic.includes("initializeProduct('reading'"), 'Passport 登录后未初始化 NaviReading');
assert.ok(passportLogic.includes('legacy_registration_required') && passportPage.includes('使用原用户名注册'), 'Passport 缺少旧 Words 用户注册引导');
assert.ok(passportLogic.includes('legacyRegistration ? /^[A-Za-z0-9_') && passportLogic.includes('{1,40}'), 'Passport 未兼容旧版短用户名');
assert.ok(passportPage.includes('inheritanceMessage'), 'Passport 未展示旧 Words 数据继承结果');
const passportButtonRule = passportStyles.match(/button\s*\{([^}]*)\}/);
assert.ok(passportButtonRule, 'Passport 页面缺少统一按钮规则');
for (const declaration of ['display: flex', 'align-items: center', 'justify-content: center', 'line-height: 1.2']) {
  assert.ok(passportButtonRule[1].includes(declaration), `Passport 按钮缺少居中规则：${declaration}`);
}
assert.ok(passportPage.includes('<text>{{submitLabel}}</text>'), 'Passport 动态提交文案缺少稳定文本节点');
assert.ok(portalLogic.includes("['reading', 'plan'].includes(module.id)") && portalLogic.includes('tapVersion'), 'Portal 未隐藏 NaviReading、暂时隐藏 NaviPlan 或缺少版本号入口');
assert.ok(syncScript.includes('mirrorDirectory(stagingTarget, target)'), '微信模块同步没有使用无中断镜像更新');
assert.ok(!syncScript.includes('fs.rmSync(target, { recursive: true'), '微信模块同步仍会整体删除正在预览的分包');
assert.ok(!/\.\.\.[A-Za-z_(]/.test(portalLogic), 'Portal 不能使用会注入外部 SWC 运行时的展开语法');
assert.ok(portalLogic.includes("['reading', 'plan'].includes(module.id)"), 'Portal 未暂时隐藏 NaviPlan');
assert.ok(portalPage.includes('bindtap="tapVersion"'), 'Portal 版本号未绑定 NaviReading 隐藏入口');
assert.ok(!portalPage.includes("item.id === 'reading'"), 'Portal 模块列表仍暴露 NaviReading 专属图标');
assert.ok(portalPage.includes('/assets/navistudy-mark.svg'), 'Portal 未使用新版 NaviStudy 标志');
assert.ok(!portalPage.includes('mark-line'), 'Portal 仍在使用旧交叉线标志');
assert.ok(brandMark.includes('M18 45V19L46 45V20') && brandMark.includes('#79E2BC'), 'NaviStudy 标志缺少学习路径或导航终点');
assert.ok(portalPage.includes('访问网页版获得更完整的体验') && portalPage.includes('bindtap="openWeb"'), 'Portal 缺少网页版体验入口');
assert.ok(portalLogic.includes("const WEB_URL = 'https://study.example.test/'") && portalLogic.includes('setClipboardData'), 'Portal 网页版入口未复制规范地址');
assert.ok(fs.readFileSync(path.join(miniRoot, 'utils/passport.js'), 'utf8').includes('https://words.example.test/navistudy-api'), 'Passport 未使用已获授权的 NaviWords API 域名');
assert.ok(fs.readFileSync(path.join(miniRoot, 'utils/passport.js'), 'utf8').includes("app_settings: 'map'"), 'Words 偏好设置未纳入 Passport 合并');

const readingData = require(path.join(miniRoot, 'reading', 'data', 'study-data.js'));
assert.strictEqual(readingData.units.length, 5, 'NaviReading 单元数量不正确');
assert.strictEqual(readingData.units.reduce((sum, unit) => sum + unit.paragraphs.length, 0), 5, 'NaviReading 段落数量不正确');
const readingReader = fs.readFileSync(path.join(miniRoot, 'reading/pages/reader/reader.wxml'), 'utf8');
assert.ok(readingReader.includes('查看教材原页') && readingReader.includes('我的批注'), 'NaviReading 阅读页缺少原页或批注功能');

const planIndex = fs.readFileSync(path.join(miniRoot, 'plan/pages/index/index.wxml'), 'utf8');
const planSource = fs.readFileSync(path.join(miniRoot, 'plan/pages/source/source.wxml'), 'utf8');
const planCourse = fs.readFileSync(path.join(miniRoot, 'plan/pages/course/course.wxml'), 'utf8');
assert.ok(planIndex.includes('毕业还缺') && planIndex.includes('未来未选必修') && planIndex.includes('限修 / 选修候选'), 'NaviPlan 首页缺少学分缺口与选课规划核心信息');
assert.ok(planSource.includes('首次导入') && planSource.includes('只有点击上方按钮时访问北航教务'), 'NaviPlan 数据源没有明确按需导入边界');
assert.ok(planCourse.includes('状态') && planCourse.includes('类别') && planCourse.includes('学分'), 'NaviPlan 课程修正字段不完整');
for (const forbidden of ['DDL', '删除日程', '自动排程', 'ICS']) {
  assert.ok(![planIndex, planSource, planCourse].join('\n').includes(forbidden), `NaviPlan 仍暴露已退役功能：${forbidden}`);
}

const toolsFill = fs.readFileSync(path.join(miniRoot, 'tools/pages/fill/fill.wxml'), 'utf8');
const toolsStats = fs.readFileSync(path.join(miniRoot, 'tools/pages/stats/stats.wxml'), 'utf8');
const toolsLogic = fs.readFileSync(path.join(miniRoot, 'tools/pages/stats/stats.js'), 'utf8');
assert.ok(toolsFill.includes('bindtouchstart="beginSelect"') && toolsFill.includes('catchtouchmove="moveSelect"'), 'NaviTools 填写页缺少拖选交互');
assert.ok(toolsStats.includes('大家都有空的时间') && toolsStats.includes('提交记录'), 'NaviTools 统计页缺少热力统计或回答管理');
assert.ok(toolsLogic.includes('onShareAppMessage') && toolsLogic.includes('copyLink') && toolsLogic.includes('showQr'), 'NaviTools 缺少分享、链接或二维码入口');

for (const moduleId of ['words', 'mt', 'reading', 'plan', 'tools']) {
  const pageFiles = fs.readdirSync(path.join(miniRoot, moduleId, 'pages'), { withFileTypes: true })
    .filter(entry => entry.isDirectory())
    .map(entry => path.join(miniRoot, moduleId, 'pages', entry.name, `${entry.name}.js`))
    .filter(file => fs.existsSync(file));
  pageFiles.forEach(file => assert.ok(fs.readFileSync(file, 'utf8').includes('behaviors/theme'), `分包页面缺少共享主题：${file}`));
}

const mtAccountPage = fs.readFileSync(path.join(miniRoot, 'mt/pages/me/me.wxml'), 'utf8');
assert.ok(mtAccountPage.includes('passport-entry'), 'NaviMT 我的页缺少统一 Passport 入口');
assert.ok(!mtAccountPage.includes('拉取') && !mtAccountPage.includes('上传'), 'NaviMT 我的页仍暴露旧式手动同步操作');

const bytes = fs.readdirSync(miniRoot, { recursive: true, withFileTypes: true })
  .filter(entry => entry.isFile())
  .reduce((sum, entry) => sum + fs.statSync(path.join(entry.parentPath || entry.path, entry.name)).size, 0);
assert.ok(bytes < 2 * 1024 * 1024, `当前总包体超过 2 MiB：${bytes}`);

console.log(`structure.test: OK (${Math.round(bytes / 1024)} KiB)`);
