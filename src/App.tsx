const VERSION = "v5.5.26b";
"use client";

import React, { useEffect, useMemo, useState } from "react";

type Screen = "home" | "kid" | "parent";
type Audit = { text: string; at: string };
type LibraryChore = { id: number; name: string; points: number; category: string };
type Chore = LibraryChore & { done: boolean; doneAt: string | null };
type Kid = {
  id: number;
  name: string;
  chores: Chore[];
  weeklyCustom: Chore[];
  dishesLoadDone: boolean;
  dishesUnloadDone: boolean;
  bathroomAssigned: boolean;
  bathroomDone: boolean;
  carryoverPoints: number;
  dishPenaltyPoints: number;
  extraCreditPoints: number;
  rewardWeeksRemaining: number;
  rewardSelected: string | null;
  electronicsBlockedManual: boolean;
  audit: Audit[];
  weeksTracked: number;
  weeksSuccessful: number;
};
type DogCare = { amFedAt: string | null; pmFedAt: string | null; chiefMedsAt: string | null };
type AppState = { version: number; library: LibraryChore[]; kids: Kid[]; parentPin: string; dogCare: DogCare; lastWeekKey: string };

const STORAGE_KEY = "hadtieri_house_v2";
const VERSION = 1;
const BASE_POINTS = 5;
const BATHROOM_POINTS = 2;
const DISH_PENALTY = 3;
const REWARD_OPTIONS = ["Reward 1"];
const KIDS = ["Morgan", "Marilyn", "James", "Calvin", "Anastasia", "Evie"];
const DEFAULT_LIBRARY: LibraryChore[] = [
  { id: 1, name: "Make Bed", points: 1, category: "Room" },
  { id: 2, name: "Pick Up Bedroom", points: 1, category: "Room" },
  { id: 3, name: "Trash", points: 1, category: "House" },
  { id: 4, name: "Wipe Counters", points: 1, category: "Kitchen" },
  { id: 5, name: "Vacuum", points: 2, category: "House" },
  { id: 6, name: "Fold Laundry", points: 2, category: "Laundry" },
];

const byName = <T extends { name: string }>(arr: T[]) => [...arr].sort((a, b) => a.name.localeCompare(b.name));
const stamp = () => new Date().toLocaleString([], { month: "numeric", day: "numeric", hour: "numeric", minute: "2-digit" });

function getWeekStart(date = new Date()) {
  const d = new Date(date);
  const diff = d.getDay() === 0 ? -6 : 1 - d.getDay();
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + diff);
  return d;
}
function getWeekEnd(date = new Date()) {
  const d = getWeekStart(date);
  d.setDate(d.getDate() + 6);
  d.setHours(23, 59, 59, 999);
  return d;
}
function fmtCountdown(ms: number) {
  if (ms <= 0) return "00d 00h 00m 00s";
  const s = Math.floor(ms / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), m = Math.floor((s % 3600) / 60), sec = s % 60;
  return `${String(d).padStart(2, "0")}d ${String(h).padStart(2, "0")}h ${String(m).padStart(2, "0")}m ${String(sec).padStart(2, "0")}s`;
}
function asChores(library: LibraryChore[]): Chore[] { return byName(library).map(c => ({ ...c, done: false, doneAt: null })); }
function completedPoints(k: Kid) { return k.chores.filter(c => c.done).reduce((s, c) => s + c.points, 0) + k.weeklyCustom.filter(c => c.done).reduce((s, c) => s + c.points, 0) + (k.bathroomAssigned && k.bathroomDone ? BATHROOM_POINTS : 0); }
function requiredPoints(k: Kid) { return Math.max(0, BASE_POINTS - k.extraCreditPoints) + k.carryoverPoints + k.dishPenaltyPoints; }

function defaultState(): AppState {
  const library = byName(DEFAULT_LIBRARY);
  return {
    version: VERSION,
    library,
    parentPin: "5422",
    dogCare: { amFedAt: null, pmFedAt: null, chiefMedsAt: null },
    lastWeekKey: getWeekStart().toISOString(),
    kids: KIDS.map((name, i) => ({
      id: i + 1,
      name,
      chores: asChores(library),
      weeklyCustom: [],
      dishesLoadDone: false,
      dishesUnloadDone: false,
      bathroomAssigned: i === 0,
      bathroomDone: false,
      carryoverPoints: 0,
      dishPenaltyPoints: 0,
      extraCreditPoints: 0,
      rewardWeeksRemaining: 0,
      rewardSelected: null,
      electronicsBlockedManual: false,
      audit: [],
      weeksTracked: 0,
      weeksSuccessful: 0,
    }))
  };
}

