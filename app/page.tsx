"use client";

import { useState, useEffect, useCallback, ReactNode, CSSProperties } from "react";

// ─── TYPES ────────────────────────────────────────────────────────────────────
interface Slot {
  start: string;
  end: string;
}

interface Booking {
  id: string;
  name: string;
  phone: string;
  startTime: string;
  endTime: string;
  status: "paid" | "unpaid";
  date: string;
  amount: number;
}

interface Settings {
  slotDuration: number;
  openTime: string;
  closeTime: string;
  facilityName: string;
  pricePerSlot: number;
}

interface BookingsMap {
  [date: string]: Booking[];
}

interface StoredState {
  settings?: Settings;
  bookings?: BookingsMap;
}

interface ToastState {
  msg: string;
  color: string;
}

type SheetType = "add" | "detail" | "settings" | null;
type TabType = "slots" | "unpaid" | "summary";

// ─── UTILS ────────────────────────────────────────────────────────────────────
const todayStr = (): string => new Date().toISOString().split("T")[0];

const minsToTime = (m: number): string =>
  `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;

const fmt12 = (t: string): string => {
  const [h, m] = t.split(":").map(Number);
  return `${h % 12 || 12}:${String(m).padStart(2, "0")} ${h >= 12 ? "PM" : "AM"}`;
};

const fmtDateHeader = (d: string): string =>
  new Date(d + "T00:00:00").toLocaleDateString("en-IN", {
    weekday: "long", day: "numeric", month: "long",
  });

const fmtDateShort = (d: string): string => {
  const today = todayStr();
  const tmrwDate = new Date();
  tmrwDate.setDate(tmrwDate.getDate() + 1);
  const tmrw = tmrwDate.toISOString().split("T")[0];
  if (d === today) return "Today";
  if (d === tmrw) return "Tmrw";
  return new Date(d + "T00:00:00").toLocaleDateString("en-IN", { day: "numeric", month: "short" });
};

const genId = (): string => Date.now().toString(36) + Math.random().toString(36).slice(2);

const genSlots = (openTime: string, closeTime: string, duration: number): Slot[] => {
  const [oh, om] = openTime.split(":").map(Number);
  const [ch, cm] = closeTime.split(":").map(Number);
  const slots: Slot[] = [];
  let cur = oh * 60 + om;
  const end = ch * 60 + cm;
  while (cur + duration <= end) {
    slots.push({ start: minsToTime(cur), end: minsToTime(cur + duration) });
    cur += duration;
  }
  return slots;
};

const getDateRange = (): string[] =>
  Array.from({ length: 8 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() + i - 1);
    return d.toISOString().split("T")[0];
  });

const STORAGE_KEY = "sportslot_v2";

const defaultSettings: Settings = {
  slotDuration: 60,
  openTime: "06:00",
  closeTime: "22:00",
  facilityName: "My Turf",
  pricePerSlot: 500,
};

// ─── STORAGE ──────────────────────────────────────────────────────────────────
const loadState = (): StoredState | null => {
  try {
    const s = localStorage.getItem(STORAGE_KEY);
    return s ? (JSON.parse(s) as StoredState) : null;
  } catch {
    return null;
  }
};

const saveState = (data: StoredState): void => {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch {}
};

// ─── STYLES ───────────────────────────────────────────────────────────────────
const injectStyles = (): void => {
  if (document.getElementById("ss-styles")) return;
  const el = document.createElement("style");
  el.id = "ss-styles";
  el.textContent = `
    @import url('https://fonts.googleapis.com/css2?family=Syne:wght@400;600;700;800&family=DM+Mono:wght@400;500&display=swap');
    *{box-sizing:border-box;margin:0;padding:0;-webkit-tap-highlight-color:transparent}
    body{background:#0c0c0f;font-family:'Syne',sans-serif;color:#f0ede8;overscroll-behavior:none}
    input,select,button{font-family:'Syne',sans-serif}
    input[type=number]::-webkit-inner-spin-button{-webkit-appearance:none}
    ::-webkit-scrollbar{display:none}
    @keyframes slideUp{from{transform:translateY(100%);opacity:0}to{transform:translateY(0);opacity:1}}
    @keyframes fadeIn{from{opacity:0;transform:translateY(8px)}to{opacity:1;transform:translateY(0)}}
    @keyframes toastIn{from{opacity:0;transform:translateX(-50%) translateY(-12px)}to{opacity:1;transform:translateX(-50%) translateY(0)}}
    .slot-enter{animation:fadeIn 0.2s ease both}
    .sheet-anim{animation:slideUp 0.28s cubic-bezier(.32,.72,0,1) both}
  `;
  document.head.appendChild(el);
};

// ─── MAIN APP ─────────────────────────────────────────────────────────────────
export default function App() {
  useEffect(() => { injectStyles(); }, []);

  const stored = loadState();
  const [settings, setSettings] = useState<Settings>(stored?.settings ?? defaultSettings);
  const [bookings, setBookings] = useState<BookingsMap>(stored?.bookings ?? {});
  const [selectedDate, setSelectedDate] = useState<string>(todayStr());
  const [tab, setTab] = useState<TabType>("slots");
  const [toast, setToast] = useState<ToastState | null>(null);
  const [sheet, setSheet] = useState<SheetType>(null);
  const [activeBooking, setActiveBooking] = useState<Booking | null>(null);
  const [preSlot, setPreSlot] = useState<Slot | null>(null);

  useEffect(() => {
    saveState({ settings, bookings });
  }, [settings, bookings]);

  const showToast = useCallback((msg: string, color = "#16a34a") => {
    setToast({ msg, color });
    setTimeout(() => setToast(null), 2400);
  }, []);

  const dayBookings: Booking[] = bookings[selectedDate] ?? [];
  const slots: Slot[] = genSlots(settings.openTime, settings.closeTime, settings.slotDuration);

  const earned = dayBookings
    .filter((b) => b.status === "paid")
    .reduce((s, b) => s + (b.amount ?? 0), 0);
  const pending = dayBookings
    .filter((b) => b.status === "unpaid")
    .reduce((s, b) => s + (b.amount ?? 0), 0);
  const totalUnpaidCount = Object.values(bookings)
    .flat()
    .filter((b) => b.status === "unpaid").length;

  return (
    <div style={{ maxWidth: 430, margin: "0 auto", minHeight: "100dvh", background: "#0c0c0f", position: "relative", overflow: "hidden" }}>

      {/* HEADER */}
      <div style={{ background: "#111116", borderBottom: "1px solid #1e1e28", padding: "14px 18px 12px", position: "sticky", top: 0, zIndex: 50, display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div>
          <div style={{ fontSize: 19, fontWeight: 800, letterSpacing: "-0.5px", color: "#f0ede8" }}>
            {settings.facilityName}
            <span style={{ marginLeft: 8, fontSize: 10, fontWeight: 700, background: "#1dde7022", color: "#1dde70", padding: "2px 8px", borderRadius: 20, letterSpacing: 1, textTransform: "uppercase", verticalAlign: "middle" }}>LIVE</span>
          </div>
          <div style={{ fontSize: 11, color: "#5a5a72", fontFamily: "'DM Mono', monospace", marginTop: 2 }}>{fmtDateHeader(selectedDate)}</div>
        </div>
        <button onClick={() => setSheet("settings")} style={{ width: 38, height: 38, borderRadius: 10, background: "#1a1a24", border: "1px solid #1e1e28", color: "#f0ede8", fontSize: 17, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center" }}>⚙</button>
      </div>

      {/* DATE NAV */}
      <div style={{ background: "#111116", borderBottom: "1px solid #1e1e28", padding: "10px 18px", display: "flex", gap: 6, overflowX: "auto" }}>
        {getDateRange().map((d) => (
          <button key={d} onClick={() => setSelectedDate(d)} style={{
            flexShrink: 0, padding: "6px 14px", borderRadius: 20, fontSize: 12, fontWeight: 700,
            cursor: "pointer", border: "1px solid",
            background: d === selectedDate ? "#f0ede8" : "transparent",
            color: d === selectedDate ? "#0c0c0f" : "#5a5a72",
            borderColor: d === selectedDate ? "#f0ede8" : "#1e1e28",
            transition: "all 0.15s",
          }}>{fmtDateShort(d)}</button>
        ))}
      </div>

      {/* SUMMARY STRIP */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 1, background: "#1e1e28", borderBottom: "1px solid #1e1e28" }}>
        <SummaryTile label="Bookings" value={String(dayBookings.length)} color="#f0ede8" />
        <SummaryTile label="Collected" value={`₹${earned}`} color="#1dde70" />
        <SummaryTile label="Pending" value={`₹${pending}`} color={pending > 0 ? "#f5a623" : "#5a5a72"} />
      </div>

      {/* TABS */}
      <div style={{ background: "#111116", borderBottom: "1px solid #1e1e28", display: "flex", padding: "0 18px", gap: 22 }}>
        {([ 
          { key: "slots" as TabType, label: "Slots" },
          { key: "unpaid" as TabType, label: `Unpaid${totalUnpaidCount > 0 ? ` (${totalUnpaidCount})` : ""}` },
          { key: "summary" as TabType, label: "Earnings" },
        ]).map((t) => (
          <button key={t.key} onClick={() => setTab(t.key)} style={{
            padding: "11px 0", fontSize: 13, fontWeight: 700, cursor: "pointer",
            background: "none", border: "none", color: tab === t.key ? "#f0ede8" : "#5a5a72",
            borderBottom: tab === t.key ? "2px solid #f0ede8" : "2px solid transparent",
            transition: "all 0.15s",
          }}>{t.label}</button>
        ))}
      </div>

      {/* TAB CONTENT */}
      <div style={{ paddingBottom: 90 }}>
        {tab === "slots" && (
          <SlotsView
            slots={slots}
            bookings={dayBookings}
            onSlotClick={(slot: Slot, booking: Booking | null) => {
              if (booking) { setActiveBooking(booking); setSheet("detail"); }
              else { setPreSlot(slot); setSheet("add"); }
            }}
          />
        )}
        {tab === "unpaid" && (
          <UnpaidView
            allBookings={bookings}
            onMarkPaid={(date: string, id: string) => {
              setBookings((prev) => {
                const next = { ...prev };
                next[date] = (next[date] ?? []).map((b) =>
                  b.id === id ? { ...b, status: "paid" as const } : b
                );
                return next;
              });
              showToast("✅ Marked as paid!");
            }}
            onOpen={(b: Booking) => { setActiveBooking(b); setSheet("detail"); }}
          />
        )}
        {tab === "summary" && <SummaryView allBookings={bookings} />}
      </div>

      {/* FAB */}
      {tab === "slots" && (
        <button onClick={() => { setPreSlot(null); setSheet("add"); }} style={{
          position: "fixed", bottom: 24, left: "50%", transform: "translateX(-50%)",
          width: "calc(min(430px, 100vw) - 36px)", background: "#f0ede8", color: "#0c0c0f",
          border: "none", borderRadius: 14, padding: "16px 0", fontSize: 15, fontWeight: 800,
          cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center",
          gap: 8, zIndex: 40, boxShadow: "0 8px 40px #00000066", letterSpacing: "-0.3px",
        }}>
          <span style={{ fontSize: 20, lineHeight: 1 }}>+</span> Add Booking
        </button>
      )}

      {/* SHEETS */}
      {sheet === "add" && (
        <AddBookingSheet
          slots={slots}
          bookedSlots={dayBookings.map((b) => b.startTime)}
          preSlot={preSlot}
          defaultPrice={settings.pricePerSlot}
          onClose={() => setSheet(null)}
          onSave={(booking: Omit<Booking, "id" | "date">) => {
            setBookings((prev) => ({
              ...prev,
              [selectedDate]: [...(prev[selectedDate] ?? []), { ...booking, id: genId(), date: selectedDate }],
            }));
            setSheet(null);
            showToast("Booking confirmed ✅");
          }}
        />
      )}
      {sheet === "detail" && activeBooking && (
        <DetailSheet
          booking={activeBooking}
          facilityName={settings.facilityName}
          onClose={() => setSheet(null)}
          onMarkPaid={() => {
            setBookings((prev) => {
              const next = { ...prev };
              next[activeBooking.date] = (next[activeBooking.date] ?? []).map((b) =>
                b.id === activeBooking.id ? { ...b, status: "paid" as const } : b
              );
              return next;
            });
            setSheet(null);
            showToast("✅ Marked as paid!");
          }}
          onDelete={() => {
            setBookings((prev) => {
              const next = { ...prev };
              next[activeBooking.date] = (next[activeBooking.date] ?? []).filter(
                (b) => b.id !== activeBooking.id
              );
              return next;
            });
            setSheet(null);
            showToast("Booking deleted");
          }}
        />
      )}
      {sheet === "settings" && (
        <SettingsSheet
          settings={settings}
          onUpdate={(s: Settings) => setSettings(s)}
          onClose={() => setSheet(null)}
        />
      )}

      {/* TOAST */}
      {toast && (
        <div style={{
          position: "fixed", top: 80, left: "50%",
          background: toast.color, color: "#fff",
          padding: "10px 22px", borderRadius: 30, fontSize: 13, fontWeight: 700,
          zIndex: 300, animation: "toastIn 0.25s ease both", whiteSpace: "nowrap",
          boxShadow: "0 4px 20px #00000055",
        }}>{toast.msg}</div>
      )}
    </div>
  );
}

// ─── SUMMARY TILE ─────────────────────────────────────────────────────────────
interface SummaryTileProps {
  label: string;
  value: string;
  color: string;
}

function SummaryTile({ label, value, color }: SummaryTileProps) {
  return (
    <div style={{ background: "#111116", padding: "12px 14px" }}>
      <div style={{ fontSize: 10, color: "#5a5a72", textTransform: "uppercase", letterSpacing: "0.8px", fontWeight: 700, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 20, fontWeight: 800, color, fontFamily: "'DM Mono', monospace", letterSpacing: "-0.5px" }}>{value}</div>
    </div>
  );
}

// ─── SLOTS VIEW ───────────────────────────────────────────────────────────────
interface SlotsViewProps {
  slots: Slot[];
  bookings: Booking[];
  onSlotClick: (slot: Slot, booking: Booking | null) => void;
}

function SlotsView({ slots, bookings, onSlotClick }: SlotsViewProps) {
  if (slots.length === 0) return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "#5a5a72" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🕐</div>
      <div style={{ fontSize: 14 }}>No slots configured. Open settings to set times.</div>
    </div>
  );

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 8 }}>
      {slots.map((slot, i) => {
        const booking = bookings.find((b) => b.startTime === slot.start) ?? null;
        const status: "available" | "paid" | "unpaid" = booking ? booking.status : "available";

        const colorMap = {
          available: { bg: "#111116", border: "#1e1e28", dot: "#1dde70", badge: "#1dde7022", badgeTxt: "#1dde70" },
          paid:      { bg: "#0f1f15", border: "#1dde7033", dot: "#1dde70", badge: "#1dde7022", badgeTxt: "#1dde70" },
          unpaid:    { bg: "#1c1710", border: "#f5a62333", dot: "#f5a623", badge: "#f5a62322", badgeTxt: "#f5a623" },
        };
        const colors = colorMap[status];

        return (
          <div
            key={slot.start}
            className="slot-enter"
            onClick={() => onSlotClick(slot, booking)}
            style={{
              animationDelay: `${i * 18}ms`,
              background: colors.bg,
              border: `1.5px solid ${colors.border}`,
              borderRadius: 12,
              padding: "13px 14px",
              display: "flex",
              alignItems: "center",
              gap: 12,
              cursor: "pointer",
            }}
          >
            <div style={{ width: 7, height: 7, borderRadius: "50%", background: colors.dot, flexShrink: 0, boxShadow: `0 0 8px ${colors.dot}88` }} />
            <div style={{ fontFamily: "'DM Mono', monospace", fontSize: 13, fontWeight: 500, color: "#f0ede8", flexShrink: 0, minWidth: 64 }}>{fmt12(slot.start)}</div>
            <div style={{ flex: 1 }}>
              {booking ? (
                <>
                  <div style={{ fontSize: 14, fontWeight: 700, color: "#f0ede8" }}>{booking.name}</div>
                  <div style={{ fontSize: 11, color: "#5a5a72", fontFamily: "'DM Mono', monospace", marginTop: 1 }}>{booking.phone}</div>
                </>
              ) : (
                <div style={{ fontSize: 13, color: "#3a3a52" }}>Available</div>
              )}
            </div>
            <div style={{ background: colors.badge, color: colors.badgeTxt, fontSize: 10, fontWeight: 700, padding: "3px 10px", borderRadius: 20, textTransform: "uppercase", letterSpacing: "0.6px", flexShrink: 0 }}>
              {status === "available" ? "Free" : status === "paid" ? `₹${booking?.amount ?? 0}` : "Unpaid"}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── UNPAID VIEW ──────────────────────────────────────────────────────────────
interface UnpaidViewProps {
  allBookings: BookingsMap;
  onMarkPaid: (date: string, id: string) => void;
  onOpen: (booking: Booking) => void;
}

function UnpaidView({ allBookings, onMarkPaid, onOpen }: UnpaidViewProps) {
  const all: Booking[] = Object.entries(allBookings)
    .flatMap(([date, bks]) => bks.filter((b) => b.status === "unpaid").map((b) => ({ ...b, date })))
    .sort((a, b) => a.date.localeCompare(b.date) || a.startTime.localeCompare(b.startTime));

  if (all.length === 0) return (
    <div style={{ textAlign: "center", padding: "60px 20px", color: "#5a5a72" }}>
      <div style={{ fontSize: 40, marginBottom: 12 }}>🎉</div>
      <div style={{ fontSize: 14 }}>All payments collected!<br />Nothing pending.</div>
    </div>
  );

  const total = all.reduce((s, b) => s + (b.amount ?? 0), 0);

  return (
    <div style={{ padding: "12px 16px" }}>
      <div style={{ background: "#1c1710", border: "1.5px solid #f5a62333", borderRadius: 12, padding: "14px 16px", marginBottom: 12, display: "flex", justifyContent: "space-between", alignItems: "center" }}>
        <div>
          <div style={{ fontSize: 11, color: "#f5a623", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Total Outstanding</div>
          <div style={{ fontSize: 26, fontWeight: 800, color: "#f5a623", fontFamily: "'DM Mono', monospace", marginTop: 2 }}>₹{total}</div>
        </div>
        <div style={{ fontSize: 13, color: "#5a5a72" }}>{all.length} booking{all.length !== 1 ? "s" : ""}</div>
      </div>
      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
        {all.map((b) => (
          <div key={b.id} onClick={() => onOpen(b)} style={{ background: "#111116", border: "1.5px solid #1e1e28", borderRadius: 12, padding: "13px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", cursor: "pointer" }}>
            <div>
              <div style={{ fontSize: 14, fontWeight: 700 }}>{b.name}</div>
              <div style={{ fontSize: 11, color: "#5a5a72", fontFamily: "'DM Mono', monospace", marginTop: 2 }}>
                {fmtDateShort(b.date)} · {fmt12(b.startTime)}{b.amount ? ` · ₹${b.amount}` : ""}
              </div>
            </div>
            <button
              onClick={(e) => { e.stopPropagation(); onMarkPaid(b.date, b.id); }}
              style={{ padding: "7px 14px", background: "#1dde7022", border: "1.5px solid #1dde70", color: "#1dde70", borderRadius: 20, fontSize: 11, fontWeight: 700, cursor: "pointer", flexShrink: 0 }}
            >✓ Paid</button>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── SUMMARY / EARNINGS VIEW ──────────────────────────────────────────────────
interface SummaryViewProps {
  allBookings: BookingsMap;
}

interface DayData {
  date: string;
  bks: number;
  collected: number;
  pending: number;
  total: number;
}

function SummaryView({ allBookings }: SummaryViewProps) {
  const today = todayStr();
  const week: string[] = Array.from({ length: 7 }, (_, i) => {
    const d = new Date();
    d.setDate(d.getDate() - (6 - i));
    return d.toISOString().split("T")[0];
  });

  const weekData: DayData[] = week.map((date) => {
    const bks = allBookings[date] ?? [];
    const collected = bks.filter((b) => b.status === "paid").reduce((s, b) => s + (b.amount ?? 0), 0);
    const pending = bks.filter((b) => b.status === "unpaid").reduce((s, b) => s + (b.amount ?? 0), 0);
    return { date, bks: bks.length, collected, pending, total: collected + pending };
  });

  const totalCollected = weekData.reduce((s, d) => s + d.collected, 0);
  const totalPending = weekData.reduce((s, d) => s + d.pending, 0);
  const totalBookings = weekData.reduce((s, d) => s + d.bks, 0);
  const maxTotal = Math.max(...weekData.map((d) => d.total), 1);

  const allCollected = Object.values(allBookings).flat().filter((b) => b.status === "paid").reduce((s, b) => s + (b.amount ?? 0), 0);
  const allPending = Object.values(allBookings).flat().filter((b) => b.status === "unpaid").reduce((s, b) => s + (b.amount ?? 0), 0);
  const allTotal = allCollected + allPending;

  return (
    <div style={{ padding: "12px 16px", display: "flex", flexDirection: "column", gap: 12 }}>

      {/* All-time hero */}
      <div style={{ background: "linear-gradient(135deg, #1dde7015, #111116)", border: "1.5px solid #1dde7033", borderRadius: 14, padding: "20px 18px" }}>
        <div style={{ fontSize: 11, color: "#1dde70", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700, marginBottom: 8 }}>All Time Revenue</div>
        <div style={{ fontSize: 34, fontWeight: 800, color: "#1dde70", fontFamily: "'DM Mono', monospace", letterSpacing: "-1px" }}>₹{allCollected.toLocaleString("en-IN")}</div>
        <div style={{ fontSize: 12, color: "#5a5a72", marginTop: 6 }}>+ ₹{allPending.toLocaleString("en-IN")} outstanding</div>
        {allTotal > 0 && (
          <div style={{ marginTop: 12 }}>
            <div style={{ height: 6, background: "#1e1e28", borderRadius: 6, overflow: "hidden" }}>
              <div style={{ height: "100%", width: `${(allCollected / allTotal) * 100}%`, background: "#1dde70", borderRadius: 6, transition: "width 0.6s ease" }} />
            </div>
            <div style={{ fontSize: 11, color: "#5a5a72", marginTop: 4 }}>{Math.round((allCollected / allTotal) * 100)}% collected</div>
          </div>
        )}
      </div>

      {/* 7-day block */}
      <div style={{ background: "#111116", border: "1px solid #1e1e28", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e1e28", display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "#f0ede8" }}>Last 7 Days</div>
          <div style={{ fontSize: 11, color: "#5a5a72", fontFamily: "'DM Mono', monospace" }}>{totalBookings} bookings</div>
        </div>
        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", borderBottom: "1px solid #1e1e28" }}>
          <div style={{ padding: "14px 16px", borderRight: "1px solid #1e1e28" }}>
            <div style={{ fontSize: 10, color: "#5a5a72", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Collected</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "#1dde70", fontFamily: "'DM Mono', monospace", marginTop: 4 }}>₹{totalCollected.toLocaleString("en-IN")}</div>
          </div>
          <div style={{ padding: "14px 16px" }}>
            <div style={{ fontSize: 10, color: "#5a5a72", textTransform: "uppercase", letterSpacing: 1, fontWeight: 700 }}>Pending</div>
            <div style={{ fontSize: 22, fontWeight: 800, color: totalPending > 0 ? "#f5a623" : "#5a5a72", fontFamily: "'DM Mono', monospace", marginTop: 4 }}>₹{totalPending.toLocaleString("en-IN")}</div>
          </div>
        </div>

        {/* Bar chart */}
        <div style={{ padding: "16px", display: "flex", gap: 6, alignItems: "flex-end", height: 100 }}>
          {weekData.map((d) => {
            const h = d.total > 0 ? Math.max((d.total / maxTotal) * 68, 6) : 4;
            const collectedH = d.total > 0 ? (d.collected / d.total) * h : 0;
            const isToday = d.date === today;
            return (
              <div key={d.date} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4 }}>
                <div style={{ width: "100%", height: 72, display: "flex", flexDirection: "column", justifyContent: "flex-end" }}>
                  <div style={{ width: "100%", borderRadius: "4px 4px 0 0", overflow: "hidden", height: h }}>
                    <div style={{ height: collectedH, background: isToday ? "#1dde70" : "#1dde7066" }} />
                    <div style={{ height: h - collectedH, background: d.pending > 0 ? (isToday ? "#f5a623" : "#f5a62366") : "transparent" }} />
                  </div>
                </div>
                <div style={{ fontSize: 9, color: isToday ? "#f0ede8" : "#3a3a52", fontWeight: 700, textTransform: "uppercase" }}>
                  {fmtDateShort(d.date) === "Today" ? "T" : new Date(d.date + "T00:00:00").toLocaleDateString("en-IN", { weekday: "narrow" })}
                </div>
              </div>
            );
          })}
        </div>

        <div style={{ padding: "0 16px 12px", display: "flex", gap: 16 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: "#1dde70" }} />
            <span style={{ fontSize: 10, color: "#5a5a72" }}>Collected</span>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <div style={{ width: 8, height: 8, borderRadius: 2, background: "#f5a623" }} />
            <span style={{ fontSize: 10, color: "#5a5a72" }}>Pending</span>
          </div>
        </div>
      </div>

      {/* Daily rows */}
      <div style={{ background: "#111116", border: "1px solid #1e1e28", borderRadius: 14, overflow: "hidden" }}>
        <div style={{ padding: "12px 16px", borderBottom: "1px solid #1e1e28", fontSize: 12, fontWeight: 700, color: "#f0ede8" }}>Daily Breakdown</div>
        {[...weekData].reverse().map((d, i) => (
          <div key={d.date} style={{ padding: "13px 16px", borderBottom: i < 6 ? "1px solid #1e1e28" : "none", display: "flex", justifyContent: "space-between", alignItems: "center", background: d.date === today ? "#1dde7008" : "transparent" }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#f0ede8", display: "flex", alignItems: "center", gap: 6 }}>
                {fmtDateShort(d.date)}
                {d.date === today && <span style={{ fontSize: 9, background: "#f0ede8", color: "#0c0c0f", padding: "1px 7px", borderRadius: 10, fontWeight: 800 }}>TODAY</span>}
              </div>
              <div style={{ fontSize: 11, color: "#5a5a72", marginTop: 2 }}>{d.bks} booking{d.bks !== 1 ? "s" : ""}</div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div style={{ fontSize: 14, fontWeight: 800, color: d.collected > 0 ? "#1dde70" : "#3a3a52", fontFamily: "'DM Mono', monospace" }}>₹{d.collected.toLocaleString("en-IN")}</div>
              {d.pending > 0 && <div style={{ fontSize: 11, color: "#f5a623", fontFamily: "'DM Mono', monospace" }}>₹{d.pending} due</div>}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

// ─── ADD BOOKING SHEET ────────────────────────────────────────────────────────
interface AddBookingSheetProps {
  slots: Slot[];
  bookedSlots: string[];
  preSlot: Slot | null;
  defaultPrice: number;
  onClose: () => void;
  onSave: (booking: Omit<Booking, "id" | "date">) => void;
}

function AddBookingSheet({ slots, bookedSlots, preSlot, defaultPrice, onClose, onSave }: AddBookingSheetProps) {
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [amount, setAmount] = useState(String(defaultPrice ?? ""));
  const [selectedSlot, setSelectedSlot] = useState<Slot | null>(preSlot);
  const [status, setStatus] = useState<"paid" | "unpaid">("paid");

  const handleSave = () => {
    if (!name.trim()) { alert("Enter customer name"); return; }
    if (!selectedSlot) { alert("Select a time slot"); return; }
    onSave({
      name: name.trim(),
      phone: phone.trim(),
      startTime: selectedSlot.start,
      endTime: selectedSlot.end,
      status,
      amount: parseInt(amount) || 0,
    });
  };

  return (
    <Overlay onClose={onClose}>
      <div style={{ paddingBottom: 8 }}>
        <SheetHandle />
        <div style={{ padding: "0 20px 16px", borderBottom: "1px solid #1e1e28", fontSize: 17, fontWeight: 800 }}>New Booking</div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14, maxHeight: "60dvh", overflowY: "auto" }}>
          <Field label="Customer Name">
            <input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Rahul Sharma" style={inputStyle} />
          </Field>
          <Field label="Phone Number">
            <input type="tel" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="9876543210" style={inputStyle} />
          </Field>
          <Field label="Amount (₹)">
            <input type="number" value={amount} onChange={(e) => setAmount(e.target.value)} placeholder="500" style={inputStyle} />
          </Field>
          <Field label="Select Time Slot">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {slots.map((slot) => {
                const booked = bookedSlots.includes(slot.start);
                const sel = selectedSlot?.start === slot.start;
                return (
                  <button
                    key={slot.start}
                    disabled={booked}
                    onClick={() => setSelectedSlot(slot)}
                    style={{
                      padding: "11px 10px", borderRadius: 8, fontSize: 12,
                      fontFamily: "'DM Mono', monospace", fontWeight: 500,
                      cursor: booked ? "not-allowed" : "pointer", border: "1.5px solid",
                      background: sel ? "#f0ede8" : booked ? "#111116" : "#1a1a24",
                      color: sel ? "#0c0c0f" : booked ? "#2a2a38" : "#f0ede8",
                      borderColor: sel ? "#f0ede8" : "#1e1e28",
                      textDecoration: booked ? "line-through" : "none",
                    }}
                  >{fmt12(slot.start)}</button>
                );
              })}
            </div>
          </Field>
          <Field label="Payment">
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
              {([
                { k: "paid" as const, label: "✅ Paid", color: "#1dde70" },
                { k: "unpaid" as const, label: "⏳ Unpaid", color: "#f5a623" },
              ]).map((opt) => (
                <button
                  key={opt.k}
                  onClick={() => setStatus(opt.k)}
                  style={{
                    padding: "13px", borderRadius: 8, fontSize: 14, fontWeight: 700,
                    cursor: "pointer", border: "1.5px solid",
                    background: status === opt.k ? `${opt.color}22` : "#1a1a24",
                    color: status === opt.k ? opt.color : "#5a5a72",
                    borderColor: status === opt.k ? opt.color : "#1e1e28",
                  }}
                >{opt.label}</button>
              ))}
            </div>
          </Field>
        </div>
        <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={handleSave} style={primaryBtn}>Confirm Booking</button>
          <button onClick={onClose} style={ghostBtn}>Cancel</button>
        </div>
      </div>
    </Overlay>
  );
}

// ─── DETAIL SHEET ─────────────────────────────────────────────────────────────
interface DetailSheetProps {
  booking: Booking;
  facilityName: string;
  onClose: () => void;
  onMarkPaid: () => void;
  onDelete: () => void;
}

function DetailSheet({ booking, facilityName, onClose, onMarkPaid, onDelete }: DetailSheetProps) {
  const sendWA = () => {
    const msg = `Hi ${booking.name}! 👋\n\nYour booking at *${facilityName}* is confirmed.\n\n📅 ${fmtDateHeader(booking.date)}\n⏰ ${fmt12(booking.startTime)} – ${fmt12(booking.endTime)}\n💰 ₹${booking.amount ?? 0}\n\nSee you there! 🏅`;
    window.open(`https://wa.me/${booking.phone.replace(/\D/g, "")}?text=${encodeURIComponent(msg)}`, "_blank");
  };

  const rows: { label: string; value: string; color?: string }[] = [
    { label: "Customer", value: booking.name },
    { label: "Phone", value: booking.phone || "—" },
    { label: "Date", value: fmtDateShort(booking.date) },
    { label: "Time", value: `${fmt12(booking.startTime)} – ${fmt12(booking.endTime)}` },
    { label: "Amount", value: booking.amount ? `₹${booking.amount}` : "—" },
    { label: "Status", value: booking.status === "paid" ? "✅ Paid" : "⏳ Unpaid", color: booking.status === "paid" ? "#1dde70" : "#f5a623" },
  ];

  return (
    <Overlay onClose={onClose}>
      <div>
        <SheetHandle />
        <div style={{ padding: "0 20px 16px", borderBottom: "1px solid #1e1e28", fontSize: 17, fontWeight: 800 }}>Booking Details</div>
        <div style={{ padding: "4px 20px" }}>
          {rows.map((row) => (
            <div key={row.label} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "13px 0", borderBottom: "1px solid #1e1e28" }}>
              <span style={{ fontSize: 12, color: "#5a5a72", textTransform: "uppercase", letterSpacing: "0.5px", fontWeight: 700 }}>{row.label}</span>
              <span style={{ fontSize: 14, fontWeight: 700, color: row.color ?? "#f0ede8" }}>{row.value}</span>
            </div>
          ))}
        </div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          {booking.status === "unpaid" && (
            <button onClick={onMarkPaid} style={primaryBtn}>✅ Mark as Paid</button>
          )}
          {booking.phone && (
            <button onClick={sendWA} style={{ ...primaryBtn, background: "#25D366" }}>💬 Send WhatsApp</button>
          )}
          <button onClick={onDelete} style={{ ...ghostBtn, color: "#ef4444", borderColor: "#ef444433" }}>🗑 Delete Booking</button>
          <button onClick={onClose} style={ghostBtn}>Close</button>
        </div>
      </div>
    </Overlay>
  );
}

