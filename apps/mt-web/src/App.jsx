import { useEffect, useMemo, useRef, useState } from "react";
import {
  Archive,
  ArrowLeft,
  ArrowRight,
  BarChart3,
  BookOpen,
  Check,
  ChevronRight,
  CircleAlert,
  CloudDownload,
  CloudUpload,
  Clock3,
  Download,
  FileArchive,
  Filter,
  Flag,
  History,
  Home,
  Info,
  ListChecks,
  LayoutGrid,
  Menu,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  Play,
  RefreshCcw,
  Search,
  Save,
  Settings,
  ShieldCheck,
  Shuffle,
  Star,
  Sun,
  Target,
  Upload,
  UserRound,
  X,
  XCircle,
} from "lucide-react";
import bank from "./data/question-bank.json";
import materialFiles from "./data/material-files";
import {
  emptyStudyState,
  exportStudyState,
  getStudyStats,
  importStudyState,
  loadStudyState,
  recordAnswer,
  saveStudyState,
  fromSyncState,
  toSyncState,
  toggleInList,
} from "./lib/study-state";
import { answerLabel, checkAnswer, matchesQuery, shuffle, typeNames } from "./lib/questions";
import { createPassportSync, startPassportLogin } from "./lib/passport";

const navItems = [
  { id: "dashboard", label: "开始练习", icon: Home },
  { id: "library", label: "题目列表", icon: ListChecks },
  { id: "wrong", label: "错题本", icon: XCircle },
  { id: "favorites", label: "收藏夹", icon: Star },
  { id: "stats", label: "学习统计", icon: BarChart3 },
  { id: "sources", label: "账号与资料", icon: Archive },
];

const activeQuestions = bank.questions.filter((question) => !question.disabled);
const HIDE_LEGACY_STORAGE_KEY = "military-theory-hide-legacy";

function Brand({ compact = false }) {
  return (
    <div className={`brand ${compact ? "brand-compact" : ""}`}>
      <img className="brand-mark" src={`${import.meta.env.BASE_URL}app-mark.svg`} alt="" />
      <div>
        <strong>NaviMT 军理通</strong>
        {!compact && <span>军事理论题库与复习</span>}
      </div>
    </div>
  );
}

function Sidebar({ view, onNavigate, collapsed, onCollapse }) {
  return (
    <aside className={`sidebar ${collapsed ? "sidebar-collapsed" : ""}`}>
      <div className="sidebar-head">
        <Brand compact={collapsed} />
        <button className="icon-button desktop-only" onClick={onCollapse} title={collapsed ? "展开侧栏" : "收起侧栏"}>
          {collapsed ? <PanelLeftOpen /> : <PanelLeftClose />}
        </button>
      </div>
      <nav aria-label="主要导航">
        {navItems.map((item) => {
          const Icon = item.icon;
          const active = view === item.id || (view === "practice" && item.id === "dashboard");
          return (
            <button key={item.id} className={active ? "active" : ""} onClick={() => onNavigate(item.id)} title={collapsed ? item.label : undefined}>
              <Icon />
              {!collapsed && <span>{item.label}</span>}
            </button>
          );
        })}
      </nav>
      <div className="sidebar-foot">
        <a className="study-home-link" href="https://study.example.test/" title="返回 NaviStudy 统一学习首页">
          <LayoutGrid />
          {!collapsed && (
            <div>
              <strong>返回 NaviStudy</strong>
              <span>统一学习首页</span>
            </div>
          )}
        </a>
      </div>
    </aside>
  );
}

function MobileNav({ view, onNavigate }) {
  return (
    <nav className="mobile-nav" aria-label="移动端导航">
      {navItems.slice(0, 5).map((item) => {
        const Icon = item.icon;
        const active = view === item.id || (view === "practice" && item.id === "dashboard");
        return (
          <button key={item.id} className={active ? "active" : ""} onClick={() => onNavigate(item.id)}>
            <Icon />
            <span>{item.label.replace("练习", "")}</span>
          </button>
        );
      })}
    </nav>
  );
}

