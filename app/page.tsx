"use client";
import { useState, useEffect, useCallback, useRef } from "react";

/* ── STORAGE ── */
const S = {
  get: (k: string) => { try { const item = localStorage.getItem(k); return item ? JSON.parse(item) : null; } catch { return null; } },
  set: (k: string, v: unknown) => localStorage.setItem(k, JSON.stringify(v)),
};

/* ── CONSTANTS ── */
const DEFAULT_INVENTORY = [
  { id: "water", emoji: "💧", name: "Water", price: 20 },
  { id: "coke", emoji: "🥤", name: "Coke", price: 30 },
  { id: "redbull", emoji: "🐂", name: "Red Bull", price: 80 },
  { id: "cigarette", emoji: "🚬", name: "Cigarette", price: 15 },
];
const DEFAULT_COURTS = [
  { id: "tc1", type: "turf", emoji: "🏟️", name: "Turf Court 1", pricePerMinute: 3 },
  { id: "tc2", type: "turf", emoji: "🏟️", name: "Turf Court 2", pricePerMinute: 3 },
  { id: "pt1", type: "pool", emoji: "🎱", name: "Pool Table 1", pricePerMinute: 3 },
  { id: "pt2", type: "pool", emoji: "🎱", name: "Pool Table 2", pricePerMinute: 3 },
];
const DEFAULT_SETTINGS = {
  facilityName: "Arena Manager",
  pricePerMinute: 3,
  openTime: "06:00",
  closeTime: "22:00",
  defaultBookingDuration: 60,
  defaultBookingPrice: 500,
};