// ─── SETTINGS SHEET ───────────────────────────────────────────────────────────
interface SettingsSheetProps {
  settings: Settings;
  onUpdate: (s: Settings) => void;
  onClose: () => void;
}

function SettingsSheet({ settings, onUpdate, onClose }: SettingsSheetProps) {
  const [s, setS] = useState<Settings>({ ...settings });
  const handleSave = () => { onUpdate(s); onClose(); };

  return (
    <Overlay onClose={onClose}>
      <div>
        <SheetHandle />
        <div style={{ padding: "0 20px 16px", borderBottom: "1px solid #1e1e28", fontSize: 17, fontWeight: 800 }}>Settings</div>
        <div style={{ padding: "16px 20px", display: "flex", flexDirection: "column", gap: 14, maxHeight: "60dvh", overflowY: "auto" }}>
          <Field label="Facility Name">
            <input value={s.facilityName} onChange={(e) => setS({ ...s, facilityName: e.target.value })} style={inputStyle} />
          </Field>
          <Field label="Slot Duration">
            <select value={s.slotDuration} onChange={(e) => setS({ ...s, slotDuration: Number(e.target.value) })} style={{ ...inputStyle, appearance: "none" as CSSProperties["appearance"] }}>
              {([["30", "30 Minutes"], ["60", "1 Hour"], ["90", "1.5 Hours"], ["120", "2 Hours"]] as [string, string][]).map(([v, l]) => (
                <option key={v} value={v}>{l}</option>
              ))}
            </select>
          </Field>
          <Field label="Opening Time (24hr)">
            <input value={s.openTime} onChange={(e) => setS({ ...s, openTime: e.target.value })} placeholder="06:00" style={inputStyle} />
          </Field>
          <Field label="Closing Time (24hr)">
            <input value={s.closeTime} onChange={(e) => setS({ ...s, closeTime: e.target.value })} placeholder="22:00" style={inputStyle} />
          </Field>
          <Field label="Default Slot Price (₹)">
            <input type="number" value={s.pricePerSlot} onChange={(e) => setS({ ...s, pricePerSlot: Number(e.target.value) })} style={inputStyle} />
          </Field>
        </div>
        <div style={{ padding: "14px 20px", display: "flex", flexDirection: "column", gap: 10 }}>
          <button onClick={handleSave} style={primaryBtn}>Save Settings</button>
          <button onClick={onClose} style={ghostBtn}>Cancel</button>
        </div>
      </div>
    </Overlay>
  );
}

