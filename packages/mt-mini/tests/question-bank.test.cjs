const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const questions = require(path.join(root, 'miniprogram', 'utils', 'questions.js'));
const materials = require(path.join(root, 'miniprogram', 'data', 'material-files.js'));

assert.strictEqual(questions.bank.questions.length, 4, '题目总数应为 4');
assert.strictEqual(questions.bank.chapters.length, 1, '章节数应为 6');
assert.strictEqual(questions.filterQuestions({ type: 'objective' }).length, 3, '客观题数量不正确');
assert.strictEqual(questions.filterQuestions({ type: 'short' }).length, 1, '简答题数量不正确');
assert.ok(questions.filterQuestions({ chapter: '学习方法' }).length > 0, '章节筛选异常');
const legacyCount = questions.bank.questions.filter(item => item.legacy).length;
const currentQuestions = questions.filterQuestions({ hideLegacy: true });
assert.strictEqual(currentQuestions.length, 4 - legacyCount, '不看历史题数量不正确');
assert.ok(currentQuestions.every(item => !item.legacy), '不看历史题仍返回了历史题');
assert.strictEqual(Object.keys(materials.files).length, 0, '参考资料下载清单应包含 19 份文件');
assert.deepStrictEqual(Object.keys(materials.files).sort(), questions.bank.sources.map(item => item.id).sort(), '参考资料下载清单与题库来源不一致');

const single = questions.bank.questions.find(item => item.type === 'single');
const multiple = questions.bank.questions.find(item => item.type === 'multiple');
const judge = questions.bank.questions.find(item => item.type === 'truefalse');
assert.ok(questions.checkAnswer(single, single.answer), '单选答案校验失败');
assert.ok(questions.checkAnswer(multiple, multiple.answer.slice().reverse()), '多选答案顺序不应影响校验');
assert.ok(questions.checkAnswer(judge, [judge.answer]), '判断题答案校验失败');
assert.ok(questions.answerText(single).includes(single.answer[0]), '答案文本缺少选项键');

console.log('question-bank.test: OK');
