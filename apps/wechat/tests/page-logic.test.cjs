const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..', 'miniprogram');
const memory = {};
let capturedPage = null;
let navigation = null;
let navigationBarColor = null;
let modalConfirm = false;
let modalCalls = 0;
let clipboardData = '';
let lastModal = null;

global.getApp = () => ({
  globalData: {
    version: '0.1.0',
    wordsVersion: '0.2.1',
    mtVersion: '0.1.0',
    planVersion: '0.2.0',
    readingVersion: '0.1.0',
    apiBase: 'https://words.example.test',
    mtApiBase: 'https://mt.example.test',
    planWebBase: 'https://study.example.test/naviplan/',
    toolsWebBase: 'https://study.example.test/tools/',
    toolsApiBase: 'https://words.example.test/navitools/api/availability',
    user: '',
    passportUser: '',
    navistudyTheme: 'dark'
  },
  queueSync() {}
});

global.wx = {
  getStorageSync(key) { return memory[key]; },
  setStorageSync(key, value) { memory[key] = JSON.parse(JSON.stringify(value)); },
  removeStorageSync(key) { delete memory[key]; },
  navigateTo({ url }) { navigation = { type: 'navigateTo', url }; },
  redirectTo({ url }) { navigation = { type: 'redirectTo', url }; },
  reLaunch({ url }) { navigation = { type: 'reLaunch', url }; },
  navigateBack({ delta }) { navigation = { type: 'navigateBack', delta }; },
  showToast() {},
  showModal(options) { lastModal = options; modalCalls += 1; if (options.success) options.success({ confirm: modalConfirm }); },
  showLoading() {},
  hideLoading() {},
  showShareMenu() {},
  setNavigationBarColor(options) { navigationBarColor = options; },
  setClipboardData({ data, success }) { clipboardData = data; if (success) success(); },
  getClipboardData({ success }) { if (success) success({ data: '{}' }); },
  setNavigationBarTitle() {},
  previewImage() {}
};
global.Page = definition => { capturedPage = definition; };

function instantiate(relativePath) {
  capturedPage = null;
  const fullPath = path.join(root, relativePath);
  delete require.cache[require.resolve(fullPath)];
  require(fullPath);
  assert.ok(capturedPage, `页面未注册：${relativePath}`);
  const page = Object.assign({}, capturedPage);
  page.data = JSON.parse(JSON.stringify(capturedPage.data || {}));
  page.setData = patch => { page.data = Object.assign(page.data, patch); };
  return page;
}

const portal = instantiate('pages/portal/portal.js');
portal.onShow();
assert.strictEqual(portal.data.continuation.available, false);
assert.deepStrictEqual(portal.data.modules.map(module => module.id), ['words', 'mt']);
assert.strictEqual(portal.data.theme, 'dark');
portal.toggleTheme({ detail: { value: true } });
assert.strictEqual(portal.data.theme, 'light');
assert.strictEqual(memory.navistudy_portal_theme, 'light');
assert.deepStrictEqual(navigationBarColor, { frontColor: '#000000', backgroundColor: '#eef4fb' });
portal.toggleTheme({ detail: { value: false } });
assert.strictEqual(portal.data.theme, 'dark');
assert.strictEqual(memory.navistudy_portal_theme, 'dark');
portal.enterModule({ currentTarget: { dataset: { id: 'words' } } });
assert.deepStrictEqual(navigation, { type: 'navigateTo', url: '/words/pages/index/index' });
navigation = null;
portal.enterModule({ currentTarget: { dataset: { id: 'plan' } } });
assert.strictEqual(navigation, null, 'NaviPlan 暂停期间不能从 Portal 进入');
portal.enterModule({ currentTarget: { dataset: { id: 'reading' } } });
assert.strictEqual(navigation, null, 'NaviReading 只能通过隐藏入口进入');
const modalCountBeforeWeb = modalCalls;
portal.openWeb();
assert.strictEqual(clipboardData, 'https://study.example.test/');
assert.strictEqual(modalCalls, modalCountBeforeWeb + 1);
assert.ok(lastModal.content.includes('访问网页版获得更完整的体验'));
assert.strictEqual(lastModal.showCancel, false);
navigation = null;
const modalCountBeforeReading = modalCalls;
for (let tap = 0; tap < 4; tap += 1) portal.tapVersion();
assert.strictEqual(modalCalls, modalCountBeforeReading);
assert.strictEqual(navigation, null);
modalConfirm = true;
portal.tapVersion();
assert.strictEqual(modalCalls, modalCountBeforeReading + 1);
assert.deepStrictEqual(navigation, { type: 'navigateTo', url: '/reading/pages/index/index' });
modalConfirm = false;

