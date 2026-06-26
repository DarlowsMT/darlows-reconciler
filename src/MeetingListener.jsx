import { useState, useEffect, useRef, useCallback } from "react";

const API_URL = "https://api.anthropic.com/v1/messages";
const MODEL = "claude-sonnet-4-20250514";
const KEYS = {
  apiKey: "mlistener.apiKey",
  meetings: "mlistener.meetings",
  skipWarn: "mlistener.skipSendWarning",
};

const COLORS = {
  bg: "#0a0a0b",
  surface: "#111113",
  card: "#18181c",
  border: "#2a2a30",
  accent: "#f97316",
  accentDim: "#7c3a12",
  accentGlow: "rgba(249,115,22,0.15)",
  text: "#e8e8ec",
  muted: "#666672",
  dim: "#3a3a45",
  green: "#22c55e",
  blue: "#3b82f6",
  red: "#ef4444",
  yellow: "#eab308",
};

const SPEAKER_COLORS = [
  "#f97316", "#3b82f6", "#22c55e", "#eab308", "#c084fc", "#f472b6",
  "#06b6d4", "#a3e635",
];

const BTN = {
  padding: "8px 16px",
  borderRadius: 6,
  border: "none",
  cursor: "pointer",
  fontSize: 13,
  fontWeight: 600,
  lineHeight: 1,
};

// ─── Utilities ──────────────────────────────────────────────

function extractJSON(text) {
  if (typeof text !== "string") text = JSON.stringify(text);
  const stripped = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch { /* fallthrough */ }
  const m = stripped.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (m) {
    try {
      return JSON.parse(m[1]);
    } catch { /* fallthrough */ }
  }
  throw new Error(
    `Could not parse JSON.\n\nRaw response:\n${text.slice(0, 800)}`
  );
}

function fmtDuration(ms) {
  const s = Math.floor(ms / 1000);
  const h = Math.floor(s / 3600);
  const mn = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const pad = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${pad(mn)}:${pad(sec)}` : `${pad(mn)}:${pad(sec)}`;
}

function fmtTs(ms) {
  const s = Math.floor(ms / 1000);
  const mn = Math.floor(s / 60);
  const sec = s % 60;
  return `${String(mn).padStart(2, "0")}:${String(sec).padStart(2, "0")}`;
}

function wc(text) {
  return text.trim() ? text.trim().split(/\s+/).length : 0;
}

function segsToText(segs) {
  return segs.map((s) => s.text).join(" ");
}

function segsToLabeled(segs, names) {
  return segs
    .map((s) => `[${names[s.speaker] || `Speaker ${s.speaker}`}]: ${s.text}`)
    .join("\n");
}

function splitSentences(text, maxLen) {
  const sentences = text.match(/[^.!?]+[.!?]+\s*/g) || [text];
  const chunks = [];
  let cur = "";
  for (const s of sentences) {
    if (cur.length + s.length > maxLen && cur) {
      chunks.push(cur.trim());
      cur = "";
    }
    cur += s;
  }
  if (cur.trim()) chunks.push(cur.trim());
  return chunks;
}

function downloadFile(name, content, mime = "text/plain") {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  URL.revokeObjectURL(url);
}

async function clipCopy(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

function migrateMeeting(m) {
  if (!m.segments) {
    m.segments = m.transcript
      ? [{ id: "0", text: m.transcript, ts: 0, speaker: 1, highlight: false }]
      : [];
    delete m.transcript;
  }
  if (!m.speakerNames) m.speakerNames = {};
  if (!m.liveNotes) m.liveNotes = [];
  if (!m.chatHistory) m.chatHistory = [];
  return m;
}

function speakerColor(n) {
  return SPEAKER_COLORS[(n - 1) % SPEAKER_COLORS.length];
}

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

// ─── Claude API ─────────────────────────────────────────────

async function callClaude(apiKey, system, userMessage, maxTokens = 1000) {
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: MODEL,
      max_tokens: maxTokens,
      system,
      messages: [{ role: "user", content: userMessage }],
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(`API ${res.status}: ${JSON.stringify(data)}`);
  const text = (data.content || [])
    .filter((b) => b.type === "text")
    .map((b) => b.text)
    .join("\n");
  if (!text) throw new Error(`No text in response: ${JSON.stringify(data)}`);
  return text;
}

// ── Summary

const SUM_PROMPT = `You are a meeting analyst. Given a meeting transcript with speaker labels, produce a single strict JSON object and NOTHING else.

Schema:
{
  "tldr": "2-3 sentence executive summary",
  "keyPoints": ["…"],
  "actionItems": [{"owner": "name or unassigned", "task": "…", "due": "date or null"}],
  "decisions": ["…"],
  "openQuestions": ["…"],
  "topics": ["short topic label"],
  "sentiment": {"tag": "positive|neutral|tense|mixed", "rationale": "one short sentence"}
}

If a field has no content, use an empty array or null. Do not invent information not in the transcript.`;

async function summarizeMeeting(transcript, apiKey, focus = "") {
  const extra = focus.trim()
    ? `\n\nAdditional focus: ${focus.trim()}`
    : "";
  if (transcript.length <= 12000) {
    return extractJSON(
      await callClaude(apiKey, SUM_PROMPT + extra, `Meeting transcript:\n\n${transcript}`, 1500)
    );
  }
  const chunks = splitSentences(transcript, 8000);
  const partials = [];
  for (let i = 0; i < chunks.length; i++) {
    partials.push(
      extractJSON(
        await callClaude(
          apiKey,
          `You are a meeting analyst. Summarize transcript chunk ${i + 1}/${chunks.length} into compact JSON: { keyPoints, actionItems, decisions, topics, sentiment }. Be concise.`,
          `Chunk ${i + 1}/${chunks.length}:\n\n${chunks[i]}`,
          800
        )
      )
    );
  }
  return extractJSON(
    await callClaude(
      apiKey,
      SUM_PROMPT + extra,
      `Merge these ${partials.length} chunk summaries into one meeting summary. Deduplicate and synthesize.\n\n${JSON.stringify(partials, null, 2)}`,
      1500
    )
  );
}

function toMarkdown(s) {
  if (!s) return "";
  let md = "# Meeting Summary\n\n";
  if (s.tldr) md += `## TL;DR\n${s.tldr}\n\n`;
  if (s.topics?.length)
    md += `## Topics\n${s.topics.map((t) => `- ${t}`).join("\n")}\n\n`;
  if (s.keyPoints?.length)
    md += `## Key Points\n${s.keyPoints.map((p) => `- ${p}`).join("\n")}\n\n`;
  if (s.actionItems?.length) {
    md += "## Action Items\n";
    for (const a of s.actionItems) {
      md += `- [ ] ${a.task}`;
      if (a.owner && a.owner !== "unassigned") md += ` (@${a.owner})`;
      if (a.due) md += ` — due ${a.due}`;
      md += "\n";
    }
    md += "\n";
  }
  if (s.decisions?.length)
    md += `## Decisions\n${s.decisions.map((d) => `- ${d}`).join("\n")}\n\n`;
  if (s.openQuestions?.length)
    md += `## Open Questions\n${s.openQuestions.map((q) => `- ${q}`).join("\n")}\n\n`;
  if (s.sentiment)
    md += `## Sentiment\n**${s.sentiment.tag}** — ${s.sentiment.rationale}\n`;
  return md;
}

// ── Live notes

async function extractLiveNotes(text, apiKey) {
  const raw = await callClaude(
    apiKey,
    `You are a real-time meeting note-taker. Extract the most important information from this transcript chunk. Respond with ONLY a JSON object:
{
  "keyPoints": ["concise point 1", "..."],
  "actionItems": ["action 1", "..."],
  "decisions": ["decision 1", "..."]
}
Be very concise. Only genuinely important items. Empty arrays if nothing notable.`,
    `Transcript chunk:\n\n${text}`,
    500
  );
  return extractJSON(raw);
}