function Topbar({ search, setSearch, theme, toggleTheme, onNavigate, view, passportAccount, syncState }) {
  return (
    <header className="topbar">
      <div className="mobile-brand-row mobile-only">
        <Brand />
        <a className="mobile-study-link" href="https://study.example.test/" title="返回 NaviStudy">
          <LayoutGrid />
          <span>NaviStudy</span>
        </a>
      </div>
      <div className="breadcrumbs desktop-only">
        <span>NaviMT 军理通</span>
        <ChevronRight />
        <strong>{navItems.find((item) => item.id === view)?.label || "练习模式"}</strong>
      </div>
      <div className="topbar-actions">
        <label className="search-box">
          <Search />
          <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="搜索题目、章节或来源" />
          {search && (
            <button onClick={() => setSearch("")} title="清除搜索" type="button"><X /></button>
          )}
        </label>
        <button
          className={`passport-top-button ${passportAccount ? "is-connected" : ""}`}
          onClick={() => passportAccount ? onNavigate("sources") : startPassportLogin()}
          title={passportAccount ? "查看 Navi Passport 与同步状态" : "登录 Navi Passport"}
        >
          <UserRound />
          <span>{passportAccount ? passportAccount.username : "登录同步"}</span>
          {passportAccount && <i className={`sync-dot sync-${syncState.value}`} aria-label={syncState.label} />}
        </button>
        <button className="icon-button" onClick={toggleTheme} title={theme === "dark" ? "切换日间模式" : "切换夜间模式"}>
          {theme === "dark" ? <Sun /> : <Moon />}
        </button>
        <button className="icon-button" onClick={() => onNavigate("sources")} title="账号与资料">
          <Settings />
        </button>
      </div>
    </header>
  );
}

function MetricStrip({ stats }) {
  const items = [
    ["已练题目", stats.practiced, "道"],
    ["累计正确率", stats.accuracy, "%"],
    ["待攻克", stats.wrong, "道"],
    ["已收藏", stats.favorites, "道"],
  ];
  return (
    <div className="metric-strip">
      {items.map(([label, value, unit]) => (
        <div key={label}>
          <span>{label}</span>
          <strong>{value}<small>{unit}</small></strong>
        </div>
      ))}
    </div>
  );
}

