const STORAGE_KEY = "military-theory-study-v1";

export const emptyStudyState = {
  attempts: {},
  favorites: [],
  wrong: [],
  sessions: [],
  syncMeta: {},
};

export function loadStudyState() {
  try {
    const saved = JSON.parse(localStorage.getItem(STORAGE_KEY));
    return saved ? { ...emptyStudyState, ...saved } : emptyStudyState;
  } catch {
    return emptyStudyState;
  }
}

export function saveStudyState(state) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
}

export function toSyncState(state) {
  const answers = { ...(state.attempts || {}) };
  const wrongbook = Object.fromEntries((state.wrong || []).map((id) => {
    const answer = answers[id] || {};
    return [id, {
      attempts: Number(answer.attempts || 1),
      selected: Array.isArray(answer.selected) ? answer.selected : [],
      lastWrongAt: Date.parse(answer.updatedAt || "") || Date.now(),
    }];
  }));
  const mastered = Object.fromEntries(Object.entries(answers)
    .filter(([, answer]) => Number(answer.correct || 0) > 0)
    .map(([id]) => [id, true]));
  const payload = {
    favorites: [...(state.favorites || [])],
    answers,
    wrongbook,
    mastered,
    sessions: state.sessions || [],
  };
  if (Object.prototype.hasOwnProperty.call(state.syncMeta || {}, "lastProgress")) payload.lastProgress = state.syncMeta.lastProgress;
  if (Object.prototype.hasOwnProperty.call(state.syncMeta || {}, "progressPositions")) payload.progressPositions = state.syncMeta.progressPositions;
  if (Object.prototype.hasOwnProperty.call(state.syncMeta || {}, "studyEvents")) payload.studyEvents = state.syncMeta.studyEvents;
  return payload;
}

export function fromSyncState(remote) {
  const data = remote && typeof remote === "object" ? remote : {};
  return {
    attempts: data.answers && typeof data.answers === "object" ? data.answers : {},
    favorites: Array.isArray(data.favorites) ? data.favorites : [],
    wrong: data.wrongbook && typeof data.wrongbook === "object" ? Object.keys(data.wrongbook) : [],
    sessions: Array.isArray(data.sessions) ? data.sessions : [],
    syncMeta: {
      lastProgress: data.lastProgress || null,
      progressPositions: data.progressPositions || {},
      studyEvents: Array.isArray(data.studyEvents) ? data.studyEvents : [],
    },
  };
}

export function recordAnswer(state, questionId, correct, selected) {
  const previous = state.attempts[questionId] || { attempts: 0, correct: 0 };
  const attempt = {
    attempts: previous.attempts + 1,
    correct: previous.correct + (correct ? 1 : 0),
    lastCorrect: correct,
    selected,
    updatedAt: new Date().toISOString(),
  };
  const wrong = new Set(state.wrong);
  if (correct) wrong.delete(questionId);
  else wrong.add(questionId);

  return {
    ...state,
    attempts: { ...state.attempts, [questionId]: attempt },
    wrong: [...wrong],
  };
}

export function toggleInList(list, id) {
  return list.includes(id) ? list.filter((item) => item !== id) : [...list, id];
}

export function getStudyStats(state, allowedQuestions = null) {
  const allowedIds = Array.isArray(allowedQuestions)
    ? new Set(allowedQuestions.map((question) => typeof question === "string" ? question : question.id))
    : null;
  const attempts = Object.entries(state.attempts)
    .filter(([id]) => !allowedIds || allowedIds.has(id))
    .map(([, attempt]) => attempt);
  const totalAttempts = attempts.reduce((sum, item) => sum + item.attempts, 0);
  const correctAttempts = attempts.reduce((sum, item) => sum + item.correct, 0);
  return {
    practiced: attempts.length,
    totalAttempts,
    correctAttempts,
    accuracy: totalAttempts ? Math.round((correctAttempts / totalAttempts) * 100) : 0,
    wrong: state.wrong.filter((id) => !allowedIds || allowedIds.has(id)).length,
    favorites: state.favorites.filter((id) => !allowedIds || allowedIds.has(id)).length,
  };
}

export function exportStudyState(state) {
  const blob = new Blob([JSON.stringify(state, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = `NaviMT军理通-学习记录-${new Date().toISOString().slice(0, 10)}.json`;
  anchor.click();
  URL.revokeObjectURL(url);
}

export async function importStudyState(file) {
  if (file.size > 2 * 1024 * 1024) throw new Error("记录文件不能超过 2 MB。");
  const parsed = JSON.parse(await file.text());
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("这不是有效的学习记录文件。");
  if (parsed.attempts && typeof parsed.attempts !== "object") throw new Error("学习记录格式不正确。");
  return {
    attempts: parsed.attempts || {},
    favorites: Array.isArray(parsed.favorites) ? parsed.favorites : [],
    wrong: Array.isArray(parsed.wrong) ? parsed.wrong : [],
    sessions: Array.isArray(parsed.sessions) ? parsed.sessions : [],
    syncMeta: parsed.syncMeta && typeof parsed.syncMeta === "object" ? parsed.syncMeta : {},
  };
}