// ── Chat

async function chatAboutMeeting(question, transcript, history, apiKey) {
  let msg = `Meeting transcript:\n\n${transcript}\n\n`;
  if (history.length > 0) {
    msg += "Previous Q&A:\n";
    for (const h of history.slice(-6)) {
      msg += `Q: ${h.q}\nA: ${h.a}\n\n`;
    }
  }
  msg += `New question: ${question}`;
  return callClaude(
    apiKey,
    "You are a helpful meeting assistant. Answer questions about the meeting accurately and concisely based only on the transcript. If the answer is not in the transcript, say so.",
    msg,
    800
  );
}

// ── Polish

async function polishTranscript(text, apiKey) {
  return callClaude(
    apiKey,
    `You are a transcript editor. Clean up this speech-to-text transcript:
- Fix grammar, punctuation, and capitalization
- Correct likely misheard words based on context
- Break into natural paragraphs
- Preserve the speaker's original meaning exactly
- Keep speaker labels like [Speaker 1]: intact
- Do NOT add, remove, or change the substance
Return ONLY the cleaned transcript text.`,
    text,
    3000
  );
}

// ─── Hooks ──────────────────────────────────────────────────

function useSpeechRecognition(onFinal, onInterim, onError) {
  const supported =
    typeof window !== "undefined" &&
    ("SpeechRecognition" in window || "webkitSpeechRecognition" in window);
  const [recording, setRecording] = useState(false);
  const [paused, setPaused] = useState(false);

  const cbFinal = useRef(onFinal);
  const cbInterim = useRef(onInterim);
  const cbError = useRef(onError);
  useEffect(() => { cbFinal.current = onFinal; }, [onFinal]);
  useEffect(() => { cbInterim.current = onInterim; }, [onInterim]);
  useEffect(() => { cbError.current = onError; }, [onError]);

  const recRef = useRef(null);
  const alive = useRef(false);
  const retries = useRef(0);
  const timer = useRef(null);
  const buildRef = useRef(null);

  const build = useCallback(() => {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    const rec = new SR();
    rec.continuous = true;
    rec.interimResults = true;
    rec.lang = "en-US";
    rec.onresult = (e) => {
      let interim = "";
      for (let i = e.resultIndex; i < e.results.length; i++) {
        if (e.results[i].isFinal) cbFinal.current(e.results[i][0].transcript);
        else interim += e.results[i][0].transcript;
      }
      cbInterim.current(interim);
      retries.current = 0;
    };
    rec.onerror = (e) => {
      if (e.error === "no-speech") return;
      if (e.error === "not-allowed" || e.error === "audio-capture") {
        alive.current = false;
        setRecording(false);
        setPaused(false);
        cbError.current(
          e.error === "not-allowed"
            ? "Microphone access denied. Allow mic access in browser settings and try again."
            : "No microphone found. Connect a mic and try again."
        );
        return;
      }
      cbError.current(`Speech recognition error: ${e.error}`);
    };
    rec.onend = () => {
      if (!alive.current) { setRecording(false); return; }
      retries.current++;
      if (retries.current > 50) {
        alive.current = false;
        setRecording(false);
        cbError.current("Speech recognition stopped after too many restarts.");
        return;
      }
      const delay = Math.min(retries.current * 200, 2000);
      timer.current = setTimeout(() => {
        try {
          const fresh = buildRef.current();
          recRef.current = fresh;
          fresh.start();
        } catch {
          alive.current = false;
          setRecording(false);
          cbError.current("Failed to restart recognition.");
        }
      }, delay);
    };
    return rec;
  }, []);
  useEffect(() => { buildRef.current = build; }, [build]);

  const start = useCallback(() => {
    if (!supported) return;
    alive.current = true;
    retries.current = 0;
    const rec = build();
    recRef.current = rec;
    try { rec.start(); setRecording(true); setPaused(false); }
    catch { cbError.current("Failed to start speech recognition."); }
  }, [supported, build]);

  const stop = useCallback(() => {
    alive.current = false;
    clearTimeout(timer.current);
    recRef.current?.stop();
    setRecording(false);
    setPaused(false);
  }, []);

  const pause = useCallback(() => {
    alive.current = false;
    clearTimeout(timer.current);
    recRef.current?.stop();
    setPaused(true);
  }, []);

  const resume = useCallback(() => {
    if (!supported) return;
    alive.current = true;
    retries.current = 0;
    const rec = build();
    recRef.current = rec;
    try { rec.start(); setPaused(false); }
    catch { cbError.current("Failed to resume recognition."); }
  }, [supported, build]);

  useEffect(() => () => {
    alive.current = false;
    clearTimeout(timer.current);
    recRef.current?.stop();
  }, []);

  return { supported, recording, paused, start, stop, pause, resume };
}

function useMeetings() {
  const init = (() => {
    try {
      return JSON.parse(localStorage.getItem(KEYS.meetings) || "[]").map(migrateMeeting);
    } catch { return []; }
  })();

  const [meetings, setMeetings] = useState(init);
  const [currentId, setCurrentId] = useState(init.length > 0 ? init[0].id : null);
  const ref = useRef(meetings);
  useEffect(() => { ref.current = meetings; }, [meetings]);

  const persist = useCallback((list) => {
    try { localStorage.setItem(KEYS.meetings, JSON.stringify(list)); return true; }
    catch { return false; }
  }, []);

  const current = meetings.find((m) => m.id === currentId) || null;

  const create = useCallback(() => {
    const m = migrateMeeting({
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 7),
      title: "Untitled Meeting",
      createdAt: Date.now(),
      updatedAt: Date.now(),
      segments: [],
      speakerNames: {},
      summary: null,
      liveNotes: [],
      chatHistory: [],
      durationMs: 0,
    });
    const next = [m, ...ref.current];
    setMeetings(next);
    setCurrentId(m.id);
    persist(next);
    return m;
  }, [persist]);

  const update = useCallback((id, changes) => {
    const next = ref.current.map((m) =>
      m.id === id ? { ...m, ...changes, updatedAt: Date.now() } : m
    );
    setMeetings(next);
    return persist(next);
  }, [persist]);

  const remove = useCallback((id) => {
    const next = ref.current.filter((m) => m.id !== id);
    setMeetings(next);
    setCurrentId((prev) => (prev === id ? null : prev));
    persist(next);
  }, [persist]);

  const load = useCallback((id) => setCurrentId(id), []);
  const clearAll = useCallback(() => {
    setMeetings([]);
    setCurrentId(null);
    localStorage.removeItem(KEYS.meetings);
  }, []);
  const exportAll = useCallback(() => {
    downloadFile("meetings-export.json", JSON.stringify(ref.current, null, 2), "application/json");
  }, []);

  return { meetings, current, currentId, create, update, remove, load, clearAll, exportAll };
}

// ─── Components ─────────────────────────────────────────────

function Spinner({ size = 16 }) {
  return (
    <span style={{ display: "inline-block", width: size, height: size, border: `2px solid ${COLORS.border}`, borderTopColor: COLORS.accent, borderRadius: "50%", animation: "mlspin 0.6s linear infinite", verticalAlign: "middle" }} />
  );
}

function Toast({ message, type }) {
  const bg = type === "error" ? COLORS.red : type === "success" ? COLORS.green : COLORS.blue;
  return <div style={{ background: bg, color: "#fff", padding: "8px 16px", borderRadius: 6, fontSize: 13, boxShadow: "0 4px 12px rgba(0,0,0,0.4)", maxWidth: 300 }}>{message}</div>;
}