function Dashboard({ study, questions, hideLegacy, setHideLegacy, onStart, onMaterials, passportAccount, syncState, onAccount }) {
  const stats = getStudyStats(study, questions);
  const [chapter, setChapter] = useState("全部章节");
  const [count, setCount] = useState(20);
  const [unpracticed, setUnpracticed] = useState(false);
  const progress = questions.length ? Math.round((stats.practiced / questions.length) * 100) : 0;

  return (
    <main className="page dashboard-page">
      <section className="page-heading dashboard-heading">
        <div>
          <h1>NaviMT 军理通</h1>
          <p>军事理论题库与复习，把散落的资料练成一条清楚的知识线。</p>
        </div>
        <div className="progress-summary">
          <div><span>总进度</span><strong>{stats.practiced} / {questions.length}</strong></div>
          <div className="progress-track" aria-label={`总进度 ${progress}%`}><span style={{ transform: `scaleX(${progress / 100})` }} /></div>
        </div>
      </section>

      <button className={`passport-banner ${passportAccount ? "is-connected" : ""}`} onClick={onAccount}>
        <span className="passport-banner-icon"><UserRound /></span>
        <span className="passport-banner-copy">
          <strong>{passportAccount ? passportAccount.username : "登录 Navi Passport"}</strong>
          <small>{passportAccount ? `军理记录${syncState.label}，NaviWords 数据独立保存` : "跨网页与小程序同步军理进度，游客模式仍可直接学习"}</small>
        </span>
        <span className={`passport-banner-state sync-${syncState.value}`}><i />{passportAccount ? syncState.label : "登录同步"}</span>
        <ChevronRight />
      </button>

      <section className="source-notice">
        <Info />
        <p><strong>先看资料年代。</strong>{bank.notice}</p>
        <button className="notice-download" type="button" onClick={onMaterials}><Download />资料下载</button>
      </section>

      <MetricStrip stats={stats} />

      <section className="practice-section">
        <div className="section-heading">
          <div><Target /><h2>练习模式</h2></div>
          <div className="switch-group">
            <label className="switch-row">
              <span>仅练未做题</span>
              <input type="checkbox" checked={unpracticed} onChange={(event) => setUnpracticed(event.target.checked)} />
              <i aria-hidden="true" />
            </label>
            <label className="switch-row">
              <span>不看历史题</span>
              <input type="checkbox" checked={hideLegacy} onChange={(event) => setHideLegacy(event.target.checked)} />
              <i aria-hidden="true" />
            </label>
          </div>
        </div>
        <div className="mode-grid">
          <article className="mode-card">
            <div className="mode-title"><ListChecks /><div><h3>章节顺练</h3><p>按资料顺序建立完整框架</p></div></div>
            <label><span>选择章节</span><select value={chapter} onChange={(event) => setChapter(event.target.value)}><option>全部章节</option>{bank.chapters.map((item) => <option key={item}>{item}</option>)}</select></label>
            <button className="primary-button" onClick={() => onStart({ mode: "sequential", chapter, count: 0, unpracticed })}><Play />开始练习</button>
          </article>
          <article className="mode-card">
            <div className="mode-title"><Shuffle /><div><h3>随机组卷</h3><p>打散章节，快速检查记忆</p></div></div>
            <label><span>题目数量</span><select value={count} onChange={(event) => setCount(Number(event.target.value))}>{[10, 20, 30, 50].map((item) => <option key={item} value={item}>{item} 道</option>)}</select></label>
            <button className="primary-button" onClick={() => onStart({ mode: "random", chapter, count, unpracticed })}><Shuffle />生成练习</button>
          </article>
          <article className="mode-card wrong-mode">
            <div className="mode-title"><XCircle /><div><h3>错题攻坚</h3><p>只看仍未订正的题目</p></div></div>
            <div className="mode-count"><strong>{stats.wrong}</strong><span>道待攻克</span></div>
            <button className="primary-button" disabled={!stats.wrong} onClick={() => onStart({ mode: "wrong", chapter: "全部章节", count: 0 })}><Target />开始攻坚</button>
          </article>
          <article className="mode-card favorite-mode">
            <div className="mode-title"><Star /><div><h3>收藏练习</h3><p>回到你主动标记的重点</p></div></div>
            <div className="mode-count"><strong>{stats.favorites}</strong><span>道重点题</span></div>
            <button className="primary-button" disabled={!stats.favorites} onClick={() => onStart({ mode: "favorites", chapter: "全部章节", count: 0 })}><Star />复习收藏</button>
          </article>
        </div>
      </section>

      <section className="chapter-overview">
        <div className="section-heading"><div><BookOpen /><h2>章节进度</h2></div></div>
        <div className="chapter-list">
          {bank.chapters.map((item) => {
            const chapterQuestions = questions.filter((question) => question.chapter === item);
            const completed = chapterQuestions.filter((question) => study.attempts[question.id]).length;
            const percent = chapterQuestions.length ? Math.round((completed / chapterQuestions.length) * 100) : 0;
            return (
              <button key={item} onClick={() => onStart({ mode: "sequential", chapter: item, count: 0, unpracticed })}>
                <span className="chapter-name">{item}</span>
                <span className="chapter-bar"><i style={{ width: `${percent}%` }} /></span>
                <span className="chapter-count">{completed}/{chapterQuestions.length}</span>
                <ChevronRight />
              </button>
            );
          })}
        </div>
      </section>
    </main>
  );
}

function QuestionRail({ queue, currentIndex, study, onSelect, mobileOpen, setMobileOpen }) {
  return (
    <aside className={`question-rail ${mobileOpen ? "mobile-open" : ""}`}>
      <div className="rail-heading">
        <div><h2>题目列表</h2><span>共 {queue.length} 题</span></div>
        <button className="icon-button mobile-only" onClick={() => setMobileOpen(false)} title="关闭题目列表"><X /></button>
      </div>
      <div className="question-dots">
        {queue.map((question, index) => {
          const attempt = study.attempts[question.id];
          const className = [index === currentIndex ? "current" : "", attempt ? (attempt.lastCorrect ? "done-correct" : "done-wrong") : ""].join(" ");
          return <button key={`${question.id}-${index}`} className={className} onClick={() => { onSelect(index); setMobileOpen(false); }}>{index + 1}</button>;
        })}
      </div>
      <div className="rail-legend"><span><i className="legend-current" />当前</span><span><i className="legend-correct" />正确</span><span><i className="legend-wrong" />待复习</span></div>
    </aside>
  );
}

