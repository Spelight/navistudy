const assert = require("assert");

const storage = new Map();
global.wx = {
  getStorageSync(key) {
    return storage.get(key);
  },
  setStorageSync(key, value) {
    storage.set(key, value);
  },
  showToast() {},
};
global.getApp = () => ({ globalData: {} });

let pageDefinition;
global.Page = (definition) => {
  pageDefinition = definition;
};

const vocab = require("../miniprogram/utils/data");
const store = require("../miniprogram/utils/store");
require("../miniprogram/pages/practice/practice");

function createPage(query) {
  const page = Object.assign({}, pageDefinition, {
    data: JSON.parse(JSON.stringify(pageDefinition.data)),
    setData(update, callback) {
      Object.assign(this.data, update);
      if (callback) callback.call(this);
    },
  });
  page.onLoad(query);
  return page;
}

const words = vocab.getWordsByScope("b5", "all");
storage.set("words_learning_data", {
  last_progress: {
    book: "b5",
    unit: "all",
    mode: "card",
    index: 11,
    word: words[11].w,
  },
});
const legacyResume = createPage({ book: "b5", unit: "all", mode: "card" });
assert.strictEqual(
  legacyResume.data.index,
  11,
  "旧版 last_progress 应继续兼容",
);

storage.clear();
store.saveProgress({
  book: "b5",
  unit: "all",
  mode: "card",
  source: "",
  wrongType: "all",
  wrongKey: "",
  index: 24,
  wordKey: vocab.getItemKey(words[24]),
  word: words[24].w,
});

const resumed = createPage({ book: "b5", unit: "all", mode: "card" });
assert.strictEqual(resumed.data.index, 24, "普通入口应恢复上次位置");

const explicitStart = createPage({
  book: "b5",
  unit: "all",
  mode: "card",
  index: "0",
});
assert.strictEqual(
  explicitStart.data.index,
  0,
  "显式 index=0 应从第一个词开始",
);

const otherUnit = createPage({ book: "b5", unit: "b5u1", mode: "card" });
assert.strictEqual(otherUnit.data.index, 0, "不同 Unit 不应串用进度");

const advancing = createPage({
  book: "b5",
  unit: "all",
  mode: "card",
  index: "3",
});
advancing.knowWord();
assert.strictEqual(advancing.data.index, 4, "记住后应自动进入下一词");
assert.strictEqual(
  store.getSavedProgress({ book: "b5", unit: "all", mode: "card" }).index,
  4,
  "推进后应立即保存位置",
);

store.saveProgress({ book: "b5", unit: "all", mode: "choice", index: 8 });
assert.strictEqual(
  store.getSavedProgress({ book: "b5", unit: "all", mode: "card" }).index,
  4,
  "不同练习模式不应互相覆盖位置",
);

const phrases = vocab.getAllPhrases();
assert.strictEqual(phrases.length, 4, "词组数据应独立可用");
const phraseBook = vocab.getBookIdByUnit(phrases[0].u);
store.saveProgress({
  book: phraseBook,
  unit: "all",
  kind: "phrase",
  mode: "card",
  index: 2,
  wordKey: vocab.getItemKey(phrases[2]),
  word: phrases[2].w,
});
assert.strictEqual(
  store.getSavedProgress({
    book: phraseBook,
    unit: "all",
    kind: "phrase",
    mode: "card",
  }).index,
  2,
  "词组进度应独立保存",
);
const wordProgressAfterPhrase = store.getSavedProgress({
  book: phraseBook,
  unit: "all",
  kind: "word",
  mode: "card",
});
assert.notStrictEqual(
  wordProgressAfterPhrase && wordProgressAfterPhrase.index,
  2,
  "词组进度不应覆盖单词进度",
);

store.setDefinitionMode("en");
assert.strictEqual(store.getDefinitionMode(), "en", "英文释义偏好应保存");
const definitionPractice = createPage({
  book: "b5",
  unit: "all",
  kind: "word",
  mode: "spell",
  index: "0",
});
definitionPractice.selectDefinitionMode({
  currentTarget: { dataset: { mode: "both" } },
});
assert.strictEqual(
  definitionPractice.data.definitionMode,
  "both",
  "双语释义选择应立即更新状态",
);
assert.ok(
  definitionPractice.data.currentView.showChinese,
  "切换双语后应立即显示中文释义",
);
assert.ok(
  definitionPractice.data.currentView.showEnglish,
  "切换双语后应立即显示英文释义",
);
assert.ok(
  definitionPractice.data.currentView.spellPrompt.includes(" · "),
  "切换双语后拼写提示应立即包含双语释义",
);
store.setDefinitionMode("en");
const choicePractice = createPage({
  book: "b5",
  unit: "all",
  kind: "word",
  mode: "choice",
  index: "0",
});
choicePractice.selectDefinitionMode({
  currentTarget: { dataset: { mode: "both" } },
});
choicePractice.data.options.forEach((item) => {
  assert.strictEqual(
    item.optionText,
    choicePractice.definitionText(item, "both"),
    "选择题选项应立即使用最新释义模式",
  );
});
const switchedPractice = createPage({
  book: "b5",
  unit: "all",
  kind: "word",
  mode: "card",
  index: "0",
});
switchedPractice.switchMode({ currentTarget: { dataset: { mode: "spell" } } });
assert.strictEqual(
  switchedPractice.data.displayTitle,
  "拼写练习",
  "切换练习模式后应使用新模式重新加载内容",
);
const phrasePractice = createPage({
  book: phraseBook,
  unit: "all",
  kind: "phrase",
  mode: "card",
  index: "0",
});
assert.strictEqual(phrasePractice.data.kind, "phrase");
assert.strictEqual(
  phrasePractice.data.currentView.definitionZh,
  phrases[0].e,
  "词组中文释义应按规范化字段展示",
);

console.log("practice progress tests passed");
