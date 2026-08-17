import { useEffect, useMemo, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import {
  CATEGORY_META,
  CategoryKey,
  INITIAL_WHEEL_IDS,
  TOPICS,
  Topic,
} from "./catalog";

type StudyRecord = {
  topicId: string;
  completedAt: string;
  mastery: number;
  note?: string;
};

type StudySession = {
  topicId: string;
  startedAt: number;
};

type TopicOverride = Partial<
  Pick<Topic, "title" | "short" | "category" | "difficulty" | "tags" | "goal" | "plan" | "prerequisites">
>;

type AppState = {
  activeWheelIds: string[];
  records: StudyRecord[];
  session: StudySession | null;
  customTopics: Topic[];
  overrides: Record<string, TopicOverride>;
  focusWeights: Partial<Record<CategoryKey, number>>;
};

type Recommendation = {
  topic: Topic;
  score: number;
  reason: string;
};

type EditDraft = {
  title: string;
  short: string;
  category: CategoryKey;
  difficulty: 1 | 2 | 3;
  goal: string;
  planText: string;
};

type Assessment = {
  topicId: string;
  mastery: number;
  note: string;
};

const STORAGE_KEY = "bio-spin-45-state-v2";
const LEGACY_STORAGE_KEY = "bio-spin-45-state-v1";
const SESSION_LENGTH = 45 * 60 * 1000;
const SPIN_DURATION = 4800;
const APP_BASE = import.meta.env.BASE_URL;
const CATEGORIES = Object.keys(CATEGORY_META) as CategoryKey[];

const emptyDraft: EditDraft = {
  title: "",
  short: "",
  category: "microbiome",
  difficulty: 1,
  goal: "",
  planText: "",
};

function newDefaultState(): AppState {
  return {
    activeWheelIds: [...INITIAL_WHEEL_IDS],
    records: [],
    session: null,
    customTopics: [],
    overrides: {},
    focusWeights: {},
  };
}

function isCategory(value: unknown): value is CategoryKey {
  return typeof value === "string" && CATEGORIES.includes(value as CategoryKey);
}

function isTopic(value: unknown): value is Topic {
  if (!value || typeof value !== "object") return false;
  const candidate = value as Partial<Topic>;
  return (
    typeof candidate.id === "string" &&
    typeof candidate.title === "string" &&
    typeof candidate.short === "string" &&
    isCategory(candidate.category) &&
    (candidate.difficulty === 1 || candidate.difficulty === 2 || candidate.difficulty === 3) &&
    Array.isArray(candidate.tags) &&
    typeof candidate.goal === "string" &&
    Array.isArray(candidate.plan) &&
    candidate.plan.length === 3
  );
}

function mergeTopics(state: AppState): Topic[] {
  return TOPICS.map((topic) => ({
    ...topic,
    ...(state.overrides[topic.id] ?? {}),
    id: topic.id,
  })).concat(state.customTopics);
}

function readState(): AppState {
  if (typeof window === "undefined") return newDefaultState();
  try {
    const saved =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY);
    if (!saved) return newDefaultState();
    const parsed = JSON.parse(saved) as Partial<AppState>;
    const customTopics = Array.isArray(parsed.customTopics)
      ? parsed.customTopics.filter(isTopic)
      : [];
    const validIds = new Set([...TOPICS, ...customTopics].map((topic) => topic.id));
    const activeWheelIds = Array.isArray(parsed.activeWheelIds)
      ? parsed.activeWheelIds.filter((id): id is string => typeof id === "string" && validIds.has(id)).slice(0, 20)
      : [...INITIAL_WHEEL_IDS];
    const records = Array.isArray(parsed.records)
      ? parsed.records.filter(
          (record): record is StudyRecord =>
            Boolean(record) &&
            typeof record.topicId === "string" &&
            typeof record.completedAt === "string" &&
            typeof record.mastery === "number",
        )
      : [];
    const focusWeights: Partial<Record<CategoryKey, number>> = {};
    if (parsed.focusWeights && typeof parsed.focusWeights === "object") {
      CATEGORIES.forEach((category) => {
        const value = parsed.focusWeights?.[category];
        if (typeof value === "number" && Number.isFinite(value)) {
          focusWeights[category] = Math.min(2.4, Math.max(0.45, value));
        }
      });
    }
    return {
      activeWheelIds,
      records,
      session:
        parsed.session &&
        typeof parsed.session.topicId === "string" &&
        typeof parsed.session.startedAt === "number" &&
        validIds.has(parsed.session.topicId)
          ? parsed.session
          : null,
      customTopics,
      overrides:
        parsed.overrides && typeof parsed.overrides === "object"
          ? parsed.overrides
          : {},
      focusWeights,
    };
  } catch {
    return newDefaultState();
  }
}