function AnswerOptions({ question, selected, submitted, onToggle }) {
  if (question.type === "truefalse") {
    return (
      <div className="answer-options two-options">
        {["正确", "错误"].map((value) => {
          const chosen = selected.includes(value);
          const isAnswer = submitted && question.answer === value;
          const isWrong = submitted && chosen && !isAnswer;
          return <button key={value} className={`${chosen ? "selected" : ""} ${isAnswer ? "correct" : ""} ${isWrong ? "incorrect" : ""}`} onClick={() => onToggle(value)} disabled={submitted}><span>{value === "正确" ? <Check /> : <X />}</span><strong>{value}</strong></button>;
        })}
      </div>
    );
  }
  return (
    <div className="answer-options">
      {question.options.map((option) => {
        const chosen = selected.includes(option.key);
        const isAnswer = submitted && question.answer.includes(option.key);
        const isWrong = submitted && chosen && !isAnswer;
        return (
          <button key={option.key} className={`${chosen ? "selected" : ""} ${isAnswer ? "correct" : ""} ${isWrong ? "incorrect" : ""}`} onClick={() => onToggle(option.key)} disabled={submitted}>
            <span>{option.key}</span><strong>{option.text}</strong>{isAnswer && <Check className="answer-state-icon" />}{isWrong && <X className="answer-state-icon" />}
          </button>
        );
      })}
    </div>
  );
}

function ContextRail({ question, submitted, result }) {
  return (
    <aside className="context-rail">
      <div className="context-heading"><Info /><h2>答案与来源</h2></div>
      {!submitted ? (
        <div className="context-empty"><BookOpen /><p>提交答案后，这里会显示参考答案、资料来源和校勘提示。</p></div>
      ) : (
        <div className="answer-context">
          {result !== null && <div className={`result-banner ${result ? "success" : "error"}`}>{result ? <Check /> : <X />}<strong>{result ? "回答正确" : "还需复习"}</strong></div>}
          {question.type === "short" ? <section><span>参考答案</span><p className="short-reference">{question.answer}</p></section> : <section><span>参考答案</span><strong>{answerLabel(question)}</strong></section>}
          {question.explanation && <section><span>资料依据</span><p>{question.explanation}</p></section>}
          <section><span>来源</span><p>{question.sources.join("、")}</p></section>
          {question.legacy && <div className="legacy-warning"><History /><p>这是历史资料题。法规、编制和时事内容请以当前教材与教师要求为准。</p></div>}
        </div>
      )}
    </aside>
  );
}