memory.words_user = 'xy';
const passportPage = instantiate('pages/passport/passport.js');
passportPage.onShow();
assert.strictEqual(passportPage.data.legacyUsername, 'xy');
assert.ok(passportPage.data.legacyHint.includes('原有记录会自动继承'));
passportPage.chooseLegacyRegistration();
assert.strictEqual(passportPage.data.mode, 'register');
assert.strictEqual(passportPage.data.legacyRegistration, true);
passportPage.onPassword({ detail: { value: '安全密码-2026' } });
passportPage.onConfirmPassword({ detail: { value: '安全密码-2026' } });
assert.strictEqual(passportPage.validate(), '', '旧版两位用户名应可进入同名注册流程');

const wordsHome = instantiate('words/pages/index/index.js');
wordsHome.onShow();
assert.ok(wordsHome.data.progressTotal > 0);
wordsHome.goBooks();
assert.deepStrictEqual(navigation, { type: 'redirectTo', url: '/words/pages/books/books' });

const wordsPractice = instantiate('words/pages/practice/practice.js');
wordsPractice.onLoad({ book: 'b3', unit: 'all', mode: 'card', index: '5' });
const savedWord = wordsPractice.data.current;
const wordsDeepLink = instantiate('words/pages/practice/practice.js');
wordsDeepLink.onLoad({
  book: 'b3',
  unit: 'all',
  mode: 'card',
  index: '0',
  wordKey: encodeURIComponent(memory.words_learning_data.last_progress.wordKey)
});
assert.strictEqual(wordsDeepLink.data.current.key, savedWord.key);

const mtHome = instantiate('mt/pages/index/index.js');
mtHome.onShow();
assert.strictEqual(mtHome.data.stats.total, 4);
mtHome.goBank();
assert.deepStrictEqual(navigation, { type: 'redirectTo', url: '/mt/pages/bank/bank' });

const mtPractice = instantiate('mt/pages/practice/practice.js');
mtPractice.onLoad({ chapter: encodeURIComponent('学习方法'), type: 'single', order: 'sequential' });
const answer = mtPractice.data.current.answer[0];
mtPractice.chooseOption({ currentTarget: { dataset: { key: answer } } });
assert.strictEqual(mtPractice.data.correct, true);
assert.strictEqual(memory.military_theory_learning_v1.lastProgress.questionText, mtPractice.data.current.stem);

memory.words_learning_data.last_progress.updatedAt = Date.now() + 1000;
portal.onShow();
assert.strictEqual(portal.data.continuation.moduleId, 'words');
assert.strictEqual(portal.data.continuation.title, memory.words_learning_data.last_progress.word);
portal.continueLearning();
assert.ok(navigation.url.startsWith('/words/pages/practice/practice?'));
assert.ok(navigation.url.includes(`wordKey=${encodeURIComponent(memory.words_learning_data.last_progress.wordKey)}`));
assert.ok(navigation.url.includes('kind=word'));

memory.military_theory_learning_v1.lastProgress.updatedAt = Date.now() + 2000;
portal.onShow();
assert.strictEqual(portal.data.continuation.moduleId, 'mt');
assert.strictEqual(portal.data.continuation.title, mtPractice.data.current.stem);
portal.continueLearning();
assert.ok(navigation.url.startsWith('/mt/pages/practice/practice?'));
assert.ok(navigation.url.includes(`questionId=${mtPractice.data.current.id}`));

