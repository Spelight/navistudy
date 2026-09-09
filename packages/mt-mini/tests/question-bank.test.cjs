const assert = require('assert');
const path = require('path');

const root = path.resolve(__dirname, '..');
const questions = require(path.join(root, 'miniprogram', 'utils', 'questions.js'));

assert.ok(questions.bank.questions.length > 0, 'public fixture should contain questions');
assert.ok(questions.bank.chapters.length > 0, 'public fixture should contain chapters');
assert.ok(questions.filterQuestions({ type: 'objective' }).length > 0, 'objective filter should work');
assert.ok(questions.filterQuestions({ chapter: questions.bank.chapters[0] }).length > 0, 'chapter filter should work');

const single = questions.bank.questions.find(item => item.type === 'single');
const multiple = questions.bank.questions.find(item => item.type === 'multiple');
assert.ok(questions.checkAnswer(single, single.answer), 'single answer should validate');
assert.ok(questions.checkAnswer(multiple, multiple.answer.slice().reverse()), 'multiple answer order should not matter');
assert.ok(questions.answerText(single).includes(single.answer[0]), 'answer text should include the answer');

console.log('question-bank.test: OK');
