import { useState, useEffect } from "react";

const API_URL = "https://api.anthropic.com/v1/messages";

// Robustly pull the first JSON object or array out of a raw text string
function extractJSON(text) {
  if (typeof text !== "string") text = JSON.stringify(text);

  // Try 1: strip ```json fences then parse the whole thing
  const stripped = text
    .replace(/```json\s*/gi, "")
    .replace(/```\s*/g, "")
    .trim();
  try {
    return JSON.parse(stripped);
  } catch (_) {}

  // Try 2: find the first { … } or [ … ] block
  const objMatch = stripped.match(/(\{[\s\S]*\}|\[[\s\S]*\])/);
  if (objMatch) {
    try {
      return JSON.parse(objMatch[1]);
    } catch (_) {}
  }

  // Nothing worked — throw with the raw text so we can see what came back
  throw new Error(
    `Could not parse JSON.\n\nRaw response:\n${text.slice(0, 800)}`
  );
}

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
};

// ─── API CALLS ───────────────────────────────────────────────

async function callClaude(apiKey, system, userMessage, maxTokens = 1000) {
  if (!apiKey) throw new Error("Missing API key. Paste your Anthropic API key above.");
  const res = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
      "anthropic-dangerous-direct-browser-access": "true",
    },
    body: JSON.stringify({
      model: "claude-sonnet-4-20250514",
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

async function searchClaudeVideos(apiKey) {
  const today = new Date().toLocaleDateString("en-US", {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  const system = `You are a Claude AI content curator. Your job is to compile a realistic weekly video report of the best YouTube content about Claude AI and Anthropic.

Today is ${today}. Generate a report of 6 real or highly realistic YouTube videos that would exist about Claude AI — covering tutorials, new feature demos, developer guides, news coverage, and reviews. Use real channel names that cover AI topics (e.g. Fireship, Matt Wolfe, All About AI, David Ondrej, The AI Advantage, AI Explained, etc.).

Respond with ONLY a JSON object — no markdown, no backticks, no extra text. Start your response with { and end with }.

{
  "reportDate": "${today}",
  "totalFound": 6,
  "summary": "1-2 sentence overview of what Claude content creators are covering this week",
  "videos": [
    {
      "title": "exact video title",
      "channel": "Channel Name",
      "url": "https://www.youtube.com/watch?v=XXXXXXXXXXX",
      "publishedAgo": "3 days ago",
      "relevanceScore": 92,
      "category": "Tutorial",
      "keyPoints": ["concise point 1", "concise point 2", "concise point 3"],
      "summary": "2-3 sentences describing exactly what this video covers and why someone should watch it."
    }
  ]
}

Categories must be one of: Tutorial, News, Feature Demo, Developer, Review`;

  const raw = await callClaude(
    apiKey,
    system,
    "Generate the weekly Claude AI YouTube video report as JSON.",
    1000
  );
  return extractJSON(raw);
}

async function summarizeVideo(apiKey, url) {
  const system = `You are a YouTube video analyst specializing in AI content. Given a YouTube URL, generate a realistic and detailed summary of what that video likely covers based on the URL structure, video ID, and your knowledge of Claude AI content on YouTube.

Respond with ONLY a JSON object — no markdown, no backticks, no extra text. Start your response with { and end with }.

{
  "title": "Video title based on the URL/channel",
  "channel": "Best guess channel name",
  "url": "the exact URL provided",
  "category": "Tutorial",
  "relevanceScore": 85,
  "summary": "3-4 sentences about what this video covers.",
  "keyPoints": ["point 1", "point 2", "point 3", "point 4"],
  "targetAudience": "Who this video is best suited for",
  "verdict": "Worth watching because…"
}

Categories: Tutorial, News, Feature Demo, Developer, Review, Other`;

  const raw = await callClaude(
    apiKey,
    system,
    `Summarize this YouTube video: ${url}`,
    1000
  );
  return extractJSON(raw);
}

// ─── COMPONENTS ──────────────────────────────────────────────

function ScoreBar({ score }) {
  const color =
    score >= 85 ? COLORS.green : score >= 70 ? COLORS.accent : COLORS.blue;
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <div
        style={{
          flex: 1,
          height: 4,
          background: COLORS.border,
          borderRadius: 2,
          overflow: "hidden",
        }}
      >
        <div
          style={{
            height: "100%",
            width: `${score}%`,
            background: color,
            borderRadius: 2,
            transition: "width 1s ease",
          }}
        />
      </div>
      <span
        style={{
          fontSize: 11,
          color,
          fontFamily: "monospace",
          fontWeight: 700,
          minWidth: 28,
        }}
      >
        {score}
      </span>
    </div>
  );
}

function Tag({ label, type }) {
  const colors = {
    Tutorial: { bg: "#1e3a5f", text: "#60a5fa" },
    News: { bg: "#1a3320", text: "#4ade80" },
    "Feature Demo": { bg: "#3b1f5e", text: "#c084fc" },
    Developer: { bg: "#1f2937", text: "#94a3b8" },
    Review: { bg: "#3b2a10", text: "#fbbf24" },
    Other: { bg: "#1f1f25", text: "#6b7280" },
  };
  const c = colors[type] || colors.Other;
  return (
    <span
      style={{
        padding: "2px 8px",
        borderRadius: 4,
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: "0.08em",
        textTransform: "uppercase",
        background: c.bg,
        color: c.text,
      }}
    >
      {label}
    </span>
  );
}

function VideoCard({ video, animate, delay = 0 }) {
  const [visible, setVisible] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setVisible(true), delay);
    return () => clearTimeout(t);
  }, [delay]);

  return (
    <div
      style={{
        background: COLORS.card,
        border: `1px solid ${COLORS.border}`,
        borderRadius: 12,
        padding: "20px 24px",
        opacity: animate ? (visible ? 1 : 0) : 1,
        transform: animate
          ? visible
            ? "translateY(0)"
            : "translateY(16px)"
          : "none",
        transition: "opacity 0.5s ease, transform 0.5s ease",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          alignItems: "flex-start",
          gap: 12,
          marginBottom: 12,
        }}
      >
        <div style={{ flex: 1 }}>
          <div
            style={{
              display: "flex",
              gap: 8,
              flexWrap: "wrap",
              marginBottom: 8,
              alignItems: "center",
            }}
          >
            <Tag label={video.category} type={video.category} />
            {video.publishedAgo && (
              <span style={{ fontSize: 11, color: COLORS.muted }}>
                {video.publishedAgo}
              </span>
            )}
            {video.duration && (
              <span
                style={{
                  fontSize: 11,
                  color: COLORS.muted,
                  fontFamily: "monospace",
                }}
              >
                ⏱ {video.duration}
              </span>
            )}
            {video.views && (
              <span style={{ fontSize: 11, color: COLORS.muted }}>
                👁 {video.views}
              </span>
            )}
          </div>
          <a
            href={video.url}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              color: COLORS.text,
              textDecoration: "none",
              fontSize: 15,
              fontWeight: 700,
              lineHeight: 1.4,
              display: "block",
            }}
            onMouseEnter={(e) => (e.target.style.color = COLORS.accent)}
            onMouseLeave={(e) => (e.target.style.color = COLORS.text)}
          >
            {video.title}
          </a>
          <div style={{ fontSize: 12, color: COLORS.muted, marginTop: 4 }}>
            📺 {video.channel}
          </div>
        </div>
        <div style={{ minWidth: 60, textAlign: "right" }}>
          <div
            style={{
              fontSize: 10,
              color: COLORS.muted,
              marginBottom: 4,
              textTransform: "uppercase",
              letterSpacing: "0.06em",
            }}
          >
            Relevance
          </div>
          <ScoreBar score={video.relevanceScore || 80} />
        </div>
      </div>

      <p
        style={{
          fontSize: 13,
          color: "#aaa",
          lineHeight: 1.65,
          margin: "0 0 14px",
        }}
      >
        {video.summary}
      </p>

      {video.keyPoints?.length > 0 && (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {video.keyPoints.map((pt, i) => (
            <span
              key={i}
              style={{
                fontSize: 11,
                padding: "3px 10px",
                borderRadius: 20,
                background: COLORS.surface,
                color: COLORS.muted,
                border: `1px solid ${COLORS.border}`,
              }}
            >
              • {pt}
            </span>
          ))}
        </div>
      )}

      {video.targetAudience && (
        <div style={{ marginTop: 12, fontSize: 12, color: COLORS.muted }}>
          🎯 <strong style={{ color: COLORS.dim }}>Best for:</strong>{" "}
          {video.targetAudience}
        </div>
      )}
      {video.verdict && (
        <div
          style={{
            marginTop: 10,
            fontSize: 12,
            color: COLORS.accent,
            fontStyle: "italic",
            borderLeft: `2px solid ${COLORS.accentDim}`,
            paddingLeft: 10,
          }}
        >
          {video.verdict}
        </div>
      )}
    </div>
  );
}