function Practice({ queue, study, setStudy, onExit, initialIndex = 0 }) {
  const [index, setIndex] = useState(initialIndex);
  const [selected, setSelected] = useState([]);
  const [submitted, setSubmitted] = useState(false);
  const [result, setResult] = useState(null);
  const [shortDraft, setShortDraft] = useState("");
  const [mobileRail, setMobileRail] = useState(false);
  const [seconds, setSeconds] = useState(0);
  const current = queue[index];

  useEffect(() => {
    const timer = window.setInterval(() => setSeconds((value) => value + 1), 1000);
    return () => window.clearInterval(timer);
  }, []);

  function resetQuestion(nextIndex) {
    setIndex(nextIndex);
    setSelected([]);
    setSubmitted(false);
    setResult(null);
    setShortDraft("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function toggleOption(key) {
    if (submitted) return;
    if (current.type === "multiple") setSelected((items) => toggleInList(items, key));
    else setSelected([key]);
  }

  function submitAnswer() {
    if (current.type === "short") {
      window.NaviAnalytics?.track("study_start", { product: "mt", itemId: current.id, metadata: { type: current.type } });
      setSubmitted(true);
      return;
    }
    if (!selected.length) return;
    const correct = checkAnswer(current, selected);
    window.NaviAnalytics?.track("question_answered", { product: "mt", itemId: current.id, value: correct ? 1 : 0, metadata: { type: current.type } });
    setResult(correct);
    setSubmitted(true);
    setStudy((state) => recordAnswer(state, current.id, correct, selected));
  }

  function scoreShort(mastered) {
    if (result !== null) return;
    setResult(mastered);
    window.NaviAnalytics?.track("question_answered", { product: "mt", itemId: current.id, value: mastered ? 1 : 0, metadata: { type: "short" } });
    setStudy((state) => recordAnswer(state, current.id, mastered, [mastered ? "mastered" : "review"]));
  }

  function toggleFavorite() {
    const added = !study.favorites.includes(current.id);
    window.NaviAnalytics?.track(added ? "favorite_added" : "favorite_removed", { product: "mt", itemId: current.id });
    setStudy((state) => ({ ...state, favorites: toggleInList(state.favorites, current.id) }));
  }

  const time = `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(seconds % 60).padStart(2, "0")}`;
  const progress = ((index + 1) / queue.length) * 100;

  if (!current) return <EmptyState icon={CircleAlert} title="没有可练习的题目" copy="返回首页调整章节或练习范围。" action="返回首页" onAction={onExit} />;

  return (
    <main className="practice-page">
      <header className="practice-topbar">
        <button className="icon-button" onClick={onExit} title="退出练习"><ArrowLeft /></button>
        <div><strong>练习模式</strong><span>{current.chapter} · {index + 1}/{queue.length}</span></div>
        <button className="question-index-button mobile-only" onClick={() => setMobileRail(true)}><Menu />题号</button>
        <div className="timer"><Clock3 />{time}</div>
      </header>
      <div className="practice-progress"><span style={{ transform: `scaleX(${progress / 100})` }} /></div>
      <div className="practice-layout">
        <QuestionRail queue={queue} currentIndex={index} study={study} onSelect={resetQuestion} mobileOpen={mobileRail} setMobileOpen={setMobileRail} />
        {mobileRail && <button className="rail-backdrop mobile-only" onClick={() => setMobileRail(false)} aria-label="关闭题目列表" />}
        <section className="question-stage">
          <div className="question-meta"><span>第 {index + 1} 题</span><span>{typeNames[current.type]}</span><span>{current.legacy ? "历史题" : "现行重点"}</span></div>
          <h1>{current.stem}</h1>
          {current.type === "short" ? (
            <div className="short-answer-area">
              <label><span>默写区</span><textarea value={shortDraft} onChange={(event) => setShortDraft(event.target.value)} disabled={submitted} placeholder="在这里组织答案，不会上传或保存正文。" /></label>
              {!submitted ? <button className="primary-button submit-button" onClick={submitAnswer}><BookOpen />查看参考答案</button> : (
                <div className="self-assess"><p>对照参考答案，给这次回忆一个判断：</p><div><button onClick={() => scoreShort(false)} disabled={result !== null}><RefreshCcw />待复习</button><button onClick={() => scoreShort(true)} disabled={result !== null}><Check />已掌握</button></div></div>
              )}
            </div>
          ) : (
            <>
              <AnswerOptions question={current} selected={selected} submitted={submitted} onToggle={toggleOption} />
              <button className="primary-button submit-button" disabled={!selected.length || submitted} onClick={submitAnswer}><Check />提交答案</button>
            </>
          )}
          <div className="mobile-answer-context mobile-only"><ContextRail question={current} submitted={submitted} result={result} /></div>
        </section>
        <ContextRail question={current} submitted={submitted} result={result} />
      </div>
      <footer className="practice-footer">
        <button onClick={() => resetQuestion(Math.max(0, index - 1))} disabled={index === 0}><ArrowLeft />上一题</button>
        <button className={study.favorites.includes(current.id) ? "favorited" : ""} onClick={toggleFavorite}>{study.favorites.includes(current.id) ? <Star fill="currentColor" /> : <Star />}<span>收藏</span></button>
        <button onClick={() => index + 1 < queue.length ? resetQuestion(index + 1) : onExit()}>{index + 1 < queue.length ? "下一题" : "完成"}<ArrowRight /></button>
      </footer>
    </main>
  );
}

function EmptyState({ icon: Icon, title, copy, action, onAction }) {
  return <div className="empty-state"><Icon /><h2>{title}</h2><p>{copy}</p>{action && <button className="primary-button" onClick={onAction}>{action}<ArrowRight /></button>}</div>;
}

function FilterBar({ chapter, setChapter, type, setType, period, setPeriod, hideLegacy, setHideLegacy }) {
  return (
    <div className="filter-bar">
      <Filter />
      <label><span>章节</span><select value={chapter} onChange={(event) => setChapter(event.target.value)}><option>全部章节</option>{bank.chapters.map((item) => <option key={item}>{item}</option>)}</select></label>
      <label><span>题型</span><select value={type} onChange={(event) => setType(event.target.value)}><option value="all">全部题型</option>{Object.entries(typeNames).map(([key, value]) => <option value={key} key={key}>{value}</option>)}</select></label>
      <label><span>年代</span><select value={period} onChange={(event) => setPeriod(event.target.value)}><option value="all">{hideLegacy ? "全部现行题" : "全部资料"}</option><option value="modern">现行重点</option>{!hideLegacy && <option value="legacy">历史题库</option>}</select></label>
      <label className="switch-row filter-switch">
        <span>不看历史题</span>
        <input type="checkbox" checked={hideLegacy} onChange={(event) => {
          const checked = event.target.checked;
          if (checked && period === "legacy") setPeriod("all");
          setHideLegacy(checked);
        }} />
        <i aria-hidden="true" />
      </label>
    </div>
  );
}

function QuestionListView({ mode, study, questions, hideLegacy, setHideLegacy, search, onOpenQuestion, onPractice }) {
  const [chapter, setChapter] = useState("全部章节");
  const [type, setType] = useState("all");
  const [period, setPeriod] = useState("all");
  let base = questions;
  if (mode === "wrong") base = base.filter((question) => study.wrong.includes(question.id));
  if (mode === "favorites") base = base.filter((question) => study.favorites.includes(question.id));
  const filtered = base.filter((question) => {
    if (!matchesQuery(question, search)) return false;
    if (chapter !== "全部章节" && question.chapter !== chapter) return false;
    if (type !== "all" && question.type !== type) return false;
    if (period === "modern" && question.legacy) return false;
    if (period === "legacy" && !question.legacy) return false;
    return true;
  });
  const title = mode === "wrong" ? "错题本" : mode === "favorites" ? "收藏夹" : "题目列表";
  const copy = mode === "wrong" ? "答对后会自动移出错题本。" : mode === "favorites" ? "集中复习你主动标记的重点。" : `当前范围共 ${questions.length} 道可练习题目。`;

  return (
    <main className="page list-page">
      <section className="page-heading list-heading"><div><h1>{title}</h1><p>{copy}</p></div>{filtered.length > 0 && <button className="primary-button" onClick={() => onPractice(filtered)}><Play />练习当前结果</button>}</section>
      <FilterBar chapter={chapter} setChapter={setChapter} type={type} setType={setType} period={period} setPeriod={setPeriod} hideLegacy={hideLegacy} setHideLegacy={setHideLegacy} />
      <div className="result-count">显示 {filtered.length} 道题</div>
      {filtered.length ? (
        <div className="question-list">
          {filtered.map((question) => {
            const attempt = study.attempts[question.id];
            return (
              <button key={question.id} onClick={() => onOpenQuestion(question)}>
                <span className={`question-status ${attempt ? (attempt.lastCorrect ? "correct" : "wrong") : ""}`}>{attempt ? (attempt.lastCorrect ? <Check /> : <X />) : question.number}</span>
                <span className="question-row-main"><strong>{question.stem}</strong><small>{question.chapter} · {typeNames[question.type]} · {question.source}</small></span>
                {question.legacy && <span className="legacy-tag">历史题</span>}
                <ChevronRight />
              </button>
            );
          })}
        </div>
      ) : <EmptyState icon={mode === "wrong" ? ShieldCheck : Star} title={mode === "wrong" ? "暂时没有错题" : mode === "favorites" ? "还没有收藏题目" : "没有匹配结果"} copy={mode === "wrong" ? "继续练习，错误题目会自动汇总到这里。" : "调整筛选条件，或者从练习中添加收藏。"} />}
    </main>
  );
}

function StatsView({ study, questions }) {
  const stats = getStudyStats(study, questions);
  const chapterStats = bank.chapters.map((chapter) => {
    const chapterQuestions = questions.filter((question) => question.chapter === chapter);
    const done = chapterQuestions.filter((question) => study.attempts[question.id]);
    const attempts = done.reduce((sum, question) => sum + study.attempts[question.id].attempts, 0);
    const correct = done.reduce((sum, question) => sum + study.attempts[question.id].correct, 0);
    return { chapter, total: chapterQuestions.length, done: done.length, accuracy: attempts ? Math.round((correct / attempts) * 100) : 0 };
  });
  return (
    <main className="page stats-page">
      <section className="page-heading"><div><h1>学习统计</h1><p>统计只基于当前浏览器中的练习记录。</p></div></section>
      <MetricStrip stats={stats} />
      <section className="stats-table">
        <div className="section-heading"><div><BarChart3 /><h2>章节掌握情况</h2></div></div>
        <div className="stats-table-head"><span>章节</span><span>已练</span><span>正确率</span></div>
        {chapterStats.map((item) => (
          <div className="stats-row" key={item.chapter}>
            <strong>{item.chapter}</strong>
            <span>{item.done} / {item.total}</span>
            <span className="accuracy-cell"><i><b style={{ width: `${item.accuracy}%` }} /></i><em>{item.accuracy}%</em></span>
          </div>
        ))}
      </section>
      <section className="study-guidance">
        <Flag />
        <div><h2>复习建议</h2><p>{stats.practiced < 30 ? "先完成一轮 20 题随机练习，让系统找到你的薄弱点。" : stats.accuracy < 70 ? "先清理错题本，再回到正确率最低的章节顺练。" : "保持随机练习，并用简答题默写检查表达是否完整。"}</p></div>
      </section>
    </main>
  );
}

function SourcesView({ study, setStudy, passportAccount, syncState, onSync, onSignOut }) {
  const fileInput = useRef(null);
  const roleNames = { review: "重点整理", qa: "问答资料", reference: "参考资料", legacy: "历史试题", questions: "题库", duplicate: "重复来源" };
  const [message, setMessage] = useState("");
  const formatSize = (bytes) => bytes >= 1024 * 1024 ? `${(bytes / 1024 / 1024).toFixed(1)} MB` : `${Math.round(bytes / 1024)} KB`;
  async function importFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    try {
      const imported = await importStudyState(file);
      setStudy(imported);
      setMessage("学习记录已导入。");
    } catch (error) {
      setMessage(error instanceof SyntaxError ? "无法识别这份记录文件。" : error.message);
    }
    event.target.value = "";
  }

  function resetProgress() {
    if (!window.confirm("确定清空当前浏览器中的全部练习记录吗？此操作无法撤销。")) return;
    setStudy(emptyStudyState);
    setMessage("学习记录已清空。");
  }

  return (
    <main className="page sources-page">
      <section className="page-heading"><div><h1>账号与资料</h1><p>管理 Navi Passport、本地记录与题目来源。</p></div></section>
      <section className="provenance-note"><ShieldCheck /><div><h2>校勘原则</h2><p>2023-2025 年课程资料用于建立现行复习口径；历史题库用于拓展练习。两道答案冲突题已停用，所有涉及法规、军队编制或国际形势的旧题都应以当前教材为准。</p></div></section>
      <div className="source-table">
        <div className="source-head"><span>资料</span><span>年代</span><span>用途</span><span>文件</span></div>
        {bank.sources.map((source) => {
          const material = materialFiles[source.id];
          return (
            <div className="source-row" key={source.id}>
              <div><FileArchive /><span><strong>{source.name}</strong><small>{source.note} · {material.type.toUpperCase()} · {formatSize(material.size)}</small></span></div>
              <span>{source.period}</span>
              <span className={`role-tag role-${source.role}`}>{roleNames[source.role]}</span>
              <a className="material-download" href={`${import.meta.env.BASE_URL}downloads/${material.file}`} download={source.name}><Download />下载</a>
            </div>
          );
        })}
      </div>
      <section className="passport-tools">
        <div className="passport-heading">
          <UserRound />
          <div><h2>Navi Passport</h2><p>{passportAccount ? `${passportAccount.username} · NaviMT 记录自动同步，NaviWords 数据保持独立。` : "游客模式可直接学习；登录后与 NaviWords 共用身份。"}</p></div>
        </div>
        <div className="passport-controls">
          <span className={`sync-state sync-${syncState.value}`}><i />{syncState.label}</span>
          {passportAccount ? <div><button onClick={onSync}><RefreshCcw />立即同步</button><button onClick={onSignOut}><X />退出</button></div> : <button className="passport-login-button" onClick={startPassportLogin}><UserRound />登录 Navi Passport</button>}
        </div>
      </section>
      <section className="data-tools">
        <div><h2>本地备份</h2><p>导出可用于离线留档，不包含默写区正文。</p></div>
        <div className="data-actions">
          <button onClick={() => exportStudyState(study)}><Download />导出记录</button>
          <button onClick={() => fileInput.current?.click()}><Upload />导入记录</button>
          <button className="danger-button" onClick={resetProgress}><RefreshCcw />清空记录</button>
          <input ref={fileInput} hidden type="file" accept="application/json,.json" onChange={importFile} />
        </div>
        {message && <p className="data-message" aria-live="polite">{message}</p>}
      </section>
    </main>
  );
}