// ─── SHARED COMPONENTS ────────────────────────────────────────────────────────
interface OverlayProps {
  children: ReactNode;
  onClose: () => void;
}

function Overlay({ children, onClose }: OverlayProps) {
  return (
    <div
      onClick={onClose}
      style={{ position: "fixed", inset: 0, background: "#000000cc", zIndex: 100, display: "flex", alignItems: "flex-end", backdropFilter: "blur(4px)" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="sheet-anim"
        style={{ background: "#111116", borderRadius: "20px 20px 0 0", width: "100%", maxWidth: 430, margin: "0 auto", border: "1px solid #1e1e28", borderBottom: "none", maxHeight: "92dvh", overflowY: "auto" }}
      >
        {children}
      </div>
    </div>
  );
}

function SheetHandle() {
  return <div style={{ width: 36, height: 4, background: "#1e1e28", borderRadius: 4, margin: "14px auto 16px" }} />;
}

interface FieldProps {
  label: string;
  children: ReactNode;
}

function Field({ label, children }: FieldProps) {
  return (
    <div>
      <div style={{ fontSize: 11, fontWeight: 700, color: "#5a5a72", textTransform: "uppercase", letterSpacing: "0.8px", marginBottom: 7 }}>{label}</div>
      {children}
    </div>
  );
}

const inputStyle: CSSProperties = {
  width: "100%", background: "#1a1a24", border: "1.5px solid #1e1e28",
  borderRadius: 8, padding: "13px 14px", fontSize: 15, color: "#f0ede8",
  outline: "none", WebkitAppearance: "none",
};

const primaryBtn: CSSProperties = {
  width: "100%", background: "#f0ede8", color: "#0c0c0f",
  border: "none", borderRadius: 10, padding: "15px", fontSize: 15,
  fontWeight: 800, cursor: "pointer", fontFamily: "'Syne', sans-serif",
};

const ghostBtn: CSSProperties = {
  width: "100%", background: "transparent", color: "#5a5a72",
  border: "1.5px solid #1e1e28", borderRadius: 10, padding: "13px",
  fontSize: 14, fontWeight: 700, cursor: "pointer", fontFamily: "'Syne', sans-serif",
};