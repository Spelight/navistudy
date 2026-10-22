const modules = require('../../data/modules');
const passport = require('../../utils/passport');
const analytics = require('../../utils/analytics');

const THEME_KEY = 'navistudy_portal_theme';
const WEB_URL = 'https://study.example.test/';

const EMPTY_CONTINUATION = {
  available: false,
  moduleId: 'empty',
  label: '上次学到',
  title: '还没有继续项',
  meta: '进入一个模块后，这里会显示最近可以继续做的事',
  path: '',
  updatedAt: 0
};

function encode(value) {
  return encodeURIComponent(String(value || ''));
}

function wordsContinuation() {
  const learning = wx.getStorageSync('words_learning_data') || {};
  const progress = learning.last_progress;
  if (!progress || !progress.wordKey || !progress.word) return null;
  const params = [
    `book=${encode(progress.book || 'b3')}`,
    `unit=${encode(progress.unit || 'all')}`,
    `mode=${encode(progress.mode || 'card')}`,
    `kind=${encode(progress.kind || 'word')}`,
    `index=${Number(progress.index || 0)}`,
    `wordKey=${encode(progress.wordKey)}`
  ];
  if (progress.source) params.push(`source=${encode(progress.source)}`);
  if (progress.wrongType) params.push(`type=${encode(progress.wrongType)}`);
  if (progress.wrongKey) params.push(`key=${encode(progress.wrongKey)}`);
  const book = String(progress.book || 'b3').replace(/^b/i, 'Book ');
  const unit = progress.unit === 'all' ? '全部 Unit' : String(progress.unit || '全部 Unit');
  return {
    available: true,
    moduleId: 'words',
    label: `${progress.kind === 'phrase' ? '继续词组' : '继续背词'} · NaviWords`,
    title: progress.word,
    meta: [progress.cn, book, unit].filter(Boolean).join(' · '),
    path: `/words/pages/practice/practice?${params.join('&')}`,
    updatedAt: Number(progress.updatedAt || 0)
  };
}

function mtContinuation() {
  const learning = wx.getStorageSync('military_theory_learning_v1') || {};
  const progress = learning.lastProgress;
  if (!progress || !progress.currentId) return null;
  const params = [
    `chapter=${encode(progress.chapter || 'all')}`,
    `type=${encode(progress.type || 'all')}`,
    `order=${encode(progress.order || 'sequential')}`,
    `index=${Number(progress.index || 0)}`,
    `questionId=${encode(progress.currentId)}`
  ];
  if (progress.source) params.push(`source=${encode(progress.source)}`);
  const typeNames = { single: '单选题', multiple: '多选题', truefalse: '判断题', short: '简答题', objective: '客观题', all: '综合练习' };
  const chapter = progress.chapter === 'all' ? '全部章节' : String(progress.chapter || '全部章节');
  return {
    available: true,
    moduleId: 'mt',
    label: '继续刷题 · NaviMT',
    title: progress.questionText || `${chapter}第 ${Number(progress.index || 0) + 1} 题`,
    meta: `${chapter} · ${typeNames[progress.type] || '综合练习'} · 第 ${Number(progress.index || 0) + 1} 题`,
    path: `/mt/pages/practice/practice?${params.join('&')}`,
    updatedAt: Number(progress.updatedAt || 0)
  };
}

function toolsContinuation() {
  const saved = wx.getStorageSync('navistudy_tools_continuation') || {};
  if (!saved.path || !String(saved.path).startsWith('/tools/pages/')) return null;
  return {
    available: true,
    moduleId: 'tools',
    label: '继续管理 · NaviTools',
    title: saved.title || '最近管理的问卷',
    meta: saved.meta || '查看问卷统计',
    path: saved.path,
    updatedAt: Number(saved.updatedAt || 0)
  };
}

function latestContinuation() {
  const preferredId = wx.getStorageSync('navistudy_last_module');
  const candidates = [wordsContinuation(), mtContinuation(), toolsContinuation()].filter(Boolean);
  if (!candidates.length) return Object.assign({}, EMPTY_CONTINUATION);
  return candidates.sort((a, b) => {
    const timeDifference = b.updatedAt - a.updatedAt;
    if (timeDifference) return timeDifference;
    return a.moduleId === preferredId ? -1 : 1;
  })[0];
}

function normalizeTheme(value) {
  return value === 'light' ? 'light' : 'dark';
}

function getTheme() {
  return normalizeTheme(wx.getStorageSync(THEME_KEY));
}

function themeMeta(theme) {
  if (theme === 'light') {
    return {
      theme,
      isLightTheme: true,
      themeLabel: '日间模式',
      themeHint: '亮色背景'
    };
  }
  return {
    theme: 'dark',
    isLightTheme: false,
    themeLabel: '夜间模式',
    themeHint: '暗色背景'
  };
}

