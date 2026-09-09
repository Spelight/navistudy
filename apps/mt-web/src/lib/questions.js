export const typeNames = {
  single: "单选题",
  multiple: "多选题",
  truefalse: "判断题",
  short: "简答题",
};

export function shuffle(items) {
  const result = [...items];
  for (let index = result.length - 1; index > 0; index -= 1) {
    const target = Math.floor(Math.random() * (index + 1));
    [result[index], result[target]] = [result[target], result[index]];
  }
  return result;
}

export function checkAnswer(question, selected) {
  if (question.type === "truefalse") return selected[0] === question.answer;
  const expected = [...question.answer].sort().join("");
  return [...selected].sort().join("") === expected;
}

export function answerLabel(question) {
  if (question.type === "short" || question.type === "truefalse") return question.answer;
  return question.answer.join("、");
}

export function matchesQuery(question, query) {
  const term = query.trim().toLowerCase();
  if (!term) return true;
  const haystack = [
    question.stem,
    question.chapter,
    question.source,
    ...question.sources,
    ...question.options.map((option) => option.text),
  ].join(" ").toLowerCase();
  return haystack.includes(term);
}
