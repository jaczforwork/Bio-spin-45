import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties, FormEvent } from "react";
import type { Session as AuthSession } from "@supabase/supabase-js";
import {
  CATEGORY_META,
  CategoryKey,
  INITIAL_WHEEL_IDS,
  TOPICS,
  Topic,
} from "./catalog";
import { cloudEnabled, supabase } from "./cloud";

type StudyRecord = {
  topicId: string;
  completedAt: string;
  mastery: number;
  understanding?: string;
  question?: string;
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
  topicUpdatedAt: Record<string, string>;
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
  understanding: string;
  question: string;
};

type AuthMode = "password" | "register" | "magic";

type LibrarySort =
  | "updated"
  | "curriculum"
  | "difficulty-asc"
  | "difficulty-desc"
  | "status"
  | "category"
  | "recent";

type SyncStatus = "local" | "syncing" | "synced" | "offline" | "error";

const STORAGE_KEY = "bio-spin-45-state-v2";
const LEGACY_STORAGE_KEY = "bio-spin-45-state-v1";
const ASSESSMENT_DRAFT_KEY = "bio-spin-45-assessment-draft-v1";
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
    topicUpdatedAt: {},
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

function normalizeState(value: unknown): AppState {
  try {
    const parsed = value && typeof value === "object" ? (value as Partial<AppState>) : {};
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
    const topicUpdatedAt: Record<string, string> = {};
    if (parsed.topicUpdatedAt && typeof parsed.topicUpdatedAt === "object") {
      Object.entries(parsed.topicUpdatedAt).forEach(([topicId, timestamp]) => {
        if (typeof timestamp === "string" && !Number.isNaN(Date.parse(timestamp))) {
          topicUpdatedAt[topicId] = timestamp;
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
      topicUpdatedAt,
    };
  } catch {
    return newDefaultState();
  }
}

function readState(): AppState {
  if (typeof window === "undefined") return newDefaultState();
  try {
    const saved =
      window.localStorage.getItem(STORAGE_KEY) ??
      window.localStorage.getItem(LEGACY_STORAGE_KEY);
    return saved ? normalizeState(JSON.parse(saved)) : newDefaultState();
  } catch {
    return newDefaultState();
  }
}

function readAssessmentDraft(topicId: string | undefined): Assessment | null {
  if (!topicId || typeof window === "undefined") return null;
  try {
    const saved = JSON.parse(window.localStorage.getItem(ASSESSMENT_DRAFT_KEY) ?? "null") as Partial<Assessment> | null;
    if (!saved || saved.topicId !== topicId) return null;
    return {
      topicId,
      mastery: typeof saved.mastery === "number" ? Math.min(5, Math.max(1, saved.mastery)) : 3,
      understanding: typeof saved.understanding === "string" ? saved.understanding : "",
      question: typeof saved.question === "string" ? saved.question : "",
    };
  } catch {
    return null;
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

function fillWheel(state: AppState, topics: Topic[], target = 20): AppState {
  let next = { ...state, activeWheelIds: [...state.activeWheelIds] };
  const learnedIds = new Set(next.records.map((record) => record.topicId));

  while (next.activeWheelIds.length < target) {
    const recommended = getRecommendations(next, topics, 1)[0]?.topic;
    const fallback = topics.find(
      (topic) => !learnedIds.has(topic.id) && !next.activeWheelIds.includes(topic.id),
    );
    const replacement = recommended ?? fallback;
    if (!replacement) break;
    next = { ...next, activeWheelIds: [...next.activeWheelIds, replacement.id] };
  }
  return next;
}

function isUntouchedState(state: AppState) {
  return (
    state.records.length === 0 &&
    state.customTopics.length === 0 &&
    state.session === null &&
    Object.keys(state.overrides).length === 0 &&
    Object.keys(state.focusWeights).length === 0 &&
    Object.keys(state.topicUpdatedAt).length === 0 &&
    state.activeWheelIds.join("|") === INITIAL_WHEEL_IDS.join("|")
  );
}

function mergeAppStates(local: AppState, remote: AppState): AppState {
  if (isUntouchedState(local)) return remote;
  if (isUntouchedState(remote)) return local;

  const customTopics = [...remote.customTopics, ...local.customTopics].reduce<Topic[]>(
    (items, topic) => {
      const existing = items.findIndex((candidate) => candidate.id === topic.id);
      if (existing >= 0) items[existing] = topic;
      else items.push(topic);
      return items;
    },
    [],
  );
  const recordKeys = new Set<string>();
  const records = [...remote.records, ...local.records]
    .filter((record) => {
      const key = `${record.topicId}|${record.completedAt}`;
      if (recordKeys.has(key)) return false;
      recordKeys.add(key);
      return true;
    })
    .sort((a, b) => a.completedAt.localeCompare(b.completedAt));
  const sessionCandidates = [remote.session, local.session]
    .filter((session): session is StudySession => Boolean(session))
    .sort((a, b) => b.startedAt - a.startedAt);
  const topicUpdatedAt = { ...remote.topicUpdatedAt };
  Object.entries(local.topicUpdatedAt).forEach(([topicId, timestamp]) => {
    if (!topicUpdatedAt[topicId] || timestamp > topicUpdatedAt[topicId]) {
      topicUpdatedAt[topicId] = timestamp;
    }
  });
  const merged: AppState = {
    activeWheelIds: [...new Set([...remote.activeWheelIds, ...local.activeWheelIds])].slice(0, 20),
    records,
    session: sessionCandidates[0] ?? null,
    customTopics,
    overrides: { ...remote.overrides, ...local.overrides },
    focusWeights: { ...remote.focusWeights, ...local.focusWeights },
    topicUpdatedAt,
  };
  const topics = mergeTopics(merged);
  const validIds = new Set(topics.map((topic) => topic.id));
  const cleaned = {
    ...merged,
    activeWheelIds: merged.activeWheelIds.filter((id) => validIds.has(id)),
    records: merged.records.filter((record) => validIds.has(record.topicId)),
    session:
      merged.session && validIds.has(merged.session.topicId) ? merged.session : null,
  };
  return fillWheel(cleaned, topics);
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

function buildChatGPTPrompt(topic: Topic, understanding: string, question: string) {
  return `你是一位严谨、善于启发研究生的生物医学导师。请评估我对今天学习主题的真实掌握程度。

【我的研究方向】肠道菌群调控骨骼肌
【今日主题】${topic.title}
【学习目标】${topic.goal}
【45 分钟学习路线】
${topic.plan.map((step, index) => `${index + 1}. ${step}`).join("\n")}

【我用自己的话做的解释】
${understanding.trim()}

【我仍然不确定的问题】
${question.trim() || "暂时没有写出具体问题，请帮我发现理解盲区。"}

请按下面的方式辅导我：
1. 分别指出我的表述中正确、模糊、可能错误或缺失的部分；
2. 先提出 3 个由浅入深的追问，让我作答，不要立刻替我回答；
3. 检查我能否把这个知识用于肠道菌群—骨骼肌研究，并给出一个具体应用情境；
4. 在我回答追问后，按 1–5 分评估掌握程度，并说明评分依据、一个最需要补强的点和一个 15 分钟复习任务。

请区分事实准确性、机制理解和实验应用，不要因为文字流畅而高估掌握程度。`;
}

async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    const textarea = document.createElement("textarea");
    textarea.value = text;
    textarea.setAttribute("readonly", "");
    textarea.style.position = "fixed";
    textarea.style.opacity = "0";
    document.body.appendChild(textarea);
    textarea.select();
    const copied = document.execCommand("copy");
    textarea.remove();
    return copied;
  }
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
  const [viewingRecord, setViewingRecord] = useState<StudyRecord | null>(null);
  const [customTitle, setCustomTitle] = useState("");
  const [customCategory, setCustomCategory] = useState<CategoryKey>("microbiome");
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState<EditDraft>(emptyDraft);
  const [librarySort, setLibrarySort] = useState<LibrarySort>("updated");
  const [authSession, setAuthSession] = useState<AuthSession | null>(null);
  const [syncStatus, setSyncStatus] = useState<SyncStatus>("local");
  const [cloudPanelOpen, setCloudPanelOpen] = useState(false);
  const [authEmail, setAuthEmail] = useState("");
  const [authPassword, setAuthPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [authMode, setAuthMode] = useState<AuthMode>("password");
  const [linkSent, setLinkSent] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const stateRef = useRef(state);
  const syncReadyRef = useRef(false);
  const lastSyncedRef = useRef("");

  useEffect(() => {
    const savedState = readState();
    setState(savedState);
    setAssessment(readAssessmentDraft(savedState.session?.topicId));
    setHydrated(true);
    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register(`${APP_BASE}sw.js`, { scope: APP_BASE })
        .catch(() => undefined);
    }
  }, []);

  useEffect(() => {
    if (!hydrated) return;
    if (assessment) {
      window.localStorage.setItem(ASSESSMENT_DRAFT_KEY, JSON.stringify(assessment));
    } else {
      window.localStorage.removeItem(ASSESSMENT_DRAFT_KEY);
    }
  }, [assessment, hydrated]);

  useEffect(() => {
    if (!hydrated) return;
    stateRef.current = state;
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  }, [state, hydrated]);

  useEffect(() => {
    const client = supabase;
    if (!client) return;
    client.auth.getSession().then(({ data }) => setAuthSession(data.session));
    const { data } = client.auth.onAuthStateChange((_event, nextSession) => {
      setAuthSession(nextSession);
      if (!nextSession) {
        syncReadyRef.current = false;
        lastSyncedRef.current = "";
        setSyncStatus("local");
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    const client = supabase;
    const userId = authSession?.user.id;
    if (!client || !userId || !hydrated) return;

    let cancelled = false;
    syncReadyRef.current = false;
    setSyncStatus("syncing");

    const initializeSync = async () => {
      const { data, error } = await client
        .from("user_states")
        .select("state, updated_at")
        .eq("user_id", userId)
        .maybeSingle();
      if (cancelled) return;
      if (error) {
        setSyncStatus(navigator.onLine ? "error" : "offline");
        setNotice("云同步连接失败。本机记录仍会保留，请检查云数据库是否已完成初始化。");
        return;
      }

      const migrationKey = `bio-spin-45-cloud-migrated:${userId}`;
      const alreadyMigrated = window.localStorage.getItem(migrationKey) === "yes";
      const remote = data?.state ? normalizeState(data.state) : null;
      const next = remote
        ? alreadyMigrated
          ? remote
          : mergeAppStates(stateRef.current, remote)
        : stateRef.current;
      const serialized = JSON.stringify(next);

      stateRef.current = next;
      setState(next);
      const { error: saveError } = await client.from("user_states").upsert(
        { user_id: userId, state: next, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
      if (cancelled) return;
      if (saveError) {
        setSyncStatus(navigator.onLine ? "error" : "offline");
        setNotice("学习记录已经保存在本机，但暂时无法写入云端。");
        return;
      }

      window.localStorage.setItem(migrationKey, "yes");
      lastSyncedRef.current = serialized;
      syncReadyRef.current = true;
      setSyncStatus("synced");
    };

    void initializeSync();
    const channel = client
      .channel(`user-state-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "user_states",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          const row = payload.new as { state?: unknown };
          if (!row?.state) return;
          const incoming = normalizeState(row.state);
          const serialized = JSON.stringify(incoming);
          if (serialized === lastSyncedRef.current) return;
          lastSyncedRef.current = serialized;
          stateRef.current = incoming;
          setState(incoming);
          setSyncStatus("synced");
        },
      )
      .subscribe();

    return () => {
      cancelled = true;
      syncReadyRef.current = false;
      void client.removeChannel(channel);
    };
  }, [authSession?.user.id, hydrated]);

  useEffect(() => {
    const client = supabase;
    const userId = authSession?.user.id;
    if (!client || !userId || !hydrated || !syncReadyRef.current) return;
    const serialized = JSON.stringify(state);
    if (serialized === lastSyncedRef.current) return;

    setSyncStatus(navigator.onLine ? "syncing" : "offline");
    const timer = window.setTimeout(async () => {
      const { error } = await client.from("user_states").upsert(
        { user_id: userId, state, updated_at: new Date().toISOString() },
        { onConflict: "user_id" },
      );
      if (error) {
        setSyncStatus(navigator.onLine ? "error" : "offline");
        return;
      }
      lastSyncedRef.current = serialized;
      setSyncStatus("synced");
    }, 650);
    return () => window.clearTimeout(timer);
  }, [authSession?.user.id, hydrated, state]);

  useEffect(() => {
    const retryWhenOnline = () => {
      if (authSession?.user.id && syncReadyRef.current) {
        setState((previous) => ({ ...previous }));
      }
    };
    window.addEventListener("online", retryWhenOnline);
    return () => window.removeEventListener("online", retryWhenOnline);
  }, [authSession?.user.id]);

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
  const latestRecords = useMemo(() => latestRecordMap(state.records), [state.records]);
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
  const sortedLibraryTopics = useMemo(() => {
    const originalOrder = new Map(allTopics.map((topic, index) => [topic.id, index]));
    const latest = latestRecordMap(state.records);
    const categoryOrder = new Map(CATEGORIES.map((category, index) => [category, index]));
    const statusRank = (topic: Topic) => {
      if (state.session?.topicId === topic.id) return 0;
      if (state.activeWheelIds.includes(topic.id)) return 1;
      if (!learnedIds.has(topic.id)) return 2;
      return 3;
    };
    const fallback = (a: Topic, b: Topic) =>
      (originalOrder.get(a.id) ?? 0) - (originalOrder.get(b.id) ?? 0);

    return [...allTopics].sort((a, b) => {
      if (librarySort === "updated") {
        const aCustom = a.id.startsWith("custom-") ? 0 : 1;
        const bCustom = b.id.startsWith("custom-") ? 0 : 1;
        const customGroup = aCustom - bCustom;
        if (customGroup) return customGroup;
        const customTimestamp = (topic: Topic) => {
          const saved = state.topicUpdatedAt[topic.id];
          if (saved) return Date.parse(saved);
          const match = topic.id.match(/^custom-(\d+)-/);
          return match ? Number(match[1]) : 0;
        };
        return customTimestamp(b) - customTimestamp(a) || fallback(a, b);
      }
      if (librarySort === "difficulty-asc") return a.difficulty - b.difficulty || fallback(a, b);
      if (librarySort === "difficulty-desc") return b.difficulty - a.difficulty || fallback(a, b);
      if (librarySort === "status") return statusRank(a) - statusRank(b) || fallback(a, b);
      if (librarySort === "category") {
        return (
          (categoryOrder.get(a.category) ?? 0) - (categoryOrder.get(b.category) ?? 0) ||
          a.difficulty - b.difficulty ||
          fallback(a, b)
        );
      }
      if (librarySort === "recent") {
        const aDate = latest.get(a.id)?.completedAt ?? "";
        const bDate = latest.get(b.id)?.completedAt ?? "";
        return bDate.localeCompare(aDate) || fallback(a, b);
      }
      return fallback(a, b);
    });
  }, [allTopics, learnedIds, librarySort, state.activeWheelIds, state.records, state.session, state.topicUpdatedAt]);
  const remaining = state.session
    ? Math.max(0, SESSION_LENGTH - (now - state.session.startedAt))
    : SESSION_LENGTH;
  const uniqueLearnedCount = learnedIds.size;
  const overallMastery = state.records.length
    ? state.records.reduce((sum, record) => sum + record.mastery, 0) / state.records.length
    : null;
  const syncLabel = !authSession
    ? "登录同步"
    : syncStatus === "syncing"
      ? "同步中…"
      : syncStatus === "offline"
        ? "离线保存"
        : syncStatus === "error"
          ? "同步异常"
          : "已同步";
  const viewingTopic = viewingRecord ? topicLookup.get(viewingRecord.topicId) : undefined;

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
    setAssessment({ topicId: currentTopic.id, mastery: 3, understanding: "", question: "" });
  };

  const saveAssessment = () => {
    if (!assessment || !currentTopic || assessment.topicId !== currentTopic.id) return;
    const understanding = assessment.understanding.trim();
    if (understanding.length < 10) return;
    setState((previous) => {
      const completed: StudyRecord = {
        topicId: currentTopic.id,
        completedAt: new Date().toISOString(),
        mastery: assessment.mastery,
        understanding,
        question: assessment.question.trim() || undefined,
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

  const openChatGPTEvaluation = async (topic: Topic, understanding: string, question: string) => {
    if (understanding.trim().length < 10) {
      setNotice("请先用至少 10 个字写下自己的理解，再请 ChatGPT 评估。");
      return;
    }
    const chatWindow = window.open("https://chatgpt.com/", "_blank");
    if (chatWindow) chatWindow.opener = null;
    const copied = await copyText(buildChatGPTPrompt(topic, understanding, question));
    if (!chatWindow) {
      setNotice(copied ? "评估材料已复制；浏览器阻止了新窗口，请手动打开 ChatGPT 并粘贴。" : "无法打开 ChatGPT，请检查浏览器的新窗口权限。");
      return;
    }
    setNotice(copied ? "评估材料已复制。请在 ChatGPT 输入框中粘贴并发送，回来后按反馈调整掌握度。" : "ChatGPT 已打开，但自动复制失败；请返回并手动复制你的学习输出。");
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
      topicUpdatedAt: { ...previous.topicUpdatedAt, [topic.id]: new Date().toISOString() },
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
          topicUpdatedAt: { ...previous.topicUpdatedAt, [editingId]: new Date().toISOString() },
        };
      }
      return {
        ...previous,
        overrides: {
          ...previous.overrides,
          [editingId]: { ...(previous.overrides[editingId] ?? {}), ...patch },
        },
        topicUpdatedAt: { ...previous.topicUpdatedAt, [editingId]: new Date().toISOString() },
      };
    });
    setEditingId(null);
    setNotice(`已更新「${patch.title}」。`);
  };

  const deleteCustomTopic = (topicId: string) => {
    const topic = state.customTopics.find((candidate) => candidate.id === topicId);
    if (!topic) return;
    if (state.session?.topicId === topicId) {
      setNotice("这个词条正在学习中。请先完成归档或重新抽取，再删除它。");
      return;
    }
    const hasRecords = state.records.some((record) => record.topicId === topicId);
    const confirmed = window.confirm(
      hasRecords
        ? `确定删除「${topic.title}」吗？它的已学习记录和笔记也会一起删除。`
        : `确定删除自定义词条「${topic.title}」吗？`,
    );
    if (!confirmed) return;

    setState((previous) => {
      const overrides = { ...previous.overrides };
      delete overrides[topicId];
      const topicUpdatedAt = { ...previous.topicUpdatedAt };
      delete topicUpdatedAt[topicId];
      const cleaned: AppState = {
        ...previous,
        activeWheelIds: previous.activeWheelIds.filter((id) => id !== topicId),
        records: previous.records.filter((record) => record.topicId !== topicId),
        customTopics: previous.customTopics.filter((candidate) => candidate.id !== topicId),
        overrides,
        topicUpdatedAt,
      };
      return fillWheel(cleaned, mergeTopics(cleaned));
    });
    if (editingId === topicId) setEditingId(null);
    setNotice(`已删除「${topic.title}」，并自动补齐转盘。`);
  };

  const sendAuthLink = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const client = supabase;
    const email = authEmail.trim().toLowerCase();
    if (!client || !email) return;
    setAuthBusy(true);
    const { error } = await client.auth.signInWithOtp({
      email,
      options: {
        shouldCreateUser: true,
        emailRedirectTo: `${window.location.origin}${APP_BASE}`,
      },
    });
    setAuthBusy(false);
    if (error) {
      setNotice(`登录链接发送失败：${error.message}`);
      return;
    }
    setAuthEmail(email);
    setLinkSent(true);
    setNotice(`登录链接已发送到 ${email}，请在邮件中点击链接。`);
  };

  const signInWithPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const client = supabase;
    const email = authEmail.trim().toLowerCase();
    if (!client || !email || authPassword.length < 8) return;
    setAuthBusy(true);
    const { error } = await client.auth.signInWithPassword({ email, password: authPassword });
    setAuthBusy(false);
    if (error) {
      setNotice(`登录失败：${error.message}。如果你以前只用邮件链接登录，请先在 Safari 网页版登录并设置同步密码。`);
      return;
    }
    setAuthEmail(email);
    setAuthPassword("");
    setNotice("已在当前 App 内登录，正在合并并同步学习记录。");
  };

  const signUpWithPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const client = supabase;
    const email = authEmail.trim().toLowerCase();
    if (!client || !email || authPassword.length < 8) return;
    setAuthBusy(true);
    const { data, error } = await client.auth.signUp({
      email,
      password: authPassword,
      options: { emailRedirectTo: `${window.location.origin}${APP_BASE}` },
    });
    setAuthBusy(false);
    if (error) {
      setNotice(`注册失败：${error.message}`);
      return;
    }
    setAuthEmail(email);
    setAuthPassword("");
    if (data.session) {
      setNotice("账号已创建并在当前 App 内登录，正在同步学习记录。");
    } else {
      setLinkSent(true);
      setNotice(`确认邮件已发送到 ${email}。确认后请回到桌面 App 用邮箱和密码登录。`);
    }
  };

  const setSyncPassword = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const client = supabase;
    if (!client || !authSession || newPassword.length < 8) return;
    setAuthBusy(true);
    const { error } = await client.auth.updateUser({ password: newPassword });
    setAuthBusy(false);
    if (error) {
      setNotice(`同步密码设置失败：${error.message}`);
      return;
    }
    setNewPassword("");
    setNotice("同步密码已设置。现在可在主屏幕 App 中用同一邮箱和密码直接登录。");
  };

  const signOut = async () => {
    const client = supabase;
    if (!client) return;
    await client.auth.signOut();
    setCloudPanelOpen(false);
    setLinkSent(false);
    setAuthMode("password");
    setNotice("已退出云同步；本机记录仍然保留。");
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
        <div className="header-actions">
          {cloudEnabled && (
            <button
              className={`sync-button ${syncStatus}`}
              onClick={() => setCloudPanelOpen((open) => !open)}
              aria-expanded={cloudPanelOpen}
            >
              <i aria-hidden="true" />{syncLabel}
            </button>
          )}
          <div className="header-progress" aria-label={`已学习 ${uniqueLearnedCount} 个主题`}>
            <strong>{uniqueLearnedCount}</strong>
            <span>已学主题</span>
          </div>
        </div>
      </header>

      <nav className="tabs" aria-label="主导航">
        <button className={activeTab === "spin" ? "tab active" : "tab"} onClick={() => setActiveTab("spin")}>今日转盘</button>
        <button className={activeTab === "recommend" ? "tab active" : "tab"} onClick={() => setActiveTab("recommend")}>为你推荐</button>
        <button className={activeTab === "library" ? "tab active" : "tab"} onClick={() => setActiveTab("library")}>学习库</button>
      </nav>

      {cloudEnabled && cloudPanelOpen && (
        <section className="cloud-panel" aria-label="跨设备同步">
          <div>
            <p className="section-kicker">PRIVATE CLOUD SYNC</p>
            <h2>跨设备同步</h2>
            <p>同一邮箱登录后，电脑、手机和平板共享抽签结果、倒计时、学习记录和自定义词条。</p>
          </div>
          {authSession ? (
            <div className="cloud-account">
              <div className="cloud-account-status">
                <span>{authSession.user.email}</span>
                <strong>{syncLabel}</strong>
              </div>
              <form className="password-set-form" onSubmit={setSyncPassword}>
                <label htmlFor="new-sync-password">同步密码</label>
                <input
                  id="new-sync-password"
                  className="input"
                  type="password"
                  autoComplete="new-password"
                  minLength={8}
                  value={newPassword}
                  onChange={(event) => setNewPassword(event.target.value)}
                  placeholder="设置或修改（至少 8 位）"
                  required
                />
                <button className="save-button" disabled={authBusy || newPassword.length < 8} type="submit">保存密码</button>
              </form>
              <p>从邮件链接登录的老用户，请在 Safari 网页版设置一次密码，再到主屏幕 App 直接登录。</p>
              <button className="text-button cloud-signout" onClick={signOut}>退出登录</button>
            </div>
          ) : linkSent ? (
            <div className="magic-link-sent" role="status">
              <strong>{authMode === "register" ? "确认邮件已经发送" : "登录邮件已经发送"}</strong>
              <p>{authMode === "register" ? `请确认发往 ${authEmail} 的邮件，然后回到主屏幕 App，用刚设置的邮箱和密码登录。` : `请打开发往 ${authEmail} 的邮件并点击登录链接。iOS 可能会在 Safari 中登录；登录后请在那里设置同步密码，再回到主屏幕 App。`}</p>
              <div>
                <button className="text-button" type="button" onClick={() => setLinkSent(false)}>返回登录方式</button>
              </div>
            </div>
          ) : authMode === "password" ? (
            <form className="cloud-form cloud-form-stacked" onSubmit={signInWithPassword}>
              <label htmlFor="auth-email">邮箱地址</label>
              <input id="auth-email" className="input" type="email" autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="name@example.com" required />
              <label htmlFor="auth-password">同步密码</label>
              <input id="auth-password" className="input" type="password" autoComplete="current-password" minLength={8} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="至少 8 位" required />
              <button className="save-button" disabled={authBusy || authPassword.length < 8} type="submit">{authBusy ? "正在登录…" : "在当前 App 登录"}</button>
              <div className="auth-switches">
                <button className="text-button" type="button" onClick={() => { setAuthMode("register"); setLinkSent(false); }}>注册新账号</button>
                <button className="text-button" type="button" onClick={() => { setAuthMode("magic"); setLinkSent(false); }}>使用邮件登录链接</button>
              </div>
            </form>
          ) : authMode === "register" ? (
            <form className="cloud-form cloud-form-stacked" onSubmit={signUpWithPassword}>
              <label htmlFor="register-email">注册邮箱</label>
              <input id="register-email" className="input" type="email" autoComplete="email" value={authEmail} onChange={(event) => setAuthEmail(event.target.value)} placeholder="name@example.com" required />
              <label htmlFor="register-password">设置同步密码</label>
              <input id="register-password" className="input" type="password" autoComplete="new-password" minLength={8} value={authPassword} onChange={(event) => setAuthPassword(event.target.value)} placeholder="至少 8 位" required />
              <button className="save-button" disabled={authBusy || authPassword.length < 8} type="submit">{authBusy ? "正在注册…" : "注册并发送确认邮件"}</button>
              <button className="text-button auth-back" type="button" onClick={() => { setAuthMode("password"); setLinkSent(false); }}>返回邮箱密码登录</button>
            </form>
          ) : (
            <form className="cloud-form" onSubmit={sendAuthLink}>
              <label htmlFor="auth-email">邮箱地址</label>
              <input
                id="auth-email"
                className="input"
                type="email"
                autoComplete="email"
                value={authEmail}
                onChange={(event) => setAuthEmail(event.target.value)}
                placeholder="name@example.com"
                required
              />
              <button className="save-button" disabled={authBusy} type="submit">{authBusy ? "正在发送…" : "发送登录链接"}</button>
              <button className="text-button" type="button" onClick={() => { setAuthMode("password"); setLinkSent(false); }}>返回邮箱密码登录</button>
            </form>
          )}
        </section>
      )}

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
              <span className="status-pill">{authSession ? "跨设备学习记录驱动" : "本地学习记录驱动"}</span>
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

          <div className="library-tools">
            <label htmlFor="library-sort">排列方式</label>
            <select
              id="library-sort"
              className="select"
              value={librarySort}
              onChange={(event) => setLibrarySort(event.target.value as LibrarySort)}
            >
              <option value="updated">最近更新：自定义优先</option>
              <option value="curriculum">推荐学习顺序</option>
              <option value="difficulty-asc">难度：由浅到深</option>
              <option value="difficulty-desc">难度：由深到浅</option>
              <option value="status">状态：学习中／转盘／待学习／已学</option>
              <option value="category">研究类别</option>
              <option value="recent">最近学习</option>
            </select>
          </div>

          <div className="topic-grid">
            {sortedLibraryTopics.map((topic) => {
              const completed = learnedIds.has(topic.id);
              const latestRecord = latestRecords.get(topic.id);
              const active = state.activeWheelIds.includes(topic.id);
              const isCurrent = state.session?.topicId === topic.id;
              const isCustom = state.customTopics.some((candidate) => candidate.id === topic.id);
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
                    {latestRecord && (
                      <button className="text-button" onClick={() => setViewingRecord(latestRecord)}>学习记录</button>
                    )}
                    {active ? (
                      <button className="text-button" disabled={isCurrent} onClick={() => swapOutOfWheel(topic.id)}>{isCurrent ? "学习中" : "换出"}</button>
                    ) : (
                      <button className="text-button" onClick={() => addToWheel(topic.id)}>{completed ? "复习到转盘" : "加入转盘"}</button>
                    )}
                    {isCustom && (
                      <button
                        className="delete-button"
                        disabled={isCurrent}
                        onClick={() => deleteCustomTopic(topic.id)}
                      >
                        {isCurrent ? "学习中不可删" : "删除"}
                      </button>
                    )}
                  </div>
                </article>
              );
            })}
          </div>
        </section>
      )}

      {assessment && currentTopic && (
        <div className="assessment-backdrop" role="dialog" aria-modal="true" aria-labelledby="assessment-title">
          <article className="assessment-card">
            <p className="section-kicker">LEARNING CHECK-IN</p>
            <h2 id="assessment-title">先输出，再判断自己是否真的学会</h2>
            <p>用自己的话解释「{currentTopic.title}」。学习输出会进入记录，并随你的账号跨设备同步。</p>
            <label className="assessment-field" htmlFor="understanding-output">
              <span>我的理解 <em>必填，至少 10 个字</em></span>
              <textarea id="understanding-output" className="textarea" value={assessment.understanding} onChange={(event) => setAssessment({ ...assessment, understanding: event.target.value })} placeholder="不要抄定义：试着写清它是什么、为什么重要，以及它怎样用于肠道菌群—骨骼肌研究。" />
            </label>
            <label className="assessment-field" htmlFor="remaining-question">
              <span>仍然不确定的问题 <em>可选</em></span>
              <textarea id="remaining-question" className="textarea compact" value={assessment.question} onChange={(event) => setAssessment({ ...assessment, question: event.target.value })} placeholder="例如：这个方法的主要混杂因素是什么？结果能否支持因果关系？" />
            </label>
            <button className="chatgpt-button" type="button" disabled={assessment.understanding.trim().length < 10} onClick={() => void openChatGPTEvaluation(currentTopic, assessment.understanding, assessment.question)}>
              复制评估材料并打开 ChatGPT
            </button>
            <p className="chatgpt-hint">在 ChatGPT 中粘贴并发送；完成追问后，根据反馈调整下面的分数。</p>
            <div className="assessment-options">
              {[
                [1, "完全陌生"], [2, "还需复习"], [3, "能复述"], [4, "能判读"], [5, "能应用"],
              ].map(([value, label]) => (
                <button key={value} className={assessment.mastery === value ? "rating-option active" : "rating-option"} onClick={() => setAssessment({ ...assessment, mastery: value as number })}>
                  <strong>{value}/5</strong><span>{label}</span>
                </button>
              ))}
            </div>
            <div className="assessment-actions">
              <button className="text-button" onClick={() => setAssessment(null)}>暂不归档</button>
              <button className="save-button" disabled={assessment.understanding.trim().length < 10} onClick={saveAssessment}>保存输出并推荐下一项</button>
            </div>
          </article>
        </div>
      )}

      {viewingRecord && viewingTopic && (
        <div className="assessment-backdrop" role="dialog" aria-modal="true" aria-labelledby="record-title">
          <article className="assessment-card record-card">
            <p className="section-kicker">LEARNING RECORD</p>
            <h2 id="record-title">{viewingTopic.title}</h2>
            <div className="record-meta">
              <span>{new Date(viewingRecord.completedAt).toLocaleString("zh-CN")}</span>
              <strong>掌握度 {viewingRecord.mastery}/5</strong>
            </div>
            <section className="record-section">
              <h3>我的理解</h3>
              <p>{viewingRecord.understanding ?? viewingRecord.note ?? "这条旧记录没有保存学习输出。"}</p>
            </section>
            {viewingRecord.question && (
              <section className="record-section">
                <h3>仍然不确定的问题</h3>
                <p>{viewingRecord.question}</p>
              </section>
            )}
            <div className="assessment-actions">
              <button className="text-button" onClick={() => setViewingRecord(null)}>关闭</button>
              {(viewingRecord.understanding ?? viewingRecord.note) && (
                <button className="chatgpt-button compact-button" onClick={() => void openChatGPTEvaluation(viewingTopic, viewingRecord.understanding ?? viewingRecord.note ?? "", viewingRecord.question ?? "")}>再次请 ChatGPT 评估</button>
              )}
            </div>
          </article>
        </div>
      )}
    </main>
  );
}