function normalizeKids(rawKids: any[], library: LibraryChore[]): Kid[] {
  return defaultState().kids.map((base, i) => {
    const raw = rawKids?.find((x: any) => x?.name === base.name) ?? rawKids?.[i] ?? {};
    return {
      ...base,
      ...raw,
      id: base.id,
      name: base.name,
      chores: byName(library).map(lib => {
        const ex = raw.chores?.find((c: any) => c?.id === lib.id || c?.name === lib.name);
        return { ...lib, done: ex?.done ?? ex?.completed ?? false, doneAt: ex?.doneAt ?? ex?.completedAt ?? null };
      }),
      weeklyCustom: byName((raw.weeklyCustom ?? raw.customChores ?? []).map((c: any) => ({ ...c, done: c?.done ?? c?.completed ?? false, doneAt: c?.doneAt ?? c?.completedAt ?? null }))),
      dishesLoadDone: raw.dishesLoadDone ?? raw.dishesDone ?? false,
      dishesUnloadDone: raw.dishesUnloadDone ?? false,
      bathroomAssigned: raw.bathroomAssigned ?? base.bathroomAssigned,
      bathroomDone: raw.bathroomDone ?? false,
      carryoverPoints: Number(raw.carryoverPoints ?? 0),
      dishPenaltyPoints: Number(raw.dishPenaltyPoints ?? 0),
      extraCreditPoints: Number(raw.extraCreditPoints ?? 0),
      rewardWeeksRemaining: Number(raw.rewardWeeksRemaining ?? 0),
      rewardSelected: raw.rewardSelected ?? null,
      electronicsBlockedManual: raw.electronicsBlockedManual ?? false,
      audit: Array.isArray(raw.audit) ? raw.audit : Array.isArray(raw.auditTrail) ? raw.auditTrail : [],
      weeksTracked: Number(raw.weeksTracked ?? 0),
      weeksSuccessful: Number(raw.weeksSuccessful ?? 0),
    };
  });
}

function loadState(): AppState {
  const fallback = defaultState();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    const library = Array.isArray(parsed.library) && parsed.library.length ? byName(parsed.library) : fallback.library;
    return {
      version: parsed.version ?? VERSION,
      library,
      kids: normalizeKids(parsed.kids ?? [], library),
      parentPin: parsed.parentPin ?? "5422",
      dogCare: parsed.dogCare ?? fallback.dogCare,
      lastWeekKey: parsed.lastWeekKey ?? parsed.lastWeekStart ?? fallback.lastWeekKey,
    };
  } catch { return fallback; }
}

function downloadBackup(name: string, data: unknown) {
  const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a"); a.href = url; a.download = name; a.click();
  URL.revokeObjectURL(url);
}