function formatClock(milliseconds: number) {
  const seconds = Math.max(0, Math.ceil(milliseconds / 1000));
  return `${String(Math.floor(seconds / 60)).padStart(2, "0")}:${String(
    seconds % 60,
  ).padStart(2, "0")}`;
}

function sectorPath(index: number, count: number) {
  const cx = 180;
  const cy = 180;
  const radius = 156;
  const start = (-90 + (360 / count) * index) * (Math.PI / 180);
  const end = (-90 + (360 / count) * (index + 1)) * (Math.PI / 180);
  const startPoint = `${cx + radius * Math.cos(start)} ${cy + radius * Math.sin(start)}`;
  const endPoint = `${cx + radius * Math.cos(end)} ${cy + radius * Math.sin(end)}`;
  return `M ${cx} ${cy} L ${startPoint} A ${radius} ${radius} 0 0 1 ${endPoint} Z`;
}

function latestRecordMap(records: StudyRecord[]) {
  const latest = new Map<string, StudyRecord>();
  records.forEach((record) => {
    const previous = latest.get(record.topicId);
    if (!previous || record.completedAt > previous.completedAt) latest.set(record.topicId, record);
  });
  return latest;
}

function getCategoryStats(records: StudyRecord[], topics: Topic[]) {
  const latest = latestRecordMap(records);
  const lookup = new Map(topics.map((topic) => [topic.id, topic]));
  const sums = {} as Record<CategoryKey, { total: number; count: number }>;
  CATEGORIES.forEach((category) => {
    sums[category] = { total: 0, count: 0 };
  });
  latest.forEach((record) => {
    const topic = lookup.get(record.topicId);
    if (!topic) return;
    sums[topic.category].total += record.mastery;
    sums[topic.category].count += 1;
  });
  return CATEGORIES.reduce(
    (stats, category) => {
      const entry = sums[category];
      stats[category] = {
        count: entry.count,
        average: entry.count ? entry.total / entry.count : null,
      };
      return stats;
    },
    {} as Record<CategoryKey, { count: number; average: number | null }>,
  );
}

function targetDifficulty(completedCount: number) {
  if (completedCount < 7) return 1;
  if (completedCount < 22) return 2;
  return 3;
}

function focusWeight(state: AppState, category: CategoryKey) {
  return state.focusWeights[category] ?? CATEGORY_META[category].defaultWeight;
}

function getRecommendations(
  state: AppState,
  topics: Topic[],
  limit = 3,
  excludedIds = new Set<string>(),
): Recommendation[] {
  const latest = latestRecordMap(state.records);
  const learnedIds = new Set(latest.keys());
  const lookup = new Map(topics.map((topic) => [topic.id, topic]));
  const stats = getCategoryStats(state.records, topics);
  const preferredDifficulty = targetDifficulty(learnedIds.size);
  const recentTopics = [...state.records]
    .sort((a, b) => b.completedAt.localeCompare(a.completedAt))
    .slice(0, 4)
    .map((record) => lookup.get(record.topicId))
    .filter((topic): topic is Topic => Boolean(topic));

  return topics
    .filter(
      (topic) =>
        !learnedIds.has(topic.id) &&
        !state.activeWheelIds.includes(topic.id) &&
        !excludedIds.has(topic.id),
    )
    .map((topic) => {
      const prerequisiteIds = topic.prerequisites ?? [];
      const metPrerequisites = prerequisiteIds.filter((id) => learnedIds.has(id));
      const allPrerequisitesMet =
        prerequisiteIds.length > 0 && metPrerequisites.length === prerequisiteIds.length;
      const prerequisiteProgress = prerequisiteIds.length
        ? metPrerequisites.length / prerequisiteIds.length
        : 1;
      const categoryStat = stats[topic.category];
      const relatedTags = recentTopics.reduce(
        (sum, recent) => sum + recent.tags.filter((tag) => topic.tags.includes(tag)).length,
        0,
      );
      const directContinuation = recentTopics.some((recent) =>
        prerequisiteIds.includes(recent.id),
      );

      let score = focusWeight(state, topic.category) * 1.85;
      score += 2.2 - Math.abs(topic.difficulty - preferredDifficulty) * 0.85;
      score += prerequisiteProgress * 1.35;
      score += Math.min(relatedTags, 3) * 0.38;
      if (directContinuation) score += 1.2;
      if (allPrerequisitesMet) score += 1.25;
      if (categoryStat.average === null) score += 0.8;
      if (categoryStat.average !== null && categoryStat.average < 3) {
        score += (3.25 - categoryStat.average) * 1.15;
      }
      if (topic.difficulty > preferredDifficulty + 1) score -= 2.6;
      if (prerequisiteIds.length > 0 && prerequisiteProgress === 0 && topic.difficulty > 1) {
        score -= 2.1;
      }

      let reason = `与你当前的「${CATEGORY_META[topic.category].label}」优先级相匹配，难度也适合下一步。`;
      if (categoryStat.average !== null && categoryStat.average < 3) {
        reason = `你在「${CATEGORY_META[topic.category].label}」的平均自评为 ${categoryStat.average.toFixed(1)}/5，先补强这一环。`;
      } else if (allPrerequisitesMet) {
        const bridge = lookup.get(metPrerequisites[0]);
        reason = `承接你已完成的「${bridge?.short ?? "前置主题"}」，让知识链继续向前。`;
      } else if (categoryStat.average === null) {
        reason = `这是你尚未建立的「${CATEGORY_META[topic.category].label}」基础模块，适合现在加入。`;
      } else if (directContinuation || relatedTags > 0) {
        reason = "与最近学习的关键词相连，趁记忆新鲜把相邻知识串起来。";
      }
      return { topic, score, reason };
    })
    .sort((a, b) => b.score - a.score)
    .slice(0, limit);
}