function ConfirmDialog({ message, onConfirm, onCancel }) {
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onCancel}>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24, maxWidth: 400, width: "90%" }} onClick={(e) => e.stopPropagation()}>
        <p style={{ color: COLORS.text, fontSize: 14, marginBottom: 20, lineHeight: 1.5 }}>{message}</p>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ ...BTN, background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.text }}>Cancel</button>
          <button onClick={onConfirm} style={{ ...BTN, background: COLORS.red, color: "#fff" }}>Confirm</button>
        </div>
      </div>
    </div>
  );
}

function SendWarningDialog({ onConfirm, onCancel }) {
  const [skip, setSkip] = useState(false);
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.6)", display: "flex", alignItems: "center", justifyContent: "center", zIndex: 1000 }} onClick={onCancel}>
      <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 24, maxWidth: 420, width: "90%" }} onClick={(e) => e.stopPropagation()}>
        <h3 style={{ color: COLORS.text, fontSize: 16, marginBottom: 12 }}>Send data to Claude?</h3>
        <p style={{ color: COLORS.muted, fontSize: 13, lineHeight: 1.6, marginBottom: 16 }}>This will send your transcript to Anthropic&apos;s API. The data goes directly to Anthropic — nowhere else.</p>
        <label style={{ display: "flex", alignItems: "center", gap: 8, color: COLORS.muted, fontSize: 12, marginBottom: 20, cursor: "pointer" }}>
          <input type="checkbox" checked={skip} onChange={(e) => setSkip(e.target.checked)} />
          Don&apos;t ask again
        </label>
        <div style={{ display: "flex", gap: 10, justifyContent: "flex-end" }}>
          <button onClick={onCancel} style={{ ...BTN, background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.text }}>Cancel</button>
          <button onClick={() => onConfirm(skip)} style={{ ...BTN, background: COLORS.accent, color: "#fff" }}>Send to Claude</button>
        </div>
      </div>
    </div>
  );
}

function SentimentChip({ sentiment }) {
  if (!sentiment) return null;
  const map = { positive: COLORS.green, neutral: COLORS.blue, tense: COLORS.red, mixed: COLORS.yellow };
  const c = map[sentiment.tag] || COLORS.muted;
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, padding: "4px 10px", borderRadius: 20, background: c + "22", color: c, fontSize: 12, fontWeight: 600 }}>
      {sentiment.tag.toUpperCase()}
      {sentiment.rationale && <span style={{ fontWeight: 400, opacity: 0.8 }}> — {sentiment.rationale}</span>}
    </span>
  );
}

function SumSec({ title, children }) {
  return (
    <div style={{ marginBottom: 16 }}>
      <h4 style={{ color: COLORS.accent, fontSize: 11, textTransform: "uppercase", letterSpacing: 1.2, marginBottom: 6, fontWeight: 700 }}>{title}</h4>
      {children}
    </div>
  );
}

function SummaryView({ summary, onCopyMd, onDownloadMd }) {
  if (!summary) return null;
  const ls = { color: COLORS.text, fontSize: 13, lineHeight: 1.8, paddingLeft: 18, margin: 0 };
  return (
    <div style={{ background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 20 }}>
      {summary.tldr && <SumSec title="TL;DR"><p style={{ color: COLORS.text, fontSize: 14, lineHeight: 1.6 }}>{summary.tldr}</p></SumSec>}
      {summary.topics?.length > 0 && (
        <SumSec title="Topics">
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
            {summary.topics.map((t, i) => <span key={i} style={{ padding: "3px 10px", borderRadius: 20, background: COLORS.accent + "22", color: COLORS.accent, fontSize: 12, fontWeight: 500 }}>{t}</span>)}
          </div>
        </SumSec>
      )}
      {summary.keyPoints?.length > 0 && <SumSec title="Key Points"><ul style={ls}>{summary.keyPoints.map((p, i) => <li key={i}>{p}</li>)}</ul></SumSec>}
      {summary.actionItems?.length > 0 && (
        <SumSec title="Action Items">
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {summary.actionItems.map((a, i) => (
              <div key={i} style={{ display: "flex", gap: 8, alignItems: "baseline", fontSize: 13, color: COLORS.text }}>
                <span style={{ color: COLORS.accent, flexShrink: 0 }}>▸</span>
                <span>{a.task}</span>
                {a.owner && a.owner !== "unassigned" && <span style={{ color: COLORS.blue, fontSize: 11, flexShrink: 0 }}>@{a.owner}</span>}
                {a.due && <span style={{ color: COLORS.muted, fontSize: 11, flexShrink: 0 }}>due {a.due}</span>}
              </div>
            ))}
          </div>
        </SumSec>
      )}
      {summary.decisions?.length > 0 && <SumSec title="Decisions"><ul style={ls}>{summary.decisions.map((d, i) => <li key={i}>{d}</li>)}</ul></SumSec>}
      {summary.openQuestions?.length > 0 && <SumSec title="Open Questions"><ul style={{ ...ls, color: COLORS.yellow }}>{summary.openQuestions.map((q, i) => <li key={i}>{q}</li>)}</ul></SumSec>}
      {summary.sentiment && <SumSec title="Sentiment"><SentimentChip sentiment={summary.sentiment} /></SumSec>}
      <div style={{ display: "flex", gap: 8, marginTop: 12, paddingTop: 12, borderTop: `1px solid ${COLORS.border}` }}>
        <button onClick={onCopyMd} style={{ ...BTN, background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.text, fontSize: 12 }}>Copy as Markdown</button>
        <button onClick={onDownloadMd} style={{ ...BTN, background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.text, fontSize: 12 }}>Download .md</button>
      </div>
    </div>
  );
}

function SegmentRow({ segment, name, searchQ, onHighlight }) {
  const col = speakerColor(segment.speaker);
  let parts = [segment.text];
  if (searchQ) {
    try {
      parts = segment.text.split(new RegExp(`(${escapeRegex(searchQ)})`, "gi"));
    } catch { /* fallthrough */ }
  }
  return (
    <div style={{ display: "flex", gap: 10, padding: "6px 0", borderLeft: segment.highlight ? `3px solid ${COLORS.accent}` : "3px solid transparent", paddingLeft: 8 }}>
      <div style={{ flexShrink: 0, width: 44, fontSize: 11, color: COLORS.muted, fontVariantNumeric: "tabular-nums", paddingTop: 2 }}>{fmtTs(segment.ts)}</div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <span style={{ fontSize: 11, fontWeight: 600, color: col }}>{name || `Speaker ${segment.speaker}`}</span>
        <div style={{ fontSize: 14, color: COLORS.text, lineHeight: 1.6, marginTop: 1 }}>
          {parts.map((p, i) =>
            searchQ && p.toLowerCase() === searchQ.toLowerCase()
              ? <mark key={i} style={{ background: COLORS.accent + "44", color: COLORS.text, borderRadius: 2, padding: "0 2px" }}>{p}</mark>
              : <span key={i}>{p}</span>
          )}
        </div>
      </div>
      <button onClick={() => onHighlight(segment.id)} style={{ ...BTN, background: "transparent", border: "none", color: segment.highlight ? COLORS.accent : COLORS.dim, fontSize: 16, padding: "2px 4px", flexShrink: 0, cursor: "pointer", lineHeight: 1 }} title="Bookmark">
        {segment.highlight ? "★" : "☆"}
      </button>
    </div>
  );
}

