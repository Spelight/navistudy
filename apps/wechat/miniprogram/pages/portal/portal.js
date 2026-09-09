const modules = require('../../data/modules');
const passport = require('../../utils/passport');

const EMPTY_CONTINUATION = {
  available: false,
  moduleId: 'empty',
  label: '上次学到',
  title: '还没有学习记录',
  meta: '完成一次单词或军理练习后，可从这里直接继续',
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
    label: '上次背到 · NaviWords',
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
    label: '上次做到 · NaviMT 军理通',
    title: progress.questionText || `${chapter}第 ${Number(progress.index || 0) + 1} 题`,
    meta: `${chapter} · ${typeNames[progress.type] || '综合练习'} · 第 ${Number(progress.index || 0) + 1} 题`,
    path: `/mt/pages/practice/practice?${params.join('&')}`,
    updatedAt: Number(progress.updatedAt || 0)
  };
}

function latestContinuation() {
  const preferredId = wx.getStorageSync('navistudy_last_module');
  const candidates = [wordsContinuation(), mtContinuation()].filter(Boolean);
  if (!candidates.length) return Object.assign({}, EMPTY_CONTINUATION);
  return candidates.sort((a, b) => {
    const timeDifference = b.updatedAt - a.updatedAt;
    if (timeDifference) return timeDifference;
    return a.moduleId === preferredId ? -1 : 1;
  })[0];
}

Page({
  data: {
    modules,
    continuation: Object.assign({}, EMPTY_CONTINUATION),
    version: '',
    passportLabel: '登录通行证',
    syncLabel: '仅本机'
  },

  onShow() {
    const account = passport.account();
    this.setData({
      continuation: latestContinuation(),
      version: getApp().globalData.version,
      passportLabel: account ? account.username : '登录通行证',
      syncLabel: account ? `${passport.syncStatus('words')} · ${passport.syncStatus('mt')}` : '跨设备同步'
    });
  },

  goPassport() { wx.navigateTo({ url: '/pages/passport/passport' }); },

  openOj() {
    wx.showModal({
      title: 'NaviOJ 使用独立账号',
      content: 'Navi Passport 不会发送到 OJ。网页版地址为 python.dxir.net.cn。',
      confirmText: '复制地址',
      success(result) { if (result.confirm) wx.setClipboardData({ data: 'https://python.dxir.net.cn/' }); }
    });
  },

  enterModule(event) {
    const id = event.currentTarget.dataset.id;
    const target = modules.find(item => item.id === id);
    if (!target) return;
    wx.setStorageSync('navistudy_last_module', target.id);
    wx.navigateTo({ url: target.path });
  },

  continueLearning() {
    const continuation = this.data.continuation;
    if (!continuation || !continuation.available) return;
    wx.setStorageSync('navistudy_last_module', continuation.moduleId);
    wx.navigateTo({ url: continuation.path });
  },

  onShareAppMessage() {
    return {
      title: 'NaviStudy · 北航学生的综合学习平台',
      path: '/pages/portal/portal'
    };
  }
});
