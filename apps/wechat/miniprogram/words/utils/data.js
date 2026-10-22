const { words, books, unitLabels } = require('../data/vocab');

function getItemKey(item) {
  if (!item) return '';
  return item.key || `${item.t || 'w'}_${item.w || item.e || ''}_${item.u || ''}`;
}

function normalizeKind(kind) {
  return kind === 'phrase' ? 'phrase' : 'word';
}

function itemKind(item) {
  return item && item.t === 'trans' ? 'phrase' : 'word';
}

function normalizeItem(item) {
  const source = item || {};
  const kind = itemKind(source);
  return Object.assign({}, source, {
    kind,
    term: source.w || '',
    definitionEn: kind === 'word' ? String(source.e || '') : '',
    definitionZh: kind === 'phrase' ? String(source.e || '') : String(source.c || '')
  });
}

function itemsOnly(list, kind) {
  const normalizedKind = normalizeKind(kind);
  return list.filter(item => item && item.w && itemKind(item) === normalizedKind);
}

function getAllWords() {
  return itemsOnly(words, 'word');
}

function getAllPhrases() {
  return itemsOnly(words, 'phrase');
}

function getBookById(bookId) {
  return books.find(book => book.id === bookId) || books[0];
}

function getBookIdByUnit(unit) {
  const n = Number(unit);
  const book = books.find(item => item.units.includes(n));
  return book ? book.id : '';
}

function getItemsByScope(bookId, unit, kind = 'word') {
  const book = getBookById(bookId);
  const allowed = new Set(book.units);
  let list = words.filter(item => allowed.has(Number(item.u)));
  if (unit && unit !== 'all') {
    list = list.filter(item => Number(item.u) === Number(unit));
  }
  return itemsOnly(list, kind);
}

function getWordsByScope(bookId, unit) {
  return getItemsByScope(bookId, unit, 'word');
}

function getPhrasesByScope(bookId, unit) {
  return getItemsByScope(bookId, unit, 'phrase');
}

function searchWords(query, bookId, kind = 'word') {
  const q = String(query || '').trim().toLowerCase();
  const source = bookId ? getItemsByScope(bookId, 'all', kind) : itemsOnly(words, kind);
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
    const phrases = getPhrasesByScope(book.id, 'all');
    return Object.assign({}, book, {
      count: list.length,
      phraseCount: phrases.length,
      unitText: book.units.map(unit => unitShortLabel(unit).replace(/^B\d\s/, '')).join(' / '),
      unitOptions: book.units.map(unit => ({
        unit,
        label: unitShortLabel(unit).replace(/^B\d\s/, ''),
        count: getWordsByScope(book.id, unit).length
      }))
    });
  });
}

module.exports = {
  words,
  books,
  unitLabels,
  getItemKey,
  itemKind,
  normalizeItem,
  getAllWords,
  getAllPhrases,
  getBookById,
  getBookIdByUnit,
  getWordsByScope,
  getPhrasesByScope,
  getItemsByScope,
  searchWords,
  shuffle,
  unitShortLabel,
  bookStats
};