function LiveNotesPanel({ notes }) {
  if (!notes || notes.length === 0) return <p style={{ color: COLORS.muted, fontSize: 13 }}>AI notes will appear here during recording.</p>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      {notes.map((n, i) => (
        <div key={i}>
          <div style={{ fontSize: 11, color: COLORS.muted, marginBottom: 4 }}>{fmtTs(n.ts)}</div>
          {n.keyPoints?.length > 0 && n.keyPoints.map((p, j) => <div key={`p${j}`} style={{ fontSize: 13, color: COLORS.text, paddingLeft: 8, borderLeft: `2px solid ${COLORS.accent}`, marginBottom: 4 }}>{p}</div>)}
          {n.actionItems?.length > 0 && n.actionItems.map((a, j) => <div key={`a${j}`} style={{ fontSize: 13, color: COLORS.green, paddingLeft: 8, borderLeft: `2px solid ${COLORS.green}`, marginBottom: 4 }}>Action: {a}</div>)}
          {n.decisions?.length > 0 && n.decisions.map((d, j) => <div key={`d${j}`} style={{ fontSize: 13, color: COLORS.blue, paddingLeft: 8, borderLeft: `2px solid ${COLORS.blue}`, marginBottom: 4 }}>Decision: {d}</div>)}
        </div>
      ))}
    </div>
  );
}

function ChatPanel({ messages, input, onInput, onSend, loading }) {
  return (
    <div>
      {messages.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 12, marginBottom: 12, maxHeight: 300, overflowY: "auto" }}>
          {messages.map((m, i) => (
            <div key={i}>
              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.accent, marginBottom: 2 }}>You</div>
              <div style={{ fontSize: 13, color: COLORS.text, marginBottom: 8 }}>{m.q}</div>
              <div style={{ fontSize: 12, fontWeight: 600, color: COLORS.green, marginBottom: 2 }}>AI</div>
              <div style={{ fontSize: 13, color: COLORS.text, lineHeight: 1.6, whiteSpace: "pre-wrap" }}>{m.a}</div>
            </div>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 8 }}>
        <input
          value={input}
          onChange={(e) => onInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && !e.shiftKey && onSend()}
          placeholder="Ask about this meeting…"
          style={{ flex: 1, background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "8px 12px", color: COLORS.text, fontSize: 13, outline: "none" }}
        />
        <button onClick={onSend} disabled={loading || !input.trim()} style={{ ...BTN, background: COLORS.accent, color: "#fff", opacity: loading || !input.trim() ? 0.5 : 1, cursor: loading || !input.trim() ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 6, minHeight: 38 }}>
          {loading ? <Spinner size={14} /> : "Ask"}
        </button>
      </div>
    </div>
  );
}

// ─── Collapsible section ────────────────────────────────────

function Section({ title, badge, defaultOpen, children }) {
  const [open, setOpen] = useState(defaultOpen ?? false);
  return (
    <div style={{ marginTop: 20 }}>
      <button onClick={() => setOpen(!open)} style={{ ...BTN, background: "transparent", border: "none", color: COLORS.text, padding: 0, display: "flex", alignItems: "center", gap: 8, fontSize: 14, fontWeight: 600 }}>
        <span style={{ color: COLORS.dim, fontSize: 12 }}>{open ? "▾" : "▸"}</span>
        {title}
        {badge != null && <span style={{ fontSize: 11, color: COLORS.muted, fontWeight: 400 }}>({badge})</span>}
      </button>
      {open && <div style={{ marginTop: 10 }}>{children}</div>}
    </div>
  );
}

// ─── Main Component ─────────────────────────────────────────