export default function App() {
  const initial = useMemo(() => loadState(), []);
  const [screen, setScreen] = useState<Screen>("home");
  const [selectedKidId, setSelectedKidId] = useState<number | null>(null);
  const [library, setLibrary] = useState<LibraryChore[]>(initial.library);
  const [kids, setKids] = useState<Kid[]>(initial.kids);
  const [dogCare, setDogCare] = useState<DogCare>(initial.dogCare);
  const [parentPin, setParentPin] = useState(initial.parentPin);
  const [enteredPin, setEnteredPin] = useState("");
  const [newPin, setNewPin] = useState("");
  const [parentUnlocked, setParentUnlocked] = useState(false);
  const [pinMessage, setPinMessage] = useState("");
  const [importMessage, setImportMessage] = useState("");
  const [weeklyKidId, setWeeklyKidId] = useState(1);
  const [customName, setCustomName] = useState("");
  const [customPoints, setCustomPoints] = useState("1");
  const [libName, setLibName] = useState("");
  const [libPoints, setLibPoints] = useState("1");
  const [libCategory, setLibCategory] = useState("General");
  const [lastWeekKey, setLastWeekKey] = useState(initial.lastWeekKey);
  const [now, setNow] = useState(new Date());

  useEffect(() => { const t = setInterval(() => setNow(new Date()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => {
    const payload: AppState = { version: VERSION, library: byName(library), kids, parentPin, dogCare, lastWeekKey };
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [library, kids, parentPin, dogCare, lastWeekKey]);

  const weekStart = getWeekStart(now);
  const weekEnd = getWeekEnd(now);
  const countdownText = fmtCountdown(weekEnd.getTime() - now.getTime());
  const todayKey = now.toDateString();
  const dogStatus = {
    amDone: !!dogCare.amFedAt && new Date(dogCare.amFedAt).toDateString() === todayKey,
    pmDone: !!dogCare.pmFedAt && new Date(dogCare.pmFedAt).toDateString() === todayKey,
    medsDone: !!dogCare.chiefMedsAt && new Date(dogCare.chiefMedsAt).toDateString() === todayKey,
  };
  const dogOverdue = { am: now.getHours() >= 8 && !dogStatus.amDone, pm: now.getHours() >= 21 && !dogStatus.pmDone, meds: now.getHours() >= 8 && !dogStatus.medsDone };

  useEffect(() => {
    const currentWeekKey = weekStart.toISOString();
    if (currentWeekKey === lastWeekKey) return;
    setKids(prev => {
      const currentAssigned = prev.findIndex(k => k.bathroomAssigned);
      const nextAssigned = currentAssigned >= 0 ? (currentAssigned + 1) % prev.length : 0;
      return prev.map((kid, i) => {
        const done = completedPoints(kid);
        const owed = requiredPoints(kid);
        const carry = Math.max(0, owed - done);
        const penalty = kid.dishesLoadDone && kid.dishesUnloadDone ? 0 : DISH_PENALTY;
        const extra = Math.max(0, done - owed);
        const success = carry === 0 && penalty === 0;
        return {
          ...kid,
          chores: asChores(library),
          weeklyCustom: [],
          dishesLoadDone: false,
          dishesUnloadDone: false,
          bathroomAssigned: i === nextAssigned,
          bathroomDone: false,
          carryoverPoints: carry,
          dishPenaltyPoints: penalty,
          extraCreditPoints: extra,
          rewardWeeksRemaining: Math.max(0, kid.rewardWeeksRemaining - 1),
          rewardSelected: kid.rewardWeeksRemaining > 0 ? kid.rewardSelected : null,
          audit: [{ text: `${kid.name} rolled into a new week.`, at: stamp() }, ...kid.audit],
          weeksTracked: kid.weeksTracked + 1,
          weeksSuccessful: kid.weeksSuccessful + (success ? 1 : 0),
        };
      });
    });
    setDogCare({ amFedAt: null, pmFedAt: null, chiefMedsAt: null });
    setLastWeekKey(currentWeekKey);
  }, [weekStart, lastWeekKey, library]);

  const kidsWithMetrics = useMemo(() => kids.map(kid => {
    const completed = completedPoints(kid);
    const required = requiredPoints(kid);
    const remaining = Math.max(0, required - completed);
    const rewardQualified = remaining === 0 && kid.dishesLoadDone && kid.dishesUnloadDone && (!kid.bathroomAssigned || kid.bathroomDone);
    const rewardAvailable = rewardQualified || kid.rewardWeeksRemaining > 0;
    const electronicsBlocked = kid.carryoverPoints > 0 || kid.dishPenaltyPoints > 0 || kid.electronicsBlockedManual;
    const progress = required === 0 ? 100 : Math.min(100, Math.round((completed / required) * 100));
    const completionRate = kid.weeksTracked > 0 ? Math.round((kid.weeksSuccessful / kid.weeksTracked) * 100) : 0;
    return { ...kid, completedPoints: completed, requiredPoints: required, pointsRemaining: remaining, rewardQualified, rewardAvailable, electronicsBlocked, progress, completionRate };
  }), [kids]);

  useEffect(() => {
    setKids(prev => prev.map(kid => {
      const metrics = kidsWithMetrics.find(k => k.id === kid.id);
      if (!metrics) return kid;
      if (metrics.rewardQualified && kid.rewardWeeksRemaining === 0) {
        return { ...kid, rewardWeeksRemaining: 2, audit: [{ text: `${kid.name} unlocked reward for 2 weeks`, at: stamp() }, ...kid.audit] };
      }
      return kid;
    }));
  }, [kidsWithMetrics]);

  const selectedKid = kidsWithMetrics.find(k => k.id === selectedKidId) ?? null;
  const addAudit = (kid: Kid, text: string): Kid => ({ ...kid, audit: [{ text, at: stamp() }, ...kid.audit] });
  const updateKid = (kidId: number, fn: (kid: Kid) => Kid) => setKids(prev => prev.map(kid => kid.id === kidId ? fn(kid) : kid));

  const toggleLibraryChore = (kidId: number, choreId: number) => updateKid(kidId, kid => {
    const chore = kid.chores.find(c => c.id === choreId); if (!chore) return kid;
    const next = !chore.done;
    return addAudit({ ...kid, chores: byName(kid.chores.map(c => c.id === choreId ? { ...c, done: next, doneAt: next ? stamp() : null } : c)) }, `${kid.name} ${next ? "completed" : "unmarked"} ${chore.name}`);
  });
  const deleteLibraryChoreFromKidWeek = (kidId: number, choreId: number) => updateKid(kidId, kid => {
    const chore = kid.chores.find(c => c.id === choreId); if (!chore) return kid;
    return addAudit({ ...kid, chores: kid.chores.filter(c => c.id !== choreId) }, `Parent deleted ${chore.name} from ${kid.name}'s current week`);
  });
  const toggleWeeklyCustomChore = (kidId: number, choreId: number) => updateKid(kidId, kid => {
    const chore = kid.weeklyCustom.find(c => c.id === choreId); if (!chore) return kid;
    const next = !chore.done;
    return addAudit({ ...kid, weeklyCustom: byName(kid.weeklyCustom.map(c => c.id === choreId ? { ...c, done: next, doneAt: next ? stamp() : null } : c)) }, `${kid.name} ${next ? "completed" : "unmarked"} weekly custom chore ${chore.name}`);
  });
  const deleteWeeklyCustomChore = (kidId: number, choreId: number) => updateKid(kidId, kid => {
    const chore = kid.weeklyCustom.find(c => c.id === choreId); if (!chore) return kid;
    return addAudit({ ...kid, weeklyCustom: kid.weeklyCustom.filter(c => c.id !== choreId) }, `Parent deleted weekly custom chore ${chore.name} for ${kid.name}`);
  });
  const toggleDishField = (kidId: number, field: "dishesLoadDone" | "dishesUnloadDone" | "bathroomDone") => updateKid(kidId, kid => {
    const labels = { dishesLoadDone: "dishes load", dishesUnloadDone: "dishes unload", bathroomDone: "kids bathroom" };
    const next = !kid[field];
    return addAudit({ ...kid, [field]: next }, `${kid.name} marked ${labels[field]} ${next ? "done" : "not done"}`);
  });

  const addLibraryChore = () => {
    if (!libName.trim()) return;
    const newChore: LibraryChore = { id: Date.now(), name: libName.trim(), points: Math.max(1, Number(libPoints) || 1), category: libCategory.trim() || "General" };
    setLibrary(prev => byName([...prev, newChore]));
    setKids(prev => prev.map(kid => addAudit({ ...kid, chores: byName([...kid.chores, { ...newChore, done: false, doneAt: null }]) }, `Parent added library chore ${newChore.name}`)));
    setLibName(""); setLibPoints("1"); setLibCategory("General");
  };
  const updateLibraryChore = (id: number, field: "name" | "points" | "category", value: string) => {
    const nextValue = field === "points" ? Math.max(1, Number(value) || 1) : value;
    setLibrary(prev => byName(prev.map(c => c.id === id ? { ...c, [field]: nextValue } : c)));
    setKids(prev => prev.map(kid => ({ ...kid, chores: byName(kid.chores.map(c => c.id === id ? { ...c, [field]: nextValue } : c)) })));
  };
  const addWeeklyCustomChore = () => {
    if (!parentUnlocked || !customName.trim()) return;
    const chore: Chore = { id: Date.now(), name: customName.trim(), points: Math.max(1, Number(customPoints) || 1), category: "Weekly Custom", done: false, doneAt: null };
    updateKid(weeklyKidId, kid => addAudit({ ...kid, weeklyCustom: byName([...kid.weeklyCustom, chore]) }, `Parent added weekly custom chore ${chore.name} (${chore.points} pts) for ${kid.name}`));
    setCustomName(""); setCustomPoints("1");
  };
  const unlockParent = () => { if (enteredPin === parentPin) { setParentUnlocked(true); setEnteredPin(""); setPinMessage(""); } else setPinMessage("Incorrect PIN"); };
  const savePin = () => { if (!/^\d{4}$/.test(newPin)) return setPinMessage("PIN must be 4 digits"); setParentPin(newPin); setNewPin(""); setPinMessage("PIN updated"); };
  const chooseReward = (kidId: number, reward: string) => updateKid(kidId, kid => addAudit({ ...kid, rewardSelected: reward }, `Parent selected ${reward} for ${kid.name}`));
  const clearReward = (kidId: number) => updateKid(kidId, kid => addAudit({ ...kid, rewardSelected: null, rewardWeeksRemaining: 0 }, `Parent cleared reward for ${kid.name}`));
  const exportBackup = () => downloadBackup(`hadtieri-house-backup-${new Date().toISOString().slice(0, 10)}.json`, { version: VERSION, library, kids, parentPin, dogCare, lastWeekKey });
  const importBackup = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]; if (!file) return;
    try {
      const parsed = JSON.parse(await file.text());
      const nextLibrary = Array.isArray(parsed.library) && parsed.library.length ? byName(parsed.library) : DEFAULT_LIBRARY;
      setLibrary(nextLibrary); setKids(normalizeKids(parsed.kids ?? [], nextLibrary)); setParentPin(parsed.parentPin ?? "5422"); setDogCare(parsed.dogCare ?? { amFedAt: null, pmFedAt: null, chiefMedsAt: null }); setLastWeekKey(parsed.lastWeekKey ?? getWeekStart().toISOString()); setImportMessage("Backup imported.");
    } catch { setImportMessage("Could not import that backup file."); }
  };

  const styles = {
    page: { minHeight: "100vh", background: "radial-gradient(circle at top, #1e293b 0%, #020617 60%)", color: "white", padding: 20, fontFamily: "Arial, Helvetica, sans-serif" } as React.CSSProperties,
    shell: { width: "100%", maxWidth: 1920, margin: "0 auto", display: "flex", flexDirection: "column", gap: 16 } as React.CSSProperties,
    row: { display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" } as React.CSSProperties,
    card: { background: "rgba(15,23,42,0.92)", border: "1px solid #334155", borderRadius: 22, padding: 18, boxShadow: "0 8px 24px rgba(0,0,0,0.28)" } as React.CSSProperties,
    smallCard: { background: "#020617", border: "1px solid #334155", borderRadius: 16, padding: 14 } as React.CSSProperties,
    button: { background: "#2563eb", color: "white", border: "none", borderRadius: 14, padding: "12px 16px", fontWeight: 700, cursor: "pointer" } as React.CSSProperties,
    buttonSecondary: { background: "#475569", color: "white", border: "none", borderRadius: 14, padding: "12px 16px", fontWeight: 700, cursor: "pointer" } as React.CSSProperties,
    buttonDanger: { background: "#b91c1c", color: "white", border: "none", borderRadius: 14, padding: "10px 12px", fontWeight: 700, cursor: "pointer" } as React.CSSProperties,
    input: { padding: "12px 14px", borderRadius: 14, border: "1px solid #475569", background: "#0f172a", color: "white", minWidth: 120 } as React.CSSProperties,
    grid2: { display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 16 } as React.CSSProperties,
    grid3: { display: "grid", gridTemplateColumns: "repeat(3, minmax(0, 1fr))", gap: 16 } as React.CSSProperties,
    grid4: { display: "grid", gridTemplateColumns: "repeat(4, minmax(0, 1fr))", gap: 16 } as React.CSSProperties,
    progressWrap: { width: "100%", height: 12, background: "#1e293b", borderRadius: 999, overflow: "hidden" } as React.CSSProperties,
    progressBar: (pct: number) => ({ width: `${pct}%`, height: "100%", background: "linear-gradient(90deg,#22c55e,#38bdf8)" }) as React.CSSProperties,
    pill: (bg: string, color = "white") => ({ display: "inline-block", background: bg, color, borderRadius: 999, padding: "6px 10px", fontSize: 13, fontWeight: 700 }) as React.CSSProperties,
    scroll: { maxHeight: 260, overflow: "auto", display: "flex", flexDirection: "column", gap: 10 } as React.CSSProperties,
    sectionTitle: { fontSize: 22, fontWeight: 800, marginBottom: 12 } as React.CSSProperties,
  };

  const Header = () => <div style={styles.grid4}><div style={{ ...styles.card, gridColumn: "span 2" as any }}><div style={{ color: "#94a3b8", fontSize: 14 }}>Week of</div><div style={{ fontSize: 38, fontWeight: 800 }}>{weekStart.toLocaleDateString()}</div></div><div style={styles.card}><div style={{ color: "#94a3b8", fontSize: 14 }}>Current Date & Time</div><div style={{ fontSize: 24, fontWeight: 800 }}>{now.toLocaleDateString()} · {now.toLocaleTimeString()}</div></div><div style={styles.card}><div style={{ color: "#94a3b8", fontSize: 14 }}>Countdown to Sunday 11:59 PM</div><div style={{ fontSize: 24, fontWeight: 800 }}>{countdownText}</div></div></div>;

  const DogCard = () => <div style={{ ...styles.card, background: dogOverdue.am || dogOverdue.pm || dogOverdue.meds ? "rgba(127,29,29,0.92)" : undefined, border: dogOverdue.am || dogOverdue.pm || dogOverdue.meds ? "1px solid #f87171" : undefined }}><div style={styles.sectionTitle}>Dog Care Tracker</div><div style={styles.grid3}><div style={styles.smallCard}><div>AM Feed by 8:00 AM</div><div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{dogStatus.amDone ? "Done" : dogOverdue.am ? "OVERDUE" : "Pending"}</div><button style={{ ...styles.button, width: "100%", marginTop: 12 }} onClick={() => setDogCare(p => ({ ...p, amFedAt: new Date().toISOString() }))}>Mark AM Feed</button></div><div style={styles.smallCard}><div>PM Feed by 9:00 PM</div><div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{dogStatus.pmDone ? "Done" : dogOverdue.pm ? "OVERDUE" : "Pending"}</div><button style={{ ...styles.button, width: "100%", marginTop: 12 }} onClick={() => setDogCare(p => ({ ...p, pmFedAt: new Date().toISOString() }))}>Mark PM Feed</button></div><div style={styles.smallCard}><div>Chief Allergy Meds (AM)</div><div style={{ fontSize: 24, fontWeight: 800, marginTop: 6 }}>{dogStatus.medsDone ? "Done" : dogOverdue.meds ? "OVERDUE" : "Pending"}</div><button style={{ ...styles.button, width: "100%", marginTop: 12 }} onClick={() => setDogCare(p => ({ ...p, chiefMedsAt: new Date().toISOString() }))}>Mark Chief Meds</button></div></div></div>;

  const KidTile = ({ kid }: { kid: (typeof kidsWithMetrics)[number] }) => {
    const openKid = () => {
      setSelectedKidId(kid.id);
      setScreen("kid");
    };
    const statusButton: React.CSSProperties = { ...styles.button, minHeight: 52, fontSize: 14, padding: "10px 12px" };
    return <div style={{ ...styles.card, background: kid.electronicsBlocked ? "rgba(127,29,29,0.92)" : styles.card.background, border: kid.electronicsBlocked ? "1px solid #f87171" : styles.card.border, cursor: "pointer" }} onClick={openKid}><div style={styles.row}><div><div style={{ fontSize: 28, fontWeight: 800 }}>{kid.name}</div><div style={{ color: "#cbd5e1" }}>{kid.bathroomAssigned ? "Bathroom week" : "Standard week"}</div></div><div style={styles.pill(kid.rewardAvailable ? "#facc15" : "#334155", kid.rewardAvailable ? "#111827" : "white")}>{kid.rewardAvailable ? `Reward (${kid.rewardWeeksRemaining}w)` : "Working"}</div></div><div style={{ marginTop: 14 }}><div style={styles.row}><span>Progress</span><span>{kid.progress}%</span></div><div style={styles.progressWrap}><div style={styles.progressBar(kid.progress)} /></div></div><div style={{ ...styles.grid2, marginTop: 14 }}><div style={{ ...styles.smallCard, background: kid.pointsRemaining === 0 ? "#052e16" : styles.smallCard.background, border: kid.pointsRemaining === 0 ? "1px solid #15803d" : styles.smallCard.border }}><div>Remaining</div><div style={{ fontSize: 28, fontWeight: 800 }}>{kid.pointsRemaining}</div></div><div style={{ ...styles.smallCard, background: kid.completedPoints >= kid.requiredPoints && kid.requiredPoints > 0 ? "#052e16" : styles.smallCard.background, border: kid.completedPoints >= kid.requiredPoints && kid.requiredPoints > 0 ? "1px solid #15803d" : styles.smallCard.border }}><div>Completed</div><div style={{ fontSize: 28, fontWeight: 800 }}>{kid.completedPoints}</div></div></div><div style={{ ...styles.grid2, marginTop: 14 }}><button style={{ ...statusButton, background: kid.dishesLoadDone ? "#059669" : "#dc2626" }} onClick={(e) => { e.stopPropagation(); toggleDishField(kid.id, "dishesLoadDone"); }}>Load Dishes {kid.dishesLoadDone ? "✓" : "✕"}</button><button style={{ ...statusButton, background: kid.dishesUnloadDone ? "#059669" : "#dc2626" }} onClick={(e) => { e.stopPropagation(); toggleDishField(kid.id, "dishesUnloadDone"); }}>Unload Dishes {kid.dishesUnloadDone ? "✓" : "✕"}</button><button style={{ ...statusButton, background: !kid.bathroomAssigned ? "#475569" : kid.bathroomDone ? "#059669" : "#dc2626" }} onClick={(e) => { e.stopPropagation(); kid.bathroomAssigned && toggleDishField(kid.id, "bathroomDone"); }}>{kid.bathroomAssigned ? `Bathroom ${kid.bathroomDone ? "✓" : "✕"}` : "Bathroom N/A"}</button><div style={{ ...styles.smallCard, background: kid.electronicsBlocked ? "#7f1d1d" : "#052e16", border: kid.electronicsBlocked ? "1px solid #f87171" : "1px solid #15803d", display: "flex", alignItems: "center", justifyContent: "center", fontWeight: 800 }}>{kid.electronicsBlocked ? "Electronics Blocked" : "Electronics Allowed"}</div></div><button style={{ ...styles.buttonSecondary, width: "100%", marginTop: 14 }} onClick={(e) => { e.stopPropagation(); openKid(); }}>Open {kid.name}</button></div>;
  };

  const reporting = { totalMarked: kids.reduce((sum, kid) => sum + kid.chores.filter(c => c.done).length + kid.weeklyCustom.filter(c => c.done).length + (kid.bathroomDone ? 1 : 0) + (kid.dishesLoadDone ? 1 : 0) + (kid.dishesUnloadDone ? 1 : 0), 0), rewardsSelected: kids.filter(k => k.rewardSelected).length, blockedKids: kidsWithMetrics.filter(k => k.electronicsBlocked).length };

  if (screen === "kid" && selectedKid) return <div style={styles.page}><div style={styles.shell}><Header /><div style={styles.row}><div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}><button style={styles.buttonSecondary} onClick={() => setScreen("home")}>← Home</button><button style={styles.buttonSecondary} onClick={() => setScreen("parent")}>Parent Console</button><div><div style={{ fontSize: 38, fontWeight: 800 }}>{selectedKid.name}</div><div style={{ color: "#cbd5e1" }}>Kid view</div></div></div><div style={styles.pill("#f59e0b", "#111827")}>All core rules loaded</div></div><div style={styles.grid4}><div style={styles.card}><div>Required Points</div><div style={{ fontSize: 42, fontWeight: 800 }}>{selectedKid.requiredPoints}</div></div><div style={styles.card}><div>Completed Points</div><div style={{ fontSize: 42, fontWeight: 800 }}>{selectedKid.completedPoints}</div></div><div style={styles.card}><div>Points Remaining</div><div style={{ fontSize: 42, fontWeight: 800 }}>{selectedKid.pointsRemaining}</div></div><div style={styles.card}><div>Electronics</div><div style={{ fontSize: 30, fontWeight: 800 }}>{selectedKid.electronicsBlocked ? "Blocked" : "Allowed"}</div></div></div><div style={styles.card}><div style={styles.sectionTitle}>Weekly Checklist</div><div style={{ ...styles.grid3, gridTemplateColumns: "repeat(3, minmax(0, 1fr))" }}><button style={{ ...styles.button, background: selectedKid.dishesLoadDone ? "#059669" : "#dc2626", minHeight: 70 }} onClick={() => toggleDishField(selectedKid.id, "dishesLoadDone")}>Load Dishes</button><button style={{ ...styles.button, background: selectedKid.dishesUnloadDone ? "#059669" : "#dc2626", minHeight: 70 }} onClick={() => toggleDishField(selectedKid.id, "dishesUnloadDone")}>Unload Dishes</button><button style={{ ...styles.button, background: selectedKid.bathroomAssigned ? (selectedKid.bathroomDone ? "#059669" : "#1d4ed8") : "#475569", minHeight: 70 }} onClick={() => selectedKid.bathroomAssigned && toggleDishField(selectedKid.id, "bathroomDone")}>Kids Bathroom</button></div><div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>{byName(selectedKid.chores).map(chore => <div key={chore.id} style={{ ...styles.smallCard, display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center", background: chore.done ? "#052e16" : undefined, border: chore.done ? "1px solid #15803d" : undefined }}><button style={{ background: "transparent", color: "white", border: "none", textAlign: "left", cursor: "pointer" }} onClick={() => toggleLibraryChore(selectedKid.id, chore.id)}><div style={{ fontSize: 18, fontWeight: 700 }}>{chore.name}</div><div style={{ color: "#94a3b8", fontSize: 13 }}>{chore.category}</div></button><div>{chore.points} pt</div><button style={styles.buttonDanger} onClick={() => deleteLibraryChoreFromKidWeek(selectedKid.id, chore.id)}>Delete</button></div>)}{byName(selectedKid.weeklyCustom).map(chore => <div key={chore.id} style={{ ...styles.smallCard, display: "grid", gridTemplateColumns: "1fr auto auto", gap: 10, alignItems: "center", background: chore.done ? "#052e16" : undefined, border: chore.done ? "1px solid #15803d" : undefined }}><button style={{ background: "transparent", color: "white", border: "none", textAlign: "left", cursor: "pointer" }} onClick={() => toggleWeeklyCustomChore(selectedKid.id, chore.id)}><div style={{ fontSize: 18, fontWeight: 700 }}>{chore.name}</div><div style={{ color: "#94a3b8", fontSize: 13 }}>Weekly custom</div></button><div>{chore.points} pt</div><button style={styles.buttonDanger} onClick={() => deleteWeeklyCustomChore(selectedKid.id, chore.id)}>Delete</button></div>)}</div></div><div style={styles.card}><div style={styles.sectionTitle}>Audit Trail</div><div style={styles.scroll}>{selectedKid.audit.length === 0 && <div style={{ color: "#94a3b8" }}>No activity yet.</div>}{selectedKid.audit.map((entry, idx) => <div key={idx} style={styles.smallCard}><div>{entry.text}</div><div style={{ color: "#94a3b8", fontSize: 12, marginTop: 6 }}>{entry.at}</div></div>)}</div></div></div></div>;

  if (screen === "parent") return <div style={styles.page}><div style={styles.shell}><Header /><div style={styles.row}><div><div style={{ fontSize: 46, fontWeight: 900 }}>🔒 Parent Console</div><div style={{ color: "#cbd5e1", fontSize: 18 }}>All requested core systems in one build.</div></div><button style={styles.buttonSecondary} onClick={() => setScreen("home")}>Home</button></div>{!parentUnlocked ? <div style={{ ...styles.card, maxWidth: 520 }}><div style={styles.sectionTitle}>Enter Parent PIN</div><div style={{ display: "flex", gap: 10, alignItems: "center" }}><input style={styles.input} type="password" value={enteredPin} onChange={e => setEnteredPin(e.target.value)} placeholder="Default PIN: 5422" /><button style={styles.button} onClick={unlockParent}>Unlock</button></div>{pinMessage && <div style={{ color: "#fbbf24", marginTop: 10 }}>{pinMessage}</div>}</div> : <><div style={styles.grid3}><div style={styles.card}><div style={styles.sectionTitle}>PIN & Backup</div><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><input style={styles.input} type="password" value={newPin} onChange={e => setNewPin(e.target.value)} placeholder="New 4-digit PIN" /><button style={styles.button} onClick={savePin}>Update PIN</button><button style={styles.buttonSecondary} onClick={() => setParentUnlocked(false)}>Lock</button></div>{pinMessage && <div style={{ color: "#fbbf24", marginTop: 10 }}>{pinMessage}</div>}<div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}><button style={styles.buttonSecondary} onClick={exportBackup}>Export Backup</button><input type="file" accept="application/json" onChange={importBackup} /></div>{importMessage && <div style={{ color: "#fbbf24", marginTop: 10 }}>{importMessage}</div>}</div><div style={styles.card}><div style={styles.sectionTitle}>Add Library Chore</div><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><input style={{ ...styles.input, flex: 1 }} value={libName} onChange={e => setLibName(e.target.value)} placeholder="Chore name" /><input style={{ ...styles.input, width: 120 }} value={libPoints} onChange={e => setLibPoints(e.target.value)} placeholder="Points" /><input style={{ ...styles.input, width: 160 }} value={libCategory} onChange={e => setLibCategory(e.target.value)} placeholder="Category" /><button style={styles.button} onClick={addLibraryChore}>Add</button></div></div><div style={styles.card}><div style={styles.sectionTitle}>Add Weekly Custom Chore</div><div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}><select style={styles.input} value={weeklyKidId} onChange={e => setWeeklyKidId(Number(e.target.value))}>{kids.map(kid => <option key={kid.id} value={kid.id}>{kid.name}</option>)}</select><input style={{ ...styles.input, flex: 1 }} value={customName} onChange={e => setCustomName(e.target.value)} placeholder="Weekly custom chore" /><input style={{ ...styles.input, width: 120 }} value={customPoints} onChange={e => setCustomPoints(e.target.value)} placeholder="Points" /><button style={styles.button} onClick={addWeeklyCustomChore}>Add for Week</button></div></div></div><div style={styles.card}><div style={styles.sectionTitle}>Library Chores</div><div style={{ ...styles.scroll, maxHeight: 340 }}>{byName(library).map(chore => <div key={chore.id} style={{ ...styles.smallCard, display: "grid", gridTemplateColumns: "1fr 120px 180px", gap: 10 }}><input style={styles.input} value={chore.name} onChange={e => updateLibraryChore(chore.id, "name", e.target.value)} /><input style={styles.input} value={String(chore.points)} onChange={e => updateLibraryChore(chore.id, "points", e.target.value)} /><input style={styles.input} value={chore.category} onChange={e => updateLibraryChore(chore.id, "category", e.target.value)} /></div>)}</div></div><div style={styles.grid2}><div style={styles.card}><div style={styles.sectionTitle}>Rewards</div><div style={styles.scroll}>{kidsWithMetrics.map(kid => <div key={kid.id} style={styles.smallCard}><div style={styles.row}><strong>{kid.name}</strong><span>{kid.rewardSelected ?? "No reward selected"}</span></div><div style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>{REWARD_OPTIONS.map(reward => <button key={reward} style={styles.button} onClick={() => chooseReward(kid.id, reward)}>{reward}</button>)}<button style={styles.buttonSecondary} onClick={() => clearReward(kid.id)}>Clear</button></div></div>)}</div></div><div style={styles.card}><div style={styles.sectionTitle}>Completion Summary</div><div style={styles.scroll}>{kidsWithMetrics.map(kid => <div key={kid.id} style={styles.smallCard}><div style={styles.row}><strong>{kid.name}</strong><span>{kid.completionRate}% success</span></div><div style={{ color: "#cbd5e1", marginTop: 6 }}>Required: {kid.requiredPoints}</div><div style={{ color: "#cbd5e1", marginTop: 4 }}>Completed: {kid.completedPoints}</div><div style={{ color: "#cbd5e1", marginTop: 4 }}>Remaining: {kid.pointsRemaining}</div></div>)}</div></div></div></>}</div></div>;

  return <div style={styles.page}><div style={styles.shell}><Header /><div style={styles.row}><div><div style={{ fontSize: 46, fontWeight: 900 }}>🏠 Hadtieri House</div><div style={{ color: "#cbd5e1", fontSize: 18 }}>Full rebuilt version.</div></div><button style={styles.button} onClick={() => setScreen("parent")}>Parent Console</button></div><div style={styles.grid3}><div style={styles.card}><div style={{ color: "#94a3b8" }}>Total chores marked</div><div style={{ fontSize: 42, fontWeight: 800 }}>{reporting.totalMarked}</div></div><div style={styles.card}><div style={{ color: "#94a3b8" }}>Rewards selected</div><div style={{ fontSize: 42, fontWeight: 800 }}>{reporting.rewardsSelected}</div></div><div style={styles.card}><div style={{ color: "#94a3b8" }}>Kids blocked</div><div style={{ fontSize: 42, fontWeight: 800 }}>{reporting.blockedKids}</div></div></div><DogCard /><div style={styles.grid4}>{kidsWithMetrics.map(kid => <KidTile key={kid.id} kid={kid} />)}</div></div></div>;
}