/* ── HELPERS ── */
const todayStr = () => new Date().toISOString().slice(0, 10);
const genId = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const fmt = (n:number) => "₹" + Number(n || 0).toFixed(0);
const mins = (s: number, e?: number) => Math.max(0, Math.floor(((e || Date.now()) - s) / 60000));
const minsToTime = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
const timeToMins = (t: string) => { const [h, m] = t.split(":").map(Number); return h * 60 + m; };
const fmt12 = (t: string) => { if (!t) return ""; const [h, m] = t.split(":").map(Number); return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`; };
const to12hParts = (t: string) => {
  const [h, m] = t.split(":").map(Number);
  const period: "AM" | "PM" = h >= 12 ? "PM" : "AM";
  return { hour: h % 12 || 12, minute: m, period };
};
const from12hParts = (hour: number, minute: number, period: "AM" | "PM") => {
  const h24 = period === "PM" ? (hour % 12) + 12 : hour % 12;
  return `${String(h24).padStart(2, "0")}:${String(minute).padStart(2, "0")}`;
};
const fmtDateFull = (d: string) => new Date(d + "T00:00:00").toLocaleDateString("en-IN", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
const fmtDateShort = (d: string) => { const t = todayStr(); const tm = new Date(); tm.setDate(tm.getDate() + 1); const ts = tm.toISOString().slice(0, 10); if (d === t) return "Today"; if (d === ts) return "Tomorrow"; return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" }); };
const getDateRange = () => Array.from({ length: 10 }, (_, i) => { const d = new Date(); d.setDate(d.getDate() + i - 1); return d.toISOString().slice(0, 10); });
const getGreeting = () => { const h = new Date().getHours(); if (h >= 5 && h < 12) return "Good Morning"; if (h >= 12 && h < 17) return "Good Afternoon"; if (h >= 17 && h < 21) return "Good Evening"; return "Good Night"; };
const fmtDuration = (m: number) => m < 60 ? `${m}m` : `${Math.floor(m / 60)}h ${m % 60 > 0 ? `${m % 60}m` : ""}`.trim();

const calcCourtSession = (session: { endTime?: number; startTime: number; pausedDuration?: number; pricePerMinute: number; saleItems?: Record<string, { qty: number; price: number }>; }) => {
  const end = session.endTime || Date.now();
  const pausedMs = (session.pausedDuration || 0) * 60000;
  const rawMs = end - session.startTime - pausedMs;
  const duration = Math.max(0, Math.floor(rawMs / 60000));
  const sessionAmt = duration * session.pricePerMinute;
  const itemAmt = Object.values(session.saleItems || {}).reduce((a, it) => a + it.qty * it.price, 0);
  return { duration, sessionAmt, itemAmt, total: sessionAmt + itemAmt };
};

/* ── MAIN APP ── */
export default function App() {
  const [mounted, setMounted] = useState(false);
  const [settings, setSettings] = useState(() => S.get("settings") || DEFAULT_SETTINGS);
  const [inventory, setInventory] = useState(() => S.get("inventory") || DEFAULT_INVENTORY);
  const [courts, setCourts] = useState(() => {
    const savedCourts = S.get("courts");
    const baseCourts = (savedCourts || DEFAULT_COURTS) as any[];
    return baseCourts.map((c: any) => ({ ...c, pricePerMinute: Number(c.pricePerMinute ?? 3) }));
  });
  const [courtSessions, setCourtSessions] = useState(() => S.get("courtSessions") || {});
  const [sessionHistory, setSessionHistory] = useState(() => S.get("sessionHistory") || []);
  const [bookings, setBookings] = useState(() => S.get("bookings") || {});
  const [tab, setTab] = useState("courts");
  const [selectedDate, setSelectedDate] = useState(todayStr());
  const [sheet, setSheet] = useState<string | null>(null);
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const [sheetData, setSheetData] = useState<any>(null);
  const [toast, setToast] = useState<{ msg: string; color: string } | null>(null);
  const [tick, setTick] = useState(0);

  useEffect(() => { S.set("settings", settings); }, [settings]);
  useEffect(() => { S.set("inventory", inventory); }, [inventory]);
  useEffect(() => { S.set("courts", courts); }, [courts]);
  useEffect(() => { S.set("courtSessions", courtSessions); }, [courtSessions]);
  useEffect(() => { S.set("sessionHistory", sessionHistory); }, [sessionHistory]);
  useEffect(() => { S.set("bookings", bookings); }, [bookings]);

  useEffect(() => {
    const t = setInterval(() => setTick(x => x + 1), 10000);
    return () => clearInterval(t);
  }, []);
  useEffect(() => { setMounted(true); }, []);

  const showToast = useCallback((msg: string, color = "#00e5a0") => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 2800);
  }, []);

  // Avoid server/client text mismatches from time-dependent values during hydration.
  if (!mounted) return null;

  /* ── Court Session Actions ── */
  const startCourtSession = (court: { id: string; name: string; emoji: string; pricePerMinute?: number }) => {
    const session = {
      id: genId(), courtId: court.id, courtName: court.name, courtEmoji: court.emoji,
      startTime: Date.now(), endTime: null, pausedAt: null, pausedDuration: 0,
      pricePerMinute: Number(court.pricePerMinute ?? 0),
      saleItems: {}, participants: [], date: todayStr(), status: "running",
    };
    setCourtSessions((prev: Record<string, any>) => ({ ...prev, [court.id]: session }));
    showToast(`▶ ${court.name} session started`);
  };

  const pauseCourtSession = (courtId: string) => {
    setCourtSessions((prev: Record<string, any>) => {
      const s = prev[courtId];
      if (!s || s.status !== "running") return prev;
      return { ...prev, [courtId]: { ...s, status: "paused", pausedAt: Date.now() } };
    });
    showToast("⏸ Session paused");
  };

  const resumeCourtSession = (courtId: string) => {
    setCourtSessions((prev: Record<string, any>) => {
      const s = prev[courtId];
      if (!s || s.status !== "paused") return prev;
      const pausedMs = Math.floor((Date.now() - s.pausedAt) / 60000);
      return { ...prev, [courtId]: { ...s, status: "running", pausedAt: null, pausedDuration: (s.pausedDuration || 0) + pausedMs } };
    });
    showToast("▶ Session resumed");
  };

  const endCourtSession = (courtId: string) => {
    setCourtSessions((prev: Record<string, any>) => {
      const s = prev[courtId];
      if (!s) return prev;
      return { ...prev, [courtId]: { ...s, endTime: Date.now(), status: "ended" } };
    });
    setSheetData({ courtId });
    setSheet("endSession");
  };

  const addItemToSession = (courtId: string, item: any) => {
    setCourtSessions((prev: Record<string, any>) => {
      const s = prev[courtId];
      if (!s || s.endTime) return prev;
      const saleItems = { ...s.saleItems };
      saleItems[item.id] = saleItems[item.id]
        ? { ...saleItems[item.id], qty: saleItems[item.id].qty + 1 }
        : { name: item.name, qty: 1, price: item.price };
      return { ...prev, [courtId]: { ...s, saleItems } };
    });
  };

  const splitSession = (courtId: string, count: number, names?: string[]) => {
    setCourtSessions((prev: Record<string, any>) => {
      const s = prev[courtId];
      if (!s) return prev;
      const { total } = calcCourtSession(s);
      const participants = Array.from({ length: count }, (_, i) => ({
        id: i.toString(), name: names?.[i]?.trim() || `Player ${i + 1}`, share: total / count, status: "unpaid",
      }));
      return { ...prev, [courtId]: { ...s, participants } };
    });
  };

  const toggleParticipantPaid = (courtId: string, pid: string) => {
    setCourtSessions((prev: Record<string, any>) => {
      const s = prev[courtId];
      if (!s) return prev;
      const participants = s.participants.map((p: any) => p.id === pid ? { ...p, status: p.status === "paid" ? "unpaid" : "paid" } : p);
      return { ...prev, [courtId]: { ...s, participants } };
    });
  };

  const saveAndCloseSession = (courtId: string) => {
    const s = courtSessions[courtId];
    if (!s) return;
    setSessionHistory((prev: any[]) => [s, ...prev].slice(0, 500));
    setCourtSessions((prev: Record<string, any>) => { const next = { ...prev }; delete next[courtId]; return next; });
    setSheet(null);
    setSheetData(null);
    showToast("✓ Session saved");
  };

  /* ── Booking Actions ── */
  const saveBooking = (booking: any) => {
    const finalBooking = { ...booking, id: genId(), date: selectedDate };
    setBookings((prev: Record<string, any>) => ({ ...prev, [selectedDate]: [...(prev[selectedDate] || []), finalBooking] }));
    setSheet(null);
    showToast(`✓ Booking confirmed`);
  };

  const assignBookingToCourt = (booking: any, courtId: string) => {
    const court = courts.find((c: any) => c.id === courtId);
    if (!court) return;
    // start session on that court
    const session = {
      id: genId(), courtId: court.id, courtName: court.name, courtEmoji: court.emoji,
      startTime: Date.now(), endTime: null, pausedAt: null, pausedDuration: 0,
      pricePerMinute: Number(court.pricePerMinute ?? 0),
      saleItems: {}, participants: [], date: todayStr(), status: "running",
      bookingRef: booking.id, customerName: booking.name, customerPhone: booking.phone,
    };
    setCourtSessions((prev: Record<string, any>) => ({ ...prev, [court.id]: session }));
    // mark booking as assigned
    setBookings((prev: Record<string, any>) => {
      const next = { ...prev };
      next[booking.date] = (next[booking.date] || []).map((b: any) =>
        b.id === booking.id ? { ...b, assignedCourtId: courtId, assignedCourtName: court.name, status: b.status === "unpaid" ? "unpaid" : b.status } : b
      );
      return next;
    });
    setSheet(null);
    showToast(`▶ ${court.name} — ${booking.name} session started`);
  };

  const markBookingPaid = (date: string, id: string) => {
    setBookings((prev: Record<string, any>) => {
      const next = { ...prev };
      next[date] = (next[date] || []).map((b: any) => b.id === id ? { ...b, status: "paid" } : b);
      return next;
    });
    showToast("✓ Marked as paid");
  };

  const markSessionPaid = (sessionId: string) => {
    setSessionHistory((prev: any[]) => prev.map((s: any) => {
      if (s.id !== sessionId) return s;
      const participants = (s.participants || []).map((p: any) => ({ ...p, status: "paid" }));
      return { ...s, participants, paymentStatus: "paid" };
    }));
    showToast("✓ Session marked paid");
  };

  const updateBookingAmount = (date: string, id: string, amount: number) => {
    setBookings((prev: Record<string, any>) => {
      const next = { ...prev };
      next[date] = (next[date] || []).map((b: any) => b.id === id ? { ...b, amount: Math.max(0, Math.floor(amount)) } : b);
      return next;
    });
    setSheetData((prev: any) => prev?.booking ? { ...prev, booking: { ...prev.booking, amount: Math.max(0, Math.floor(amount)) } } : prev);
    showToast("Due updated");
  };

  const deleteBooking = (date: string, id: string) => {
    setBookings((prev: Record<string, any>) => {
      const next = { ...prev };
      next[date] = (next[date] || []).filter((b: any) => b.id !== id);
      return next;
    });
    setSheet(null);
    showToast("Booking deleted");
  };

  /* ── Derived ── */
  const dayBookings = bookings[selectedDate] || [];
  const activeSessions = Object.values(courtSessions).filter((s: any) => !s.endTime);
  const allUnpaid = Object.entries(bookings).flatMap(([date, bks]: any) => (bks as any[]).filter((b: any) => b.status === "unpaid").map((b: any) => ({ ...b, date })));

  return (
    <div style={{ fontFamily: "'Syne', sans-serif", background: "#080a0e", minHeight: "100dvh", color: "#e8e4de" }}>
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=JetBrains+Mono:wght@400;500;700&display=swap');
        *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
        body{background:#080a0e;overflow-x:hidden}
        input,select,button,textarea{font-family:'Syne',sans-serif}
        input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
        input[type=range]{-webkit-appearance:none;appearance:none;background:transparent}
        input[type=range]::-webkit-slider-runnable-track{height:4px;border-radius:2px;background:#1e2535}
        input[type=range]::-webkit-slider-thumb{-webkit-appearance:none;width:18px;height:18px;border-radius:50%;background:#00e5a0;margin-top:-7px;cursor:pointer;box-shadow:0 0 12px #00e5a066}
        ::-webkit-scrollbar{width:4px;height:4px}
        ::-webkit-scrollbar-track{background:transparent}
        ::-webkit-scrollbar-thumb{background:#1e2535;border-radius:4px}
        @keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
        @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
        @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(-8px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
        @keyframes pulse{0%,100%{opacity:1}50%{opacity:0.5}}
        @keyframes spin{from{transform:rotate(0deg)}to{transform:rotate(360deg)}}
        .fade-in{animation:fadeIn 0.25s ease both}
        .sheet-up{animation:slideUp 0.3s cubic-bezier(.32,.72,0,1) both}
        .live-dot{animation:pulse 1.8s ease infinite}
      `}</style>

      {/* ── SIDEBAR ── */}
      <div style={{ display: "flex", minHeight: "100dvh" }}>
        <Sidebar tab={tab} setTab={setTab} settings={settings} activeSessions={activeSessions} setSheet={setSheet} />

        {/* ── MAIN ── */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column", marginLeft: 220 }}>
          {/* Header */}
          <header style={{ background: "#0c0f17", borderBottom: "1px solid #1a2030", padding: "16px 32px", display: "flex", alignItems: "center", justifyContent: "space-between", position: "sticky", top: 0, zIndex: 50 }}>
            <div>
              <h1 style={{ fontSize: 22, fontWeight: 800, letterSpacing: "-0.5px" }}>{settings.facilityName}</h1>
              <div style={{ fontSize: 12, color: "#4a5568", fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                {getGreeting()} · {fmtDateFull(todayStr())}
              </div>
            </div>
            <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
              {activeSessions.length > 0 && (
                <div style={{ background: "#00e5a015", border: "1px solid #00e5a033", color: "#00e5a0", borderRadius: 20, padding: "6px 14px", fontSize: 12, fontWeight: 700, display: "flex", alignItems: "center", gap: 6 }}>
                  <span className="live-dot" style={{ width: 7, height: 7, background: "#00e5a0", borderRadius: "50%", display: "inline-block" }} />
                  {activeSessions.length} LIVE
                </div>
              )}
              <button onClick={() => setSheet("settings")} style={{ background: "#1a2030", border: "1px solid #1e2a40", color: "#e8e4de", borderRadius: 10, padding: "9px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 6 }}>
                ⚙ Settings
              </button>
            </div>
          </header>

          {/* Content */}
          <main style={{ flex: 1, padding: "28px 32px", overflowY: "auto" }}>
            {tab === "courts" && (
              <CourtsTab courts={courts} courtSessions={courtSessions} inventory={inventory} settings={settings}
                bookings={bookings[todayStr()] || []}
                onStart={startCourtSession} onPause={pauseCourtSession} onResume={resumeCourtSession}
                onEnd={endCourtSession} onAddItem={addItemToSession}
                onAssign={(booking: any) => { setSheetData({ booking }); setSheet("assignCourt"); }}
                tick={tick}
              />
            )}
            {tab === "bookings" && (
              <BookingsTab
                selectedDate={selectedDate} setSelectedDate={setSelectedDate}
                bookings={bookings} courts={courts} courtSessions={courtSessions}
                settings={settings} allUnpaid={allUnpaid}
                onNewBooking={() => { setSheetData(null); setSheet("booking"); }}
                onBookingClick={(b: any) => { setSheetData({ booking: b }); setSheet("bookingDetail"); }}
                onMarkPaid={markBookingPaid}
                onAssign={(booking: any) => { setSheetData({ booking }); setSheet("assignCourt"); }}
              />
            )}
            {tab === "today" && <TodayTab sessionHistory={sessionHistory} bookings={bookings} onMarkSessionPaid={markSessionPaid} />}
            {tab === "monthly" && <MonthlyTab sessionHistory={sessionHistory} bookings={bookings} />}
          </main>
        </div>
      </div>

      {/* ── SHEETS ── */}
      {sheet === "settings" && (
        <SettingsSheet settings={settings} onSave={(s: any) => { setSettings(s); showToast("Settings saved"); }}
          inventory={inventory} onSaveInventory={setInventory}
          courts={courts} onSaveCourts={setCourts}
          onClose={() => setSheet(null)} />
      )}
      {sheet === "booking" && (
        <BookingSheet settings={settings} courts={courts}
          bookedSlots={dayBookings} selectedDate={selectedDate}
          onClose={() => setSheet(null)} onSave={saveBooking} />
      )}
      {sheet === "bookingDetail" && sheetData?.booking && (
        <BookingDetailSheet booking={sheetData.booking} settings={settings} courts={courts}
          courtSessions={courtSessions}
          onClose={() => setSheet(null)}
          onUpdateDue={(amount: number) => updateBookingAmount(sheetData.booking.date, sheetData.booking.id, amount)}
          onMarkPaid={() => { markBookingPaid(sheetData.booking.date, sheetData.booking.id); setSheet(null); }}
          onDelete={() => deleteBooking(sheetData.booking.date, sheetData.booking.id)}
          onAssign={() => { setSheet("assignCourt"); }} />
      )}
      {sheet === "assignCourt" && sheetData?.booking && (
        <AssignCourtSheet booking={sheetData.booking} courts={courts} courtSessions={courtSessions}
          onClose={() => setSheet(null)} onAssign={assignBookingToCourt} />
      )}
      {sheet === "endSession" && sheetData?.courtId && courtSessions[sheetData.courtId] && (
        <EndSessionSheet session={courtSessions[sheetData.courtId]}
          onSplit={(n: number, names?: string[]) => splitSession(sheetData.courtId, n, names)}
          onTogglePaid={(pid: string) => toggleParticipantPaid(sheetData.courtId, pid)}
          onAddItem={(item: any) => addItemToSession(sheetData.courtId, item)}
          inventory={inventory}
          onClose={() => saveAndCloseSession(sheetData.courtId)} />
      )}

      {/* ── TOAST ── */}
      {toast && (
        <div style={{ position: "fixed", top: 24, left: "50%", background: toast.color === "#00e5a0" ? "#00e5a0" : toast.color, color: "#080a0e", padding: "11px 24px", borderRadius: 30, fontSize: 13, fontWeight: 800, zIndex: 500, animation: "toastIn 0.25s ease both", whiteSpace: "nowrap", boxShadow: "0 8px 32px #00000088", letterSpacing: "-0.2px" }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}

/* ── SIDEBAR ── */
function Sidebar({ tab, setTab, settings, activeSessions, setSheet }: any) {
  const nav = [
    { key: "courts", icon: "🏟️", label: "Courts" },
    { key: "bookings", icon: "📅", label: "Bookings" },
    { key: "today", icon: "📊", label: "Today" },
    { key: "monthly", icon: "📈", label: "Monthly" },
  ];
  return (
    <div style={{ width: 220, background: "#0c0f17", borderRight: "1px solid #1a2030", position: "fixed", top: 0, left: 0, height: "100dvh", display: "flex", flexDirection: "column", padding: "24px 0", zIndex: 60 }}>
      <div style={{ padding: "0 20px 24px", borderBottom: "1px solid #1a2030" }}>
        <div style={{ fontSize: 13, fontWeight: 800, color: "#00e5a0", letterSpacing: 2, textTransform: "uppercase", fontFamily: "'JetBrains Mono', monospace" }}>ARENA</div>
        <div style={{ fontSize: 11, color: "#4a5568", marginTop: 2 }}>{settings.facilityName}</div>
      </div>
      <nav style={{ flex: 1, padding: "16px 12px", display: "flex", flexDirection: "column", gap: 4 }}>
        {nav.map(n => (
          <button key={n.key} onClick={() => setTab(n.key)} style={{
            width: "100%", padding: "11px 14px", borderRadius: 10, border: "none", cursor: "pointer",
            background: tab === n.key ? "#1a2030" : "transparent",
            color: tab === n.key ? "#e8e4de" : "#4a5568",
            textAlign: "left", fontSize: 14, fontWeight: tab === n.key ? 700 : 600,
            display: "flex", alignItems: "center", gap: 10,
            borderLeft: tab === n.key ? "2px solid #00e5a0" : "2px solid transparent",
            transition: "all 0.15s",
          }}>
            <span style={{ fontSize: 16 }}>{n.icon}</span>
            {n.label}
            {n.key === "courts" && activeSessions.length > 0 && (
              <span style={{ marginLeft: "auto", background: "#00e5a022", color: "#00e5a0", borderRadius: 20, fontSize: 10, padding: "2px 8px", fontWeight: 800 }}>{activeSessions.length}</span>
            )}
          </button>
        ))}
      </nav>
      <div style={{ padding: "16px 12px", borderTop: "1px solid #1a2030" }}>
        {activeSessions.length > 0 && (
          <div style={{ background: "#00e5a010", border: "1px solid #00e5a022", borderRadius: 10, padding: "10px 12px", marginBottom: 10 }}>
            <div style={{ fontSize: 10, color: "#00e5a0", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, marginBottom: 4 }}>Live Sessions</div>
            {activeSessions.map((s: any) => {
              const { total } = calcCourtSession(s);
              return (
                <div key={s.id} style={{ fontSize: 11, color: "#e8e4de", display: "flex", justifyContent: "space-between", marginBottom: 2 }}>
                  <span style={{ color: "#4a5568" }}>{s.courtEmoji} {s.courtName}</span>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{fmt(total)}</span>
                </div>
              );
            })}
          </div>
        )}
        <div style={{ fontSize: 10, color: "#2a3548", textAlign: "center", fontFamily: "'JetBrains Mono', monospace" }}>ARENA v2.0</div>
      </div>
    </div>
  );
}

/* ── COURTS TAB ── */
function CourtsTab({ courts, courtSessions, inventory, settings, bookings, onStart, onPause, onResume, onEnd, onAddItem, onAssign, tick }: any) {
  // pending bookings that haven't been assigned yet
  const today = todayStr();
  const now = new Date();
  const currentMins = now.getHours() * 60 + now.getMinutes();
  const pendingBookings = bookings.filter((b: any) => {
    if (b.assignedCourtId) return false;
    const startM = timeToMins(b.startTime || "00:00");
    const endM = timeToMins(b.endTime || "23:59");
    return currentMins >= startM - 30 && currentMins <= endM + 15;
  });

  return (
    <div className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 }}>
        <div>
          <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px" }}>Courts</h2>
          <p style={{ fontSize: 13, color: "#4a5568", marginTop: 4 }}>Manage active sessions per court</p>
        </div>
      </div>

      {/* Pending bookings banner */}
      {pendingBookings.length > 0 && (
        <div style={{ background: "#1c1a0e", border: "1px solid #f5a62344", borderRadius: 14, padding: "16px 20px", marginBottom: 24 }}>
          <div style={{ fontSize: 11, color: "#f5a623", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, marginBottom: 10 }}>⏰ Bookings Ready to Start</div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {pendingBookings.map((b: any) => (
              <button key={b.id} onClick={() => onAssign(b)} style={{ background: "#f5a62315", border: "1.5px solid #f5a62355", color: "#f5a623", borderRadius: 10, padding: "10px 16px", fontSize: 13, fontWeight: 700, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
                <span>👤 {b.name}</span>
                <span style={{ fontSize: 11, color: "#f5a62388" }}>{fmt12(b.startTime)}</span>
                <span style={{ fontSize: 11, background: "#f5a62322", borderRadius: 6, padding: "2px 8px" }}>Assign Court →</span>
              </button>
            ))}
          </div>
        </div>
      )}

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(380px, 1fr))", gap: 18 }}>
        {courts.map((court: any) => (
          <CourtCard key={court.id} court={court} session={courtSessions[court.id]}
            inventory={inventory} settings={settings}
            onStart={() => onStart(court)} onPause={() => onPause(court.id)}
            onResume={() => onResume(court.id)} onEnd={() => onEnd(court.id)}
            onAddItem={(item: any) => onAddItem(court.id, item)} tick={tick} />
        ))}
        {courts.length === 0 && (
          <div style={{ gridColumn: "1/-1", textAlign: "center", padding: "80px", color: "#2a3548" }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🏟️</div>
            <div style={{ fontSize: 14 }}>No courts configured. Add in Settings.</div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ── COURT CARD ── */
function CourtCard({ court, session, inventory, settings, onStart, onPause, onResume, onEnd, onAddItem, tick }: any) {
  const [showItems, setShowItems] = useState(false);
  const calc = session ? calcCourtSession(session) : null;
  const isRunning = session?.status === "running";
  const isPaused = session?.status === "paused";
  const hasSession = !!session;

  const statusColor = isRunning ? "#00e5a0" : isPaused ? "#f5a623" : "#2a3548";
  const cardBg = isRunning ? "linear-gradient(135deg, #0a1a12, #0c0f17)" : isPaused ? "linear-gradient(135deg, #1a1208, #0c0f17)" : "#0c0f17";
  const borderColor = isRunning ? "#00e5a033" : isPaused ? "#f5a62333" : "#1a2030";

  return (
    <div style={{ background: cardBg, border: `1.5px solid ${borderColor}`, borderRadius: 18, overflow: "hidden", transition: "border-color 0.3s" }}>
      {/* Card Header */}
      <div style={{ padding: "18px 20px 14px", borderBottom: `1px solid ${borderColor}` }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
            <span style={{ fontSize: 26 }}>{court.emoji}</span>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{court.name}</div>
              {session?.customerName && (
                <div style={{ fontSize: 11, color: "#4a5568", marginTop: 2 }}>👤 {session.customerName}</div>
              )}
            </div>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            {isRunning && <span className="live-dot" style={{ width: 7, height: 7, background: "#00e5a0", borderRadius: "50%", display: "inline-block" }} />}
            <span style={{ fontSize: 10, fontWeight: 800, textTransform: "uppercase", letterSpacing: 1.5, color: statusColor, background: statusColor + "15", padding: "4px 10px", borderRadius: 20 }}>
              {isRunning ? "LIVE" : isPaused ? "PAUSED" : "IDLE"}
            </span>
          </div>
        </div>

        {hasSession && (
          <div style={{ marginTop: 16, background: "#080a0e", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 38, fontWeight: 700, letterSpacing: -1, color: statusColor }}>{fmt(calc?.total || 0)}</div>
            <div style={{ fontSize: 11, color: "#4a5568", marginTop: 4, display: "flex", gap: 12 }}>
              <span>⏱ {fmtDuration(calc?.duration || 0)}</span>
              <span>🏟 {fmt(calc?.sessionAmt || 0)}</span>
              {calc && calc.itemAmt > 0 && <span>🛒 +{fmt(calc?.itemAmt || 0)}</span>}
            </div>
            {session?.participants?.length > 0 && (
              <div style={{ marginTop: 8, fontSize: 11, color: "#4a5568" }}>
                {session.participants.filter((p: any) => p.status === "paid").length}/{session.participants.length} paid
              </div>
            )}
          </div>
        )}
      </div>

      {/* Controls */}
      <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
        {!hasSession ? (
          <button onClick={onStart} style={{ background: "#00e5a0", color: "#080a0e", border: "none", borderRadius: 10, padding: "14px", fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
            ▶ Start Session
          </button>
        ) : session.status === "ended" ? (
          <div style={{ textAlign: "center", padding: "10px", color: "#4a5568", fontSize: 13 }}>Session ending...</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 8 }}>
              {isRunning ? (
                <button onClick={onPause} style={{ flex: 1, background: "#f5a62318", border: "1.5px solid #f5a62344", color: "#f5a623", borderRadius: 10, padding: "12px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                  ⏸ Pause
                </button>
              ) : (
                <button onClick={onResume} style={{ flex: 1, background: "#00e5a018", border: "1.5px solid #00e5a044", color: "#00e5a0", borderRadius: 10, padding: "12px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                  ▶ Resume
                </button>
              )}
              <button onClick={onEnd} style={{ flex: 1, background: "#ef444418", border: "1.5px solid #ef444444", color: "#ef4444", borderRadius: 10, padding: "12px", fontSize: 13, fontWeight: 800, cursor: "pointer" }}>
                ⏹ End
              </button>
            </div>
            {inventory.length > 0 && (
              <>
                <button onClick={() => setShowItems(!showItems)} style={{ background: "#1a2030", border: "1px solid #1e2a40", color: "#e8e4de", borderRadius: 10, padding: "10px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>
                  🛒 Sell Items {showItems ? "▲" : "▼"}
                </button>
                {showItems && (
                  <div style={{ display: "grid", gridTemplateColumns: `repeat(${Math.min(inventory.length, 4)}, 1fr)`, gap: 8 }}>
                    {inventory.map((item: any) => {
                      const sold = session.saleItems?.[item.id];
                      return (
                        <button key={item.id} onClick={() => onAddItem(item)} style={{ background: sold ? "#00e5a010" : "#1a2030", border: `1px solid ${sold ? "#00e5a033" : "#1e2a40"}`, borderRadius: 10, padding: "10px 6px", cursor: "pointer", display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                          <span style={{ fontSize: 20 }}>{item.emoji}</span>
                          <span style={{ fontSize: 10, fontWeight: 600, color: "#e8e4de" }}>{item.name}</span>
                          <span style={{ fontSize: 10, color: "#4a5568" }}>{fmt(item.price)}</span>
                          {sold && <span style={{ background: "#00e5a0", color: "#080a0e", borderRadius: 8, fontSize: 10, fontWeight: 800, padding: "1px 6px" }}>×{sold.qty}</span>}
                        </button>
                      );
                    })}
                  </div>
                )}
              </>
            )}
          </>
        )}
      </div>
    </div>
  );
}

/* ── BOOKINGS TAB ── */
function BookingsTab({ selectedDate, setSelectedDate, bookings, courts, courtSessions, settings, allUnpaid, onNewBooking, onBookingClick, onMarkPaid, onAssign }: any) {
  const dayBks = bookings[selectedDate] || [];
  const paid = dayBks.filter((b: any) => b.status === "paid").reduce((a: number, b: any) => a + (b.amount || 0), 0);
  const unpaid = dayBks.filter((b: any) => b.status === "unpaid").reduce((a: number, b: any) => a + (b.amount || 0), 0);

  return (
    <div className="fade-in">
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 }}>
        <div>
          <h2 style={{ fontSize: 26, fontWeight: 800, letterSpacing: "-0.5px" }}>Bookings</h2>
          <p style={{ fontSize: 13, color: "#4a5568", marginTop: 4 }}>Manage slot reservations</p>
        </div>
        <button onClick={onNewBooking} style={{ background: "#00e5a0", color: "#080a0e", border: "none", borderRadius: 10, padding: "12px 20px", fontSize: 14, fontWeight: 800, cursor: "pointer", display: "flex", alignItems: "center", gap: 8 }}>
          + New Booking
        </button>
      </div>

      {/* Date strip */}
      <div style={{ display: "flex", gap: 8, overflowX: "auto", paddingBottom: 4, marginBottom: 20 }}>
        {getDateRange().map(d => (
          <button key={d} onClick={() => setSelectedDate(d)} style={{ flexShrink: 0, padding: "8px 16px", borderRadius: 20, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "1.5px solid", background: d === selectedDate ? "#e8e4de" : "transparent", color: d === selectedDate ? "#080a0e" : "#4a5568", borderColor: d === selectedDate ? "#e8e4de" : "#1a2030", transition: "all 0.15s" }}>
            {fmtDateShort(d)}
          </button>
        ))}
      </div>

      {/* Stats row */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 20 }}>
        {[{ label: "Bookings", val: String(dayBks.length), color: "#e8e4de" }, { label: "Collected", val: fmt(paid), color: "#00e5a0" }, { label: "Pending", val: fmt(unpaid), color: unpaid > 0 ? "#f5a623" : "#4a5568" }].map(t => (
          <div key={t.label} style={{ background: "#0c0f17", border: "1px solid #1a2030", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: "#4a5568", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{t.label}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 22, fontWeight: 700, color: t.color }}>{t.val}</div>
          </div>
        ))}
      </div>

      {/* Booking list */}
      {dayBks.length === 0 ? (
        <div style={{ textAlign: "center", padding: "60px", color: "#2a3548" }}>
          <div style={{ fontSize: 42, marginBottom: 12 }}>📅</div>
          <div style={{ fontSize: 13 }}>No bookings for {fmtDateShort(selectedDate)}</div>
          <button onClick={onNewBooking} style={{ marginTop: 16, background: "#1a2030", border: "1px solid #1e2a40", color: "#e8e4de", borderRadius: 10, padding: "10px 20px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>+ Add Booking</button>
        </div>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {dayBks.sort((a: any, b: any) => timeToMins(a.startTime || "0:00") - timeToMins(b.startTime || "0:00")).map((b: any) => {
            const assigned = b.assignedCourtId;
            const activeSession = assigned ? Object.values(courtSessions).find((s: any) => s.courtId === assigned && !s.endTime) : null;
            return (
              <div key={b.id} onClick={() => onBookingClick(b)} style={{ background: "#0c0f17", border: `1.5px solid ${b.status === "paid" ? "#00e5a022" : "#f5a62322"}`, borderRadius: 12, padding: "16px 20px", cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "space-between", transition: "border-color 0.2s" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
                  <div style={{ width: 8, height: 8, borderRadius: "50%", background: b.status === "paid" ? "#00e5a0" : "#f5a623", boxShadow: `0 0 8px ${b.status === "paid" ? "#00e5a0" : "#f5a623"}88` }} />
                  <div>
                    <div style={{ fontWeight: 700, fontSize: 15 }}>{b.name}</div>
                    <div style={{ fontSize: 11, color: "#4a5568", fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                      {fmt12(b.startTime)} → {fmt12(b.endTime)} · {b.phone || "—"}
                      {assigned && <span style={{ color: "#00e5a0", marginLeft: 8 }}>✓ {b.assignedCourtName}</span>}
                    </div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, fontSize: 16, color: b.status === "paid" ? "#00e5a0" : "#f5a623" }}>{fmt(b.amount)}</span>
                  {!assigned && (
                    <button onClick={e => { e.stopPropagation(); onAssign(b); }} style={{ background: "#00e5a018", border: "1px solid #00e5a033", color: "#00e5a0", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                      Assign Court
                    </button>
                  )}
                  {activeSession ? <span style={{ background: "#00e5a022", color: "#00e5a0", borderRadius: 8, padding: "4px 10px", fontSize: 10, fontWeight: 800 }}>● LIVE</span> : null}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* All unpaid */}
      {allUnpaid.filter((b: any) => b.date !== selectedDate).length > 0 && (
        <div style={{ marginTop: 28 }}>
          <div style={{ fontSize: 12, color: "#4a5568", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 12 }}>Other Unpaid Bookings</div>
          {allUnpaid.filter((b: any) => b.date !== selectedDate).map((b: any) => (
            <div key={b.id} style={{ background: "#0c0f17", border: "1px solid #f5a62322", borderRadius: 10, padding: "12px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
              <div>
                <div style={{ fontWeight: 700, fontSize: 14 }}>{b.name}</div>
                <div style={{ fontSize: 11, color: "#4a5568" }}>{fmtDateShort(b.date)} · {fmt12(b.startTime)}</div>
              </div>
              <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#f5a623" }}>{fmt(b.amount)}</span>
                <button onClick={() => onMarkPaid(b.date, b.id)} style={{ background: "#00e5a018", border: "1px solid #00e5a033", color: "#00e5a0", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>✓ Paid</button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

/* ── TIME RANGE PICKER ── */
function TimeRangePicker({ openMins, closeMins, startMins, endMins, onChangeStart, onChangeEnd }: any) {
  const totalMins = closeMins - openMins;
  const startPct = ((startMins - openMins) / totalMins) * 100;
  const endPct = ((endMins - openMins) / totalMins) * 100;

  return (
    <div style={{ padding: "8px 0" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 12 }}>
        <div style={{ background: "#1a2030", borderRadius: 8, padding: "8px 14px" }}>
          <div style={{ fontSize: 9, color: "#4a5568", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Start</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: "#00e5a0" }}>{fmt12(minsToTime(startMins))}</div>
        </div>
        <div style={{ background: "#1a2030", borderRadius: 8, padding: "8px 14px", textAlign: "right" }}>
          <div style={{ fontSize: 9, color: "#4a5568", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>End</div>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700, color: "#f5a623" }}>{fmt12(minsToTime(endMins))}</div>
        </div>
      </div>
      <div style={{ position: "relative", padding: "8px 0" }}>
        {/* track */}
        <div style={{ height: 6, background: "#1a2030", borderRadius: 3, position: "relative", marginBottom: 20 }}>
          <div style={{ position: "absolute", left: `${startPct}%`, width: `${endPct - startPct}%`, height: "100%", background: "linear-gradient(to right, #00e5a0, #f5a623)", borderRadius: 3 }} />
        </div>
        {/* Start slider */}
        <input type="range" min={openMins} max={closeMins - 30} step={5} value={startMins}
          onChange={e => { const v = parseInt(e.target.value); onChangeStart(Math.min(v, endMins - 30)); }}
          style={{ position: "absolute", top: 4, left: 0, width: "100%", height: 22, opacity: 0, cursor: "pointer", zIndex: 2 }} />
        {/* End slider */}
        <input type="range" min={openMins + 30} max={closeMins} step={5} value={endMins}
          onChange={e => { const v = parseInt(e.target.value); onChangeEnd(Math.max(v, startMins + 30)); }}
          style={{ position: "absolute", top: 4, left: 0, width: "100%", height: 22, opacity: 0, cursor: "pointer", zIndex: 2 }} />
      </div>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, color: "#2a3548", fontFamily: "'JetBrains Mono', monospace" }}>
        <span>{fmt12(minsToTime(openMins))}</span>
        <span style={{ color: "#4a5568", fontSize: 11 }}>Duration: {fmtDuration(endMins - startMins)}</span>
        <span>{fmt12(minsToTime(closeMins))}</span>
      </div>
    </div>
  );
}

/* ── BOOKING SHEET ── */
function BookingSheet({ settings, courts, bookedSlots, selectedDate, onClose, onSave }: any) {
  const openM = timeToMins(settings.openTime);
  const closeM = timeToMins(settings.closeTime);
  const nowM = new Date().getHours() * 60 + new Date().getMinutes();
  const defaultStart = Math.max(openM, Math.min(closeM - settings.defaultBookingDuration, Math.ceil(nowM / 30) * 30));
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState(String(settings.defaultBookingPrice));
  const [startM] = useState(defaultStart);
  const [endM] = useState(defaultStart + settings.defaultBookingDuration);
  const startDefault12 = to12hParts(minsToTime(defaultStart));
  const endDefault12 = to12hParts(minsToTime(defaultStart + settings.defaultBookingDuration));
  const [startHour, setStartHour] = useState(startDefault12.hour);
  const [startMinute, setStartMinute] = useState(startDefault12.minute);
  const [startPeriod, setStartPeriod] = useState<"AM" | "PM">(startDefault12.period);
  const [endHour, setEndHour] = useState(endDefault12.hour);
  const [endMinute, setEndMinute] = useState(endDefault12.minute);
  const [endPeriod, setEndPeriod] = useState<"AM" | "PM">(endDefault12.period);
  const [status, setStatus] = useState("unpaid");
  const [courtPref, setCourtPref] = useState("");

  const startTime = from12hParts(startHour, startMinute, startPeriod);
  const endTime = from12hParts(endHour, endMinute, endPeriod);
  const selectedStartM = timeToMins(startTime);
  const selectedEndM = timeToMins(endTime);
  const isTimeValid = selectedStartM >= openM && selectedEndM <= closeM && selectedEndM > selectedStartM;

  return (
    <SheetOverlay onClose={onClose}>
      <div style={{ padding: "0 24px 16px", borderBottom: "1px solid #1a2030", fontSize: 18, fontWeight: 800 }}>New Booking</div>
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 18, maxHeight: "65dvh", overflowY: "auto" }}>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 14 }}>
          <FieldBlock label="Customer Name"><input autoFocus value={name} onChange={e => setName(e.target.value)} placeholder="Rahul Sharma" style={iStyle} /></FieldBlock>
          <FieldBlock label="Phone"><input type="tel" value={phone} onChange={e => setPhone(e.target.value)} placeholder="9876543210" style={iStyle} /></FieldBlock>
        </div>
        <FieldBlock label="Amount (₹)"><input type="number" value={amount} onChange={e => setAmount(e.target.value)} style={{ ...iStyle, maxWidth: 200 }} /></FieldBlock>
        <FieldBlock label="Time Slot (Manual)">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            <div style={{ background: "#1a2030", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: "#4a5568", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>Start</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                <select value={startHour} onChange={e => setStartHour(Number(e.target.value))} style={iStyle}>{Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h} value={h}>{h}</option>)}</select>
                <select value={startMinute} onChange={e => setStartMinute(Number(e.target.value))} style={iStyle}>{[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}</select>
                <select value={startPeriod} onChange={e => setStartPeriod(e.target.value as "AM" | "PM")} style={iStyle}><option value="AM">AM</option><option value="PM">PM</option></select>
              </div>
            </div>
            <div style={{ background: "#1a2030", borderRadius: 10, padding: "10px 12px" }}>
              <div style={{ fontSize: 10, color: "#4a5568", fontWeight: 700, textTransform: "uppercase", marginBottom: 8 }}>End</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 6 }}>
                <select value={endHour} onChange={e => setEndHour(Number(e.target.value))} style={iStyle}>{Array.from({ length: 12 }, (_, i) => i + 1).map(h => <option key={h} value={h}>{h}</option>)}</select>
                <select value={endMinute} onChange={e => setEndMinute(Number(e.target.value))} style={iStyle}>{[0, 5, 10, 15, 20, 25, 30, 35, 40, 45, 50, 55].map(m => <option key={m} value={m}>{String(m).padStart(2, "0")}</option>)}</select>
                <select value={endPeriod} onChange={e => setEndPeriod(e.target.value as "AM" | "PM")} style={iStyle}><option value="AM">AM</option><option value="PM">PM</option></select>
              </div>
            </div>
          </div>
          <div style={{ marginTop: 10, fontSize: 11, color: isTimeValid ? "#4a5568" : "#ef4444" }}>
            {isTimeValid ? `Selected: ${fmt12(startTime)} - ${fmt12(endTime)} (${fmtDuration(selectedEndM - selectedStartM)})` : `Pick a valid slot between ${fmt12(settings.openTime)} and ${fmt12(settings.closeTime)} with end after start.`}
          </div>
        </FieldBlock>
        <FieldBlock label="Court Preference (optional)">
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            <button onClick={() => setCourtPref("")} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "1.5px solid", background: courtPref === "" ? "#e8e4de" : "#1a2030", color: courtPref === "" ? "#080a0e" : "#4a5568", borderColor: courtPref === "" ? "#e8e4de" : "#1a2030" }}>Any</button>
            {courts.map((c: any) => (
              <button key={c.id} onClick={() => setCourtPref(c.id)} style={{ padding: "7px 14px", borderRadius: 8, fontSize: 12, fontWeight: 700, cursor: "pointer", border: "1.5px solid", background: courtPref === c.id ? "#00e5a022" : "#1a2030", color: courtPref === c.id ? "#00e5a0" : "#4a5568", borderColor: courtPref === c.id ? "#00e5a044" : "#1a2030" }}>
                {c.emoji} {c.name}
              </button>
            ))}
          </div>
        </FieldBlock>
        <FieldBlock label="Payment Status">
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
            {[{ k: "paid", label: "✅ Paid Now" }, { k: "unpaid", label: "⏳ Pay Later" }].map(opt => (
              <button key={opt.k} onClick={() => setStatus(opt.k)} style={{ padding: "12px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "1.5px solid", background: status === opt.k ? (opt.k === "paid" ? "#00e5a018" : "#f5a62318") : "#1a2030", color: status === opt.k ? (opt.k === "paid" ? "#00e5a0" : "#f5a623") : "#4a5568", borderColor: status === opt.k ? (opt.k === "paid" ? "#00e5a044" : "#f5a62344") : "#1a2030" }}>{opt.label}</button>
            ))}
          </div>
        </FieldBlock>
      </div>
      <div style={{ padding: "14px 24px 20px", display: "flex", gap: 10 }}>
        <button onClick={() => { if (name.trim() && isTimeValid) onSave({ name: name.trim(), phone: phone.trim(), startTime, endTime, amount: parseInt(amount) || 0, status, courtPref }); }} disabled={!name.trim() || !isTimeValid} style={{ flex: 1, background: "#00e5a0", color: "#080a0e", border: "none", borderRadius: 10, padding: "14px", fontSize: 14, fontWeight: 800, cursor: "pointer", opacity: !name.trim() || !isTimeValid ? 0.5 : 1 }}>Confirm Booking</button>
        <button onClick={onClose} style={{ background: "#1a2030", border: "1px solid #1e2a40", color: "#4a5568", borderRadius: 10, padding: "14px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
      </div>
    </SheetOverlay>
  );
}

/* ── BOOKING DETAIL SHEET ── */
function BookingDetailSheet({ booking, settings, courts, courtSessions, onClose, onMarkPaid, onDelete, onAssign, onUpdateDue }: any) {
  const [dueInput, setDueInput] = useState(String(booking.amount || 0));
  useEffect(() => { setDueInput(String(booking.amount || 0)); }, [booking.amount]);
  const sendWA = () => {
    const msg = `Hi ${booking.name}! 👋\n\nBooking confirmed at *${settings.facilityName}*.\n📅 ${fmtDateFull(booking.date)}\n⏰ ${fmt12(booking.startTime)} – ${fmt12(booking.endTime)}\n💰 ₹${booking.amount}\n\nSee you! 🏟️`;
    window.open(`https://wa.me/${booking.phone?.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`, "_blank");
  };
  const assigned = booking.assignedCourtId;
  const activeSession = assigned ? (Object.values(courtSessions).find((s: any) => s.courtId === assigned && !s.endTime) as any) : null;

  return (
    <SheetOverlay onClose={onClose}>
      <div style={{ padding: "0 24px 16px", borderBottom: "1px solid #1a2030", fontSize: 18, fontWeight: 800 }}>Booking Details</div>
      <div style={{ padding: "20px 24px" }}>
        {[
          { label: "Customer", val: booking.name },
          { label: "Phone", val: booking.phone || "—" },
          { label: "Date", val: fmtDateShort(booking.date) },
          { label: "Time", val: `${fmt12(booking.startTime)} – ${fmt12(booking.endTime)}` },
          { label: "Amount", val: fmt(booking.amount) },
          { label: "Status", val: booking.status === "paid" ? "✅ Paid" : "⏳ Unpaid", color: booking.status === "paid" ? "#00e5a0" : "#f5a623" },
          ...(assigned ? [{ label: "Court", val: `${booking.assignedCourtName}`, color: "#00e5a0" }] : []),
        ].map(row => (
          <div key={row.label} style={{ display: "flex", justifyContent: "space-between", padding: "13px 0", borderBottom: "1px solid #1a2030" }}>
            <span style={{ fontSize: 11, color: "#4a5568", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.5px" }}>{row.label}</span>
            <span style={{ fontSize: 14, fontWeight: 700, color: row.color || "#e8e4de" }}>{row.val}</span>
          </div>
        ))}
        {activeSession ? (
          <div style={{ marginTop: 14, background: "#00e5a010", border: "1px solid #00e5a033", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: "#00e5a0", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1 }}>● Session Active</div>
            <div style={{ fontSize: 13, color: "#e8e4de", marginTop: 4, fontFamily: "'JetBrains Mono', monospace" }}>
              {fmt((activeSession as any)?.total)} · {fmtDuration((activeSession as any)?.duration)}
            </div>
          </div>
        ) : null}
      </div>
      {booking.status === "unpaid" && (
        <div style={{ padding: "0 24px 14px" }}>
          <div style={{ background: "#f5a62310", border: "1px solid #f5a62333", borderRadius: 10, padding: "12px 14px" }}>
            <div style={{ fontSize: 10, color: "#f5a623", fontWeight: 800, textTransform: "uppercase", letterSpacing: 1, marginBottom: 8 }}>Due Amount</div>
            <div style={{ display: "flex", gap: 8 }}>
              <input type="number" min={0} value={dueInput} onChange={e => setDueInput(e.target.value)} style={{ ...iStyle, flex: 1 }} />
              <button onClick={() => onUpdateDue(parseInt(dueInput || "0"))} style={{ background: "#1a2030", border: "1px solid #1e2a40", color: "#e8e4de", borderRadius: 8, padding: "0 14px", fontSize: 12, fontWeight: 700, cursor: "pointer", whiteSpace: "nowrap" }}>
                Save Due
              </button>
            </div>
          </div>
        </div>
      )}
      <div style={{ padding: "0 24px 20px", display: "flex", flexDirection: "column", gap: 8 }}>
        {booking.status === "unpaid" && <button onClick={onMarkPaid} style={{ background: "#00e5a0", color: "#080a0e", border: "none", borderRadius: 10, padding: "13px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>✅ Mark as Paid</button>}
        {!assigned && <button onClick={onAssign} style={{ background: "#1a2030", border: "1px solid #1e2a40", color: "#e8e4de", borderRadius: 10, padding: "13px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>🏟️ Assign to Court & Start Session</button>}
        {booking.phone && <button onClick={sendWA} style={{ background: "#25D36618", border: "1px solid #25D36644", color: "#25D366", borderRadius: 10, padding: "12px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>💬 WhatsApp</button>}
        <button onClick={onDelete} style={{ background: "#ef444415", border: "1px solid #ef444433", color: "#ef4444", borderRadius: 10, padding: "12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>🗑 Delete Booking</button>
        <button onClick={onClose} style={{ background: "transparent", border: "1px solid #1a2030", color: "#4a5568", borderRadius: 10, padding: "12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Close</button>
      </div>
    </SheetOverlay>
  );
}

/* ── ASSIGN COURT SHEET ── */
function AssignCourtSheet({ booking, courts, courtSessions, onClose, onAssign }: any) {
  return (
    <SheetOverlay onClose={onClose}>
      <div style={{ padding: "0 24px 16px", borderBottom: "1px solid #1a2030" }}>
        <div style={{ fontSize: 18, fontWeight: 800 }}>Assign Court</div>
        <div style={{ fontSize: 12, color: "#4a5568", marginTop: 4 }}>for {booking.name} · {fmt12(booking.startTime)} – {fmt12(booking.endTime)}</div>
      </div>
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 10 }}>
        {courts.map((court: any) => {
          const activeSession = courtSessions[court.id] && !courtSessions[court.id].endTime;
          return (
            <button key={court.id} disabled={!!activeSession} onClick={() => onAssign(booking, court.id)} style={{ background: activeSession ? "#0c0f17" : "#1a2030", border: `1.5px solid ${activeSession ? "#1a2030" : "#00e5a033"}`, borderRadius: 12, padding: "16px 18px", cursor: activeSession ? "not-allowed" : "pointer", display: "flex", justifyContent: "space-between", alignItems: "center", opacity: activeSession ? 0.5 : 1, transition: "all 0.15s" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                <span style={{ fontSize: 26 }}>{court.emoji}</span>
                <div>
                  <div style={{ fontWeight: 700, fontSize: 15, color: "#e8e4de", textAlign: "left" }}>{court.name}</div>
                  <div style={{ fontSize: 11, color: "#4a5568", marginTop: 2, textAlign: "left" }}>
                    {activeSession ? `🔴 Occupied by ${courtSessions[court.id].customerName || "session"}` : "🟢 Available — click to assign & start"}
                  </div>
                </div>
              </div>
              {!activeSession && <span style={{ background: "#00e5a022", color: "#00e5a0", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700 }}>▶ Start</span>}
            </button>
          );
        })}
      </div>
      <div style={{ padding: "0 24px 20px" }}>
        <button onClick={onClose} style={{ width: "100%", background: "transparent", border: "1px solid #1a2030", color: "#4a5568", borderRadius: 10, padding: "12px", fontSize: 13, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
      </div>
    </SheetOverlay>
  );
}

/* ── END SESSION SHEET ── */
function EndSessionSheet({ session, onSplit, onTogglePaid, onAddItem, inventory, onClose }: any) {
  const { duration, sessionAmt, itemAmt, total } = calcCourtSession(session);
  const [playerCount, setPlayerCount] = useState(2);
  const [playerNames, setPlayerNames] = useState<string[]>(["Player 1", "Player 2"]);
  const paid = (session.participants || []).reduce((a: number, p: any) => a + (p.status === "paid" ? p.share : 0), 0);

  return (
    <SheetOverlay onClose={onClose}>
      <div style={{ padding: "0 24px 16px", borderBottom: "1px solid #1a2030", fontSize: 18, fontWeight: 800 }}>
        Session Complete — {session.courtEmoji} {session.courtName}
      </div>
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 16, maxHeight: "60dvh", overflowY: "auto" }}>
        <div style={{ background: "#1a2030", borderRadius: 14, padding: "20px", textAlign: "center" }}>
          <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 44, fontWeight: 700, letterSpacing: -1 }}>{fmt(total)}</div>
          <div style={{ fontSize: 12, color: "#4a5568", marginTop: 6 }}>
            {fmtDuration(duration)} · {fmt(sessionAmt)} court{itemAmt > 0 ? ` + ${fmt(itemAmt)} items` : ""}
          </div>
          {session.customerName && <div style={{ fontSize: 13, color: "#00e5a0", marginTop: 6 }}>👤 {session.customerName}</div>}
        </div>

        {/* Items recap */}
        {itemAmt > 0 && (
          <div style={{ background: "#0c0f17", border: "1px solid #1a2030", borderRadius: 10, padding: "4px 16px" }}>
            {Object.values(session.saleItems).map((it: any, i: number, arr: any) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "10px 0", borderBottom: i < arr.length - 1 ? "1px solid #1a2030" : "none" }}>
                <span style={{ fontSize: 13, color: "#4a5568" }}>{it.name} × {it.qty}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{fmt(it.qty * it.price)}</span>
              </div>
            ))}
          </div>
        )}

        {/* Split */}
        <div style={{ fontSize: 11, color: "#4a5568", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1 }}>Split Payment</div>
        {(session.participants || []).length === 0 ? (
          <>
            <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
              <span style={{ fontSize: 13, color: "#4a5568" }}>Players:</span>
              {[1, 2, 3, 4, 5, 6].map(n => (
                <button key={n} onClick={() => { setPlayerCount(n); setPlayerNames(Array.from({ length: n }, (_, i) => playerNames[i] || `Player ${i + 1}`)); }} style={{ width: 42, height: 42, borderRadius: 10, border: "none", cursor: "pointer", background: playerCount === n ? "#00e5a0" : "#1a2030", color: playerCount === n ? "#080a0e" : "#e8e4de", fontWeight: 800, fontSize: 16 }}>{n}</button>
              ))}
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {Array.from({ length: playerCount }, (_, i) => (
                <input key={i} value={playerNames[i] || ""} onChange={e => setPlayerNames(prev => { const next = [...prev]; next[i] = e.target.value; return next; })} placeholder={`Player ${i + 1} name`} style={iStyle} />
              ))}
            </div>
            <button onClick={() => onSplit(playerCount, playerNames)} style={{ background: "#00e5a0", color: "#080a0e", border: "none", borderRadius: 10, padding: "14px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>
              Split ÷ {playerCount}
            </button>
          </>
        ) : (
          <>
            {(session.participants || []).map((p: any) => (
              <button key={p.id} onClick={() => onTogglePaid(p.id)} style={{ background: p.status === "paid" ? "#00e5a010" : "#1a2030", border: `1.5px solid ${p.status === "paid" ? "#00e5a033" : "#1e2a40"}`, borderRadius: 12, padding: "14px 16px", display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", width: "100%" }}>
                <div style={{ textAlign: "left" }}>
                  <div style={{ fontWeight: 700, color: "#e8e4de" }}>{p.name}</div>
                  <div style={{ fontSize: 11, color: "#4a5568" }}>tap to {p.status === "paid" ? "unmark" : "mark paid"}</div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 800 }}>₹{p.share.toFixed(1)}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, background: p.status === "paid" ? "#00e5a022" : "#ef444422", color: p.status === "paid" ? "#00e5a0" : "#ef4444", padding: "3px 10px", borderRadius: 8 }}>
                    {p.status === "paid" ? "✓ Paid" : "Unpaid"}
                  </span>
                </div>
              </button>
            ))}
            <div style={{ background: "#1a2030", borderRadius: 10, padding: "14px 16px", display: "flex", justifyContent: "space-between" }}>
              <div><div style={{ fontSize: 10, color: "#4a5568", fontWeight: 700 }}>COLLECTED</div><div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 800, color: "#00e5a0", marginTop: 4 }}>{fmt(paid)}</div></div>
              {total - paid > 0 && <div style={{ textAlign: "right" }}><div style={{ fontSize: 10, color: "#4a5568", fontWeight: 700 }}>PENDING</div><div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 800, color: "#f5a623", marginTop: 4 }}>{fmt(total - paid)}</div></div>}
            </div>
          </>
        )}
      </div>
      <div style={{ padding: "10px 24px 20px" }}>
        <button onClick={onClose} style={{ width: "100%", background: "#00e5a018", border: "1.5px solid #00e5a033", color: "#00e5a0", borderRadius: 10, padding: "14px", fontSize: 15, fontWeight: 800, cursor: "pointer" }}>✓ Save & Close</button>
      </div>
    </SheetOverlay>
  );
}

/* ── TODAY TAB ── */
function TodayTab({ sessionHistory, bookings, onMarkSessionPaid }: any) {
  const today = todayStr();
  const ts = sessionHistory.filter((s: any) => s.date === today);
  const bks = bookings[today] || [];
  const sessRev = ts.reduce((a: number, s: any) => a + calcCourtSession(s).sessionAmt, 0);
  const itemRev = ts.reduce((a: number, s: any) => a + calcCourtSession(s).itemAmt, 0);
  const bkRev = bks.filter((b: any) => b.status === "paid").reduce((a: number, b: any) => a + (b.amount || 0), 0);
  const total = sessRev + itemRev + bkRev;

  const itemBD: any = {};
  ts.forEach((s: any) => Object.entries(s.saleItems || {}).forEach(([k, v]: any) => {
    itemBD[k] = itemBD[k] || { name: v.name, qty: 0, amt: 0 };
    itemBD[k].qty += v.qty; itemBD[k].amt += v.qty * v.price;
  }));

  return (
    <div className="fade-in">
      <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>Today</h2>
      <div style={{ fontSize: 13, color: "#4a5568", marginBottom: 24 }}>{fmtDateFull(today)}</div>
      <div style={{ background: "linear-gradient(135deg, #00e5a010, #0c0f17)", border: "1.5px solid #00e5a022", borderRadius: 16, padding: "28px 24px", marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 10, color: "#00e5a0", fontWeight: 800, textTransform: "uppercase", letterSpacing: 2 }}>Total Earned Today</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 52, fontWeight: 700, color: "#00e5a0", letterSpacing: -2, marginTop: 8 }}>{fmt(total)}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 24 }}>
        {[{ label: "Court Sessions", val: fmt(sessRev) }, { label: "Item Sales", val: fmt(itemRev) }, { label: "Bookings", val: fmt(bkRev) }, { label: "Total Sessions", val: String(ts.length + bks.length) }].map((t, i) => (
          <div key={i} style={{ background: "#0c0f17", border: "1px solid #1a2030", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 9, color: "#4a5568", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{t.label}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700 }}>{t.val}</div>
          </div>
        ))}
      </div>
      {ts.length > 0 && (
        <>
          <div style={{ fontSize: 11, color: "#4a5568", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Court Sessions</div>
          {ts.map((s: any, i: number) => {
            const { duration, total } = calcCourtSession(s);
            const paidAmt = s.paymentStatus === "paid"
              ? total
              : (s.participants || []).reduce((a: number, p: any) => a + (p.status === "paid" ? p.share : 0), 0);
            const unpaidNames = (s.participants || []).filter((p: any) => p.status !== "paid").map((p: any) => p.name).filter(Boolean);
            return (
              <div key={i} style={{ background: "#0c0f17", border: "1px solid #1a2030", borderRadius: 12, padding: "14px 18px", marginBottom: 8 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontWeight: 700 }}>{s.courtEmoji} {s.courtName}</div>
                  <div style={{ fontSize: 11, color: "#4a5568", fontFamily: "'JetBrains Mono', monospace", marginTop: 2 }}>
                    {new Date(s.startTime).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" })} · {fmtDuration(duration)}
                    {s.customerName && ` · 👤 ${s.customerName}`}
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 18, fontWeight: 700 }}>{fmt(total)}</span>
                  <span style={{ fontSize: 11, fontWeight: 700, padding: "4px 10px", borderRadius: 8, background: paidAmt >= total ? "#00e5a022" : "#ef444422", color: paidAmt >= total ? "#00e5a0" : "#ef4444" }}>
                    {paidAmt >= total ? "✓ Settled" : `${fmt(total - paidAmt)} due`}
                  </span>
                </div>
              </div>
                {paidAmt < total && unpaidNames.length > 0 && (
                  <div style={{ marginTop: 8, fontSize: 11, color: "#f5a623" }}>
                    Unpaid: {unpaidNames.join(", ")}
                  </div>
                )}
                {paidAmt < total && (
                  <div style={{ marginTop: 10 }}>
                    <button onClick={() => onMarkSessionPaid(s.id)} style={{ background: "#00e5a018", border: "1px solid #00e5a033", color: "#00e5a0", borderRadius: 8, padding: "6px 12px", fontSize: 11, fontWeight: 700, cursor: "pointer" }}>
                      ✅ Mark Due Paid
                    </button>
                  </div>
                )}
              </div>
            );
          })}
        </>
      )}
      {Object.keys(itemBD).length > 0 && (
        <>
          <div style={{ fontSize: 11, color: "#4a5568", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10, marginTop: 16 }}>Items Sold</div>
          <div style={{ background: "#0c0f17", border: "1px solid #1a2030", borderRadius: 12, padding: "4px 18px" }}>
            {Object.values(itemBD).map((it: any, i: number, arr: any) => (
              <div key={i} style={{ display: "flex", justifyContent: "space-between", padding: "12px 0", borderBottom: i < arr.length - 1 ? "1px solid #1a2030" : "none" }}>
                <span style={{ color: "#4a5568", fontSize: 13 }}>{(it as any).name} × {(it as any).qty}</span>
                <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700 }}>{fmt((it as any).amt)}</span>
              </div>
            ))}
          </div>
        </>
      )}
      {ts.length === 0 && bks.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px", color: "#2a3548" }}>
          <div style={{ fontSize: 42, marginBottom: 12 }}>📋</div>
          <div style={{ fontSize: 13 }}>No activity today</div>
        </div>
      )}
    </div>
  );
}

/* ── MONTHLY TAB ── */
function MonthlyTab({ sessionHistory, bookings }: any) {
  const now = new Date();
  const month = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
  const mS = sessionHistory.filter((s: any) => s.date?.startsWith(month));
  const mB = Object.entries(bookings).filter(([d]) => d.startsWith(month)).flatMap(([, b]) => b);
  const sessRev = mS.reduce((a: number, s: any) => a + calcCourtSession(s).sessionAmt, 0);
  const itemRev = mS.reduce((a: number, s: any) => a + calcCourtSession(s).itemAmt, 0);
  const bkRev = mB.filter((b: any) => b.status === "paid").reduce((a: number, b: any) => a + (b.amount || 0), 0);
  const pending = mB.filter((b: any) => b.status === "unpaid").reduce((a: number, b: any) => a + (b.amount || 0), 0);
  const total = sessRev + itemRev + bkRev;
  const dailyMap: any = {};
  mS.forEach((s: any) => { dailyMap[s.date] = (dailyMap[s.date] || 0) + calcCourtSession(s).total; });
  mB.filter((b: any) => b.status === "paid").forEach((b: any) => { dailyMap[b.date] = (dailyMap[b.date] || 0) + (b.amount || 0); });

  return (
    <div className="fade-in">
      <h2 style={{ fontSize: 26, fontWeight: 800, marginBottom: 4 }}>{now.toLocaleDateString("en-IN", { month: "long", year: "numeric" })}</h2>
      <div style={{ fontSize: 13, color: "#4a5568", marginBottom: 24 }}>Monthly earnings overview</div>
      <div style={{ background: "linear-gradient(135deg, #00e5a012, #0c0f17)", border: "1.5px solid #00e5a022", borderRadius: 16, padding: "28px 24px", marginBottom: 20, textAlign: "center" }}>
        <div style={{ fontSize: 10, color: "#00e5a0", fontWeight: 800, textTransform: "uppercase", letterSpacing: 2 }}>Total Earned</div>
        <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 52, fontWeight: 700, color: "#00e5a0", letterSpacing: -2, marginTop: 8 }}>{fmt(total)}</div>
        <div style={{ fontSize: 12, color: "#4a5568", marginTop: 8 }}>{mS.length} sessions · {mB.length} bookings{(pending as any) > 0 ? ` · ${fmt(pending as any)} outstanding` : ""}</div>
      </div>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 12, marginBottom: 24 }}>
        {[{ label: "Court Revenue", val: fmt(sessRev as any) }, { label: "Item Sales", val: fmt(itemRev as any) }, { label: "Booking Rev", val: fmt(bkRev as any) }].map((t: any, i: number) => (
          <div key={i} style={{ background: "#0c0f17", border: "1px solid #1a2030", borderRadius: 12, padding: "14px 16px" }}>
            <div style={{ fontSize: 9, color: "#4a5568", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 6 }}>{t.label}</div>
            <div style={{ fontFamily: "'JetBrains Mono', monospace", fontSize: 20, fontWeight: 700 }}>{t.val}</div>
          </div>
        ))}
      </div>
      {Object.keys(dailyMap).length > 0 && (
        <>
          <div style={{ fontSize: 11, color: "#4a5568", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Daily Breakdown</div>
          <div style={{ background: "#0c0f17", border: "1px solid #1a2030", borderRadius: 12, padding: "4px 18px" }}>
            {Object.entries(dailyMap).sort((a: any, b: any) => b[0].localeCompare(a[0])).map(([date, amt]: any, i: number, arr: any) => {
              const max = Math.max(...Object.values(dailyMap).map((v: any) => v));
              return (
                <div key={date} style={{ padding: "12px 0", borderBottom: i < arr.length - 1 ? "1px solid #1a2030" : "none" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontSize: 13, fontWeight: 600, display: "flex", gap: 8, alignItems: "center" }}>
                      {new Date(date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "short", day: "numeric", month: "short" })}
                      {date === todayStr() && <span style={{ fontSize: 9, background: "#e8e4de", color: "#080a0e", padding: "1px 6px", borderRadius: 8, fontWeight: 800 }}>TODAY</span>}
                    </div>
                    <span style={{ fontFamily: "'JetBrains Mono', monospace", fontWeight: 700, color: "#00e5a0" }}>{fmt(amt as number)}</span>
                  </div>
                  <div style={{ height: 3, background: "#1a2030", borderRadius: 2 }}>
                    <div style={{ height: "100%", width: `${((amt as any) / max) * 100}%`, background: "linear-gradient(to right, #00e5a0, #00c97a)", borderRadius: 2 }} />
                  </div>
                </div>
              );
            })}
          </div>
        </>
      )}
      {mS.length === 0 && mB.length === 0 && (
        <div style={{ textAlign: "center", padding: "60px", color: "#2a3548" }}>
          <div style={{ fontSize: 42, marginBottom: 12 }}>📈</div>
          <div style={{ fontSize: 13 }}>No data this month</div>
        </div>
      )}
    </div>
  );
}

/* ── SETTINGS SHEET ── */
function SettingsSheet({ settings, onSave, inventory, onSaveInventory, courts, onSaveCourts, onClose }: any) {
  const [s, setS] = useState({ ...settings });
  const [inv, setInv] = useState([...inventory]);
  const [res, setRes] = useState([...courts]);
  const [tab, setTab] = useState("general");
  const [newItem, setNewItem] = useState({ emoji: "🥤", name: "", price: "" });
  const [newRes, setNewRes] = useState({ type: "turf", name: "", pricePerMinute: "3" });

  const saveAll = () => { onSave(s); onSaveInventory(inv); onSaveCourts(res); onClose(); };
  const addItem = () => { if (!newItem.name.trim()) return; setInv([...inv, { id: genId(), emoji: newItem.emoji, name: newItem.name.trim(), price: parseInt(newItem.price) || 0 }]); setNewItem({ emoji: "🥤", name: "", price: "" }); };
  const addRes = () => {
    if (!newRes.name.trim()) return;
    setRes([...res, {
      id: genId(),
      type: newRes.type,
      emoji: newRes.type === "turf" ? "🏟️" : "🎱",
      name: newRes.name.trim(),
      pricePerMinute: Number(newRes.pricePerMinute || 0),
    }]);
    setNewRes({ ...newRes, name: "", pricePerMinute: "3" });
  };

  return (
    <SheetOverlay onClose={onClose}>
      <div style={{ padding: "0 24px 0", borderBottom: "1px solid #1a2030", paddingBottom: 0 }}>
        <div style={{ fontSize: 18, fontWeight: 800, marginBottom: 12 }}>Settings</div>
        <div style={{ display: "flex", gap: 0 }}>
          {[{ k: "general", l: "General" }, { k: "courts", l: "Courts" }, { k: "inventory", l: "Inventory" }].map(t => (
            <button key={t.k} onClick={() => setTab(t.k)} style={{ flex: 1, padding: "10px 0", fontSize: 12, fontWeight: 700, cursor: "pointer", background: "none", border: "none", color: tab === t.k ? "#e8e4de" : "#4a5568", borderBottom: tab === t.k ? "2px solid #00e5a0" : "2px solid transparent" }}>{t.l}</button>
          ))}
        </div>
      </div>
      <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14, maxHeight: "60dvh", overflowY: "auto" }}>
        {tab === "general" && (
          <>
            <FieldBlock label="Facility Name"><input value={s.facilityName} onChange={e => setS({ ...s, facilityName: e.target.value })} style={iStyle} /></FieldBlock>
            <FieldBlock label="Default Booking Price (₹)"><input type="number" value={s.defaultBookingPrice} onChange={e => setS({ ...s, defaultBookingPrice: Number(e.target.value) })} style={iStyle} /></FieldBlock>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <FieldBlock label="Open Time (24h)"><input value={s.openTime} onChange={e => setS({ ...s, openTime: e.target.value })} placeholder="06:00" style={iStyle} /></FieldBlock>
              <FieldBlock label="Close Time (24h)"><input value={s.closeTime} onChange={e => setS({ ...s, closeTime: e.target.value })} placeholder="22:00" style={iStyle} /></FieldBlock>
            </div>
            <FieldBlock label="Default Booking Duration (minutes)">
              <input type="number" value={s.defaultBookingDuration} onChange={e => setS({ ...s, defaultBookingDuration: Number(e.target.value) })} style={{ ...iStyle, maxWidth: 150 }} />
            </FieldBlock>
          </>
        )}
        {tab === "courts" && (
          <>
            {res.map((r, i) => (
              <div key={r.id} style={{ background: "#1a2030", borderRadius: 10, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{r.emoji}</span>
                  <div>
                    <div style={{ fontWeight: 700 }}>{r.name}</div>
                    <div style={{ fontSize: 11, color: "#4a5568" }}>{r.type === "turf" ? "Turf Court" : "Pool Table"}</div>
                  </div>
                </div>
                <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                  <input
                    type="number"
                    value={r.pricePerMinute ?? 0}
                    onChange={e => setRes(res.map((x, j) => j === i ? { ...x, pricePerMinute: Number(e.target.value) } : x))}
                    style={{ ...iStyle, width: 110, padding: "8px 10px", fontSize: 12 }}
                    title="Price per minute"
                  />
                  <button onClick={() => setRes(res.filter((_, j) => j !== i))} style={{ background: "#ef444418", border: "1px solid #ef444433", color: "#ef4444", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Remove</button>
                </div>
              </div>
            ))}
            <div style={{ background: "#0c0f17", border: "1px solid #1a2030", borderRadius: 10, padding: "14px" }}>
              <div style={{ fontSize: 10, color: "#4a5568", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Add Court</div>
              <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
                {[{ k: "turf", e: "🏟️", l: "Turf" }, { k: "pool", e: "🎱", l: "Pool" }].map(opt => (
                  <button key={opt.k} onClick={() => setNewRes({ ...newRes, type: opt.k })} style={{ flex: 1, padding: "10px", borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: "pointer", border: "1.5px solid", background: newRes.type === opt.k ? "#00e5a018" : "#1a2030", color: newRes.type === opt.k ? "#00e5a0" : "#4a5568", borderColor: newRes.type === opt.k ? "#00e5a044" : "#1a2030" }}>{opt.e} {opt.l}</button>
                ))}
              </div>
              <input value={newRes.name} onChange={e => setNewRes({ ...newRes, name: e.target.value })} placeholder="Court name" style={{ ...iStyle, marginBottom: 8 }} onKeyDown={e => e.key === "Enter" && addRes()} />
              <input type="number" value={newRes.pricePerMinute} onChange={e => setNewRes({ ...newRes, pricePerMinute: e.target.value })} placeholder="Price / minute (₹)" style={{ ...iStyle, marginBottom: 8 }} onKeyDown={e => e.key === "Enter" && addRes()} />
              <button onClick={addRes} disabled={!newRes.name.trim()} style={{ width: "100%", background: "#00e5a0", color: "#080a0e", border: "none", borderRadius: 8, padding: "11px", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: !newRes.name.trim() ? 0.5 : 1 }}>+ Add Court</button>
            </div>
          </>
        )}
        {tab === "inventory" && (
          <>
            {inv.map((item, i) => (
              <div key={item.id} style={{ background: "#1a2030", borderRadius: 10, padding: "12px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
                  <span style={{ fontSize: 20 }}>{item.emoji}</span>
                  <div><div style={{ fontWeight: 700 }}>{item.name}</div><div style={{ fontSize: 12, color: "#4a5568", fontFamily: "'JetBrains Mono', monospace" }}>{fmt(item.price)}</div></div>
                </div>
                <button onClick={() => setInv(inv.filter((_, j) => j !== i))} style={{ background: "#ef444418", border: "1px solid #ef444433", color: "#ef4444", borderRadius: 8, padding: "6px 12px", fontSize: 12, fontWeight: 700, cursor: "pointer" }}>Remove</button>
              </div>
            ))}
            <div style={{ background: "#0c0f17", border: "1px solid #1a2030", borderRadius: 10, padding: "14px" }}>
              <div style={{ fontSize: 10, color: "#4a5568", fontWeight: 700, textTransform: "uppercase", letterSpacing: 1, marginBottom: 10 }}>Add Item</div>
              <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
                {["💧", "🥤", "🐂", "🚬", "🍟", "🍫", "⚡", "🧃"].map(e => (
                  <button key={e} onClick={() => setNewItem({ ...newItem, emoji: e })} style={{ width: 36, height: 36, borderRadius: 8, border: `1.5px solid ${newItem.emoji === e ? "#00e5a0" : "#1a2030"}`, background: newItem.emoji === e ? "#00e5a018" : "#1a2030", cursor: "pointer", fontSize: 16 }}>{e}</button>
                ))}
              </div>
              <input value={newItem.name} onChange={e => setNewItem({ ...newItem, name: e.target.value })} placeholder="Item name" style={{ ...iStyle, marginBottom: 8 }} />
              <input type="number" value={newItem.price} onChange={e => setNewItem({ ...newItem, price: e.target.value })} placeholder="Price (₹)" style={{ ...iStyle, marginBottom: 8 }} onKeyDown={e => e.key === "Enter" && addItem()} />
              <button onClick={addItem} disabled={!newItem.name.trim()} style={{ width: "100%", background: "#00e5a0", color: "#080a0e", border: "none", borderRadius: 8, padding: "11px", fontSize: 13, fontWeight: 800, cursor: "pointer", opacity: !newItem.name.trim() ? 0.5 : 1 }}>+ Add Item</button>
            </div>
          </>
        )}
      </div>
      <div style={{ padding: "10px 24px 20px", display: "flex", gap: 10 }}>
        <button onClick={saveAll} style={{ flex: 1, background: "#00e5a0", color: "#080a0e", border: "none", borderRadius: 10, padding: "14px", fontSize: 14, fontWeight: 800, cursor: "pointer" }}>Save All</button>
        <button onClick={onClose} style={{ background: "#1a2030", border: "1px solid #1e2a40", color: "#4a5568", borderRadius: 10, padding: "14px 20px", fontSize: 14, fontWeight: 700, cursor: "pointer" }}>Cancel</button>
      </div>
    </SheetOverlay>
  );
}

/* ── SHARED PRIMITIVES ── */
function SheetOverlay({ children, onClose }: any) {
  return (
    <div onClick={onClose} style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 100, display: "flex", alignItems: "flex-end", backdropFilter: "blur(6px)" }}>
      <div onClick={e => e.stopPropagation()} className="sheet-up" style={{ background: "#0c0f17", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 720, margin: "0 auto", border: "1px solid #1a2030", borderBottom: "none", maxHeight: "88dvh", overflowY: "auto" }}>
        <div style={{ width: 36, height: 4, background: "#1a2030", borderRadius: 4, margin: "14px auto 16px" }} />
        {children}
      </div>
    </div>
  );
}

function FieldBlock({ label, children }: any) {
  return (
    <div>
      <div style={{ fontSize: 10, fontWeight: 700, color: "#4a5568", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 7 }}>{label}</div>
      {children}
    </div>
  );
}

const iStyle = {
  width: "100%", background: "#1a2030", border: "1.5px solid #1e2a40",
  borderRadius: 8, padding: "12px 14px", fontSize: 14, color: "#e8e4de", outline: "none",
};