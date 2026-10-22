const bank = require('../data/question-bank');

const typeNames = {
  single: '单选题',
  multiple: '多选题',
  truefalse: '判断题',
  short: '简答题'
};

function shuffle(items) {
  const result = items.slice();
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    const current = result[index];
    result[index] = result[target];
    result[target] = current;
  }
  return result;
}

function getQuestion(id) {
  return bank.questions.find(item => item.id === id) || null;
}

function filterQuestions(filters = {}) {
  const chapter = filters.chapter || 'all';
  const type = filters.type || 'all';
  const query = String(filters.query || '').trim().toLowerCase();
  return bank.questions.filter(question => {
    if (filters.hideLegacy && question.legacy) return false;
    if (chapter !== 'all' && question.chapter !== chapter) return false;
    if (type === 'objective' && question.type === 'short') return false;
    if (type !== 'all' && type !== 'objective' && question.type !== type) return false;
    if (!query) return true;
    const haystack = [
      question.stem,
      question.chapter,
      question.source
    ].concat(
      question.sources || [],
      (question.options || []).map(option => option.text)
    ).join(' ').toLowerCase();
    return haystack.includes(query);
  });
}

function normalizeAnswer(question) {
  if (question.type === 'truefalse') return [question.answer];
  if (question.type === 'short') return [String(question.answer || '')];
  return Array.isArray(question.answer) ? question.answer.slice().sort() : [];
}

function checkAnswer(question, selected) {
  const expected = normalizeAnswer(question);
  const actual = (selected || []).slice().sort();
  return expected.join('|') === actual.join('|');
}

function answerText(question) {
  if (question.type === 'truefalse' || question.type === 'short') return String(question.answer || '');
  const keys = normalizeAnswer(question);
  const labels = keys.map(key => {
    const option = (question.options || []).find(item => item.key === key);
    return option ? `${key}. ${option.text}` : key;
  });
  return labels.join('；');
}

function typeName(type) {
  return typeNames[type] || '题目';
}

module.exports = {
  bank,
  typeNames,
  shuffle,
  getQuestion,
  filterQuestions,
  normalizeAnswer,
  checkAnswer,
  answerText,
  typeName
};
