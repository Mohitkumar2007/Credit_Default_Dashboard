import React, { useEffect, useMemo, useState } from "react";
import { Activity, CheckCircle2, Database, FileJson, History, RefreshCw, Server, ShieldCheck, Trash2, Upload } from "lucide-react";

const DEFAULT_API = import.meta.env.VITE_API_BASE_URL || "https://api-credit.mohitkumar2007.in";
const STORAGE_KEY = "credit_default_dashboard_history_v1";
const THRESHOLD = 0.4831;
const HISTORY_LIMIT = 5;
const KAGGLE_SCORES = {
  public: 0.78420,
  private: 0.78096,
};

const SAMPLE_RESULT = {
  default_probability: 0.6907619654408572,
  risk_band: "high",
  decision: "review",
  model_version: "0.1.0",
  top_reasons: [
    { feature: "num__EXT_SOURCE_MEAN", feature_value: 0.4294351637363434, contribution: 0.2372023384151609, direction: "increases_risk" },
    { feature: "num__POS_CNT_INSTALMENT_FUTURE_MEAN", feature_value: 24.9375, contribution: 0.1793452695990599, direction: "increases_risk" },
    { feature: "num__CREDIT_TERM", feature_value: 20.319868087768555, contribution: 0.12878809143528194, direction: "increases_risk" },
    { feature: "num__GOODS_CREDIT_RATIO", feature_value: 0.7911392450332642, contribution: 0.11357503361302733, direction: "increases_risk" },
  ],
};

const FEATURE_LABELS = {
  EXT_SOURCE_MEAN: "External credit score avg",
  EXT_SOURCE_1: "External credit score 1",
  EXT_SOURCE_2: "External credit score 2",
  EXT_SOURCE_3: "External credit score 3",
  CREDIT_TERM: "Loan term",
  CREDIT_INCOME_RATIO: "Credit to income ratio",
  ANNUITY_INCOME_RATIO: "Annuity to income ratio",
  GOODS_CREDIT_RATIO: "Goods to credit ratio",
  INCOME_PER_PERSON: "Income per person",
  POS_CNT_INSTALMENT_FUTURE_MEAN: "Remaining installments avg",
};

function normalizeBand(band) {
  return band === "med" ? "medium" : band || "unknown";
}

function bandClasses(band) {
  const normalized = normalizeBand(band);
  if (normalized === "low") return "text-good bg-good/10 border-good/30";
  if (normalized === "medium") return "text-warn bg-warn/10 border-warn/30";
  return "text-bad bg-bad/10 border-bad/30";
}

function bandColor(band) {
  const normalized = normalizeBand(band);
  if (normalized === "low") return "#34d8a0";
  if (normalized === "medium") return "#ffb24d";
  return "#f0573f";
}

function formatValue(value) {
  if (typeof value !== "number" || Number.isNaN(value)) return String(value ?? "-");
  if (Math.abs(value) >= 1000) return value.toLocaleString(undefined, { maximumFractionDigits: 0 });
  if (Math.abs(value) < 1) return value.toFixed(3);
  return value.toFixed(2);
}

