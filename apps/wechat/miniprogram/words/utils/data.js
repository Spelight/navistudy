const { words, books, unitLabels } = require('../data/vocab');

function getItemKey(item) {
  if (!item) return '';
  return item.key || `${item.t || 'w'}_${item.w || item.e || ''}_${item.u || ''}`;
}

function wordOnly(list) {
  return list.filter(item => item && item.t === 'w' && item.w);
}

function getAllWords() {
  return wordOnly(words);
}

function getBookById(bookId) {
  return books.find(book => book.id === bookId) || books[0];
}

function getBookIdByUnit(unit) {
  const n = Number(unit);
  const book = books.find(item => item.units.includes(n));
  return book ? book.id : '';
}

function getWordsByScope(bookId, unit) {
  const book = getBookById(bookId);
  const allowed = new Set(book.units);
  let list = words.filter(item => allowed.has(Number(item.u)));
  if (unit && unit !== 'all') {
    list = list.filter(item => Number(item.u) === Number(unit));
  }
  return wordOnly(list);
}

function searchWords(query, bookId) {
  const q = String(query || '').trim().toLowerCase();
  const source = bookId ? getWordsByScope(bookId, 'all') : wordOnly(words);
  if (!q) return source.slice(0, 80);
  return source.filter(item =>
    String(item.w || '').toLowerCase().includes(q) ||
    String(item.c || '').toLowerCase().includes(q) ||
    String(item.e || '').toLowerCase().includes(q)
  ).slice(0, 120);
}

function shuffle(list) {
  const arr = list.slice();
  for (let i = arr.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function unitShortLabel(unit) {
  const label = unitLabels[unit] || `Unit ${unit}`;
  return label.replace('Book ', 'B').replace(' Unit ', ' U');
}

function bookStats() {
  const order = ['b5', 'b4', 'b3', 'dual'];
  return books.slice().sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id)).map(book => {
    const list = getWordsByScope(book.id, 'all');
    return {
      ...book,
      count: list.length,
      unitText: book.units.map(unit => unitShortLabel(unit).replace(/^B\d\s/, '')).join(' / '),
      unitOptions: book.units.map(unit => ({
        unit,
        label: unitShortLabel(unit).replace(/^B\d\s/, ''),
        count: getWordsByScope(book.id, unit).length
      }))
    };
  });
}

module.exports = {
  words,
  books,
  unitLabels,
  getItemKey,
  getAllWords,
  getBookById,
  getBookIdByUnit,
  getWordsByScope,
  searchWords,
  shuffle,
  unitShortLabel,
  bookStats
};
