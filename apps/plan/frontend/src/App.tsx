import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BookOpen,
  CheckCircle2,
  ClipboardCheck,
  GitBranch,
  GraduationCap,
  KeyRound,
  Layers3,
  LayoutDashboard,
  ListChecks,
  Loader2,
  LogIn,
  RefreshCcw,
  Save,
  Search,
  Settings,
  Table2
} from "lucide-react";
import {
  CaptchaChallenge,
  evaluatePlan,
  importPlan,
  loadPassportSession,
  loadPlanPassportSync,
  passportLoginUrl,
  preloadBuaa,
  savePlanPassportSync
} from "./api";
import { buildFutureCourseBuckets, type FutureCourseItem } from "./futureCourses";
import type {
  CourseOverride,
  CourseRecommendation,
  CourseRecordStatus,
  CreditAudit,
  DegreeProfile,
  PassportAccount,
  PlanSnapshot,
  RequirementAudit,
  RequirementCategory,
  RequirementRuleKind,
  StudentCourseRecord,
  Term
} from "./types";

type ViewId = "overview" | "plan" | "terms" | "audit" | "recommendations" | "settings";
type BusyAction = "none" | "buaa" | "course";

const categoryLabels: Record<RequirementCategory, string> = {
  REQUIRED: "必修",
  MAJOR_ELECTIVE: "专业选修",
  LIMITED_ELECTIVE: "限修",
  GENERAL: "通识",
  AESTHETIC: "美育",
  LABOR: "劳育",
  PRACTICE: "实践",
  FREE_ELECTIVE: "任选/待确认"
};

const statusLabels: Record<CourseRecordStatus, string> = {
  PLANNED: "规划",
  IN_PROGRESS: "在修",
  COMPLETED: "已修",
  FAILED: "未通过",
  EXEMPTED: "免修",
  IGNORED: "不计入",
  CANDIDATE: "可选"
};

const ruleKindLabels: Record<RequirementRuleKind, string> = {
  CREDIT_TOTAL: "学分累计",
  CHOOSE_COURSES_FROM_POOL: "选课池",
  LANGUAGE_TRACK: "语言轨道",
  ADDITIONAL_INDICATOR: "附加指标"
};

const ruleKindDescriptions: Record<RequirementRuleKind, string> = {
  CREDIT_TOTAL: "按这条分支累计要求学分；如果属于必修大类，就优先当作硬要求逐项核对。",
  CHOOSE_COURSES_FROM_POOL: "从这一池候选课里修够学分或门数即可，池内课程不是全部必修。",
  LANGUAGE_TRACK: "先选定一门语言方向，再连续修读同一序列；不是所有二外语言都要修。",
  ADDITIONAL_INDICATOR: "按课程标签、学时或附加指标累计，重点看指标是否达标。"
};

const ruleKindGuide: Array<{ kind: RequirementRuleKind; label: string; description: string }> = [
  { kind: "CREDIT_TOTAL", label: "必修/累计", description: "看缺口，逐项确认是否已通过。" },
  { kind: "CHOOSE_COURSES_FROM_POOL", label: "限修/选修池", description: "池内任选，修够学分或门数。" },
  { kind: "LANGUAGE_TRACK", label: "二外轨道", description: "只需完成一门语言序列，不必修完整个课程池。" },
  { kind: "ADDITIONAL_INDICATOR", label: "美育/劳育指标", description: "看标签、学时和指标达标。" }
];

const categoryOrder: RequirementCategory[] = [
  "REQUIRED",
  "LIMITED_ELECTIVE",
  "MAJOR_ELECTIVE",
  "GENERAL",
  "AESTHETIC",
  "LABOR",
  "PRACTICE",
  "FREE_ELECTIVE"
];

const categoryDescriptions: Record<RequirementCategory, string> = {
  REQUIRED: "逐门或按组必须完成，优先确认是否已通过。",
  LIMITED_ELECTIVE: "限修/限选课池，通常在给定范围内修够门数或学分即可。",
  MAJOR_ELECTIVE: "专业选修池，用来补足方向学分，不代表池内全修。",
  GENERAL: "通识类要求，按培养方案给定规则累计。",
  AESTHETIC: "美育等标签/指标类要求，按课程标签或指标累计。",
  LABOR: "劳育等标签/学时类要求，按课程标签或学时累计。",
  PRACTICE: "实习、社会课堂、毕业设计等实践环节。",
  FREE_ELECTIVE: "系统暂未能稳定归类的课程，建议手动校正。"
};

const effectiveStatuses = new Set<CourseRecordStatus>(["COMPLETED", "EXEMPTED", "IN_PROGRESS", "PLANNED"]);

const navItems: Array<{ id: ViewId; label: string; icon: typeof LayoutDashboard }> = [
  { id: "overview", label: "总览", icon: LayoutDashboard },
  { id: "plan", label: "培养方案", icon: BookOpen },
  { id: "terms", label: "学期课表", icon: Table2 },
  { id: "audit", label: "学分审计", icon: ClipboardCheck },
  { id: "recommendations", label: "选课规划", icon: ListChecks },
  { id: "settings", label: "设置", icon: Settings }
];

const emptyAudit: CreditAudit = {
  generatedAt: Date.now(),
  totalEarnedCredits: 0,
  totalInProgressCredits: 0,
  totalPlannedCredits: 0,
  totalRequiredCredits: 0,
  plan: {
    id: "not-imported",
    version: "empty",
    studentGrade: "待导入",
    college: "待导入",
    major: "待导入",
    source: "NaviPlan empty state",
    updatedAt: Date.now(),
    groups: []
  },
  courses: [],
  requirementAudits: [],
  risks: []
};

const emptyProfile: DegreeProfile = {
  username: null,
  grade: "待导入",
  college: "待导入",
  major: "待导入",
  portal: "undergraduate-byxt",
  autoDetected: false,
  message: "登录后从个人学业进度读取真实信息。"
};

function formatCredits(value: number) {
  return Number.isInteger(value) ? `${value}` : value.toFixed(1);
}

function progressPercent(item: RequirementAudit) {
  const total = item.earnedCredits + item.inProgressCredits + item.plannedCredits;
  if (item.group.requiredCredits <= 0) return 100;
  return Math.min(100, Math.round((total / item.group.requiredCredits) * 100));
}

function missingTotalCredits(audit: CreditAudit) {
  return Math.max(0, audit.totalRequiredCredits - audit.totalEarnedCredits - audit.totalInProgressCredits - audit.totalPlannedCredits);
}

function sortAuditsByUrgency(items: RequirementAudit[]) {
  return [...items].sort((a, b) => {
    const aNeed = Number(!a.satisfied);
    const bNeed = Number(!b.satisfied);
    if (aNeed !== bNeed) return bNeed - aNeed;
    if (a.missingCredits !== b.missingCredits) return b.missingCredits - a.missingCredits;
    return a.group.name.localeCompare(b.group.name);
  });
}

function actionableRequirementAudits(items: RequirementAudit[]) {
  const auditIds = new Set(items.map((item) => item.group.id));
  return items.filter((item) =>
    !(item.group.children?.length) || item.group.children.some((child) => !auditIds.has(child.id))
  );
}