function getReviewTopics(state: AppState, topics: Topic[]): Recommendation[] {
  const latest = latestRecordMap(state.records);
  const lookup = new Map(topics.map((topic) => [topic.id, topic]));
  return [...latest.values()]
    .filter((record) => record.mastery <= 2 && !state.activeWheelIds.includes(record.topicId))
    .sort((a, b) => a.mastery - b.mastery || a.completedAt.localeCompare(b.completedAt))
    .slice(0, 2)
    .flatMap((record) => {
      const topic = lookup.get(record.topicId);
      return topic
        ? [{ topic, score: 5 - record.mastery, reason: `上次自评 ${record.mastery}/5；复习一次比继续堆新词条更有效。` }]
        : [];
    });
}

function replaceCompletedTopic(state: AppState, finishedId: string, topics: Topic[]): AppState {
  const activeWithoutFinished = state.activeWheelIds.filter((id) => id !== finishedId);
  const nextState = { ...state, activeWheelIds: activeWithoutFinished };
  const recommended = getRecommendations(nextState, topics, 1)[0]?.topic;
  const learnedIds = new Set(state.records.map((record) => record.topicId));
  const fallback = topics.find(
    (topic) => !learnedIds.has(topic.id) && !activeWithoutFinished.includes(topic.id),
  );
  const replacement = recommended ?? fallback;
  return {
    ...nextState,
    activeWheelIds: replacement
      ? [...activeWithoutFinished, replacement.id].slice(0, 20)
      : activeWithoutFinished,
  };
}

function defaultShort(title: string) {
  return title.replace(/\s+/g, "").slice(0, 10) || "自定义主题";
}

function normalizePlan(input: string, fallback: Topic["plan"]): Topic["plan"] {
  const steps = input
    .split("\n")
    .map((step) => step.trim())
    .filter(Boolean);
  return [steps[0] ?? fallback[0], steps[1] ?? fallback[1], steps[2] ?? fallback[2]];
}