export default function App() {
  const [view, setView] = useState("dashboard");
  const [study, setStudy] = useState(loadStudyState);
  const [search, setSearch] = useState("");
  const [theme, setTheme] = useState(() => localStorage.getItem("military-theory-theme") || (window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" : "light"));
  const [hideLegacy, setHideLegacy] = useState(() => localStorage.getItem(HIDE_LEGACY_STORAGE_KEY) === "true");
  const [collapsed, setCollapsed] = useState(false);
  const [practiceQueue, setPracticeQueue] = useState([]);
  const [passportAccount, setPassportAccount] = useState(null);
  const [syncState, setSyncState] = useState({ value: "local", label: "仅本机" });
  const studyRef = useRef(study);
  studyRef.current = study;
  const passportSync = useMemo(() => createPassportSync({
    getData: () => toSyncState(studyRef.current),
    setData: (remote) => setStudy(fromSyncState(remote)),
    onAccount: setPassportAccount,
    onStatus: (value, label) => setSyncState({ value, label }),
  }), []);
  const availableQuestions = useMemo(
    () => hideLegacy ? activeQuestions.filter((question) => !question.legacy) : activeQuestions,
    [hideLegacy]
  );

  useEffect(() => { saveStudyState(study); passportSync.markDirty(); }, [study, passportSync]);
  useEffect(() => { passportSync.initialize(); }, [passportSync]);
  useEffect(() => { localStorage.setItem(HIDE_LEGACY_STORAGE_KEY, String(hideLegacy)); }, [hideLegacy]);
  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem("military-theory-theme", theme);
    document.querySelector('meta[name="theme-color"]')?.setAttribute("content", theme === "dark" ? "#181a19" : "#f4f2eb");
  }, [theme]);

  function navigate(nextView) {
    setView(nextView);
    setSearch("");
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function updateSearch(value) {
    setSearch(value);
    if (value && view !== "library") setView("library");
  }

  function startPractice(config) {
    let pool = availableQuestions;
    if (config.mode === "wrong") pool = pool.filter((question) => study.wrong.includes(question.id));
    if (config.mode === "favorites") pool = pool.filter((question) => study.favorites.includes(question.id));
    if (config.chapter && config.chapter !== "全部章节") pool = pool.filter((question) => question.chapter === config.chapter);
    if (config.unpracticed) pool = pool.filter((question) => !study.attempts[question.id]);
    if (config.mode === "random") pool = shuffle(pool);
    if (config.count) pool = pool.slice(0, config.count);
    setPracticeQueue(pool);
    window.NaviAnalytics?.track("study_start", { product: "mt", metadata: { mode: config.mode, count: pool.length } });
    setView("practice");
    window.scrollTo({ top: 0 });
  }

  function startWithQuestions(questions) {
    setPracticeQueue(questions);
    window.NaviAnalytics?.track("study_start", { product: "mt", metadata: { mode: "selection", count: questions.length } });
    setView("practice");
    window.scrollTo({ top: 0 });
  }

  const searchedQuestions = useMemo(() => availableQuestions.filter((question) => matchesQuery(question, search)), [availableQuestions, search]);

  let content;
  if (view === "practice") content = <Practice queue={practiceQueue} study={study} setStudy={setStudy} onExit={() => navigate("dashboard")} />;
  else if (view === "dashboard") content = <Dashboard study={study} questions={availableQuestions} hideLegacy={hideLegacy} setHideLegacy={setHideLegacy} onStart={startPractice} onMaterials={() => navigate("sources")} passportAccount={passportAccount} syncState={syncState} onAccount={() => passportAccount ? navigate("sources") : startPassportLogin()} />;
  else if (["library", "wrong", "favorites"].includes(view)) content = <QuestionListView mode={view} study={study} questions={availableQuestions} hideLegacy={hideLegacy} setHideLegacy={setHideLegacy} search={search} onOpenQuestion={(question) => startWithQuestions([question])} onPractice={startWithQuestions} />;
  else if (view === "stats") content = <StatsView study={study} questions={availableQuestions} />;
  else content = <SourcesView study={study} setStudy={setStudy} passportAccount={passportAccount} syncState={syncState} onSync={passportSync.flush} onSignOut={passportSync.signOut} />;

  return (
    <div className={`app-shell ${collapsed ? "nav-collapsed" : ""}`}>
      <Sidebar view={view} onNavigate={navigate} collapsed={collapsed} onCollapse={() => setCollapsed((value) => !value)} />
      <div className="app-main">
        {view !== "practice" && <Topbar search={search} setSearch={updateSearch} theme={theme} toggleTheme={() => setTheme((value) => value === "dark" ? "light" : "dark")} onNavigate={navigate} view={view} passportAccount={passportAccount} syncState={syncState} />}
        {content}
      </div>
      {view !== "practice" && <MobileNav view={view} onNavigate={navigate} />}
      {search && searchedQuestions.length === 0 && <span className="sr-only" aria-live="polite">没有找到匹配题目</span>}
    </div>
  );
}
