function isoDate(date) {
  const value = new Date(date);
  return `${value.getFullYear()}-${String(value.getMonth() + 1).padStart(2, '0')}-${String(value.getDate()).padStart(2, '0')}`;
}

function defaultForm() {
  const now = new Date();
  const tomorrow = new Date(now.getTime() + 86400000);
  const nextWeek = new Date(now.getTime() + 7 * 86400000);
  return {
    title: '空闲时间收集', termLabel: '共同时间', weekLabel: '活动安排', nameRequired: true,
    opensDate: isoDate(now), opensTime: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
    closesDate: isoDate(nextWeek), closesTime: '23:00', dateStart: isoDate(tomorrow), dateEnd: isoDate(nextWeek)
  };
}

function fromSession(session) {
  const split = value => String(value || '').replace(' ', 'T').split('T');
  const opens = split(session.opensAt);
  const closes = split(session.closesAt);
  return Object.assign(defaultForm(), session, { opensDate: opens[0], opensTime: (opens[1] || '').slice(0, 5), closesDate: closes[0], closesTime: (closes[1] || '').slice(0, 5) });
}

function payload(form) {
  return {
    title: form.title, termLabel: form.termLabel, weekLabel: form.weekLabel, nameRequired: Boolean(form.nameRequired),
    opensAt: `${form.opensDate}T${form.opensTime}:00`, closesAt: `${form.closesDate}T${form.closesTime}:00`,
    dateStart: form.dateStart, dateEnd: form.dateEnd
  };
}

module.exports = { defaultForm, fromSession, payload };