export default function MeetingListener() {
  const [apiKey, setApiKey] = useState(() => localStorage.getItem(KEYS.apiKey) || "");
  const [showKey, setShowKey] = useState(false);

  const { meetings, current, currentId, create, update, remove, load, clearAll, exportAll } = useMeetings();

  // Segment-based transcript
  const [segments, setSegments] = useState([]);
  const [interimText, setInterimText] = useState("");
  const [speakerNames, setSpeakerNames] = useState({});
  const currentSpeakerRef = useRef(1);
  const lastSpeechTimeRef = useRef(null);
  const segmentsRef = useRef([]);
  useEffect(() => { segmentsRef.current = segments; }, [segments]);

  // Summary
  const [sumData, setSumData] = useState(null);
  const [focusInstr, setFocusInstr] = useState("");
  const [summarizing, setSummarizing] = useState(false);
  const [sumError, setSumError] = useState("");

  // Live notes
  const [liveNotes, setLiveNotes] = useState([]);
  const [liveNotesOn, setLiveNotesOn] = useState(true);
  const lastNotesIdx = useRef(0);

  // AI Chat
  const [chatMsgs, setChatMsgs] = useState([]);
  const [chatInput, setChatInput] = useState("");
  const [chatLoading, setChatLoading] = useState(false);

  // Search
  const [searchQ, setSearchQ] = useState("");

  // Polish
  const [polishing, setPolishing] = useState(false);
  const [polishedText, setPolishedText] = useState(null);
  const [showPolished, setShowPolished] = useState(false);

  // Timer
  const accumulated = useRef(0);
  const sessionStart = useRef(null);
  const [elapsed, setElapsed] = useState(0);

  // Privacy
  const [dataSent, setDataSent] = useState(false);
  const [showSendDlg, setShowSendDlg] = useState(false);
  const skipWarn = useRef(localStorage.getItem(KEYS.skipWarn) === "true");
  const sentSession = useRef(false);
  const pendingCb = useRef(null);

  // UI
  const [isMobile, setIsMobile] = useState(() => typeof window !== "undefined" && window.innerWidth < 640);
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [toasts, setToasts] = useState([]);
  const [confirmState, setConfirmState] = useState(null);
  const [recError, setRecError] = useState("");
  const [showSettings, setShowSettings] = useState(false);
  const [editingSpeakers, setEditingSpeakers] = useState(false);

  const paneRef = useRef(null);
  const nearBottom = useRef(true);
  const autoTitled = useRef(new Set());

  // ─── Toast ─────────────────────────────────────────────

  const toast = useCallback((message, type = "info") => {
    const id = Date.now() + Math.random();
    setToasts((p) => [...p, { id, message, type }]);
    setTimeout(() => setToasts((p) => p.filter((t) => t.id !== id)), 3000);
  }, []);

  // ─── Privacy gate ──────────────────────────────────────

  function checkPrivacy(cb) {
    if (!apiKey.trim()) { toast("Enter your API key first", "error"); return; }
    if (!sentSession.current && !skipWarn.current) {
      pendingCb.current = cb;
      setShowSendDlg(true);
      return;
    }
    sentSession.current = true;
    setDataSent(true);
    cb();
  }

  function confirmSend(dontAskAgain) {
    setShowSendDlg(false);
    sentSession.current = true;
    setDataSent(true);
    if (dontAskAgain) {
      skipWarn.current = true;
      localStorage.setItem(KEYS.skipWarn, "true");
    }
    pendingCb.current?.();
    pendingCb.current = null;
  }

  // ─── Speech recognition ────────────────────────────────

  const handleFinal = useCallback((text) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    const now = accumulated.current + (sessionStart.current ? Date.now() - sessionStart.current : 0);
    let spk = currentSpeakerRef.current;
    if (lastSpeechTimeRef.current !== null && now - lastSpeechTimeRef.current > 3000) {
      spk = currentSpeakerRef.current + 1;
      currentSpeakerRef.current = spk;
    }
    lastSpeechTimeRef.current = now;
    const seg = {
      id: Date.now().toString(36) + Math.random().toString(36).slice(2, 5),
      text: trimmed,
      ts: now,
      speaker: spk,
      highlight: false,
    };
    setSegments((prev) => [...prev, seg]);
    setInterimText("");
  }, []);

  const handleInterim = useCallback((text) => setInterimText(text), []);
  const handleRecErr = useCallback((msg) => { setRecError(msg); toast(msg, "error"); }, [toast]);

  const speech = useSpeechRecognition(handleFinal, handleInterim, handleRecErr);
  const { supported, recording, paused } = speech;

  // ─── Load meeting ──────────────────────────────────────

  useEffect(() => {
    if (current) {
      setSegments(current.segments || []);
      setSumData(current.summary || null);
      setSpeakerNames(current.speakerNames || {});
      setLiveNotes(current.liveNotes || []);
      setChatMsgs(current.chatHistory || []);
      accumulated.current = current.durationMs || 0;
      setElapsed(current.durationMs || 0);
      lastNotesIdx.current = current.segments?.length || 0;
    } else {
      setSegments([]);
      setSumData(null);
      setSpeakerNames({});
      setLiveNotes([]);
      setChatMsgs([]);
      accumulated.current = 0;
      setElapsed(0);
    }
    setFocusInstr("");
    setSumError("");
    setInterimText("");
    setRecError("");
    setSearchQ("");
    setChatInput("");
    setPolishedText(null);
    setShowPolished(false);
    currentSpeakerRef.current = 1;
    lastSpeechTimeRef.current = null;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentId]);

  // ─── Timer ─────────────────────────────────────────────

  useEffect(() => {
    if (!recording || paused) return;
    const id = setInterval(() => {
      if (sessionStart.current) setElapsed(accumulated.current + (Date.now() - sessionStart.current));
    }, 200);
    return () => clearInterval(id);
  }, [recording, paused]);

  // ─── Auto-save ─────────────────────────────────────────

  useEffect(() => {
    if (!currentId || segments.length === 0) return;
    const t = setTimeout(() => {
      const dur = accumulated.current + (sessionStart.current ? Date.now() - sessionStart.current : 0);
      const ok = update(currentId, { segments, speakerNames, liveNotes, chatHistory: chatMsgs, durationMs: dur });
      if (!ok) toast("Storage full — export or delete older meetings", "error");
    }, 1000);
    return () => clearTimeout(t);
  }, [segments, speakerNames, liveNotes, chatMsgs, currentId, update, toast]);

  // ─── Auto-title ────────────────────────────────────────

  useEffect(() => {
    if (!currentId || segments.length === 0) return;
    if (autoTitled.current.has(currentId)) return;
    const m = meetings.find((x) => x.id === currentId);
    if (!m || m.title !== "Untitled Meeting") return;
    autoTitled.current.add(currentId);
    const text = segsToText(segments);
    const words = text.trim().split(/\s+/).slice(0, 6).join(" ");
    update(currentId, { title: words + (text.trim().split(/\s+/).length > 6 ? "…" : "") });
  }, [segments, currentId, meetings, update]);

  // ─── Auto-scroll ───────────────────────────────────────

  useEffect(() => {
    if (nearBottom.current && paneRef.current) paneRef.current.scrollTop = paneRef.current.scrollHeight;
  }, [segments, interimText]);

  // ─── Responsive ────────────────────────────────────────

  useEffect(() => {
    const h = () => setIsMobile(window.innerWidth < 640);
    window.addEventListener("resize", h);
    return () => window.removeEventListener("resize", h);
  }, []);

  // ─── Live notes extraction ─────────────────────────────

  useEffect(() => {
    if (!recording || !liveNotesOn || !apiKey) return;
    const id = setInterval(() => {
      const segs = segmentsRef.current;
      const newSegs = segs.slice(lastNotesIdx.current);
      if (newSegs.length < 3) return;
      const text = segsToText(newSegs);
      if (text.length < 100) return;
      lastNotesIdx.current = segs.length;
      const ts = accumulated.current + (sessionStart.current ? Date.now() - sessionStart.current : 0);
      extractLiveNotes(text, apiKey)
        .then((notes) => {
          const hasContent = notes.keyPoints?.length || notes.actionItems?.length || notes.decisions?.length;
          if (hasContent) setLiveNotes((prev) => [...prev, { ts, ...notes }]);
        })
        .catch(() => { /* silent */ });
    }, 30000);
    return () => clearInterval(id);
  }, [recording, liveNotesOn, apiKey]);

  // ─── Keyboard shortcuts ────────────────────────────────

  const stateRef = useRef({});
  useEffect(() => { stateRef.current = { recording, paused, currentId, segments, apiKey }; });
  const fnRef = useRef({});

  useEffect(() => {
    const handler = (e) => {
      const tag = document.activeElement?.tagName;
      const isInput = tag === "INPUT" || tag === "TEXTAREA";
      const s = stateRef.current;
      const fn = fnRef.current;
      if (e.key === " " && !isInput && s.currentId) {
        e.preventDefault();
        s.recording ? (s.paused ? fn.handleResume?.() : fn.handlePause?.()) : fn.handleStart?.();
      }
      if ((e.metaKey || e.ctrlKey) && e.key === "s") { e.preventDefault(); fn.handleSummarize?.(); }
      if (e.key === "Escape" && s.recording) fn.handleStop?.();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ─── Recording handlers ────────────────────────────────

  function handleStart() {
    if (!currentId) { toast("Create a meeting first", "error"); return; }
    setRecError("");
    sessionStart.current = Date.now();
    currentSpeakerRef.current = segments.length > 0 ? Math.max(...segments.map((s) => s.speaker)) : 1;
    lastSpeechTimeRef.current = null;
    speech.start();
  }
  function handlePause() {
    if (sessionStart.current) { accumulated.current += Date.now() - sessionStart.current; sessionStart.current = null; }
    speech.pause();
  }
  function handleResume() {
    setRecError("");
    sessionStart.current = Date.now();
    speech.resume();
  }
  function handleStop() {
    if (sessionStart.current) { accumulated.current += Date.now() - sessionStart.current; sessionStart.current = null; }
    setElapsed(accumulated.current);
    speech.stop();
    setInterimText("");
    if (currentId) update(currentId, { segments, durationMs: accumulated.current });
  }

  function handleHighlight(id) {
    setSegments((prev) => prev.map((s) => (s.id === id ? { ...s, highlight: !s.highlight } : s)));
  }

  // ─── Summarize ─────────────────────────────────────────

  function handleSummarize() {
    const text = segsToLabeled(segments, speakerNames);
    if (!text.trim()) { toast("No transcript to summarize", "error"); return; }
    checkPrivacy(() => doSummarize(text));
  }

  async function doSummarize(text) {
    setSummarizing(true);
    setSumError("");
    try {
      const result = await summarizeMeeting(text, apiKey, focusInstr);
      setSumData(result);
      if (currentId) update(currentId, { summary: result });
      toast("Summary generated", "success");
    } catch (e) {
      setSumError(e.message);
      toast("Summarization failed", "error");
    } finally {
      setSummarizing(false);
    }
  }

  // ─── Chat ──────────────────────────────────────────────

  function handleChat() {
    if (!chatInput.trim()) return;
    const q = chatInput.trim();
    const text = segsToLabeled(segments, speakerNames);
    if (!text.trim()) { toast("No transcript to ask about", "error"); return; }
    checkPrivacy(() => doChat(q, text));
  }

  async function doChat(q, text) {
    setChatLoading(true);
    setChatInput("");
    try {
      const a = await chatAboutMeeting(q, text, chatMsgs, apiKey);
      setChatMsgs((prev) => [...prev, { q, a }]);
    } catch (e) {
      toast("Chat failed: " + e.message, "error");
    } finally {
      setChatLoading(false);
    }
  }

  // ─── Polish ────────────────────────────────────────────

  function handlePolish() {
    const text = segsToLabeled(segments, speakerNames);
    if (!text.trim()) { toast("No transcript to polish", "error"); return; }
    checkPrivacy(() => doPolish(text));
  }

  async function doPolish(text) {
    setPolishing(true);
    try {
      const cleaned = await polishTranscript(text, apiKey);
      setPolishedText(cleaned);
      setShowPolished(true);
      toast("Transcript polished", "success");
    } catch (e) {
      toast("Polish failed: " + e.message, "error");
    } finally {
      setPolishing(false);
    }
  }

  // ─── Transcript actions ────────────────────────────────

  async function handleCopy() {
    const text = showPolished && polishedText ? polishedText : segsToLabeled(segments, speakerNames);
    if (await clipCopy(text)) toast("Transcript copied", "success");
    else toast("Copy failed", "error");
  }
  function handleDownload() {
    const title = current?.title || "meeting";
    const text = showPolished && polishedText ? polishedText : segsToLabeled(segments, speakerNames);
    downloadFile(`${title.replace(/\s+/g, "-").toLowerCase()}-transcript.txt`, text);
    toast("Downloaded", "success");
  }
  function handleClear() {
    setConfirmState({
      message: "Clear the entire transcript? This cannot be undone.",
      onConfirm: () => {
        setSegments([]);
        setInterimText("");
        setSumData(null);
        setLiveNotes([]);
        setChatMsgs([]);
        setPolishedText(null);
        accumulated.current = 0;
        setElapsed(0);
        if (currentId) update(currentId, { segments: [], summary: null, liveNotes: [], chatHistory: [], durationMs: 0 });
        setConfirmState(null);
        toast("Transcript cleared", "success");
      },
    });
  }

  async function handleCopyMd() {
    if (await clipCopy(toMarkdown(sumData))) toast("Summary copied as Markdown", "success");
    else toast("Copy failed", "error");
  }
  function handleDownloadMd() {
    const title = current?.title || "meeting";
    downloadFile(`${title.replace(/\s+/g, "-").toLowerCase()}-summary.md`, toMarkdown(sumData));
    toast("Downloaded", "success");
  }

  // ─── Meeting management ────────────────────────────────

  function handleNewMeeting() {
    if (recording) handleStop();
    if (currentId && segments.length > 0) update(currentId, { segments, durationMs: accumulated.current });
    create();
  }
  function handleLoadMeeting(id) {
    if (recording) handleStop();
    if (currentId && segments.length > 0) update(currentId, { segments, durationMs: accumulated.current });
    load(id);
    if (isMobile) setSidebarOpen(false);
  }
  function handleDeleteMeeting(id) {
    const m = meetings.find((x) => x.id === id);
    setConfirmState({
      message: `Delete "${m?.title || "meeting"}"? This cannot be undone.`,
      onConfirm: () => { remove(id); setConfirmState(null); toast("Meeting deleted", "success"); },
    });
  }
  function handleTitleChange(e) {
    if (currentId) update(currentId, { title: e.target.value });
  }

  // ─── Settings ──────────────────────────────────────────

  function handleClearKey() { setApiKey(""); localStorage.removeItem(KEYS.apiKey); toast("API key cleared", "success"); }
  function handleClearAll() {
    setConfirmState({
      message: "Delete ALL meetings? This permanently removes all saved data.",
      onConfirm: () => {
        clearAll();
        setSegments([]);
        setSumData(null);
        setLiveNotes([]);
        setChatMsgs([]);
        accumulated.current = 0;
        setElapsed(0);
        setConfirmState(null);
        toast("All meetings deleted", "success");
      },
    });
  }
  function handleApiKeyBlur() {
    if (apiKey.trim()) localStorage.setItem(KEYS.apiKey, apiKey);
    else localStorage.removeItem(KEYS.apiKey);
  }
  function handlePaneScroll() {
    const el = paneRef.current;
    if (el) nearBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 50;
  }

  useEffect(() => {
    fnRef.current = { handleStart, handlePause, handleResume, handleStop, handleSummarize };
  });

  // ─── Render: unsupported ───────────────────────────────

  if (!supported) {
    return (
      <div style={{ minHeight: "100vh", background: COLORS.bg, display: "flex", alignItems: "center", justifyContent: "center", padding: 20, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
        <div style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 12, padding: 32, maxWidth: 420, textAlign: "center" }}>
          <div style={{ fontSize: 40, marginBottom: 16 }}>🎙</div>
          <h2 style={{ color: COLORS.text, fontSize: 18, marginBottom: 12 }}>Browser Not Supported</h2>
          <p style={{ color: COLORS.muted, fontSize: 14, lineHeight: 1.6 }}>Meeting Listener requires the Web Speech API, available in <strong style={{ color: COLORS.text }}>Chrome</strong> or <strong style={{ color: COLORS.text }}>Edge</strong> on desktop.</p>
        </div>
      </div>
    );
  }

  // ─── Render ────────────────────────────────────────────

  const words = wc(segsToText(segments));
  const showSidebar = !isMobile || sidebarOpen;
  const filteredSegs = searchQ
    ? segments.filter((s) => s.text.toLowerCase().includes(searchQ.toLowerCase()))
    : segments;
  const uniqueSpeakers = [...new Set(segments.map((s) => s.speaker))].sort();

  return (
    <div style={{ minHeight: "100vh", background: COLORS.bg, color: COLORS.text, fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif" }}>
      <style>{`@keyframes mlspin{to{transform:rotate(360deg)}}@keyframes mlpulse{0%,100%{opacity:1}50%{opacity:.3}}`}</style>

      {/* Toasts */}
      <div style={{ position: "fixed", top: 16, right: 16, zIndex: 2000, display: "flex", flexDirection: "column", gap: 8 }}>
        {toasts.map((t) => <Toast key={t.id} message={t.message} type={t.type} />)}
      </div>

      {confirmState && <ConfirmDialog message={confirmState.message} onConfirm={confirmState.onConfirm} onCancel={() => setConfirmState(null)} />}
      {showSendDlg && <SendWarningDialog onConfirm={confirmSend} onCancel={() => { setShowSendDlg(false); pendingCb.current = null; }} />}

      {/* Header */}
      <header style={{ display: "flex", alignItems: "center", gap: 12, padding: "12px 16px", borderBottom: `1px solid ${COLORS.border}`, background: COLORS.surface, flexWrap: "wrap" }}>
        {isMobile && (
          <button onClick={() => setSidebarOpen(!sidebarOpen)} style={{ ...BTN, background: "transparent", color: COLORS.text, padding: "6px 10px", fontSize: 18, border: "none" }}>☰</button>
        )}
        <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
          <span style={{ color: COLORS.accent, fontSize: 18 }}>●</span>
          <span style={{ fontSize: 15, fontWeight: 700, color: COLORS.text, whiteSpace: "nowrap" }}>Meeting Listener</span>
        </div>
        <span style={{ padding: "3px 10px", borderRadius: 20, fontSize: 11, fontWeight: 600, background: dataSent ? COLORS.yellow + "22" : COLORS.green + "22", color: dataSent ? COLORS.yellow : COLORS.green, whiteSpace: "nowrap" }}>
          {dataSent ? "Sent to Anthropic API" : "Local only"}
        </span>
        <div style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 6 }}>
          <input type={showKey ? "text" : "password"} value={apiKey} onChange={(e) => setApiKey(e.target.value)} onBlur={handleApiKeyBlur} placeholder="Anthropic API Key" autoComplete="off" style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "6px 10px", color: COLORS.text, fontSize: 12, width: isMobile ? 140 : 220, outline: "none" }} />
          <button onClick={() => setShowKey(!showKey)} style={{ ...BTN, background: "transparent", border: "none", color: COLORS.muted, padding: "4px 6px", fontSize: 13 }} title={showKey ? "Hide" : "Show"}>{showKey ? "◉" : "○"}</button>
        </div>
      </header>

      {/* Main layout */}
      <div style={{ display: "flex", minHeight: "calc(100vh - 53px)", position: "relative" }}>
        {isMobile && sidebarOpen && <div onClick={() => setSidebarOpen(false)} style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.4)", zIndex: 400 }} />}

        {/* Sidebar */}
        {showSidebar && (
          <aside style={{ width: isMobile ? 280 : 240, background: COLORS.surface, borderRight: isMobile ? "none" : `1px solid ${COLORS.border}`, padding: 12, display: "flex", flexDirection: "column", gap: 8, overflowY: "auto", position: isMobile ? "absolute" : "relative", top: 0, left: 0, bottom: 0, zIndex: isMobile ? 500 : 1 }}>
            <button onClick={handleNewMeeting} style={{ ...BTN, background: COLORS.accent, color: "#fff", width: "100%", padding: "10px 0", minHeight: 44 }}>+ New Meeting</button>
            <div style={{ flex: 1, display: "flex", flexDirection: "column", gap: 4, marginTop: 8, overflowY: "auto" }}>
              {meetings.length === 0 && <p style={{ color: COLORS.muted, fontSize: 12, textAlign: "center", padding: 16 }}>No meetings yet</p>}
              {meetings.map((m) => (
                <div key={m.id} onClick={() => handleLoadMeeting(m.id)} style={{ padding: "8px 10px", borderRadius: 6, cursor: "pointer", background: m.id === currentId ? COLORS.accentGlow : "transparent", border: `1px solid ${m.id === currentId ? COLORS.accent + "44" : "transparent"}`, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, minHeight: 44 }}>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div style={{ fontSize: 13, fontWeight: 500, color: COLORS.text, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.title}</div>
                    <div style={{ fontSize: 11, color: COLORS.muted, marginTop: 2 }}>{new Date(m.createdAt).toLocaleDateString()} · {wc(segsToText(m.segments || []))} words</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); handleDeleteMeeting(m.id); }} style={{ ...BTN, background: "transparent", border: "none", color: COLORS.muted, padding: "2px 6px", fontSize: 16, opacity: 0.5, minWidth: 24 }}>×</button>
                </div>
              ))}
            </div>
            <div style={{ borderTop: `1px solid ${COLORS.border}`, paddingTop: 8, marginTop: 8 }}>
              <button onClick={() => setShowSettings(!showSettings)} style={{ ...BTN, background: "transparent", border: "none", color: COLORS.muted, fontSize: 12, padding: "4px 0", width: "100%", textAlign: "left" }}>{showSettings ? "▾" : "▸"} Settings</button>
              {showSettings && (
                <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 6 }}>
                  <button onClick={handleClearKey} style={{ ...BTN, background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.text, fontSize: 11, padding: "6px 8px", textAlign: "left" }}>Clear API Key</button>
                  <button onClick={handleClearAll} style={{ ...BTN, background: "transparent", border: `1px solid ${COLORS.red}33`, color: COLORS.red, fontSize: 11, padding: "6px 8px", textAlign: "left" }}>Clear All Meetings</button>
                  <button onClick={exportAll} style={{ ...BTN, background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.text, fontSize: 11, padding: "6px 8px", textAlign: "left" }}>Export All as JSON</button>
                  <button onClick={() => { skipWarn.current = false; localStorage.removeItem(KEYS.skipWarn); toast("Send warning re-enabled", "success"); }} style={{ ...BTN, background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.text, fontSize: 11, padding: "6px 8px", textAlign: "left" }}>Reset Send Warning</button>
                </div>
              )}
            </div>
          </aside>
        )}

        {/* Main content */}
        <main style={{ flex: 1, padding: isMobile ? 12 : 24, maxWidth: 800, width: "100%", overflowY: "auto" }}>
          {!currentId ? (
            <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: "60vh", textAlign: "center", gap: 16 }}>
              <div style={{ fontSize: 48, opacity: 0.3 }}>🎙</div>
              <h2 style={{ color: COLORS.text, fontSize: 18, fontWeight: 600 }}>No meeting selected</h2>
              <p style={{ color: COLORS.muted, fontSize: 14, maxWidth: 320, lineHeight: 1.5 }}>Create a new meeting to start recording and transcribing.</p>
              <button onClick={handleNewMeeting} style={{ ...BTN, background: COLORS.accent, color: "#fff", padding: "10px 24px", fontSize: 14, minHeight: 44 }}>+ New Meeting</button>
            </div>
          ) : (
            <>
              {/* Title */}
              <input value={current?.title || ""} onChange={handleTitleChange} style={{ background: "transparent", border: "none", outline: "none", fontSize: 20, fontWeight: 700, color: COLORS.text, width: "100%", padding: "4px 0", marginBottom: 12 }} placeholder="Meeting title…" />

              {/* Controls */}
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, flexWrap: "wrap" }}>
                {recording && !paused && (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: 6 }}>
                    <span style={{ display: "inline-block", width: 8, height: 8, borderRadius: "50%", background: COLORS.red, animation: "mlpulse 1.2s ease-in-out infinite" }} />
                    <span style={{ fontSize: 12, color: COLORS.red, fontWeight: 600 }}>Recording</span>
                  </span>
                )}
                {paused && <span style={{ fontSize: 12, color: COLORS.yellow, fontWeight: 600 }}>Paused</span>}
                <span style={{ fontSize: 13, color: COLORS.muted, fontVariantNumeric: "tabular-nums" }}>{fmtDuration(elapsed)}</span>
                <span style={{ fontSize: 12, color: COLORS.dim }}>{words} word{words !== 1 ? "s" : ""}</span>

                {liveNotesOn && recording && <span style={{ fontSize: 11, color: COLORS.green, fontWeight: 500 }}>AI Notes ON</span>}

                <div style={{ display: "flex", gap: 6, marginLeft: "auto" }}>
                  {!recording && !paused && <button onClick={handleStart} style={{ ...BTN, background: COLORS.accent, color: "#fff", minHeight: 44 }}>Start</button>}
                  {recording && !paused && (
                    <>
                      <button onClick={handlePause} style={{ ...BTN, background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text, minHeight: 44 }}>Pause</button>
                      <button onClick={handleStop} style={{ ...BTN, background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text, minHeight: 44 }}>Stop</button>
                    </>
                  )}
                  {paused && (
                    <>
                      <button onClick={handleResume} style={{ ...BTN, background: COLORS.accent, color: "#fff", minHeight: 44 }}>Resume</button>
                      <button onClick={handleStop} style={{ ...BTN, background: COLORS.card, border: `1px solid ${COLORS.border}`, color: COLORS.text, minHeight: 44 }}>Stop</button>
                    </>
                  )}
                </div>
              </div>

              {/* Keyboard hints + live notes toggle */}
              <div style={{ display: "flex", alignItems: "center", gap: 12, fontSize: 11, color: COLORS.dim, marginBottom: 10, flexWrap: "wrap" }}>
                <span><span style={{ background: COLORS.card, padding: "2px 6px", borderRadius: 3, marginRight: 4 }}>Space</span>record</span>
                <span><span style={{ background: COLORS.card, padding: "2px 6px", borderRadius: 3, marginRight: 4 }}>{navigator.platform?.includes("Mac") ? "⌘" : "Ctrl"}+S</span>summarize</span>
                <span><span style={{ background: COLORS.card, padding: "2px 6px", borderRadius: 3, marginRight: 4 }}>Esc</span>stop</span>
                <label style={{ marginLeft: "auto", display: "flex", alignItems: "center", gap: 4, cursor: "pointer", color: COLORS.muted }}>
                  <input type="checkbox" checked={liveNotesOn} onChange={(e) => setLiveNotesOn(e.target.checked)} />
                  Live AI Notes
                </label>
              </div>

              {recError && <div style={{ background: COLORS.red + "18", border: `1px solid ${COLORS.red}33`, borderRadius: 8, padding: "10px 14px", marginBottom: 10, fontSize: 13, color: COLORS.red }}>{recError}</div>}

              {/* Search bar */}
              <div style={{ marginBottom: 8 }}>
                <input value={searchQ} onChange={(e) => setSearchQ(e.target.value)} placeholder="Search transcript…" style={{ width: "100%", background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "6px 10px", color: COLORS.text, fontSize: 12, outline: "none" }} />
                {searchQ && <span style={{ fontSize: 11, color: COLORS.muted, marginLeft: 8 }}>{filteredSegs.length} match{filteredSegs.length !== 1 ? "es" : ""}</span>}
              </div>

              {/* Speaker legend + edit */}
              {uniqueSpeakers.length > 1 && (
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8, flexWrap: "wrap" }}>
                  {uniqueSpeakers.map((n) => (
                    <span key={n} style={{ fontSize: 11, color: speakerColor(n), fontWeight: 600 }}>
                      {speakerNames[n] || `Speaker ${n}`}
                    </span>
                  ))}
                  <button onClick={() => setEditingSpeakers(!editingSpeakers)} style={{ ...BTN, background: "transparent", border: "none", color: COLORS.muted, fontSize: 11, padding: "2px 4px" }}>
                    {editingSpeakers ? "Done" : "Rename"}
                  </button>
                </div>
              )}
              {editingSpeakers && uniqueSpeakers.length > 0 && (
                <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 10, padding: 8, background: COLORS.card, borderRadius: 6 }}>
                  {uniqueSpeakers.map((n) => (
                    <div key={n} style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <span style={{ fontSize: 12, color: speakerColor(n), fontWeight: 600, width: 70 }}>Speaker {n}</span>
                      <input value={speakerNames[n] || ""} onChange={(e) => setSpeakerNames((prev) => ({ ...prev, [n]: e.target.value }))} placeholder={`Speaker ${n}`} style={{ flex: 1, background: COLORS.surface, border: `1px solid ${COLORS.border}`, borderRadius: 4, padding: "4px 8px", color: COLORS.text, fontSize: 12, outline: "none" }} />
                    </div>
                  ))}
                </div>
              )}

              {/* Transcript pane */}
              <div ref={paneRef} onScroll={handlePaneScroll} style={{ background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 10, padding: 12, minHeight: 200, maxHeight: 400, overflowY: "auto" }}>
                {showPolished && polishedText ? (
                  <div style={{ fontSize: 14, color: COLORS.text, lineHeight: 1.7, whiteSpace: "pre-wrap", wordBreak: "break-word" }}>{polishedText}</div>
                ) : (
                  <>
                    {filteredSegs.length === 0 && !interimText && (
                      <span style={{ color: COLORS.dim }}>{recording ? "Listening…" : segments.length === 0 ? "Hit Start to begin recording." : "No matches."}</span>
                    )}
                    {filteredSegs.map((seg) => (
                      <SegmentRow key={seg.id} segment={seg} name={speakerNames[seg.speaker]} searchQ={searchQ} onHighlight={handleHighlight} />
                    ))}
                    {interimText && (
                      <div style={{ display: "flex", gap: 10, padding: "6px 0", paddingLeft: 11 }}>
                        <div style={{ flexShrink: 0, width: 44 }} />
                        <div style={{ fontSize: 14, color: COLORS.muted, lineHeight: 1.6 }}>{interimText}</div>
                      </div>
                    )}
                  </>
                )}
              </div>

              {/* Polished toggle */}
              {polishedText && (
                <div style={{ display: "flex", gap: 8, marginTop: 6 }}>
                  <button onClick={() => setShowPolished(false)} style={{ ...BTN, background: !showPolished ? COLORS.accent + "22" : "transparent", border: `1px solid ${!showPolished ? COLORS.accent + "44" : COLORS.border}`, color: !showPolished ? COLORS.accent : COLORS.text, fontSize: 11, padding: "4px 10px" }}>Timestamped</button>
                  <button onClick={() => setShowPolished(true)} style={{ ...BTN, background: showPolished ? COLORS.accent + "22" : "transparent", border: `1px solid ${showPolished ? COLORS.accent + "44" : COLORS.border}`, color: showPolished ? COLORS.accent : COLORS.text, fontSize: 11, padding: "4px 10px" }}>Polished</button>
                </div>
              )}

              {/* Transcript actions */}
              {segments.length > 0 && (
                <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                  <button onClick={handleCopy} style={{ ...BTN, background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.text, fontSize: 12 }}>Copy</button>
                  <button onClick={handleDownload} style={{ ...BTN, background: "transparent", border: `1px solid ${COLORS.border}`, color: COLORS.text, fontSize: 12 }}>Download .txt</button>
                  <button onClick={handlePolish} disabled={polishing} style={{ ...BTN, background: "transparent", border: `1px solid ${COLORS.blue}44`, color: COLORS.blue, fontSize: 12, opacity: polishing ? 0.5 : 1, cursor: polishing ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 6 }}>
                    {polishing && <Spinner size={12} />}
                    {polishing ? "Polishing…" : "Polish with AI"}
                  </button>
                  <button onClick={handleClear} style={{ ...BTN, background: "transparent", border: `1px solid ${COLORS.red}33`, color: COLORS.red, fontSize: 12 }}>Clear</button>
                </div>
              )}

              {/* AI Notes */}
              <Section title="AI Notes" badge={liveNotes.length || null} defaultOpen={liveNotes.length > 0}>
                <LiveNotesPanel notes={liveNotes} />
              </Section>

              {/* Summarize */}
              <Section title="Summary" badge={sumData ? "ready" : null} defaultOpen={true}>
                <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
                  <input value={focusInstr} onChange={(e) => setFocusInstr(e.target.value)} placeholder="Focus: e.g. 'risks and deadlines'" style={{ flex: 1, minWidth: 180, background: COLORS.card, border: `1px solid ${COLORS.border}`, borderRadius: 6, padding: "8px 12px", color: COLORS.text, fontSize: 13, outline: "none" }} />
                  <button onClick={handleSummarize} disabled={summarizing || segments.length === 0} style={{ ...BTN, background: summarizing ? COLORS.accentDim : COLORS.accent, color: "#fff", padding: "8px 20px", opacity: summarizing || segments.length === 0 ? 0.5 : 1, cursor: summarizing || segments.length === 0 ? "not-allowed" : "pointer", display: "inline-flex", alignItems: "center", gap: 8, minHeight: 44 }}>
                    {summarizing && <Spinner size={14} />}
                    {summarizing ? "Summarizing…" : "✦ Summarize"}
                  </button>
                </div>
                {sumError && <div style={{ background: COLORS.red + "18", border: `1px solid ${COLORS.red}33`, borderRadius: 8, padding: "10px 14px", fontSize: 13, color: COLORS.red, wordBreak: "break-word", marginBottom: 10 }}>{sumError}</div>}
                {sumData && <SummaryView summary={sumData} onCopyMd={handleCopyMd} onDownloadMd={handleDownloadMd} />}
              </Section>

              {/* Chat */}
              <Section title="Ask about this meeting" badge={chatMsgs.length || null}>
                <ChatPanel messages={chatMsgs} input={chatInput} onInput={setChatInput} onSend={handleChat} loading={chatLoading} />
              </Section>
            </>
          )}
        </main>
      </div>
    </div>
  );
}