memory.naviplan_data_v1 = {
  schemaVersion: 1,
  student: { grade: 2025, major: '英语' },
  courses: [{ id: 'ENG101', name: '综合英语', credits: 4, status: 'COMPLETED', category: 'REQUIRED' }],
  coursePool: [{ id: 'ENG102', courseCode: 'ENG102', courseName: '英语阅读', credits: 2, status: 'CANDIDATE', category: 'REQUIRED', courseNature: '必修' }],
  requirements: [{ id: 'required', name: '专业必修', requiredCredits: 40 }],
  audit: {
    totalRequiredCredits: 150,
    totalEarnedCredits: 4,
    totalInProgressCredits: 0,
    totalPlannedCredits: 0,
    requirementAudits: [{
      satisfied: false,
      missingCredits: 36,
      candidateCourseIds: ['ENG102'],
      group: { id: 'required', name: '专业必修', category: 'REQUIRED', ruleKind: 'CREDIT_TOTAL' }
    }]
  },
  recommendations: [{ id: 'ENG102', courseCode: 'ENG102', courseName: '英语阅读', credits: 2, reason: '补足专业必修要求' }],
  manualCorrections: {},
  updatedAt: Date.now() + 3000
};

const planHome = instantiate('plan/pages/index/index.js');
planHome.onShow();
assert.strictEqual(planHome.data.summary.earned, 4);
assert.strictEqual(planHome.data.summary.gaps.length, 1);
assert.strictEqual(planHome.data.futureRequired[0].course.courseName, '英语阅读');
assert.strictEqual(planHome.data.futureRequired[0].course.advice, '补足专业必修要求');

portal.onShow();
assert.strictEqual(portal.data.continuation.moduleId, 'mt');
portal.continueLearning();
assert.ok(navigation.url.startsWith('/mt/pages/practice/practice?'));

const readingHome = instantiate('reading/pages/index/index.js');
readingHome.onShow();
assert.strictEqual(readingHome.data.units.length, 5);
readingHome.openUnit({ currentTarget: { dataset: { unit: 1 } } });
assert.deepStrictEqual(navigation, { type: 'navigateTo', url: '/reading/pages/reader/reader?unit=1&paragraph=1' });

const readingPage = instantiate('reading/pages/reader/reader.js');
readingPage.onLoad({ unit: '1', paragraph: '1' });
assert.ok(readingPage.data.paragraph.en.includes('A clear goal'));
readingPage.toggleBookmark();
assert.deepStrictEqual(memory.navi_reading_learning_v1.bookmarks, ['1:1']);
readingPage.onNoteInput({ detail: { value: '开篇祝贺与反讽' } });
readingPage.saveNote();
assert.strictEqual(memory.navi_reading_learning_v1.notes['1:1'], '开篇祝贺与反讽');
memory.navi_reading_learning_v1.updatedAt = Date.now() + 4000;

portal.onShow();
assert.strictEqual(portal.data.continuation.moduleId, 'mt');
portal.continueLearning();
assert.ok(navigation.url.startsWith('/mt/pages/practice/practice?'));

portal.enterTools();
assert.deepStrictEqual(navigation, { type: 'navigateTo', url: '/tools/pages/index/index' });
memory.navistudy_tools_continuation = {
  title: '班级会议时间',
  path: '/tools/pages/stats/stats?id=session-1',
  updatedAt: Date.now() + 5000
};
portal.onShow();
assert.strictEqual(portal.data.continuation.moduleId, 'tools');
assert.strictEqual(portal.data.continuation.title, '班级会议时间');
assert.ok(!portal.data.modules.some(module => module.id === 'reading' || module.id === 'plan'));
const toolsHome = instantiate('tools/pages/index/index.js');
toolsHome.onShow();
assert.strictEqual(toolsHome.data.account, null);
toolsHome.create();
assert.strictEqual(navigation.type, 'navigateTo');
assert.ok(navigation.url.startsWith('/pages/passport/passport?returnTo='));
assert.strictEqual(memory.navi_passport_intent.type, 'tools-create');

console.log('page-logic.test: OK');
