const passport = require('../../utils/passport');
const KEY = 'naviplan_data_v1';

function load() { return wx.getStorageSync(KEY) || null; }
function replace(snapshot) { wx.setStorageSync(KEY, snapshot); return snapshot; }
function sync(snapshot) { replace(snapshot); passport.queueSync('plan', snapshot); }
function flatten(groups, depth = 0) {
  return (groups || []).reduce((all, group) => all.concat([{ group, depth }], flatten(group.children || [], depth + 1)), []);
}
function actionableAudits(audits) {
  const ids = {};
  (audits || []).forEach(item => { ids[item.group.id] = true; });
  return (audits || []).filter(item => !(item.group.children || []).length || item.group.children.some(child => !ids[child.id]));
}
function futureCourses(snapshot) {
  const audit = snapshot && snapshot.audit || {};
  const byId = {};
  (snapshot && snapshot.coursePool || []).forEach(course => { byId[course.id] = course; });
  (audit.courses || []).forEach(course => { byId[course.id] = Object.assign({}, byId[course.id] || {}, course); });
  const requirements = {};
  const unmet = {};
  const requiredIds = {};
  const choiceIds = {};
  actionableAudits(audit.requirementAudits).forEach(item => {
    Array.from(new Set((item.candidateCourseIds || []).concat(item.matchedCourseIds || []))).forEach(id => {
      requirements[id] = Array.from(new Set((requirements[id] || []).concat(item.group.name)));
      if (!item.satisfied) unmet[id] = Array.from(new Set((unmet[id] || []).concat(item.group.name)));
      if (!item.satisfied && item.group.category === 'REQUIRED' && item.group.ruleKind !== 'CHOOSE_COURSES_FROM_POOL') requiredIds[id] = true;
      if (!item.satisfied && (item.group.ruleKind === 'CHOOSE_COURSES_FROM_POOL' || ['LIMITED_ELECTIVE', 'MAJOR_ELECTIVE'].includes(item.group.category))) choiceIds[id] = true;
    });
  });
  const recommendationByCourse = {};
  (snapshot && snapshot.recommendations || []).forEach(item => { recommendationByCourse[`${item.courseCode || ''}|${item.courseName}`] = item; });
  const grouped = {};
  Object.keys(byId).forEach(id => {
    const course = byId[id];
    if (course.selectedThisTerm || ['COMPLETED', 'EXEMPTED', 'IN_PROGRESS', 'IGNORED'].includes(course.status)) return;
    const mapped = requirements[id] || [];
    const hasUnmet = (unmet[id] || []).length > 0;
    const required = Boolean(requiredIds[id]) || (course.status === 'FAILED' && mapped.length > 0 && (course.courseNature || '').includes('必修'));
    const limited = !required && Boolean(choiceIds[id]);
    if (!hasUnmet && course.status !== 'FAILED') return;
    if (!required && !limited) return;
    const key = String(course.courseCode || course.id || course.courseName).trim().toLowerCase();
    const current = grouped[key];
    grouped[key] = {
      course: current && current.course.status === 'FAILED' ? current.course : course,
      required: required || Boolean(current && current.required),
      limited: limited || Boolean(current && current.limited),
      requirements: Array.from(new Set((current && current.requirements || []).concat(requirements[id] || []))),
      unmetRequirements: Array.from(new Set((current && current.unmetRequirements || []).concat(unmet[id] || [])))
    };
  });
  const rank = { FAILED: 0, PLANNED: 1, CANDIDATE: 2 };
  const sort = (a, b) => (rank[a.course.status] ?? 3) - (rank[b.course.status] ?? 3)
    || Number(Boolean(b.course.offeredThisTerm)) - Number(Boolean(a.course.offeredThisTerm))
    || a.course.courseName.localeCompare(b.course.courseName, 'zh-CN');
  const required = [];
  const limited = [];
  Object.keys(grouped).forEach(key => {
    const item = grouped[key];
    item.course.displayNature = item.course.courseNature || (item.required ? '必修' : '限修');
    item.course.displayTerm = item.course.plannedTermName || item.course.termName || '学期待确认';
    item.requirementText = item.requirements.join(' / ');
    const recommendation = recommendationByCourse[`${item.course.courseCode || ''}|${item.course.courseName}`];
    item.course.advice = recommendation && recommendation.reason || (item.course.status === 'FAILED'
      ? '未通过，建议优先重修'
      : item.required
        ? `用于补足 ${item.unmetRequirements.join(' / ') || '对应必修课组'}`
        : item.unmetRequirements.length
          ? `可补足 ${item.unmetRequirements.join(' / ')}，按缺口选够即可`
          : '当前没有需要它补足的课组缺口');
    (item.required ? required : limited).push(item);
  });
  return { required: required.sort(sort), limited: limited.sort(sort) };
}
function summary(snapshot) {
  const audit = snapshot && snapshot.audit;
  if (!audit) return { percent: 0, earned: 0, active: 0, missing: 0, gaps: [] };
  const covered = audit.totalEarnedCredits + audit.totalInProgressCredits + audit.totalPlannedCredits;
  const gaps = actionableAudits(audit.requirementAudits).filter(item => !item.satisfied);
  const future = futureCourses(snapshot);
  return {
    percent: Math.min(100, Math.round(covered / Math.max(1, audit.totalRequiredCredits) * 100)),
    earned: audit.totalEarnedCredits || 0,
    active: (audit.totalInProgressCredits || 0) + (audit.totalPlannedCredits || 0),
    missing: Math.max(0, (audit.totalRequiredCredits || 0) - covered),
    gaps,
    futureRequired: future.required,
    futureLimited: future.limited
  };
}
module.exports = { load, replace, sync, flatten, summary, futureCourses };