function rootRequirementAudits(items: RequirementAudit[]) {
  const childIds = new Set(items.flatMap((item) => item.group.children?.map((child) => child.id) ?? []));
  return items.filter((item) => !childIds.has(item.group.id));
}

function recommendationsForGroup(recommendations: CourseRecommendation[], groupId: string) {
  return recommendations.filter((item) => item.groupId === groupId);
}

function requirementStatusLabel(item: RequirementAudit) {
  if (item.satisfied) return "已满足";
  if (item.group.ruleKind === "LANGUAGE_TRACK") return "轨道未完成";
  if (item.group.ruleKind === "CHOOSE_COURSES_FROM_POOL") return "需要选课";
  if (item.candidateCourseIds.length > 0) return "有候选池";
  return "需要补";
}

function requirementAction(item: RequirementAudit, recommendations: CourseRecommendation[]) {
  const groupRecommendations = recommendationsForGroup(recommendations, item.group.id);
  if (item.satisfied) return "保持当前修读记录即可，后续只需确认成绩是否通过。";
  if (item.group.ruleKind === "LANGUAGE_TRACK") {
    return groupRecommendations[0]
      ? `优先延续同一二外轨道：${groupRecommendations[0].courseName}。`
      : "先确定一门二外语言轨道，再连续补齐后续序列。";
  }
  if (item.group.ruleKind === "CHOOSE_COURSES_FROM_POOL") {
    return groupRecommendations.length
      ? `从候选池里优先选 ${groupRecommendations.slice(0, 2).map((course) => course.courseName).join("、")}。`
      : "从该课组候选池中补足门数或学分。";
  }
  if (groupRecommendations.length) return `下学期可优先看 ${groupRecommendations[0].courseName}。`;
  return "先在培养方案页确认课程归属，再决定是否需要补课。";
}

function requirementRuleSummary(group: RequirementAudit["group"]) {
  const parts: string[] = [];
  if (group.requiredCredits > 0) parts.push(`要求 ${formatCredits(group.requiredCredits)} 学分`);
  if (group.requiredCourses > 0) parts.push(`${group.requiredCourses} 门`);
  if ((group.children ?? []).length > 0) parts.push(`${group.children?.length ?? 0} 个子分支`);
  if (parts.length === 0) parts.push("无单独学分下限");
  return parts.join(" / ");
}

function countRequirementNodes(group: RequirementAudit["group"]): number {
  return 1 + (group.children ?? []).reduce((sum, child) => sum + countRequirementNodes(child), 0);
}

function groupedAuditsByCategory(audits: RequirementAudit[]) {
  const roots = rootRequirementAudits(audits);
  return categoryOrder
    .map((category) => ({
      category,
      audits: sortAuditsByUrgency(roots.filter((item) => item.group.category === category))
    }))
    .filter((bucket) => bucket.audits.length > 0);
}

function categorySummary(audits: RequirementAudit[]) {
  return {
    earned: audits.reduce((sum, item) => sum + item.earnedCredits, 0),
    inProgress: audits.reduce((sum, item) => sum + item.inProgressCredits, 0),
    planned: audits.reduce((sum, item) => sum + item.plannedCredits, 0),
    missing: audits.reduce((sum, item) => sum + item.missingCredits, 0),
    candidates: audits.reduce((sum, item) => sum + item.candidateCourseIds.length, 0),
    nodes: audits.reduce((sum, item) => sum + countRequirementNodes(item.group), 0)
  };
}

function gradeLabel(grade: string) {
  return grade.trim().endsWith("级") ? grade.trim() : `${grade.trim()} 级`;
}

function requirementCourses(audit: CreditAudit, item: RequirementAudit, candidate: boolean) {
  const ids = new Set(candidate ? item.candidateCourseIds : item.matchedCourseIds.filter((id) => !item.candidateCourseIds.includes(id)));
  return audit.courses.filter((course) => ids.has(course.id));
}

function languageTrack(courseName: string) {
  const match = courseName.match(/二外(.+?)[（(](\d+)[）)]/);
  return match ? { language: match[1], sequence: Number(match[2]) } : null;
}

function languageTrackSummary(item: RequirementAudit, courses: StudentCourseRecord[]) {
  if (item.group.ruleKind !== "LANGUAGE_TRACK") return null;
  const active = courses.filter((course) => effectiveStatuses.has(course.status)).map((course) => languageTrack(course.courseName)).filter(Boolean) as Array<{ language: string; sequence: number }>;
  const language = active[0]?.language;
  const done = active.filter((track) => track.language === language).length;
  const candidates = courses.filter((course) => course.status === "CANDIDATE").map((course) => ({ course, track: languageTrack(course.courseName) })).filter((item) => item.track);
  const next = language ? candidates.find((item) => item.track?.language === language)?.course.courseName : candidates[0]?.course.courseName;
  if (!language) return next ? `还未选择语言轨道，可先从 ${next} 等候选中选择一条线。` : "还未选择语言轨道。";
  return `已选择：${language}，已计入 ${done} 门${next ? `，下一门建议：${next}` : ""}。`;
}