function createCustomTopic(title: string, category: CategoryKey): Topic {
  const cleaned = title.trim();
  return {
    id: `custom-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
    title: cleaned,
    short: defaultShort(cleaned),
    category,
    difficulty: 1,
    tags: ["自定义", CATEGORY_META[category].label],
    goal: `在 45 分钟内建立对「${cleaned}」的可复述理解，并写下一个能用于自己课题的问题。`,
    plan: ["先用一个可信来源写出核心定义。", "把它放入肠菌—肌肉研究路径。", "记录一个下一步可验证的问题。"],
  };
}

function topicToDraft(topic: Topic): EditDraft {
  return {
    title: topic.title,
    short: topic.short,
    category: topic.category,
    difficulty: topic.difficulty,
    goal: topic.goal,
    planText: topic.plan.join("\n"),
  };
}

export default function Home() {
  const [state, setState] = useState<AppState>(newDefaultState);
  const [hydrated, setHydrated] = useState(false);
  const [rotation, setRotation] = useState(0);
  const [isSpinning, setIsSpinning] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [activeTab, setActiveTab] = useState<"spin" | "library" | "recommend">("spin");
  const [notice, setNotice] = useState("");
  const [assessment, setAssessment] = useState<Assessment | null>(null);
  const [customTitle, setCustomTitle] = useState("");
  const [customCategory, setCustomCategory] = useState<CategoryKey>("microbiome");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>(emptyDraft);

  useEffect(() => {
    setState(readState());
    setHydrated(true);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register(`${APP_BASE}sw.js`, { scope: APP_BASE })
        .catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(timer);
  }, []);

  const allTopics = useMemo(() => mergeTopics(state), [state]);
  const topicLookup = useMemo(
    () => new Map(allTopics.map((topic) => [topic.id, topic])),
    [allTopics],
  );
  const wheelTopics = useMemo(
    () =>
      state.activeWheelIds
        .map((id) => topicLookup.get(id))
        .filter((topic): topic is Topic => Boolean(topic)),
    [state.activeWheelIds, topicLookup],
  );
  const currentTopic = state.session ? topicLookup.get(state.session.topicId) : undefined;
  const learnedIds = useMemo(
    () => new Set(state.records.map((record) => record.topicId)),
    [state.records],
  );
  const categoryStats = useMemo(
    () => getCategoryStats(state.records, allTopics),
    [state.records, allTopics],
  );
  const recommendedTopics = useMemo(
    () => getRecommendations(state, allTopics),
    [state, allTopics],
  );
  const reviewTopics = useMemo(() => getReviewTopics(state, allTopics), [state, allTopics]);
  const queueTopics = allTopics.filter(
    (topic) => !learnedIds.has(topic.id) && !state.activeWheelIds.includes(topic.id),
  );
  const remaining = state.session
    ? Math.max(0, SESSION_LENGTH - (now - state.session.startedAt))
    : SESSION_LENGTH;
  const uniqueLearnedCount = learnedIds.size;
  const overallMastery = state.records.length
    ? state.records.reduce((sum, record) => sum + record.mastery, 0) / state.records.length
    : null;

  const spin = () => {
    if (isSpinning || currentTopic || wheelTopics.length === 0) return;
    const selectedIndex = Math.floor(Math.random() * wheelTopics.length);
    const segment = 360 / wheelTopics.length;
    const current = ((rotation % 360) + 360) % 360;
    const target = (360 - (selectedIndex + 0.5) * segment) % 360;
    const adjustment = (target - current + 360) % 360;
    const nextRotation = rotation + adjustment + (6 + Math.floor(Math.random() * 3)) * 360;

    setIsSpinning(true);
    setNotice("");
    setRotation(nextRotation);
    window.setTimeout(() => {
      const topic = wheelTopics[selectedIndex];
      setState((previous) => ({
        ...previous,
        session: { topicId: topic.id, startedAt: Date.now() },
      }));
      setIsSpinning(false);
      setNotice(`今天抽到：${topic.title}`);
      window.setTimeout(() => {
        document.getElementById("spin-result")?.scrollIntoView({
          behavior: "smooth",
          block: "nearest",
        });
      }, 120);
    }, SPIN_DURATION);
  };

  const openAssessment = () => {
    if (!currentTopic) return;
    setAssessment({ topicId: currentTopic.id, mastery: 3, note: "" });
  };

  const saveAssessment = () => {
    if (!assessment || !currentTopic || assessment.topicId !== currentTopic.id) return;
    setState((previous) => {
      const completed: StudyRecord = {
        topicId: currentTopic.id,
        completedAt: new Date().toISOString(),
        mastery: assessment.mastery,
        note: assessment.note.trim() || undefined,
      };
      const withRecord: AppState = {
        ...previous,
        records: [...previous.records, completed],
        session: null,
      };
      return replaceCompletedTopic(withRecord, currentTopic.id, mergeTopics(withRecord));
    });
    setAssessment(null);
    setNotice(`已归档「${currentTopic.title}」。系统会依据你的自评挑选下一个新主题。`);
  };

  const redraw = () => {
    setState((previous) => ({ ...previous, session: null }));
    setNotice("当前题已保留在转盘，可以重新抽一次。 ");
  };

  const addToWheel = (topicId: string) => {
    const topic = topicLookup.get(topicId);
    if (!topic) return;
    if (state.activeWheelIds.includes(topicId)) {
      setNotice(`「${topic.title}」已经在转盘中。`);
      return;
    }
    setState((previous) => {
      const active = [...previous.activeWheelIds];
      if (active.length >= 20) {
        const removeIndex = active.findIndex((id) => id !== previous.session?.topicId);
        if (removeIndex >= 0) active.splice(removeIndex, 1);
      }
      return { ...previous, activeWheelIds: [...active, topicId] };
    });
    setNotice(`已把「${topic.title}」放入转盘。`);
  };

  const swapOutOfWheel = (topicId: string) => {
    const topic = topicLookup.get(topicId);
    if (!topic || state.session?.topicId === topicId) return;
    setState((previous) => {
      const activeWheelIds = previous.activeWheelIds.filter((id) => id !== topicId);
      const replacementState = { ...previous, activeWheelIds };
      const replacement = getRecommendations(
        replacementState,
        mergeTopics(previous),
        1,
        new Set([topicId]),
      )[0]?.topic;
      return {
        ...replacementState,
        activeWheelIds: replacement ? [...activeWheelIds, replacement.id] : activeWheelIds,
      };
    });
    setNotice(`已换出「${topic.title}」，系统补进了一个更适合当前进度的新主题。`);
  };

  const addCustomTopic = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!customTitle.trim()) return;
    const topic = createCustomTopic(customTitle, customCategory);
    setState((previous) => ({
      ...previous,
      customTopics: [...previous.customTopics, topic],
    }));
    setCustomTitle("");
    setNotice(`已创建「${topic.title}」。你可以在下面编辑它，或直接加入转盘。`);
  };

  const beginEdit = (topic: Topic) => {
    setEditingId(topic.id);
    setEditDraft(topicToDraft(topic));
  };

  const saveEdit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!editingId) return;
    const original = topicLookup.get(editingId);
    if (!original || !editDraft.title.trim()) return;
    const patch: TopicOverride = {
      title: editDraft.title.trim(),
      short: editDraft.short.trim() || defaultShort(editDraft.title),
      category: editDraft.category,
      difficulty: editDraft.difficulty,
      goal: editDraft.goal.trim() || original.goal,
      plan: normalizePlan(editDraft.planText, original.plan),
    };
    setState((previous) => {
      if (previous.customTopics.some((topic) => topic.id === editingId)) {
        return {
          ...previous,
          customTopics: previous.customTopics.map((topic) =>
            topic.id === editingId ? { ...topic, ...patch } : topic,
          ),
        };
      }
      return {
        ...previous,
        overrides: {
          ...previous.overrides,
          [editingId]: { ...(previous.overrides[editingId] ?? {}), ...patch },
        },
      };
    });
    setEditingId(null);
    setNotice(`已更新「${patch.title}」。`);
  };

  const toggleFocus = (category: CategoryKey) => {
    setState((previous) => {
      const base = CATEGORY_META[category].defaultWeight;
      const existing = focusWeight(previous, category);
      const isBoosted = existing > base * 1.12;
      return {
        ...previous,
        focusWeights: {
          ...previous.focusWeights,
          [category]: isBoosted ? base * 0.72 : base * 1.42,
        },
      };
    });
  };

  if (!hydrated) {
    return <main className="loading-screen">正在打开你的学习转盘…</main>;
  }

  return (
    <main className="app-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">45</span>
          <div>
            <p className="eyebrow">GUT–MUSCLE RESEARCH PRACTICE</p>
            <h1>Bio Spin 45</h1>
          </div>
        </div>
        <div className="header-progress" aria-label={`已学习 ${uniqueLearnedCount} 个主题`}>
          <strong>{uniqueLearnedCount}</strong>
          <span>已学主题</span>
        </div>
      </header>

      <nav className="tabs" aria-label="主导航">
        <button className={activeTab === "spin" ? "tab active" : "tab"} onClick={() => setActiveTab("spin")}>今日转盘</button>
        <button className={activeTab === "recommend" ? "tab active" : "tab"} onClick={() => setActiveTab("recommend")}>为你推荐</button>
        <button className={activeTab === "library" ? "tab active" : "tab"} onClick={() => setActiveTab("library")}>学习库</button>
      </nav>

      {notice && (
        <div className="notice" role="status">
          <span>{notice}</span>
          <button onClick={() => setNotice("")} aria-label="关闭提示">×</button>
        </div>
      )}

      {activeTab === "spin" && (
        <section className="spin-layout">
          <div className="spin-copy">
            <p className="section-kicker">TODAY&apos;S ONE THING</p>
            <h2>45 分钟，学透一件真正能推进研究的事。</h2>
            <p>转盘维持 20 个待学习主题。每次归档会记录你的掌握度，并优先补进能承接肠菌—肌肉研究路线的新内容。</p>
            <div className="focus-chip">推荐逻辑：学习记录 × 自评薄弱环节 × 前置知识 × 你的研究侧重</div>
          </div>

          <div className="roulette-card">
            <button
              className={isSpinning ? "wheel-button spinning" : "wheel-button"}
              onClick={spin}
              disabled={isSpinning || Boolean(currentTopic)}
              aria-label="开始抽取今日学习主题"
            >
              <svg viewBox="0 0 360 360" role="img" aria-label={`共有 ${wheelTopics.length} 个学习主题的转盘`}>
                <g
                  className="wheel-art"
                  style={{ transform: `rotate(${rotation}deg)` }}
                >
                  {wheelTopics.map((topic, index) => {
                    const meta = CATEGORY_META[topic.category];
                    const angle = -90 + ((index + 0.5) * 360) / wheelTopics.length;
                    const radians = (angle * Math.PI) / 180;
                    const x = 180 + Math.cos(radians) * 105;
                    const y = 180 + Math.sin(radians) * 105;
                    const isSelected = !isSpinning && currentTopic?.id === topic.id;
                    return (
                      <g key={topic.id}>
                        <path
                          d={sectorPath(index, wheelTopics.length)}
                          fill={meta.color}
                          opacity={isSelected ? "1" : "0.96"}
                          stroke={isSelected ? "#16282a" : "#ffffff"}
                          strokeWidth={isSelected ? "4" : "1.2"}
                        />
                        <text x={x} y={y} textAnchor="middle" dominantBaseline="central" transform={`rotate(${angle + 90} ${x} ${y})`} className="wheel-label">
                          {topic.short}
                        </text>
                      </g>
                    );
                  })}
                  <circle cx="180" cy="180" r="37" fill="#fcfbf6" stroke="#243132" strokeWidth="2" />
                  <text x="180" y="174" textAnchor="middle" className="wheel-center-small">BIO</text>
                  <text x="180" y="193" textAnchor="middle" className="wheel-center-large">45</text>
                </g>
                <g className="wheel-pointer" aria-hidden="true">
                  <polygon points="162,4 198,4 180,39" fill="#16282a" />
                  <circle cx="180" cy="7" r="5" fill="#f7f6f0" />
                </g>
              </svg>
            </button>
            <button className="spin-cta" onClick={spin} disabled={isSpinning || Boolean(currentTopic)}>
              {isSpinning ? "正在抽取…" : currentTopic ? "今日任务已确定" : "点击转盘，开始抽签"}
            </button>
            <p className="roulette-caption">当前 {wheelTopics.length}/20 个主题 · 完成后自动补充</p>
            {currentTopic && (
              <div
                id="spin-result"
                className="spin-result"
                style={{ "--topic-color": CATEGORY_META[currentTopic.category].color } as CSSProperties}
                aria-live="polite"
              >
                <span>指针选中 · {CATEGORY_META[currentTopic.category].label}</span>
                <strong>{currentTopic.title}</strong>
                <p>{currentTopic.goal}</p>
              </div>
            )}
          </div>

          {currentTopic ? (
            <article className="session-card" style={{ "--topic-color": CATEGORY_META[currentTopic.category].color } as CSSProperties}>
              <div className="session-header">
                <div>
                  <p className="section-kicker">TODAY&apos;S DRAW</p>
                  <h3>{currentTopic.title}</h3>
                </div>
                <div className="timer-block">
                  <strong>{formatClock(remaining)}</strong>
                  <span>{remaining > 0 ? "专注剩余" : "45 分钟已到"}</span>
                </div>
              </div>
              <p className="session-goal">{currentTopic.goal}</p>
              <ol className="study-plan">
                {currentTopic.plan.map((item) => <li key={item}>{item}</li>)}
              </ol>
              <div className="session-actions">
                <button className="finish-button" onClick={openAssessment}>完成并归档</button>
                <button className="quiet-button" onClick={redraw}>重新抽一个</button>
              </div>
            </article>
          ) : (
            <article className="how-card">
              <span className="how-number">01</span>
              <div><strong>抽签</strong><p>让转盘决定今天的一个具体问题。</p></div>
              <span className="how-number">02</span>
              <div><strong>学习</strong><p>按三步路线投入 45 分钟。</p></div>
              <span className="how-number">03</span>
              <div><strong>复盘</strong><p>自评掌握度，让下一次推荐更贴合你。</p></div>
            </article>
          )}
        </section>
      )}

      {activeTab === "recommend" && (
        <section className="recommendation-layout">
          <article className="recommendations-card">
            <div className="recommendation-heading">
              <div>
                <p className="section-kicker">ADAPTIVE NEXT STEPS</p>
                <h2>下一步推荐</h2>
              </div>
              <span className="status-pill">本地学习记录驱动</span>
            </div>
            <div className="recommendation-list">
              {recommendedTopics.length ? recommendedTopics.map(({ topic, reason }) => (
                <article className="recommendation-item" key={topic.id}>
                  <div className="recommendation-item-head">
                    <div>
                      <p className="section-kicker" style={{ color: CATEGORY_META[topic.category].color }}>{CATEGORY_META[topic.category].label} · 难度 {topic.difficulty}</p>
                      <h3>{topic.title}</h3>
                    </div>
                    <button className="recommend-button" onClick={() => addToWheel(topic.id)}>加入转盘</button>
                  </div>
                  <p>{topic.goal}</p>
                  <span className="recommendation-reason">{reason}</span>
                </article>
              )) : <p>待推荐的新主题已经全部在转盘或已学习库中。你可以添加自己的新词条。</p>}
            </div>
          </article>

          <aside className="insight-card">
            <h3>你的学习画像</h3>
            <p>{uniqueLearnedCount ? `已完成 ${uniqueLearnedCount} 项；平均自评 ${overallMastery?.toFixed(1)}/5。点击类别可切换为重点，推荐会随即变化。` : "还没有学习记录。先抽第一题；完成后的自评会逐步建立你的个人路线。"}</p>
            <div className="mastery-list">
              {CATEGORIES.map((category) => {
                const stat = categoryStats[category];
                const percentage = stat.average === null ? 4 : Math.max(9, (stat.average / 5) * 100);
                return (
                  <div className="mastery-row" key={category}>
                    <span>{CATEGORY_META[category].label}</span>
                    <div className="mastery-track"><i style={{ width: `${percentage}%`, background: CATEGORY_META[category].color }} /></div>
                    <strong>{stat.average === null ? "未学" : `${stat.average.toFixed(1)}`}</strong>
                  </div>
                );
              })}
            </div>
            <div className="focus-controls" aria-label="研究重点">
              {CATEGORIES.map((category) => {
                const base = CATEGORY_META[category].defaultWeight;
                const boosted = focusWeight(state, category) > base * 1.12;
                return <button key={category} className={boosted ? "active" : ""} aria-pressed={boosted} onClick={() => toggleFocus(category)}>{boosted ? "重点 · " : ""}{CATEGORY_META[category].label}</button>;
              })}
            </div>
            {reviewTopics.length > 0 && (
              <div className="recommendation-list" style={{ marginTop: 18 }}>
                <p className="section-kicker">复习提醒</p>
                {reviewTopics.map(({ topic, reason }) => (
                  <div className="recommendation-item" key={topic.id}>
                    <h3>{topic.title}</h3>
                    <p>{reason}</p>
                    <button className="recommend-button" onClick={() => addToWheel(topic.id)}>放回转盘</button>
                  </div>
                ))}
              </div>
            )}
          </aside>
        </section>
      )}

      {activeTab === "library" && (
        <section className="library-layout">
          <div className="library-heading">
            <div>
              <p className="section-kicker">YOUR CURRICULUM</p>
              <h2>研究生学习库</h2>
              <p>可以手动新建、编辑、加入或换出转盘词条；系统始终保留你的操作权。</p>
            </div>
            <div className="library-counts"><span>{wheelTopics.length} 转盘中</span><span>{queueTopics.length} 等待中</span><span>{uniqueLearnedCount} 已学习</span></div>
          </div>

          <article className="library-editor">
            <div>
              <p className="section-kicker">ADD YOUR OWN</p>
              <h3>加入一个自定义主题</h3>
              <p>例如：肌肉特异性敲除模型、短链脂肪酸靶向定量。</p>
            </div>
            <form className="editor-form" onSubmit={addCustomTopic}>
              <input className="input" value={customTitle} onChange={(event) => setCustomTitle(event.target.value)} placeholder="输入想学的技术或知识" aria-label="自定义主题名称" required />
              <select className="select" value={customCategory} onChange={(event) => setCustomCategory(event.target.value as CategoryKey)} aria-label="自定义主题类别">
                {CATEGORIES.map((category) => <option value={category} key={category}>{CATEGORY_META[category].label}</option>)}
              </select>
              <button className="save-button" type="submit">创建词条</button>
            </form>
          </article>

          {editingId && (
            <article className="library-editor edit-row">
              <div>
                <p className="section-kicker">EDIT ENTRY</p>
                <h3>修改词条内容</h3>
                <p>可改标题、转盘短标签、类别、难度、学习目标和三步计划。</p>
              </div>
              <form className="edit-form" onSubmit={saveEdit}>
                <input className="input" value={editDraft.title} onChange={(event) => setEditDraft({ ...editDraft, title: event.target.value })} placeholder="主题名称" required />
                <input className="input" value={editDraft.short} onChange={(event) => setEditDraft({ ...editDraft, short: event.target.value })} placeholder="转盘短标签" />
                <select className="select" value={editDraft.category} onChange={(event) => setEditDraft({ ...editDraft, category: event.target.value as CategoryKey })}>
                  {CATEGORIES.map((category) => <option value={category} key={category}>{CATEGORY_META[category].label}</option>)}
                </select>
                <select className="select" value={editDraft.difficulty} onChange={(event) => setEditDraft({ ...editDraft, difficulty: Number(event.target.value) as 1 | 2 | 3 })}>
                  <option value={1}>难度 1</option><option value={2}>难度 2</option><option value={3}>难度 3</option>
                </select>
                <textarea className="textarea edit-goal" value={editDraft.goal} onChange={(event) => setEditDraft({ ...editDraft, goal: event.target.value })} placeholder="45 分钟学习目标" />
                <textarea className="textarea edit-plan" value={editDraft.planText} onChange={(event) => setEditDraft({ ...editDraft, planText: event.target.value })} placeholder="三步计划，每行一步" />
                <div className="edit-form-actions"><button className="save-button" type="submit">保存修改</button><button className="text-button" type="button" onClick={() => setEditingId(null)}>取消</button></div>
              </form>
            </article>
          )}

          <div className="topic-grid">
            {allTopics.map((topic) => {
              const completed = learnedIds.has(topic.id);
              const active = state.activeWheelIds.includes(topic.id);
              const isCurrent = state.session?.topicId === topic.id;
              return (
                <article key={topic.id} className={completed ? "topic-card learned" : active ? "topic-card active" : "topic-card"}>
                  <div className="topic-card-head">
                    <span style={{ color: CATEGORY_META[topic.category].color }}>{CATEGORY_META[topic.category].label}</span>
                    <em>难度 {topic.difficulty}</em>
                  </div>
                  <h3>{topic.title}</h3>
                  <p>{topic.goal}</p>
                  <small>{isCurrent ? "今日学习中" : completed ? "已学习" : active ? "转盘中" : "等待推荐"}</small>
                  <div className="topic-card-actions">
                    <button className="text-button" onClick={() => beginEdit(topic)}>编辑</button>
                    {active ? (
                      <button className="text-button" disabled={isCurrent} onClick={() => swapOutOfWheel(topic.id)}>{isCurrent ? "学习中" : "换出"}</button>
                    ) : (
                      <button className="text-button" onClick={() => addToWheel(topic.id)}>{completed ? "复习到转盘" : "加入转盘"}</button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {assessment && (
        <div className="assessment-backdrop" role="dialog" aria-modal="true" aria-labelledby="assessment-title">
          <article className="assessment-card">
            <p className="section-kicker">LEARNING CHECK-IN</p>
            <h2 id="assessment-title">这 45 分钟，你掌握得怎样？</h2>
            <p>这不是考试。你的自评会让系统更合理地选择补强、承接或进阶的下一项内容。</p>
            <div className="assessment-options">
              {[
                [1, "完全陌生"], [2, "还需复习"], [3, "能复述"], [4, "能判读"], [5, "能应用"],
              ].map(([value, label]) => (
                <button key={value} className={assessment.mastery === value ? "rating-option active" : "rating-option"} onClick={() => setAssessment({ ...assessment, mastery: value as number })}>
                  <strong>{value}/5</strong><span>{label}</span>
                </button>
              ))}
            </div>
            <textarea className="textarea" value={assessment.note} onChange={(event) => setAssessment({ ...assessment, note: event.target.value })} placeholder="可选：记一句收获、疑问或下次要补的点" />
            <div className="assessment-actions">
              <button className="text-button" onClick={() => setAssessment(null)}>暂不归档</button>
              <button className="save-button" onClick={saveAssessment}>保存并推荐下一项</button>
            </div>
          </article>
        </div>
      )}
    </main>
  );
}