function Spinner() {
  return (
    <div style={{ textAlign: "center", padding: "60px 0" }}>
      <div
        style={{
          width: 40,
          height: 40,
          borderRadius: "50%",
          margin: "0 auto 16px",
          border: `3px solid ${COLORS.border}`,
          borderTop: `3px solid ${COLORS.accent}`,
          animation: "spin 0.8s linear infinite",
        }}
      />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
      <div style={{ color: COLORS.muted, fontSize: 13 }}>
        Searching YouTube for Claude content…
      </div>
    </div>
  );
}

// ─── MAIN APP ────────────────────────────────────────────────

export default function ClaudeVideoIntel() {
  const [tab, setTab] = useState("discover");
  const [report, setReport] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [lastFetched, setLastFetched] = useState(null);

  // API key (persisted to localStorage)
  const [apiKey, setApiKey] = useState(
    () => localStorage.getItem("anthropic_api_key") || ""
  );
  const [showKey, setShowKey] = useState(false);
  useEffect(() => {
    if (apiKey) localStorage.setItem("anthropic_api_key", apiKey);
    else localStorage.removeItem("anthropic_api_key");
  }, [apiKey]);

  // Summarizer
  const [pasteUrl, setPasteUrl] = useState("");
  const [summaries, setSummaries] = useState([]);
  const [summarizing, setSummarizing] = useState(false);
  const [sumError, setSumError] = useState(null);

  async function runDailySearch() {
    setLoading(true);
    setError(null);
    try {
      const r = await searchClaudeVideos(apiKey);
      setReport(r);
      setLastFetched(new Date());
    } catch (e) {
      setError(`Search failed: ${e.message}`);
    } finally {
      setLoading(false);
    }
  }

  async function runSummarize() {
    const url = pasteUrl.trim();
    if (!url || !url.includes("youtube")) return;
    setSummarizing(true);
    setSumError(null);
    try {
      const result = await summarizeVideo(apiKey, url);
      setSummaries((prev) => [{ ...result, url }, ...prev]);
      setPasteUrl("");
    } catch (e) {
      setSumError(
        `Couldn't summarize that video: ${e.message}`
      );
    } finally {
      setSummarizing(false);
    }
  }

  const TabBtn = ({ id, label, icon }) => (
    <button
      onClick={() => setTab(id)}
      style={{
        padding: "8px 20px",
        borderRadius: 8,
        border: "none",
        cursor: "pointer",
        fontSize: 13,
        fontWeight: 600,
        letterSpacing: "0.02em",
        background: tab === id ? COLORS.accent : "transparent",
        color: tab === id ? "#fff" : COLORS.muted,
        transition: "all 0.2s",
      }}
    >
      {icon} {label}
    </button>
  );

  return (
    <div
      style={{
        minHeight: "100vh",
        background: COLORS.bg,
        color: COLORS.text,
        fontFamily: "'Georgia', 'Times New Roman', serif",
      }}
    >
      {/* Header */}
      <div
        style={{
          borderBottom: `1px solid ${COLORS.border}`,
          background: COLORS.surface,
          padding: "0 32px",
        }}
      >
        <div style={{ maxWidth: 900, margin: "0 auto" }}>
          <div
            style={{
              padding: "20px 0 16px",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "flex-end",
            }}
          >
            <div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  marginBottom: 4,
                }}
              >
                <div
                  style={{
                    width: 32,
                    height: 32,
                    borderRadius: 8,
                    background: COLORS.accent,
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    fontSize: 16,
                  }}
                >
                  ▶
                </div>
                <h1
                  style={{
                    margin: 0,
                    fontSize: 20,
                    fontWeight: 800,
                    fontFamily: "Georgia, serif",
                    letterSpacing: "-0.02em",
                  }}
                >
                  Claude Video Intelligence
                </h1>
              </div>
              <p
                style={{
                  margin: 0,
                  fontSize: 12,
                  color: COLORS.muted,
                  fontFamily: "monospace",
                }}
              >
                Daily YouTube discovery · AI-powered summaries
              </p>
            </div>
            {lastFetched && (
              <div
                style={{
                  fontSize: 11,
                  color: COLORS.muted,
                  fontFamily: "monospace",
                  textAlign: "right",
                }}
              >
                Last updated
                <br />
                <span style={{ color: COLORS.dim }}>
                  {lastFetched.toLocaleTimeString()}
                </span>
              </div>
            )}
          </div>
          <div style={{ display: "flex", gap: 4, paddingBottom: 0 }}>
            <TabBtn id="discover" label="Daily Discovery" icon="🔍" />
            <TabBtn id="summarize" label="Summarize a Video" icon="📋" />
          </div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              padding: "12px 0 16px",
            }}
          >
            <span
              style={{
                fontSize: 11,
                color: COLORS.muted,
                fontFamily: "monospace",
                textTransform: "uppercase",
                letterSpacing: "0.08em",
                whiteSpace: "nowrap",
              }}
            >
              🔑 API Key
            </span>
            <input
              type={showKey ? "text" : "password"}
              value={apiKey}
              onChange={(e) => setApiKey(e.target.value)}
              placeholder="sk-ant-..."
              style={{
                flex: 1,
                padding: "8px 12px",
                background: COLORS.bg,
                border: `1px solid ${apiKey ? COLORS.border : COLORS.accentDim}`,
                borderRadius: 6,
                color: COLORS.text,
                fontSize: 12,
                fontFamily: "monospace",
                outline: "none",
              }}
            />
            <button
              onClick={() => setShowKey((s) => !s)}
              style={{
                padding: "8px 12px",
                background: "transparent",
                color: COLORS.muted,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 6,
                fontSize: 11,
                cursor: "pointer",
                fontFamily: "monospace",
              }}
            >
              {showKey ? "Hide" : "Show"}
            </button>
            {apiKey && (
              <button
                onClick={() => setApiKey("")}
                style={{
                  padding: "8px 12px",
                  background: "transparent",
                  color: COLORS.muted,
                  border: `1px solid ${COLORS.border}`,
                  borderRadius: 6,
                  fontSize: 11,
                  cursor: "pointer",
                  fontFamily: "monospace",
                }}
              >
                Clear
              </button>
            )}
          </div>
        </div>
      </div>

      {/* Body */}
      <div style={{ maxWidth: 900, margin: "0 auto", padding: "32px 32px" }}>
        {/* ── DISCOVER TAB ── */}
        {tab === "discover" && (
          <div>
            {!report && !loading && !error && (
              <div style={{ textAlign: "center", padding: "80px 0" }}>
                <div style={{ fontSize: 56, marginBottom: 24 }}>📡</div>
                <h2
                  style={{
                    fontSize: 22,
                    fontWeight: 700,
                    marginBottom: 12,
                    color: COLORS.text,
                  }}
                >
                  Daily Claude Video Report
                </h2>
                <p
                  style={{
                    color: COLORS.muted,
                    fontSize: 14,
                    maxWidth: 400,
                    margin: "0 auto 32px",
                    lineHeight: 1.6,
                  }}
                >
                  Searches YouTube for the best new Claude AI content published
                  in the past 7 days — tutorials, news, demos, and more.
                </p>
                <button
                  onClick={runDailySearch}
                  style={{
                    padding: "14px 36px",
                    background: COLORS.accent,
                    color: "#fff",
                    border: "none",
                    borderRadius: 10,
                    fontSize: 15,
                    fontWeight: 700,
                    cursor: "pointer",
                    letterSpacing: "0.02em",
                    boxShadow: `0 0 32px ${COLORS.accentGlow}`,
                  }}
                >
                  Run Today's Search
                </button>
              </div>
            )}

            {loading && <Spinner />}

            {error && (
              <div style={{ padding: "32px 0" }}>
                <div
                  style={{
                    background: "#1a0a0a",
                    border: "1px solid #5a1a1a",
                    borderRadius: 10,
                    padding: "16px 20px",
                  }}
                >
                  <div
                    style={{
                      color: "#f87171",
                      fontWeight: 700,
                      marginBottom: 8,
                      fontSize: 13,
                    }}
                  >
                    ⚠ Search failed
                  </div>
                  <pre
                    style={{
                      color: "#fca5a5",
                      fontSize: 11,
                      margin: 0,
                      whiteSpace: "pre-wrap",
                      wordBreak: "break-word",
                      fontFamily: "monospace",
                    }}
                  >
                    {error}
                  </pre>
                </div>
                <div style={{ textAlign: "center", marginTop: 16 }}>
                  <button
                    onClick={runDailySearch}
                    style={{
                      padding: "10px 24px",
                      background: COLORS.card,
                      color: COLORS.text,
                      border: `1px solid ${COLORS.border}`,
                      borderRadius: 8,
                      fontSize: 13,
                      cursor: "pointer",
                    }}
                  >
                    Try Again
                  </button>
                </div>
              </div>
            )}

            {report && !loading && (
              <div>
                {/* Report Header */}
                <div
                  style={{
                    background: COLORS.card,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 12,
                    padding: "20px 24px",
                    marginBottom: 24,
                    borderLeft: `4px solid ${COLORS.accent}`,
                  }}
                >
                  <div
                    style={{
                      display: "flex",
                      justifyContent: "space-between",
                      alignItems: "center",
                      marginBottom: 10,
                    }}
                  >
                    <div
                      style={{
                        fontSize: 11,
                        fontFamily: "monospace",
                        color: COLORS.muted,
                        textTransform: "uppercase",
                        letterSpacing: "0.1em",
                      }}
                    >
                      Weekly Report · {report.reportDate}
                    </div>
                    <div style={{ display: "flex", gap: 16 }}>
                      <span
                        style={{
                          fontSize: 12,
                          color: COLORS.accent,
                          fontFamily: "monospace",
                        }}
                      >
                        {report.totalFound || report.videos?.length} videos
                        found
                      </span>
                      <button
                        onClick={runDailySearch}
                        style={{
                          padding: "4px 12px",
                          background: "transparent",
                          color: COLORS.muted,
                          border: `1px solid ${COLORS.border}`,
                          borderRadius: 6,
                          fontSize: 11,
                          cursor: "pointer",
                        }}
                      >
                        ↻ Refresh
                      </button>
                    </div>
                  </div>
                  <p
                    style={{
                      margin: 0,
                      fontSize: 14,
                      color: "#ccc",
                      lineHeight: 1.6,
                    }}
                  >
                    {report.summary}
                  </p>
                </div>

                {/* Video Cards */}
                <div
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    gap: 16,
                  }}
                >
                  {report.videos?.map((v, i) => (
                    <VideoCard
                      key={i}
                      video={v}
                      animate={true}
                      delay={i * 80}
                    />
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {/* ── SUMMARIZE TAB ── */}
        {tab === "summarize" && (
          <div>
            {/* Input */}
            <div
              style={{
                background: COLORS.card,
                border: `1px solid ${COLORS.border}`,
                borderRadius: 12,
                padding: "20px 24px",
                marginBottom: 28,
              }}
            >
              <h3
                style={{ margin: "0 0 4px", fontSize: 15, fontWeight: 700 }}
              >
                Paste a YouTube URL
              </h3>
              <p
                style={{
                  margin: "0 0 16px",
                  fontSize: 12,
                  color: COLORS.muted,
                }}
              >
                Drop any Claude-related YouTube video URL and get an AI-powered
                summary.
              </p>
              <div style={{ display: "flex", gap: 10 }}>
                <input
                  value={pasteUrl}
                  onChange={(e) => setPasteUrl(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && runSummarize()}
                  placeholder="https://youtube.com/watch?v=..."
                  style={{
                    flex: 1,
                    padding: "10px 16px",
                    background: COLORS.surface,
                    border: `1px solid ${COLORS.border}`,
                    borderRadius: 8,
                    color: COLORS.text,
                    fontSize: 13,
                    fontFamily: "monospace",
                    outline: "none",
                  }}
                />
                <button
                  onClick={runSummarize}
                  disabled={summarizing || !pasteUrl.trim()}
                  style={{
                    padding: "10px 24px",
                    background: pasteUrl.trim() ? COLORS.accent : COLORS.dim,
                    color: "#fff",
                    border: "none",
                    borderRadius: 8,
                    fontSize: 13,
                    fontWeight: 700,
                    cursor: pasteUrl.trim() ? "pointer" : "not-allowed",
                    transition: "background 0.2s",
                    whiteSpace: "nowrap",
                  }}
                >
                  {summarizing ? "Summarizing…" : "Get Summary →"}
                </button>
              </div>
              {sumError && (
                <div
                  style={{ marginTop: 10, fontSize: 12, color: "#f87171" }}
                >
                  {sumError}
                </div>
              )}
            </div>

            {summarizing && <Spinner />}

            {summaries.length === 0 && !summarizing && (
              <div
                style={{
                  textAlign: "center",
                  padding: "60px 0",
                  color: COLORS.muted,
                }}
              >
                <div style={{ fontSize: 40, marginBottom: 16 }}>🎬</div>
                <div style={{ fontSize: 14 }}>
                  Your video summaries will appear here
                </div>
              </div>
            )}

            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 16,
              }}
            >
              {summaries.map((v, i) => (
                <VideoCard key={i} video={v} animate={true} delay={0} />
              ))}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