function prettyFeature(raw = "") {
  let feature = raw.replace(/^(num__|cat__|remainder__)/, "");
  if (FEATURE_LABELS[feature]) return FEATURE_LABELS[feature];
  feature = feature.replace(/^(BUREAU|BB|PREV|INST|POS|CC)_/, "");
  feature = feature.replace(/_(MEAN|SUM|MAX|MIN|STD|COUNT)$/, "");
  return feature
    .toLowerCase()
    .replaceAll("_", " ")
    .replace(/\bamt\b/g, "amount")
    .replace(/\bcnt\b/g, "count")
    .replace(/\bdpd\b/g, "days past due")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function normalizeHistoryItem(item, index = 0) {
  const data = item.response || item;
  const probability = data.default_probability ?? item.default_probability;
  if (probability === undefined || probability === null) return null;

  return {
    id: item.id || item.created_at || crypto.randomUUID(),
    ts: item.created_at ? Date.parse(item.created_at) : Date.now() - index * 1000,
    source: item.response ? "server" : item.source || "server",
    data: {
      default_probability: probability,
      risk_band: data.risk_band ?? item.risk_band,
      decision: data.decision ?? item.decision,
      model_version: data.model_version ?? item.model_version,
      top_reasons: data.top_reasons || item.top_reasons || [],
    },
  };
}

function mergeHistory(localRecords, serverRecords) {
  const seen = new Set();
  return [...serverRecords, ...localRecords]
    .filter((record) => {
      const key = `${record.ts}-${record.data.default_probability}-${record.data.risk_band}-${record.data.decision}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .sort((a, b) => b.ts - a.ts)
    .slice(0, HISTORY_LIMIT);
}

function Gauge({ probability, band }) {
  const degrees = Math.max(0, Math.min(1, probability || 0)) * 180;
  const thresholdDegrees = THRESHOLD * 180;
  const color = bandColor(band);
  return (
    <div className="relative h-[160px] w-[240px] shrink-0">
      <svg viewBox="0 0 240 160" className="h-full w-full" aria-hidden="true">
        <path d="M 32 122 A 88 88 0 0 1 82 43" className="gauge-low" />
        <path d="M 84 42 A 88 88 0 0 1 120 32" className="gauge-med" />
        <path d="M 123 32 A 88 88 0 0 1 208 122" className="gauge-high" />
        <line x1="120" y1="120" x2="120" y2="24" stroke="#8b95ab" strokeWidth="1.4" strokeDasharray="4 5" transform={`rotate(${thresholdDegrees - 90} 120 120)`} />
        <line x1="120" y1="120" x2="120" y2="34" stroke="#e9edf6" strokeWidth="3" strokeLinecap="round" transform={`rotate(${degrees - 90} 120 120)`} />
        <circle cx="120" cy="120" r="7" fill="#e9edf6" />
      </svg>
      <div className="absolute inset-x-0 bottom-1 text-center">
        <div className="font-display text-[42px] font-bold leading-none" style={{ color }}>
          {((probability || 0) * 100).toFixed(1)}%
        </div>
        <div className="mt-1 font-mono text-[10px] uppercase tracking-[.16em] text-dim">probability of default</div>
      </div>
    </div>
  );
}

function ResultPanel({ result, error }) {
  if (error) {
    return (
      <section className="panel flex min-h-[430px] items-center">
        <div className="w-full rounded-lg border border-bad/30 bg-bad/10 p-4 text-sm text-red-100">
          <div className="font-display text-base font-semibold">{error.title}</div>
          <ul className="mt-3 list-disc space-y-1 pl-5 text-red-200">
            {error.points.map((point) => <li key={point}>{point}</li>)}
          </ul>
        </div>
      </section>
    );
  }

  if (!result) {
    return (
      <section className="panel flex min-h-[430px] items-center justify-center text-center">
        <div className="max-w-sm text-muted">
          <Activity className="mx-auto mb-4 h-9 w-9 text-dim" />
          <p className="font-medium text-slate-200">No assessment selected.</p>
          <p className="mt-2 text-sm text-dim">Run an assessment, load the sample result, or select a saved prediction from history.</p>
        </div>
      </section>
    );
  }

  const reasons = [...(result.top_reasons || [])].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution));
  const maxContribution = Math.max(...reasons.map((reason) => Math.abs(reason.contribution)), 1e-9);

  return (
    <section className="panel min-h-[430px]">
      <div className="grid items-center gap-6 md:grid-cols-[auto_1fr]">
        <Gauge probability={result.default_probability} band={result.risk_band} />
        <div className="space-y-4">
          <span className={`inline-flex items-center gap-2 rounded-full border px-4 py-2 font-display text-sm font-semibold capitalize ${bandClasses(result.risk_band)}`}>
            <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: bandColor(result.risk_band) }} />
            {normalizeBand(result.risk_band)} risk
          </span>
          <div className="text-sm text-muted">
            Recommended action
            <div className="mt-1 font-display text-xl font-semibold capitalize text-slate-100">{result.decision}</div>
          </div>
          <div className="font-mono text-xs text-dim">
            decision threshold <span className="text-muted">{THRESHOLD.toFixed(3)}</span> | model <span className="text-muted">v{result.model_version || "-"}</span>
          </div>
        </div>
      </div>

      <div className="mt-7 border-t border-white/10 pt-5">
        <div className="mb-4 flex flex-wrap gap-4 font-mono text-[11px] text-muted">
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded bg-gradient-to-r from-warn to-bad" />increases risk</span>
          <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded bg-gradient-to-r from-good to-emerald-400" />decreases risk</span>
          <span className="text-dim">top {reasons.length} drivers</span>
        </div>
        <div className="space-y-3">
          {reasons.map((reason) => {
            const increases = reason.direction === "increases_risk" || (reason.contribution > 0 && reason.direction !== "decreases_risk");
            const width = `${(Math.abs(reason.contribution) / maxContribution) * 48}%`;
            return (
              <div key={`${reason.feature}-${reason.contribution}`}>
                <div className="mb-1 flex items-baseline justify-between gap-3">
                  <div className="text-sm font-medium text-slate-100">{prettyFeature(reason.feature)}</div>
                  <div className="whitespace-nowrap font-mono text-[11px] text-dim">val {formatValue(reason.feature_value)} | {increases ? "+" : "-"}{Math.abs(reason.contribution).toFixed(3)}</div>
                </div>
                <div className="relative h-3 overflow-hidden rounded-full bg-white/[.05]">
                  <span className="absolute inset-y-[-2px] left-1/2 w-px bg-white/20" />
                  <span
                    className={`absolute inset-y-0 rounded-full ${increases ? "left-1/2 bg-gradient-to-r from-warn to-bad" : "right-1/2 bg-gradient-to-l from-good to-emerald-400"}`}
                    style={{ width }}
                  />
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function HistoryPanel({ records, activeId, onSelect, onClear, onDelete, onSync, syncing }) {
  const stats = useMemo(() => {
    const count = records.length;
    const avg = count ? records.reduce((sum, record) => sum + Number(record.data.default_probability || 0), 0) / count : 0;
    const bands = { low: 0, medium: 0, high: 0 };
    records.forEach((record) => {
      const band = normalizeBand(record.data.risk_band);
      if (bands[band] !== undefined) bands[band] += 1;
    });
    return { count, avg, bands };
  }, [records]);

  const topDriver = (record) => {
    const reasons = record.data.top_reasons || [];
    if (!reasons.length) return "-";
    return prettyFeature([...reasons].sort((a, b) => Math.abs(b.contribution) - Math.abs(a.contribution))[0].feature);
  };

  return (
    <section className="panel mt-6">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="section-title">Assessment History</h2>
          <p className="mt-1 font-mono text-[11px] text-dim">saved locally and synced from `/history`</p>
        </div>
        <div className="flex gap-2">
          <button className="btn-secondary" onClick={onSync} disabled={syncing}>
            <RefreshCw className={`h-4 w-4 ${syncing ? "animate-spin" : ""}`} />
            {syncing ? "Syncing" : "Sync server log"}
          </button>
          <button className="btn-icon" onClick={onClear} title="Clear history">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div className="grid gap-4 lg:grid-cols-[280px_1fr]">
        <div className="space-y-3">
          <div className="grid grid-cols-2 gap-3">
            <div className="mini-stat"><div>{stats.count}</div><span>assessments</span></div>
            <div className="mini-stat"><div>{stats.count ? `${(stats.avg * 100).toFixed(1)}%` : "-"}</div><span>avg risk</span></div>
          </div>
          <div className="rounded-lg border border-white/10 bg-ink p-4">
            <div className="mb-3 h-3 overflow-hidden rounded-full bg-white/[.05]">
              {["low", "medium", "high"].map((band) => (
                <span key={band} className="inline-block h-full" style={{ width: `${(stats.bands[band] / Math.max(stats.count, 1)) * 100}%`, backgroundColor: bandColor(band) }} />
              ))}
            </div>
            <div className="flex gap-4 font-mono text-[11px] text-muted">
              <span>low {stats.bands.low}</span>
              <span>med {stats.bands.medium}</span>
              <span>high {stats.bands.high}</span>
            </div>
          </div>
        </div>

        <div className="max-h-[360px] overflow-auto rounded-lg border border-white/10">
          {!records.length ? (
            <div className="py-12 text-center text-sm text-dim">No assessments yet. Run a prediction or sync the server log.</div>
          ) : (
            <table className="w-full border-collapse text-left text-sm">
              <thead className="sticky top-0 bg-panel2 font-mono text-[10px] uppercase tracking-[.12em] text-dim">
                <tr>
                  <th className="px-4 py-3 font-medium">Time</th>
                  <th className="px-4 py-3 font-medium">Prob.</th>
                  <th className="px-4 py-3 font-medium">Band</th>
                  <th className="px-4 py-3 font-medium">Action</th>
                  <th className="px-4 py-3 font-medium">Top driver</th>
                  <th className="px-4 py-3" />
                </tr>
              </thead>
              <tbody>
                {records.map((record) => (
                  <tr
                    key={record.id}
                    className={`cursor-pointer border-t border-white/10 transition hover:bg-indigo/10 ${activeId === record.id ? "bg-indigo/10 shadow-[inset_3px_0_0_#7c8cff]" : ""}`}
                    onClick={() => onSelect(record.id)}
                  >
                    <td className="whitespace-nowrap px-4 py-3 font-mono text-xs text-muted">{new Date(record.ts).toLocaleTimeString()}</td>
                    <td className="px-4 py-3 font-mono font-bold" style={{ color: bandColor(record.data.risk_band) }}>{(record.data.default_probability * 100).toFixed(1)}%</td>
                    <td className="px-4 py-3"><span className={`rounded-full border px-2.5 py-1 font-display text-xs font-semibold capitalize ${bandClasses(record.data.risk_band)}`}>{normalizeBand(record.data.risk_band)}</span></td>
                    <td className="px-4 py-3 capitalize">{record.data.decision}</td>
                    <td className="px-4 py-3 text-muted">{topDriver(record)}</td>
                    <td className="px-4 py-3">
                      <button className="rounded p-1 text-dim hover:bg-bad/10 hover:text-bad" onClick={(event) => { event.stopPropagation(); onDelete(record.id); }} title="Delete row">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </section>
  );
}

function Metric({ label, value }) {
  return (
    <div className="rounded-lg border border-white/10 bg-ink p-4">
      <div className="font-mono text-[10px] uppercase tracking-[.12em] text-dim">{label}</div>
      <div className="mt-2 font-display text-xl font-bold text-slate-100">{value}</div>
    </div>
  );
}

function ModelInfoPanel({ modelInfo }) {
  const test = modelInfo?.test_metrics || {};
  const validation = modelInfo?.validation_metrics?.lightgbm || {};

  return (
    <section className="panel mt-6">
      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="section-title">Model Info</h2>
          <p className="mt-1 font-mono text-[11px] text-dim">live API metadata and Kaggle evaluation</p>
        </div>
        <span className="rounded-full border border-indigo/30 bg-indigo/10 px-3 py-1 font-mono text-[11px] text-indigo">
          {modelInfo ? `${modelInfo.model_name || "model"} v${modelInfo.model_version || "?"}` : "click Check to load"}
        </span>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Metric label="Feature Count" value={modelInfo?.feature_count ?? "-"} />
        <Metric label="Test ROC AUC" value={test.roc_auc ? test.roc_auc.toFixed(5) : "-"} />
        <Metric label="Test PR AUC" value={test.pr_auc ? test.pr_auc.toFixed(5) : "-"} />
        <Metric label="Threshold" value={test.threshold ? test.threshold.toFixed(5) : THRESHOLD.toFixed(5)} />
      </div>

      <div className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        <Metric label="Validation ROC AUC" value={validation.roc_auc ? validation.roc_auc.toFixed(5) : "-"} />
        <Metric label="Validation PR AUC" value={validation.pr_auc ? validation.pr_auc.toFixed(5) : "-"} />
        <Metric label="Kaggle Public" value={KAGGLE_SCORES.public.toFixed(5)} />
        <Metric label="Kaggle Private" value={KAGGLE_SCORES.private.toFixed(5)} />
      </div>

      <div className="mt-4 rounded-lg border border-white/10 bg-ink p-4 text-sm leading-6 text-muted">
        <span className="font-display font-semibold text-slate-100">Why this score:</span>{" "}
        The model reaches a Kaggle ROC AUC near 0.78 because the engineered application, bureau, previous-loan,
        POS, installment, and credit-card features give LightGBM useful ranking signals for default risk. The score
        is not much higher because Home Credit default prediction is highly imbalanced, many customers have incomplete
        or noisy credit histories, and some repayment outcomes depend on behavior that is not fully captured in the
        tabular data. The close public and private scores suggest the model generalizes consistently rather than only
        fitting the public leaderboard split.
      </div>
    </section>
  );
}

export default function App() {
  const [apiUrl, setApiUrl] = useState(DEFAULT_API);
  const [payload, setPayload] = useState("");
  const [token, setToken] = useState("");
  const [status, setStatus] = useState({ tone: "idle", text: "Not connected", meta: "" });
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);
  const [records, setRecords] = useState([]);
  const [activeId, setActiveId] = useState(null);
  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [modelInfo, setModelInfo] = useState(null);

  useEffect(() => {
    try {
      const saved = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      setRecords(saved);
      if (saved[0]) {
        setActiveId(saved[0].id);
        setResult(saved[0].data);
      }
    } catch {
      localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  useEffect(() => {
    refreshDashboard({ silent: true });
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(records.slice(0, HISTORY_LIMIT)));
  }, [records]);

  const baseUrl = () => apiUrl.replace(/\/+$/, "");

  async function getToken(force = false) {
    if (token && !force) return token;
    const response = await fetch(`${baseUrl()}/token`, { method: "POST" });
    if (!response.ok) throw new Error(`token request failed (${response.status})`);
    const data = await response.json();
    if (!data.access_token) throw new Error("no access_token returned");
    setToken(data.access_token);
    return data.access_token;
  }

  async function authedFetch(path, options = {}) {
    let jwt = await getToken();
    const call = (nextToken) => fetch(`${baseUrl()}${path}`, {
      ...options,
      headers: { ...(options.headers || {}), Authorization: `Bearer ${nextToken}` },
    });
    let response = await call(jwt);
    if (response.status === 401) {
      jwt = await getToken(true);
      response = await call(jwt);
    }
    return response;
  }

  async function loadModelInfo(metaFallback = "") {
    const info = await authedFetch("/model-info");
    if (!info.ok) return metaFallback;

    const model = await info.json();
    setModelInfo(model);
    return `${model.model_name || "model"} v${model.model_version || "?"} | ${model.feature_count ?? "?"} features`;
  }

  function addRecord(data, source) {
    const record = { id: crypto.randomUUID(), ts: Date.now(), source, data };
      setRecords((current) => [record, ...current].slice(0, HISTORY_LIMIT));
    setActiveId(record.id);
    setResult(data);
    setError(null);
  }

  async function checkConnection() {
    await refreshDashboard({ silent: false });
  }

  async function refreshDashboard({ silent = false } = {}) {
    setStatus({ tone: "idle", text: "Connecting...", meta: "" });
    setToken("");
    if (!silent) setError(null);
    try {
      const health = await fetch(`${baseUrl()}/health`);
      if (!health.ok) throw new Error(`health ${health.status}`);
      await getToken(true);
      const meta = await loadModelInfo();
      setStatus({ tone: "ok", text: "Connected | authenticated", meta });
      await syncServerLog({ silent: true, meta });
      return true;
    } catch (err) {
      setStatus({ tone: "bad", text: "Unreachable", meta: "" });
      if (!silent) {
        setError({
          title: "Could not reach or authenticate with the API.",
          points: [
            "Confirm /health and POST /token work on the API domain.",
            "CORS must allow this dashboard origin and the Authorization header.",
            `Raw error: ${err.message || err}`,
          ],
        });
      }
      return false;
    }
  }

  async function runPrediction() {
    let body;
    try {
      body = JSON.parse(payload);
    } catch {
      setError({ title: "That payload is not valid JSON.", points: ["Paste sample_request.json or upload a JSON file."] });
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const response = await authedFetch("/predict", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (response.status === 422) {
        const detail = await response.json();
        throw new Error(JSON.stringify(detail.detail || detail));
      }
      if (!response.ok) throw new Error(`status ${response.status}`);
      addRecord(await response.json(), "api");
      setStatus((current) => ({ ...current, tone: "ok", text: "Connected | authenticated" }));
      window.setTimeout(() => syncServerLog({ silent: true }), 900);
    } catch (err) {
      setError({ title: "Prediction request failed.", points: ["Run Check connection to isolate auth or CORS.", `Raw error: ${err.message || err}`] });
    } finally {
      setBusy(false);
    }
  }

  async function syncServerLog(options = {}) {
    const { silent = false, meta = status.meta } = options;
    if (!silent) setSyncing(true);
    setError(null);
    try {
      const response = await authedFetch(`/history?limit=${HISTORY_LIMIT}`);
      if (!response.ok) throw new Error(`status ${response.status}`);
      const raw = await response.json();
      const list = Array.isArray(raw) ? raw : raw.items || raw.history || [];
      const serverRecords = list
        .map((item, index) => normalizeHistoryItem(item, index))
        .filter(Boolean);
      setRecords((current) => {
        const merged = mergeHistory(current, serverRecords);
        if (serverRecords[0]) {
          setActiveId(serverRecords[0].id);
          setResult(serverRecords[0].data);
        }
        return merged;
      });
      setStatus({ tone: "ok", text: `Loaded ${serverRecords.length} from MongoDB`, meta });
    } catch (err) {
      if (!silent) {
        setError({ title: "Could not load the server log.", points: ["Check /history auth, CORS, and MongoDB connection on EC2.", `Raw error: ${err.message || err}`] });
      }
    } finally {
      if (!silent) setSyncing(false);
    }
  }

  function selectRecord(id) {
    const record = records.find((item) => item.id === id);
    if (!record) return;
    setActiveId(id);
    setResult(record.data);
    setError(null);
  }

  function deleteRecord(id) {
    setRecords((current) => current.filter((item) => item.id !== id));
    if (activeId === id) {
      setActiveId(null);
      setResult(null);
    }
  }

  function clearHistory() {
    setRecords([]);
    setActiveId(null);
    setResult(null);
  }

  function uploadFile(event) {
    const file = event.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => setPayload(String(reader.result || ""));
    reader.readAsText(file);
    event.target.value = "";
  }

  const dotClass = status.tone === "ok" ? "bg-good shadow-[0_0_14px_rgba(52,216,160,.75)]" : status.tone === "bad" ? "bg-bad shadow-[0_0_14px_rgba(240,87,63,.6)]" : "bg-dim";

  return (
    <main className="min-h-screen px-5 py-7 text-slate-100 sm:px-8">
      <div className="mx-auto max-w-6xl">
        <header className="flex flex-wrap items-center gap-4 border-b border-white/10 pb-5">
          <div className="mr-auto">
            <div className="flex flex-wrap items-baseline gap-3">
              <h1 className="font-display text-2xl font-bold">Default Risk Assessor</h1>
              <span className="font-mono text-[11px] uppercase tracking-[.18em] text-dim">SHAP explained | LightGBM</span>
            </div>
          </div>
          <div className="flex items-center gap-2 font-mono text-xs text-muted">
            <span className={`h-2 w-2 rounded-full ${dotClass}`} />
            {status.text}
          </div>
          {status.meta && <div className="font-mono text-xs text-muted">{status.meta}</div>}
        </header>

        <div className="mt-6 grid gap-6 lg:grid-cols-[380px_1fr]">
          <section className="panel">
            <div className="mb-4 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-indigo" />
              <h2 className="section-title">Applicant</h2>
            </div>
            <label className="field-label" htmlFor="apiUrl">API endpoint</label>
            <input id="apiUrl" className="input" value={apiUrl} onChange={(event) => setApiUrl(event.target.value)} spellCheck="false" />

            <label className="field-label mt-5" htmlFor="payload">Request payload JSON</label>
            <textarea
              id="payload"
              className="textarea"
              value={payload}
              onChange={(event) => setPayload(event.target.value)}
              placeholder='Paste the contents of sample_request.json here, or use "Upload JSON".'
              spellCheck="false"
            />

            <div className="mt-3 flex flex-wrap items-center gap-3 font-mono text-[11px] text-dim">
              <label className="inline-flex cursor-pointer items-center gap-2 text-indigo hover:text-slate-100">
                <Upload className="h-3.5 w-3.5" />
                Upload JSON file
                <input type="file" accept="application/json,.json" className="hidden" onChange={uploadFile} />
              </label>
              <button className="inline-flex items-center gap-2 text-indigo hover:text-slate-100" onClick={() => addRecord(SAMPLE_RESULT, "sample")}>
                <FileJson className="h-3.5 w-3.5" />
                Load sample result
              </button>
            </div>

            <div className="mt-5 flex flex-wrap gap-3">
              <button className="btn-primary flex-1" onClick={runPrediction} disabled={busy}>
                <Activity className="h-4 w-4" />
                {busy ? "Assessing..." : "Assess risk"}
              </button>
              <button className="btn-secondary" onClick={checkConnection}>
                <Server className="h-4 w-4" />
                Check
              </button>
            </div>
          </section>

          <ResultPanel result={result} error={error} />
        </div>

        <HistoryPanel
          records={records}
          activeId={activeId}
          onSelect={selectRecord}
          onClear={clearHistory}
          onDelete={deleteRecord}
          onSync={syncServerLog}
          syncing={syncing}
        />

        <ModelInfoPanel modelInfo={modelInfo} />

        <footer className="mt-7 flex flex-wrap gap-5 font-mono text-[11px] text-dim">
          <span className="inline-flex items-center gap-2"><CheckCircle2 className="h-3.5 w-3.5" />Bearer JWT on /predict and /history</span>
          <span className="inline-flex items-center gap-2"><Database className="h-3.5 w-3.5" />MongoDB Atlas prediction log</span>
          <span className="inline-flex items-center gap-2"><History className="h-3.5 w-3.5" />Local history retained in browser storage</span>
        </footer>
        <div className="mt-5 text-center font-display text-sm font-semibold text-muted">
          Made by <a href="https://github.com/Mohitkumar2007" target="_blank" rel="noopener noreferrer">Mohit Kumar</a>
        </div>
      </div>
    </main>
  );
}