function App() {
  const [activeView, setActiveView] = useState<ViewId>("overview");
  const [audit, setAudit] = useState<CreditAudit>(emptyAudit);
  const [profile, setProfile] = useState<DegreeProfile>(emptyProfile);
  const [recommendations, setRecommendations] = useState<CourseRecommendation[]>([]);
  const [passportAccount, setPassportAccount] = useState<PassportAccount | null>(null);
  const [snapshot, setSnapshot] = useState<PlanSnapshot | null>(null);
  const [revision, setRevision] = useState(0);
  const [csrfToken, setCsrfToken] = useState("");
  const [selectedCourse, setSelectedCourse] = useState<StudentCourseRecord | null>(null);
  const [busy, setBusy] = useState<BusyAction>("none");
  const [status, setStatus] = useState("正在准备学业规划数据...");
  const [buaaLogin, setBuaaLogin] = useState({ username: "", password: "", captcha: "", clientId: "", execution: "", captchaImage: "" });
  const [filter, setFilter] = useState("");

  const groupedByTerm = useMemo(() => {
    const groups = new Map<string, StudentCourseRecord[]>();
    audit.courses.forEach((item) => {
      const key = `${item.termCode} ${item.termName}`;
      groups.set(key, [...(groups.get(key) ?? []), item]);
    });
    return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
  }, [audit.courses]);

  const filteredCourses = useMemo(() => {
    const keyword = filter.trim().toLowerCase();
    if (!keyword) return audit.courses;
    return audit.courses.filter((item) =>
      [item.courseName, item.courseCode ?? "", item.termName, categoryLabels[item.category], statusLabels[item.status]]
        .join(" ")
        .toLowerCase()
        .includes(keyword)
    );
  }, [audit.courses, filter]);

  useEffect(() => {
    let mounted = true;
    async function boot() {
      try {
        const session = await loadPassportSession();
        if (!mounted) return;
        setPassportAccount(session.account);
        setCsrfToken(session.csrfToken ?? "");
        if (!session.account) {
          setStatus("登录 NaviPassport 后，可从北航个人学业进度导入真实培养方案");
          return;
        }
        const remote = await loadPlanPassportSync();
        if (!mounted) return;
        setRevision(remote.revision);
        if (isPlanSnapshot(remote.document)) {
          applySnapshot(remote.document);
          setStatus(`已从 NaviPassport 读取快照 · ${new Date(remote.document.updatedAt).toLocaleString()}`);
        } else {
          setStatus("尚未导入培养方案，请在数据源中连接北航教务");
        }
      } catch {
        if (mounted) setStatus("未能读取 NaviPassport；没有加载任何推测数据");
      }
    }
    boot();
    return () => {
      mounted = false;
    };
  }, []);

  function applySnapshot(next: PlanSnapshot) {
    setSnapshot(next);
    setAudit(next.audit);
    setRecommendations(next.recommendations);
    setProfile(next.student);
  }

  async function connectPassport() {
    setStatus("正在连接 NaviPassport...");
    try {
      window.location.assign(await passportLoginUrl());
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "暂时无法连接 NaviPassport，请稍后重试。");
    }
  }

  async function connectBuaa() {
    if (!passportAccount) {
      await connectPassport();
      return;
    }
    setBusy("buaa");
    setStatus("正在登录北航并生成新的培养方案快照...");
    try {
      const preload = buaaLogin.clientId ? null : await preloadBuaa();
      const next = await importPlan({
        username: buaaLogin.username,
        password: buaaLogin.password,
        clientId: buaaLogin.clientId || preload?.clientId,
        execution: buaaLogin.execution || preload?.execution,
        captcha: buaaLogin.captcha || null
      });
      const saved = await savePlanPassportSync(next, revision, csrfToken);
      setRevision(saved.revision);
      applySnapshot(next);
      window.NaviAnalytics?.track("plan_import", { product: "plan", value: next.courses.length });
      setBuaaLogin((current) => ({ ...current, password: "", captcha: "", clientId: "", execution: "", captchaImage: "" }));
      setStatus(`已更新 ${next.courses.length} 门课程，并同步到 NaviPassport`);
    } catch (error) {
      if (error instanceof CaptchaChallenge) {
        setBuaaLogin((current) => ({
          ...current,
          password: "",
          clientId: error.challenge.clientId,
          execution: error.challenge.execution ?? "",
          captchaImage: error.challenge.captcha?.imageUrl ?? ""
        }));
        setStatus("请输入验证码并重新输入密码后继续导入");
      } else {
        setStatus(error instanceof Error ? error.message : "连接失败，请稍后重试");
        setBuaaLogin((current) => ({ ...current, password: "" }));
      }
    } finally {
      setBusy("none");
    }
  }

  async function saveCoursePatch(patch: CourseOverride) {
    if (!selectedCourse || !snapshot) {
      setStatus("请先登录并导入培养方案，再保存手工修正");
      return;
    }
    setBusy("course");
    try {
      const corrections = { ...snapshot.manualCorrections, [selectedCourse.id]: patch };
      const next = await evaluatePlan(snapshot, corrections);
      const saved = await savePlanPassportSync(next, revision, csrfToken);
      window.NaviAnalytics?.track("plan_evaluate", { product: "plan", value: next.courses.length });
      setRevision(saved.revision);
      applySnapshot(next);
      const updated = next.coursePool.find((course) => course.id === selectedCourse.id)
        ?? next.courses.find((course) => course.id === selectedCourse.id)
        ?? selectedCourse;
      setSelectedCourse(updated);
      setStatus(`已更新 ${updated.courseName}`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "课程更新失败");
    } finally {
      setBusy("none");
    }
  }

  return (
    <div className="degree-shell">
      <header className="degree-topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">
            <i />
            <i />
            <i />
            <i />
          </span>
          <div>
            <strong>NaviPlan</strong>
            <span>学业规划与毕业学分检查</span>
          </div>
        </div>
        <nav className="degree-nav" aria-label="主导航">
          {navItems.map((item) => {
            const Icon = item.icon;
            return (
              <button key={item.id} className={activeView === item.id ? "active" : ""} onClick={() => setActiveView(item.id)} aria-label={item.label}>
                <Icon size={17} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <button className="passport-button" onClick={() => passportAccount ? setActiveView("settings") : void connectPassport()}>
          {passportAccount ? <CheckCircle2 size={17} /> : <LogIn size={17} />}
          <span>{passportAccount?.username ?? "登录 NaviPassport"}</span>
        </button>
      </header>

      <main className={`degree-layout ${snapshot && selectedCourse ? "" : "no-editor"}`}>
        <section className="degree-main">
          {!snapshot && (
            <PlanEmptyState
              passportAccount={passportAccount}
              status={status}
              onAction={() => passportAccount ? setActiveView("settings") : void connectPassport()}
            />
          )}

          {snapshot && <div className="hero-panel">
            <div className="hero-copy">
              <h1>毕业还缺 <strong>{formatCredits(missingTotalCredits(audit))}</strong> 学分</h1>
              <p>
                总要求 {formatCredits(audit.totalRequiredCredits)} 学分。当前缺口已扣除已获、在修和已规划课程；下方按培养方案要求拆开显示。
              </p>
              <div className="hero-actions">
                <button className="primary" onClick={() => setActiveView("settings")} disabled={busy !== "none"}>
                  <RefreshCcw size={17} />
                  {snapshot ? "更新教务数据" : "首次导入"}
                </button>
                <button onClick={() => setActiveView("audit")}>
                  <ListChecks size={17} />
                  查看审计
                </button>
              </div>
            </div>
            <div className="credit-ledger" aria-label="学分构成">
              <CreditLedgerRow label="已获" value={audit.totalEarnedCredits} tone="earned" />
              <CreditLedgerRow label="在修" value={audit.totalInProgressCredits} tone="active" />
              <CreditLedgerRow label="已规划" value={audit.totalPlannedCredits} tone="planned" />
              <CreditLedgerRow label="总要求" value={audit.totalRequiredCredits} tone="required" />
            </div>
          </div>}

          {snapshot && <div className="status-strip">
            <span>{status}</span>
            <span>{profile.major} · {gradeLabel(profile.grade)} · {snapshot.plan.version}</span>
          </div>}

          {snapshot && activeView === "overview" && (
            <Overview
              audit={audit}
              coursePool={snapshot.coursePool}
              recommendations={recommendations}
              onPickCourse={setSelectedCourse}
              onViewAllCourses={() => setActiveView("recommendations")}
            />
          )}
          {snapshot && activeView === "plan" && (
            <PlanView audit={audit} coursePool={snapshot.coursePool} recommendations={recommendations} onPickCourse={setSelectedCourse} />
          )}
          {snapshot && activeView === "terms" && (
            <TermsView groupedByTerm={groupedByTerm} onPickCourse={setSelectedCourse} />
          )}
          {snapshot && activeView === "audit" && (
            <AuditView audit={audit} filter={filter} onFilter={setFilter} courses={filteredCourses} onPickCourse={setSelectedCourse} />
          )}
          {snapshot && activeView === "recommendations" && (
            <RecommendationsView audit={audit} coursePool={snapshot.coursePool} recommendations={recommendations} onPickCourse={setSelectedCourse} />
          )}
          {activeView === "settings" && (
            <SettingsView
              passportAccount={passportAccount}
              buaaLogin={buaaLogin}
              setBuaaLogin={setBuaaLogin}
              connectBuaa={connectBuaa}
              connectPassport={connectPassport}
              terms={groupedByTerm.map(([label], index) => ({ itemCode: label, itemName: label, selected: false, itemIndex: index }))}
              busy={busy}
            />
          )}
        </section>

        {snapshot && selectedCourse && <CourseEditor course={selectedCourse} onClose={() => setSelectedCourse(null)} onSave={saveCoursePatch} busy={busy === "course"} />}
      </main>
    </div>
  );
}

function isPlanSnapshot(value: Partial<PlanSnapshot>): value is PlanSnapshot {
  return value.schemaVersion === 1 && Boolean(value.student && value.plan && value.audit && Array.isArray(value.courses) && Array.isArray(value.recommendations));
}

function PlanEmptyState({ passportAccount, status, onAction }: { passportAccount: PassportAccount | null; status: string; onAction: () => void }) {
  return (
    <section className="plan-empty-state">
      <div className="empty-state-mark" aria-hidden="true"><GraduationCap size={32} /></div>
      <div>
        <h1>导入你的个人学业进度</h1>
        <p>年级、学院、专业、培养方案和学分要求均以北航教务“个人学业进度”为准。导入前，NaviPlan 不展示猜测或演示数据。</p>
        <span>{status}</span>
      </div>
      <button className="primary" onClick={onAction}>
        {passportAccount ? <RefreshCcw size={17} /> : <LogIn size={17} />}
        {passportAccount ? "前往教务导入" : "登录 NaviPassport"}
      </button>
    </section>
  );
}

function CreditLedgerRow({ label, value, tone }: { label: string; value: number; tone: string }) {
  return (
    <div className={`credit-ledger-row ${tone}`}>
      <span>{label}</span>
      <strong>{formatCredits(value)} <small>学分</small></strong>
    </div>
  );
}

function Overview({
  audit,
  coursePool,
  recommendations,
  onPickCourse,
  onViewAllCourses
}: {
  audit: CreditAudit;
  coursePool: StudentCourseRecord[];
  recommendations: CourseRecommendation[];
  onPickCourse: (course: StudentCourseRecord) => void;
  onViewAllCourses: () => void;
}) {
  return (
    <div className="view-stack">
      <CreditGapBoard audit={audit} />
      <PriorityRecommendations recommendations={recommendations} coursePool={coursePool} onPickCourse={onPickCourse} compact />
      <FutureCoursesBoard audit={audit} coursePool={coursePool} recommendations={recommendations} onPickCourse={onPickCourse} compact onViewAll={onViewAllCourses} />
    </div>
  );
}

function CreditGapBoard({ audit }: { audit: CreditAudit }) {
  const gaps = sortAuditsByUrgency(actionableRequirementAudits(audit.requirementAudits)).filter((item) => !item.satisfied);
  return (
    <section className="gap-board">
      <div className="section-heading">
        <div>
          <h2>所缺学分</h2>
          <p>分项要求可能互相包含，不应直接相加；毕业总缺口以右侧数字为准。</p>
        </div>
        <strong>总缺口 {formatCredits(missingTotalCredits(audit))} 学分</strong>
      </div>
      <div className="gap-list">
        {gaps.map((item) => (
          <article className="gap-row" key={item.group.id}>
            <div className="gap-copy">
              <strong>{item.group.name}</strong>
              <span>{categoryLabels[item.group.category]} · {ruleKindLabels[item.group.ruleKind]}</span>
            </div>
            <div className="gap-progress">
              <span>
                已获 {formatCredits(item.earnedCredits)}
                {item.inProgressCredits > 0 ? ` + 在修 ${formatCredits(item.inProgressCredits)}` : ""}
                {item.plannedCredits > 0 ? ` + 规划 ${formatCredits(item.plannedCredits)}` : ""}
                {" / "}要求 {formatCredits(item.group.requiredCredits)}
              </span>
              <div className="gap-track" aria-label={`${item.group.name} 已覆盖 ${progressPercent(item)}%`}>
                <i style={{ width: `${progressPercent(item)}%` }} />
              </div>
            </div>
            <strong className="gap-value">
              缺 {formatCredits(item.missingCredits)}
              {item.missingCourseCount > 0 && <small>{item.missingCourseCount} 门</small>}
            </strong>
          </article>
        ))}
        {!gaps.length && <p className="empty">当前没有未满足的培养方案要求。</p>}
      </div>
    </section>
  );
}

function FutureCoursesBoard({
  audit,
  coursePool,
  recommendations,
  onPickCourse,
  compact = false,
  onViewAll
}: {
  audit: CreditAudit;
  coursePool: StudentCourseRecord[];
  recommendations: CourseRecommendation[];
  onPickCourse: (course: StudentCourseRecord) => void;
  compact?: boolean;
  onViewAll?: () => void;
}) {
  const buckets = buildFutureCourseBuckets(audit, coursePool);
  const recommendationByCourse = new Map(
    recommendations.map((item) => [`${item.courseCode ?? ""}|${item.courseName}`, item])
  );
  const [query, setQuery] = useState("");
  const keyword = query.trim().toLowerCase();
  const filterItems = (items: FutureCourseItem[]) => !keyword
    ? items
    : items.filter((item) => [
      item.course.courseName,
      item.course.courseCode ?? "",
      item.course.courseNature ?? "",
      item.course.plannedTermName ?? item.course.termName,
      ...item.requirements
    ].join(" ").toLowerCase().includes(keyword));
  const required = filterItems(buckets.required);
  const limited = filterItems(buckets.limited);
  return (
    <section className="future-course-board">
      <div className="section-heading">
        <div>
          <h2>仍需安排的课程</h2>
          <p>只列仍有培养方案缺口的必修与选课池候选；全部课程请到“培养方案”核对。</p>
        </div>
        {compact && onViewAll && (
          <button onClick={onViewAll}>
            查看全部 {buckets.required.length + buckets.limited.length} 门
            <ArrowRight size={16} />
          </button>
        )}
      </div>
      {!compact && (
        <label className="future-course-search">
          <Search size={17} />
          <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索课程名称、代码、性质或要求" />
        </label>
      )}
      <div className="future-course-columns">
        <FutureCourseColumn
          title="未选必修"
          description="培养方案要求逐项完成；未通过课程也列在此处。"
          items={required}
          totalItems={buckets.required.length}
          gaps={buckets.requiredGaps}
          recommendationByCourse={recommendationByCourse}
          onPickCourse={onPickCourse}
          limit={compact ? 4 : undefined}
          tone="required"
        />
        <FutureCourseColumn
          title="限修 / 选修候选"
          description="只列仍有缺口的选课池；按规定学分或门数选择，不是全部修完。"
          items={limited}
          totalItems={buckets.limited.length}
          gaps={buckets.limitedGaps}
          recommendationByCourse={recommendationByCourse}
          onPickCourse={onPickCourse}
          limit={compact ? 4 : undefined}
          tone="limited"
        />
      </div>
    </section>
  );
}

function FutureCourseColumn({
  title,
  description,
  items,
  totalItems,
  gaps,
  recommendationByCourse,
  onPickCourse,
  limit,
  tone
}: {
  title: string;
  description: string;
  items: FutureCourseItem[];
  totalItems: number;
  gaps: Array<{ id: string; name: string; missingCredits: number; missingCourseCount: number }>;
  recommendationByCourse: Map<string, CourseRecommendation>;
  onPickCourse: (course: StudentCourseRecord) => void;
  limit?: number;
  tone: "required" | "limited";
}) {
  const visible = limit ? items.slice(0, limit) : items;
  return (
    <div className={`future-course-column ${tone}`}>
      <div className="future-course-column-head">
        <div>
          <h3>{title}</h3>
          <p>{description}</p>
        </div>
        <strong>{totalItems} 门</strong>
      </div>
      <div className="future-gap-summary">
        {gaps.length ? gaps.map((gap) => (
          <span key={gap.id}>
            {gap.name}：还缺 {formatCredits(gap.missingCredits)} 学分{gap.missingCourseCount > 0 ? ` / ${gap.missingCourseCount} 门` : ""}
          </span>
        )) : <span>{tone === "required" ? "当前没有未满足的必修课组。" : "当前限修要求已满足，以下课程仅供核对。"}</span>}
      </div>
      <div className="future-course-list">
        {visible.map((item) => {
          const recommendation = recommendationByCourse.get(`${item.course.courseCode ?? ""}|${item.course.courseName}`);
          const state = item.course.status === "FAILED"
            ? "未通过"
            : item.course.offeredThisTerm
              ? "本期开设"
              : item.course.status === "PLANNED"
                ? "已规划，未选"
                : "未选";
          return (
            <button key={item.course.id} className="future-course-row" onClick={() => onPickCourse(item.course)}>
              <div>
                <strong>{item.course.courseName}</strong>
                <span>
                  {item.course.courseCode ?? "代码待确认"} · {formatCredits(item.course.credits)} 学分 · {item.course.courseNature ?? categoryLabels[item.course.category]}
                </span>
                <small>
                  {item.requirements.length ? `对应：${item.requirements.join(" / ")}` : "培养方案未标明具体课组"}
                  {item.course.plannedTermName ? ` · 建议学期：${item.course.plannedTermName}` : ""}
                </small>
                <small className="future-course-advice">
                  {recommendation?.reason ?? (item.course.status === "FAILED"
                    ? "建议：未通过课程，优先安排重修。"
                    : tone === "required"
                      ? `建议：用于补足 ${item.unmetRequirements.join(" / ") || "对应必修课组"}。`
                      : item.unmetRequirements.length
                        ? `建议：可用于补足 ${item.unmetRequirements.join(" / ")}，按缺口选够即可。`
                        : "当前没有需要它补足的课组缺口。")}
                </small>
              </div>
              <span className={`future-course-state ${item.course.status.toLowerCase()} ${item.course.offeredThisTerm ? "offered" : ""}`}>
                {state}
              </span>
            </button>
          );
        })}
        {!visible.length && <p className="empty">{items.length ? "没有匹配的课程。" : "没有需要补选的课程。"}</p>}
      </div>
      {limit && items.length > limit && <p className="future-course-more">另有 {items.length - limit} 门</p>}
    </div>
  );
}

function PlanView({
  audit,
  coursePool,
  recommendations,
  onPickCourse
}: {
  audit: CreditAudit;
  coursePool: StudentCourseRecord[];
  recommendations: CourseRecommendation[];
  onPickCourse: (course: StudentCourseRecord) => void;
}) {
  return (
    <div className="view-stack">
      <section className="panel">
        <div className="panel-title">
          <BookOpen size={18} />
          <h2>培养方案分叉树</h2>
        </div>
        <p className="muted">这里按 BYXT 的要求树展示：先看类别，再看课组分叉。必修是硬要求，限修/选修是课程池，二外是语言轨道，美育劳育是指标，不会把候选池里的每门课都算成必须修。</p>
      </section>
      <CoursePoolBrowser courses={coursePool} onPickCourse={onPickCourse} />
      <CurriculumTreeBoard audits={audit.requirementAudits} recommendations={recommendations} />
      <div className="requirement-detail-list">
        {sortAuditsByUrgency(actionableRequirementAudits(audit.requirementAudits)).map((item) => (
          <RequirementDetailCard key={item.group.id} audit={audit} item={item} recommendations={recommendations} onPickCourse={onPickCourse} />
        ))}
      </div>
    </div>
  );
}

type CoursePoolFilter = "ALL" | "REQUIRED" | "LIMITED" | "FREE" | "OFFERED" | "SELECTED";

function CoursePoolBrowser({ courses, onPickCourse }: { courses: StudentCourseRecord[]; onPickCourse: (course: StudentCourseRecord) => void }) {
  const [poolFilter, setPoolFilter] = useState<CoursePoolFilter>("ALL");
  const [groupFilter, setGroupFilter] = useState("ALL");
  const [query, setQuery] = useState("");
  const groupNames = [...new Set(courses.map((course) => course.requirementGroupName).filter(Boolean) as string[])]
    .sort((a, b) => a.localeCompare(b, "zh-CN"));
  const offeringKnown = courses.some((course) => course.offeredThisTerm !== null && course.offeredThisTerm !== undefined);
  const filtered = courses.filter((course) => {
    const matchesFilter = poolFilter === "ALL"
      || (poolFilter === "REQUIRED" && course.courseNature?.includes("必修"))
      || (poolFilter === "LIMITED" && course.courseNature?.includes("限修"))
      || (poolFilter === "FREE" && (course.courseNature?.includes("任修") || course.courseNature?.includes("任选")))
      || (poolFilter === "OFFERED" && course.offeredThisTerm === true)
      || (poolFilter === "SELECTED" && course.selectedThisTerm === true);
    const keyword = query.trim().toLowerCase();
    const matchesGroup = groupFilter === "ALL" || course.requirementGroupName === groupFilter;
    const matchesQuery = !keyword || [course.courseCode ?? "", course.courseName, course.courseNature ?? "", course.requirementGroupName ?? "", course.termName]
      .join(" ")
      .toLowerCase()
      .includes(keyword);
    return matchesFilter && matchesGroup && matchesQuery;
  });
  const filters: Array<{ id: CoursePoolFilter; label: string; count: number }> = [
    { id: "ALL", label: "全部", count: courses.length },
    { id: "REQUIRED", label: "必修", count: courses.filter((course) => course.courseNature?.includes("必修")).length },
    { id: "LIMITED", label: "限修", count: courses.filter((course) => course.courseNature?.includes("限修")).length },
    { id: "FREE", label: "任修", count: courses.filter((course) => course.courseNature?.includes("任修") || course.courseNature?.includes("任选")).length },
    { id: "OFFERED", label: "本期开设", count: courses.filter((course) => course.offeredThisTerm === true).length },
    { id: "SELECTED", label: "已选", count: courses.filter((course) => course.selectedThisTerm === true).length }
  ];
  return (
    <section className="panel course-pool-panel">
      <div className="pool-heading">
        <div className="panel-title">
          <Layers3 size={18} />
          <div>
            <h2>培养方案课程池</h2>
            <p>完整课程来自“我的培养方案”；本期开设与已选状态来自当前选课轮次。</p>
          </div>
        </div>
        <div className="pool-controls">
          <select value={groupFilter} onChange={(event) => setGroupFilter(event.target.value)} aria-label="按课程组筛选">
            <option value="ALL">全部课程组</option>
            {groupNames.map((name) => <option key={name} value={name}>{name}</option>)}
          </select>
          <label className="pool-search">
            <Search size={16} />
            <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索名称、代码或课程组" />
          </label>
        </div>
      </div>
      <div className="pool-filters" role="tablist" aria-label="课程池筛选">
        {filters.map((item) => (
          <button
            key={item.id}
            className={poolFilter === item.id ? "active" : ""}
            onClick={() => setPoolFilter(item.id)}
            disabled={(item.id === "OFFERED" || item.id === "SELECTED") && !offeringKnown}
            role="tab"
            aria-selected={poolFilter === item.id}
          >
            {item.label}<span>{item.count}</span>
          </button>
        ))}
      </div>
      {!offeringKnown && <p className="pool-notice">本次未能取得选课系统实时状态；完整培养方案课程池仍可正常查看。</p>}
      <p className="pool-result">当前显示 {filtered.length} / {courses.length} 门；每门课均保留培养方案性质、所属课组和计划学期。</p>
      <CourseTable courses={filtered} onPickCourse={onPickCourse} emptyText="没有符合当前条件的课程。" />
    </section>
  );
}

function CurriculumTreeBoard({ audits, recommendations }: { audits: RequirementAudit[]; recommendations: CourseRecommendation[] }) {
  const buckets = groupedAuditsByCategory(audits);
  return (
    <section className="curriculum-tree-board">
      <div className="tree-board-head">
        <div>
          <div className="panel-title compact-title">
            <GitBranch size={18} />
            <h2>要求树总览</h2>
          </div>
          <p>每个分支右侧显示当前状态；点开下方详细区可以校正课程归属和修读状态。</p>
        </div>
        <div className="tree-legend">
          <span className="legend earned">已获</span>
          <span className="legend progress">在修/规划</span>
          <span className="legend missing">仍缺</span>
          <span className="legend candidate">候选池</span>
        </div>
      </div>
      <div className="tree-mode-guide" aria-label="培养方案分支读法">
        {ruleKindGuide.map((item) => (
          <div className={`tree-mode-item ${item.kind.toLowerCase()}`} key={item.kind}>
            <span>{item.label}</span>
            <p>{item.description}</p>
          </div>
        ))}
      </div>
      <div className="tree-category-grid">
        {buckets.map((bucket) => (
          <CurriculumCategoryBranch
            key={bucket.category}
            category={bucket.category}
            audits={bucket.audits}
            allAudits={audits}
            recommendations={recommendations}
          />
        ))}
      </div>
    </section>
  );
}

function CurriculumCategoryBranch({
  category,
  audits,
  allAudits,
  recommendations
}: {
  category: RequirementCategory;
  audits: RequirementAudit[];
  allAudits: RequirementAudit[];
  recommendations: CourseRecommendation[];
}) {
  const summary = categorySummary(audits);
  const auditsById = new Map(allAudits.map((item) => [item.group.id, item]));
  return (
    <article className={`tree-category category-${category.toLowerCase()}`}>
      <div className="tree-category-head">
        <div>
          <span>{categoryLabels[category]}</span>
          <h3>{formatCredits(summary.earned + summary.inProgress + summary.planned)} / {formatCredits(summary.earned + summary.inProgress + summary.planned + summary.missing)} 学分</h3>
          <p>{categoryDescriptions[category]}</p>
        </div>
        <strong>{summary.missing > 0 ? `缺 ${formatCredits(summary.missing)}` : "已满足"}</strong>
      </div>
      <div className="tree-category-meta">
        <span>{summary.nodes} 个节点</span>
        <span>{summary.candidates} 门候选</span>
        <span>在修/规划 {formatCredits(summary.inProgress + summary.planned)}</span>
      </div>
      <div className="tree-node-list">
        {audits.map((audit) => (
          <CurriculumTreeNode key={audit.group.id} fallbackAudit={audit} auditsById={auditsById} group={audit.group} recommendations={recommendations} depth={0} />
        ))}
      </div>
    </article>
  );
}

function CurriculumTreeNode({
  fallbackAudit,
  auditsById,
  group,
  recommendations,
  depth
}: {
  fallbackAudit: RequirementAudit;
  auditsById: Map<string, RequirementAudit>;
  group: RequirementAudit["group"];
  recommendations: CourseRecommendation[];
  depth: number;
}) {
  const audit = auditsById.get(group.id) ?? fallbackAudit;
  const groupRecommendations = recommendationsForGroup(recommendations, group.id);
  const statusText = requirementStatusLabel(audit);
  const missing = audit.group.id === group.id ? audit.missingCredits : null;
  const hint = group.ruleHint ?? ruleKindDescriptions[group.ruleKind];
  return (
    <div className={`tree-node depth-${Math.min(depth, 3)} ${audit.satisfied ? "satisfied" : ""}`}>
      <div className="tree-node-main">
        <div className="tree-node-copy">
          <div className="tree-node-title-line">
            <span className={`rule-chip ${group.ruleKind.toLowerCase()}`}>{ruleKindLabels[group.ruleKind]}</span>
            <strong>{group.name}</strong>
          </div>
          <p>{requirementRuleSummary(group)}{missing !== null && missing > 0 ? ` · 仍缺 ${formatCredits(missing)} 学分` : ""}</p>
          <small>{hint}</small>
        </div>
        <b>{statusText}</b>
      </div>
      {groupRecommendations.length > 0 && (
        <div className="tree-node-suggestions">
          {groupRecommendations.slice(0, 3).map((course) => (
            <span key={course.id}>{course.courseName}</span>
          ))}
        </div>
      )}
      {(group.children ?? []).length > 0 && (
        <div className="tree-node-children">
          {(group.children ?? []).map((child) => (
            <CurriculumTreeNode key={child.id} fallbackAudit={audit} auditsById={auditsById} group={child} recommendations={recommendations} depth={depth + 1} />
          ))}
        </div>
      )}
    </div>
  );
}

function RequirementDetailCard({
  audit,
  item,
  recommendations,
  onPickCourse
}: {
  audit: CreditAudit;
  item: RequirementAudit;
  recommendations: CourseRecommendation[];
  onPickCourse: (course: StudentCourseRecord) => void;
}) {
  const activeCourses = requirementCourses(audit, item, false);
  const candidateCourses = requirementCourses(audit, item, true);
  const trackSummary = languageTrackSummary(item, [...activeCourses, ...candidateCourses]);
  return (
    <section className={`panel requirement-detail ${item.satisfied ? "satisfied" : ""}`}>
      <div className="requirement-detail-head">
        <div>
          <span className={`rule-chip ${item.group.ruleKind.toLowerCase()}`}>{ruleKindLabels[item.group.ruleKind]}</span>
          <h2>{item.group.name}</h2>
          <p>{trackSummary ?? item.group.ruleHint ?? "按该课组累计学分。"}</p>
        </div>
        <div className="requirement-numbers">
          <strong>{item.satisfied ? "已满足" : `缺 ${formatCredits(item.missingCredits)}`}</strong>
          <span>要求 {formatCredits(item.group.requiredCredits)} 学分{item.group.requiredCourses > 0 ? ` / ${item.group.requiredCourses} 门` : ""}</span>
        </div>
      </div>
      <RequirementMeter item={item} compact />
      <div className="requirement-next">
        <Layers3 size={17} />
        <span>本组下一步：{requirementAction(item, recommendations)}</span>
      </div>
      <div className="course-split-grid">
        <div>
          <h3>已计入 / 在修 / 规划</h3>
          <CourseTable courses={activeCourses} onPickCourse={onPickCourse} emptyText="这个课组还没有已计入课程。" />
        </div>
        <div>
          <h3>候选未修读</h3>
          <CourseTable courses={candidateCourses} onPickCourse={onPickCourse} emptyText="没有候选课程。" />
        </div>
      </div>
    </section>
  );
}

function TermsView({ groupedByTerm, onPickCourse }: { groupedByTerm: Array<[string, StudentCourseRecord[]]>; onPickCourse: (course: StudentCourseRecord) => void }) {
  return (
    <div className="view-stack">
      {groupedByTerm.map(([term, courses]) => (
        <section className="panel term-panel" key={term}>
          <div className="term-heading">
            <div>
              <h2>{term}</h2>
              <p>{courses.length} 门课程 · 有效 {formatCredits(courses.filter((item) => effectiveStatuses.has(item.status)).reduce((sum, item) => sum + item.credits, 0))} 学分 · 候选 {courses.filter((item) => item.status === "CANDIDATE").length} 门</p>
            </div>
            <span>{courses.some((item) => item.status === "IN_PROGRESS") ? "在修学期" : "历史/规划"}</span>
          </div>
          <CourseTable courses={courses} onPickCourse={onPickCourse} emptyText="这个学期暂无课程。" />
        </section>
      ))}
    </div>
  );
}

function AuditView({
  audit,
  filter,
  onFilter,
  courses,
  onPickCourse
}: {
  audit: CreditAudit;
  filter: string;
  onFilter: (value: string) => void;
  courses: StudentCourseRecord[];
  onPickCourse: (course: StudentCourseRecord) => void;
}) {
  return (
    <div className="view-stack">
      <section className="audit-summary">
        <Stat label="已获学分" value={formatCredits(audit.totalEarnedCredits)} />
        <Stat label="在修学分" value={formatCredits(audit.totalInProgressCredits)} />
        <Stat label="规划学分" value={formatCredits(audit.totalPlannedCredits)} />
        <Stat label="总要求" value={formatCredits(audit.totalRequiredCredits)} />
      </section>
      <section className="panel">
        <div className="panel-title search-title">
          <Search size={18} />
          <h2>课程明细与手动校正</h2>
          <input value={filter} onChange={(event) => onFilter(event.target.value)} placeholder="搜索课程、类别、学期" />
        </div>
        <CourseTable courses={courses} onPickCourse={onPickCourse} emptyText="没有匹配的课程。" />
      </section>
    </div>
  );
}

function PriorityRecommendations({
  recommendations,
  coursePool,
  onPickCourse,
  compact = false
}: {
  recommendations: CourseRecommendation[];
  coursePool: StudentCourseRecord[];
  onPickCourse: (course: StudentCourseRecord) => void;
  compact?: boolean;
}) {
  const visible = recommendations.slice(0, compact ? 4 : 10);
  if (!visible.length) return null;
  return (
    <section className="panel priority-recommendations">
      <div className="section-heading">
        <div>
          <h2>优先处理</h2>
          <p>先排未通过的固定课程，再看本期开设和临近计划学期；选修池只给候选，不替你做兴趣选择。</p>
        </div>
        <strong>{recommendations.length} 项建议</strong>
      </div>
      <div className="priority-recommendation-list">
        {visible.map((item, index) => {
          const course = coursePool.find((candidate) =>
            candidate.courseCode === item.courseCode && candidate.courseName === item.courseName
          );
          return (
            <button key={item.id} onClick={() => course && onPickCourse(course)} disabled={!course}>
              <span className="priority-index">{index + 1}</span>
              <span className="priority-copy">
                <strong>{item.courseName}</strong>
                <small>{item.courseCode ?? "代码待确认"} · {formatCredits(item.credits)} 学分 · {item.suggestedTerm}</small>
                <p>{item.reason}</p>
              </span>
              <ArrowRight size={17} />
            </button>
          );
        })}
      </div>
    </section>
  );
}

function RecommendationsView({
  audit,
  coursePool,
  recommendations,
  onPickCourse
}: {
  audit: CreditAudit;
  coursePool: StudentCourseRecord[];
  recommendations: CourseRecommendation[];
  onPickCourse: (course: StudentCourseRecord) => void;
}) {
  return (
    <div className="view-stack">
      <PriorityRecommendations recommendations={recommendations} coursePool={coursePool} onPickCourse={onPickCourse} />
      <FutureCoursesBoard audit={audit} coursePool={coursePool} recommendations={recommendations} onPickCourse={onPickCourse} />
    </div>
  );
}

function SettingsView({
  passportAccount,
  buaaLogin,
  setBuaaLogin,
  connectBuaa,
  connectPassport,
  terms,
  busy
}: {
  passportAccount: PassportAccount | null;
  buaaLogin: { username: string; password: string; captcha: string; clientId: string; execution: string; captchaImage: string };
  setBuaaLogin: (next: { username: string; password: string; captcha: string; clientId: string; execution: string; captchaImage: string }) => void;
  connectBuaa: () => void;
  connectPassport: () => void;
  terms: Term[];
  busy: BusyAction;
}) {
  return (
    <div className="settings-grid">
      <section className="panel">
        <div className="panel-title">
          <KeyRound size={18} />
          <h2>NaviPassport</h2>
        </div>
        <p className="muted">{passportAccount ? `已登录：${passportAccount.username}` : "登录后可同步课程校正、培养方案版本和审计结果。"}</p>
        <button className="primary" onClick={connectPassport}>
          <LogIn size={17} />
          {passportAccount ? "管理登录状态" : "去登录 NaviPassport"}
        </button>
      </section>
      <section className="panel">
        <div className="panel-title">
          <GraduationCap size={18} />
          <h2>北航教务数据</h2>
        </div>
        <div className="form-grid">
          <label>
            学号
            <input value={buaaLogin.username} onChange={(event) => setBuaaLogin({ ...buaaLogin, username: event.target.value })} autoComplete="username" />
          </label>
          <label>
            密码
            <input type="password" value={buaaLogin.password} onChange={(event) => setBuaaLogin({ ...buaaLogin, password: event.target.value })} autoComplete="current-password" />
          </label>
          {buaaLogin.captchaImage && (
            <label>
              验证码
              <img className="captcha" src={buaaLogin.captchaImage} alt="验证码" />
              <input value={buaaLogin.captcha} onChange={(event) => setBuaaLogin({ ...buaaLogin, captcha: event.target.value })} />
            </label>
          )}
        </div>
        <div className="button-row">
          <button className="primary" onClick={connectBuaa} disabled={busy !== "none"}>
            {busy === "buaa" ? <Loader2 className="spin" size={17} /> : <KeyRound size={17} />}
            导入或更新快照
          </button>
        </div>
      </section>
      <section className="panel">
        <div className="panel-title">
          <Table2 size={18} />
          <h2>已发现学期</h2>
        </div>
        <div className="term-chip-list">
          {terms.length ? terms.map((term) => <span key={term.itemCode}>{term.itemName || term.itemCode}</span>) : <span>连接后显示全部学期</span>}
        </div>
        <p className="notice">普通刷新只读取 NaviPassport 快照。只有点击“导入或更新快照”时才访问北航教务，密码和临时会话会在请求结束后清除。</p>
      </section>
    </div>
  );
}

function RequirementMeter({ item, compact = false }: { item: RequirementAudit; compact?: boolean }) {
  const percent = progressPercent(item);
  const required = Math.max(1, item.group.requiredCredits);
  const earnedWidth = Math.min(100, (item.earnedCredits / required) * 100);
  const inProgressWidth = Math.min(100 - earnedWidth, (item.inProgressCredits / required) * 100);
  const plannedWidth = Math.min(100 - earnedWidth - inProgressWidth, (item.plannedCredits / required) * 100);
  return (
    <article className={`requirement-meter ${compact ? "compact" : ""} ${item.satisfied ? "satisfied" : ""}`}>
      <div className="meter-copy">
        <span className="meter-meta">{categoryLabels[item.group.category]} · {ruleKindLabels[item.group.ruleKind]}</span>
        <strong>{item.group.name}</strong>
        <small>
          已获 {formatCredits(item.earnedCredits)} / 在修 {formatCredits(item.inProgressCredits)} / 规划 {formatCredits(item.plannedCredits)}
          {item.candidateCourseIds.length > 0 ? ` / 候选 ${item.candidateCourseIds.length} 门` : ""}
        </small>
      </div>
      <b>{requirementStatusLabel(item)}</b>
      <div className="meter-track">
        <i className="earned" style={{ width: `${earnedWidth}%` }} />
        <i className="in-progress" style={{ width: `${inProgressWidth}%` }} />
        <i className="planned" style={{ width: `${plannedWidth}%` }} />
      </div>
      <div className="meter-foot">
        <span>{percent}% 覆盖</span>
        <span>{item.satisfied ? "无需补课" : `仍缺 ${formatCredits(item.missingCredits)} 学分`}</span>
      </div>
    </article>
  );
}

function CourseTable({ courses, onPickCourse, emptyText }: { courses: StudentCourseRecord[]; onPickCourse: (course: StudentCourseRecord) => void; emptyText: string }) {
  if (!courses.length) return <p className="empty">{emptyText}</p>;
  return (
    <div className="course-table" role="table">
      <div className="course-row head" role="row">
        <span>课程</span>
        <span>类别</span>
        <span>状态</span>
        <span>学分</span>
      </div>
      {courses.map((course) => (
        <button className="course-row" key={course.id} onClick={() => onPickCourse(course)} role="row">
          <span>
            <strong>{course.courseName}</strong>
            <small>
              {course.courseCode ?? "代码待确认"} · {course.plannedTermName ?? course.termName}
              {course.requirementGroupName ? ` · ${course.requirementGroupName}` : ""}
              {course.offeredTermName ? ` · ${course.offeredTermName}开设` : ""}
            </small>
          </span>
          <span>{course.courseNature ?? categoryLabels[course.category]}</span>
          <span className={`status-pill ${course.selectedThisTerm ? "in_progress" : course.offeredThisTerm ? "offered" : course.status.toLowerCase()}`}>
            {course.selectedThisTerm ? "已选" : course.offeredThisTerm ? `开设 ${course.offeringClassCount ?? 1} 班` : statusLabels[course.status]}
          </span>
          <span>{formatCredits(course.credits)}</span>
        </button>
      ))}
    </div>
  );
}

function CourseEditor({
  course,
  onClose,
  onSave,
  busy
}: {
  course: StudentCourseRecord | null;
  onClose: () => void;
  onSave: (patch: { status?: CourseRecordStatus; manualCategory?: RequirementCategory; credits?: number; manualNote?: string | null }) => void;
  busy: boolean;
}) {
  const [draft, setDraft] = useState({ status: "COMPLETED" as CourseRecordStatus, category: "REQUIRED" as RequirementCategory, credits: 0, note: "" });

  useEffect(() => {
    if (course) {
      setDraft({
        status: course.status,
        category: course.manualCategory ?? course.category,
        credits: course.credits,
        note: course.manualNote ?? ""
      });
    }
  }, [course]);

  return (
    <aside className={`course-editor ${course ? "open" : ""}`} aria-label="课程编辑">
      {course ? (
        <>
          <div className="editor-head">
            <div>
              <span>{course.courseCode ?? "代码待确认"}</span>
              <h2>{course.courseName}</h2>
              <p>{course.termName} · 来源 {course.source}</p>
            </div>
            <button onClick={onClose}>关闭</button>
          </div>
          <label>
            修读状态
            <select value={draft.status} onChange={(event) => setDraft({ ...draft, status: event.target.value as CourseRecordStatus })}>
              {Object.entries(statusLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            计入类别
            <select value={draft.category} onChange={(event) => setDraft({ ...draft, category: event.target.value as RequirementCategory })}>
              {Object.entries(categoryLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>
            学分
            <input type="number" min="0" step="0.5" value={draft.credits} onChange={(event) => setDraft({ ...draft, credits: Number(event.target.value) })} />
          </label>
          <label>
            备注
            <input value={draft.note} onChange={(event) => setDraft({ ...draft, note: event.target.value })} placeholder="例如：重修中、学院认定为限修" />
          </label>
          <button className="primary" onClick={() => onSave({ status: draft.status, manualCategory: draft.category, credits: draft.credits, manualNote: draft.note })} disabled={busy}>
            {busy ? <Loader2 className="spin" size={17} /> : <Save size={17} />}
            保存校正
          </button>
        </>
      ) : (
        <div className="editor-empty">
          <GraduationCap size={28} />
          <strong>选择一门课程进行校正</strong>
          <p>可以修改是否计入、课程类别、学分和备注。手动校正优先于自动匹配。</p>
        </div>
      )}
    </aside>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="stat">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

export { App };