function applyNavigationTheme(theme) {
  if (!wx.setNavigationBarColor) return;
  if (theme === 'light') {
    wx.setNavigationBarColor({
      frontColor: '#000000',
      backgroundColor: '#eef4fb'
    });
    return;
  }
  wx.setNavigationBarColor({
    frontColor: '#ffffff',
    backgroundColor: '#050608'
  });
}

Page({
  data: {
    modules: modules.filter(module => !['reading', 'plan'].includes(module.id)),
    continuation: Object.assign({}, EMPTY_CONTINUATION),
    version: '',
    passportLabel: '登录通行证',
    syncLabel: '仅本机',
    theme: 'dark',
    isLightTheme: false,
    themeLabel: '夜间模式',
    themeHint: '适合晚上复习，保留低亮度界面'
  },

  onShow() {
    const account = passport.account();
    const theme = getTheme();
    const app = getApp();
    if (app && app.globalData) app.globalData.navistudyTheme = theme;
    applyNavigationTheme(theme);
    this.setData(Object.assign({
      continuation: latestContinuation(),
      version: app.globalData.version,
      passportLabel: account ? account.username : '登录通行证',
      syncLabel: account ? this.passportSummary() : '跨设备同步'
    }, themeMeta(theme)));
  },

  toggleTheme(event) {
    const theme = event.detail && event.detail.value ? 'light' : 'dark';
    const app = getApp();
    wx.setStorageSync(THEME_KEY, theme);
    if (app && app.globalData) app.globalData.navistudyTheme = theme;
    applyNavigationTheme(theme);
    this.setData(themeMeta(theme));
  },

  passportSummary() {
    const states = ['words', 'mt', 'reading', 'plan'].map(product => passport.syncStatus(product));
    if (states.includes('需要处理')) return '需要处理';
    if (states.includes('等待网络')) return '等待网络';
    if (states.includes('正在同步')) return '正在同步';
    if (states.includes('服务未开通')) return '部分未开通';
    return '四项已同步';
  },

  goPassport() {
    wx.navigateTo({ url: '/pages/passport/passport' });
  },

  openOj() {
    wx.showModal({
      title: 'NaviOJ 使用独立账号',
      content: 'NaviPassport 不会发送到 OJ。网页版地址为 python.example.test。',
      confirmText: '复制地址',
      success(result) {
        if (result.confirm) wx.setClipboardData({ data: 'https://python.example.test/' });
      }
    });
  },

  enterModule(event) {
    const id = event.currentTarget.dataset.id;
    const target = this.data.modules.find(item => item.id === id);
    if (!target) return;
    wx.setStorageSync('navistudy_last_module', target.id);
    analytics.track('product_open', { product: target.id });
    wx.navigateTo({ url: target.path });
  },

  enterTools() {
    wx.setStorageSync('navistudy_last_module', 'tools');
    analytics.track('product_open', { product: 'tools' });
    wx.navigateTo({ url: '/tools/pages/index/index' });
  },

  openWeb() {
    analytics.track('product_open', { product: 'study' });
    wx.setClipboardData({
      data: WEB_URL,
      success() {
        wx.showModal({
          title: '网页版地址已复制',
          content: '访问网页版获得更完整的体验。请在手机浏览器中打开 study.example.test。',
          showCancel: false,
          confirmText: '知道了'
        });
      },
      fail() {
        wx.showModal({
          title: '访问网页版',
          content: '请在手机浏览器中打开 https://study.example.test/。',
          showCancel: false,
          confirmText: '知道了'
        });
      }
    });
  },

  continueLearning() {
    const continuation = this.data.continuation;
    if (!continuation || !continuation.available) return;
    wx.setStorageSync('navistudy_last_module', continuation.moduleId);
    analytics.track('product_open', { product: continuation.moduleId });
    wx.navigateTo({ url: continuation.path });
  },

  tapVersion() {
    this.readingTapCount = (this.readingTapCount || 0) + 1;
    clearTimeout(this.readingTapTimer);
    if (this.readingTapCount < 5) {
      this.readingTapTimer = setTimeout(() => { this.readingTapCount = 0; }, 3000);
      return;
    }
    this.readingTapCount = 0;
    wx.showModal({
      title: '进入 NaviReading',
      content: '打开现代大学英语 5 双语精读？',
      confirmText: '进入',
      cancelText: '取消',
      success(result) {
        if (result.confirm) {
          wx.setStorageSync('navistudy_last_module', 'reading');
          wx.navigateTo({ url: '/reading/pages/index/index' });
        }
      }
    });
  },

  onHide() {
    clearTimeout(this.readingTapTimer);
    this.readingTapCount = 0;
  },

  onShareAppMessage() {
    return {
      title: 'NaviStudy · 北航学生的综合学习平台',
      path: '/pages/portal/portal'
    };
  }
});
