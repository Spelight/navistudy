function formatUpdatedAt(value) {
  if (value === null || value === undefined || value === '') return '时间未知';
  const numeric = typeof value === 'number' || /^\d+$/.test(String(value));
  const number = numeric ? Number(value) : null;
  if (numeric && (!Number.isFinite(number) || number <= 0)) return '时间未知';
  const date = new Date(numeric ? (number < 1e12 ? number * 1000 : number) : value);
  if (!Number.isFinite(date.getTime())) return '时间未知';
  const pad = number => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

module.exports = { formatUpdatedAt };
