"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import ApiKeyPanel, { useHasStoredApiKey } from "@/components/ApiKeyPanel";
import ModeToggle from "@/components/ModeToggle";
import OptionEditor from "@/components/OptionEditor";
import RoutingHistoryTable from "@/components/RoutingHistoryTable";
import RoutingResult from "@/components/RoutingResult";
import ThemeToggle from "@/components/ThemeToggle";
import ThresholdSlider from "@/components/ThresholdSlider";
import { apiKeyHeaders } from "@/lib/apiKeyStorage";
import { DEFAULT_CONFIDENCE_THRESHOLD } from "@/lib/jevRouter";
import { clearLabState, historyToJson, loadLabState, MAX_HISTORY, saveLabState } from "@/lib/labStorage";
import { MAX_CONTEXT_CHARS, MAX_INPUT_CHARS } from "@/lib/limits";
import { defaultOptions, requiredOptionId } from "@/lib/routerConfigs";
import type { RouteApiError, RouteApiRequest, RouteApiResponse, RouteOption, RouterMode, RoutingLogEntry } from "@/types/router";

const SAMPLE_INPUTS: Record<RouterMode, string[]> = {
  model: [
    "What is the capital of Peru?",
    "Fix this TypeScript bug: `const x: number = 'a'` fails to compile in my Next.js API route.",
    "Explain step by step why my retry-with-backoff plan is optimal, and analyze the trade-offs versus a circuit breaker.",
    "hmm",
  ],
  tool: [
    "What's the latest news on the election today?",
    "What is 1234 * 56?",
    "Do I have any meetings tomorrow morning?",
    "Write me a short poem about autumn.",
    "Handle it",
  ],
};

type LiveStatus = "unknown" | "live" | "live-user-key" | "demo";

type RunState = {
  id: number;
  mode: RouterMode;
  userInput: string;
  context?: string;
  options: RouteOption[];
  threshold: number;
  result: RouteApiResponse["result"];
};

function cloneOptions(mode: RouterMode): RouteOption[] {
  return defaultOptions[mode].map((o) => ({ ...o, metadata: o.metadata ? { ...o.metadata } : undefined }));
}

function defaultOptionsByMode(): Record<RouterMode, RouteOption[]> {
  return { model: cloneOptions("model"), tool: cloneOptions("tool") };
}

/** Compared against the live state so an untouched lab leaves nothing behind in storage. */
const DEFAULT_OPTIONS_JSON = JSON.stringify(defaultOptionsByMode());

/** Read once at mount. This component is rendered client-only (see LabLoader), so storage is safe to touch here. */
const restored = typeof window !== "undefined" ? loadLabState() : null;

export default function RouterLab() {
  const [mode, setMode] = useState<RouterMode>("tool");
  const [input, setInput] = useState<string>(SAMPLE_INPUTS.tool[0]);
  const [context, setContext] = useState("");
  const [showContext, setShowContext] = useState(false);
  const [optionsByMode, setOptionsByMode] = useState<Record<RouterMode, RouteOption[]>>(() => restored?.optionsByMode ?? defaultOptionsByMode());
  const [threshold, setThreshold] = useState<number>(restored?.threshold ?? DEFAULT_CONFIDENCE_THRESHOLD);
  /** null = still checking. */
  const [serverHasKey, setServerHasKey] = useState<boolean | null>(null);
  const userHasKey = useHasStoredApiKey();
  const liveStatus: LiveStatus = serverHasKey === null ? "unknown" : userHasKey ? "live-user-key" : serverHasKey ? "live" : "demo";
  const [keyDialogOpen, setKeyDialogOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [history, setHistory] = useState<RoutingLogEntry[]>(restored?.history ?? []);
  const runCounter = useRef(0);
  /** Bumped on every run, clear and reset. A response whose sequence number is stale is dropped. */
  const requestSeq = useRef(0);
  const inFlight = useRef<AbortController | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const options = optionsByMode[mode];
  const requiredId = requiredOptionId(mode);
  const hasRequired = options.some((o) => o.id === requiredId);
  const ids = options.map((o) => o.id);
  const hasDuplicateIds = new Set(ids).size !== ids.length;
  const hasEmptyId = ids.some((id) => id.trim().length === 0);
  const canRun = !loading && input.trim().length > 0 && options.length >= 2 && hasRequired && !hasDuplicateIds && !hasEmptyId;

  useEffect(() => {
    let cancelled = false;
    fetch("/api/route")
      .then((r) => r.json())
      .then((body: { live?: boolean }) => {
        if (!cancelled) setServerHasKey(Boolean(body.live));
      })
      .catch(() => {
        if (!cancelled) setServerHasKey(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  // Persist edits so a refresh doesn't lose them. Writes to an external system, so an effect is the right tool.
  // When everything is back at its defaults the stored blob is removed rather than rewritten, so
  // "Reset everything" (and a manual return to defaults) really does clear the browser's copy.
  useEffect(() => {
    const isDefault = history.length === 0 && threshold === DEFAULT_CONFIDENCE_THRESHOLD && JSON.stringify(optionsByMode) === DEFAULT_OPTIONS_JSON;
    if (isDefault) clearLabState();
    else saveLabState({ optionsByMode, threshold, history });
  }, [optionsByMode, threshold, history]);

  const setOptions = useCallback((next: RouteOption[]) => setOptionsByMode((prev) => ({ ...prev, [mode]: next })), [mode]);

  /** Forget any in-flight request so a slow response can't land after a clear or reset and undo it. */
  function discardInFlight() {
    requestSeq.current += 1;
    inFlight.current?.abort();
    inFlight.current = null;
    setLoading(false);
  }

  function clearHistory() {
    discardInFlight();
    setHistory([]);
  }

  function resetEverything() {
    discardInFlight();
    clearLabState();
    setOptionsByMode(defaultOptionsByMode());
    setThreshold(DEFAULT_CONFIDENCE_THRESHOLD);
    setHistory([]);
    setRun(null);
    setError(null);
  }

  function exportHistory() {
    const blob = new Blob([historyToJson(history)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `jev-routing-log-${new Date().toISOString().slice(0, 19).replace(/[:T]/g, "-")}.json`;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function changeMode(next: RouterMode) {
    if (next === mode) return;
    setMode(next);
    setError(null);
    if (!input.trim() || SAMPLE_INPUTS[mode].includes(input)) setInput(SAMPLE_INPUTS[next][0]);
  }

  /** Load a logged decision's request back into the panel: mode, input AND context, so re-running it reproduces it. */
  function recall(entry: RoutingLogEntry) {
    setMode(entry.mode);
    setInput(entry.userInput);
    setContext(entry.context ?? "");
    if (entry.context) setShowContext(true);
    setError(null);
    textareaRef.current?.scrollIntoView({ block: "center", behavior: "smooth" });
    textareaRef.current?.focus();
  }

  async function runRouting() {
    if (!canRun) return;
    setLoading(true);
    setError(null);
    const trimmedContext = context.trim() || undefined;
    const snapshot = { mode, userInput: input, context: trimmedContext, options: options.map((o) => ({ ...o })), threshold };
    const body: RouteApiRequest = { mode, userInput: input, context: trimmedContext, options: snapshot.options, confidenceThreshold: threshold };

    requestSeq.current += 1;
    const seq = requestSeq.current;
    const controller = new AbortController();
    inFlight.current?.abort();
    inFlight.current = controller;
    const isCurrent = () => seq === requestSeq.current;

    try {
      const response = await fetch("/api/route", {
        method: "POST",
        // apiKeyHeaders() adds x-typesafe-api-key if the user saved a key in this browser.
        headers: { "Content-Type": "application/json", ...apiKeyHeaders() },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      const payload = (await response.json()) as RouteApiResponse | RouteApiError;
      if (!isCurrent()) return;
      if (!response.ok || "error" in payload) {
        const err = payload as RouteApiError;
        throw new Error(err.error ?? `Request failed with HTTP ${response.status}.`);
      }
      runCounter.current += 1;
      setRun({ id: runCounter.current, ...snapshot, result: payload.result });
      setHistory((prev) => [payload.logEntry, ...prev].slice(0, MAX_HISTORY));
    } catch (e) {
      if (!isCurrent()) return; // aborted by a clear or reset; nothing to report
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      if (isCurrent()) {
        inFlight.current = null;
        setLoading(false);
      }
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 pb-10 pt-5 sm:px-6">
      {/* Header */}
      <header className="mb-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          <h1 className="text-[22px] font-semibold tracking-tight">Jev Router Lab</h1>
          <p className="mt-1 max-w-xl text-sm leading-relaxed text-ink-2">
            Jev picks the best option from a fixed list and says how sure it is. It never calls a tool and never generates text.{" "}
            <span className="font-medium text-ink">Jev decides, your code executes.</span>
          </p>
        </div>
        <div className="flex items-center gap-2">
          <StatusPill status={liveStatus} onClick={() => setKeyDialogOpen(true)} />
          <ThemeToggle />
        </div>
      </header>

      {liveStatus === "demo" && (
        <div role="status" className="enter mb-5 flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-lg border border-warn/40 bg-warn/[0.07] px-3 py-2 text-sm">
          <span className="text-ink-2">
            <span className="font-medium text-warn">Demo mode — simulated routing, not real Jev calls.</span> No API key is configured, so a local keyword
            matcher stands in for Jev.
          </span>
          <button type="button" className="btn h-7 px-2.5 text-xs" onClick={() => setKeyDialogOpen(true)}>
            Add your key
          </button>
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,11fr)_minmax(0,10fr)] lg:items-start">
        {/* Left: request + options */}
        <div className="space-y-5">
          <section className="panel">
            <div className="panel-title">
              <span>
                <span className="step">1</span>Request
              </span>
              <ModeToggle mode={mode} onChange={changeMode} disabled={loading} />
            </div>
            <div className="space-y-4 p-4">
              <div>
                <textarea
                  ref={textareaRef}
                  className="field min-h-[5.5rem] resize-y leading-relaxed"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={mode === "model" ? "What should a model handle?" : "What does the user want?"}
                  aria-label="User input"
                  maxLength={MAX_INPUT_CHARS}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      runRouting();
                    }
                  }}
                />
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {SAMPLE_INPUTS[mode].map((sample) => (
                    <button key={sample} type="button" className="chip" onClick={() => setInput(sample)} disabled={loading} title={sample}>
                      <span className="truncate">{sample.length > 36 ? `${sample.slice(0, 36)}…` : sample}</span>
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 text-xs text-muted transition-colors duration-150 hover:text-ink"
                  onClick={() => setShowContext((s) => !s)}
                  aria-expanded={showContext}
                  aria-controls="conversation-context"
                >
                  <span aria-hidden className="inline-block transition-transform duration-150" style={{ transform: showContext ? "rotate(90deg)" : "rotate(0deg)" }}>
                    ▸
                  </span>
                  Conversation context
                  {!showContext && context.trim() && <span className="rounded-full bg-teal/15 px-1.5 py-px text-[10px] font-medium text-teal">set</span>}
                  <span className="text-muted/70">· optional</span>
                </button>
                {showContext && (
                  <div className="enter mt-2">
                    <textarea
                      id="conversation-context"
                      className="field min-h-[4.5rem] resize-y font-mono text-xs leading-relaxed"
                      value={context}
                      onChange={(e) => setContext(e.target.value)}
                      placeholder={"Recent turns Jev should see, e.g.\nuser: I'm planning a trip to Lisbon next week\nassistant: Nice! Anything you need help with?"}
                      aria-label="Conversation context"
                      maxLength={MAX_CONTEXT_CHARS}
                    />
                    <p className="mt-1 text-[11px] text-muted">
                      Appended to the request as extra state. Try &quot;Is it free?&quot; with and without context to see the pick change.
                      {context.length > MAX_CONTEXT_CHARS * 0.9 && (
                        <span className="tnum"> {context.length.toLocaleString()} / {MAX_CONTEXT_CHARS.toLocaleString()} characters.</span>
                      )}
                    </p>
                  </div>
                )}
              </div>

              <ThresholdSlider value={threshold} onChange={setThreshold} />

              <div className="flex flex-wrap items-center gap-3">
                <button type="button" className="btn btn-primary min-w-[11.5rem]" onClick={runRouting} disabled={!canRun} aria-busy={loading}>
                  {loading ? (
                    <>
                      <Spinner /> Routing
                    </>
                  ) : (
                    "Run routing decision"
                  )}
                </button>
                <kbd className="hidden rounded border border-line bg-panel-2 px-1.5 py-0.5 font-mono text-[11px] text-muted sm:inline">⌘ ↵</kbd>
                {!hasRequired && (
                  <span className="text-xs text-bad">
                    Options must include <code className="font-mono">{requiredId}</code>.
                  </span>
                )}
              </div>

              {error && (
                <p role="alert" className="enter rounded-lg border border-bad/40 bg-bad/[0.07] px-3 py-2 text-sm text-bad">
                  {error}
                </p>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">
              <span>
                <span className="step">2</span>Options · {mode === "model" ? "models" : "tools"}
              </span>
              <span className="panel-hint">Jev may only return one of these ids</span>
            </div>
            <div className="p-4">
              <OptionEditor options={options} requiredId={requiredId} onChange={setOptions} onReset={() => setOptions(cloneOptions(mode))} disabled={loading} />
            </div>
          </section>
        </div>

        {/* Right: decision, sticky on desktop so it stays in view while editing options */}
        <div className="space-y-5 lg:sticky lg:top-5">
          <section className="panel">
            <div className="panel-title">
              <span>
                <span className="step">3</span>Decision
              </span>
              {run && (
                <span className="panel-hint">
                  {run.mode === "model" ? "model router" : "tool router"} ·{" "}
                  <span className={run.result.source === "jev" ? "text-teal" : ""}>{run.result.source === "jev" ? "live Jev" : "simulated"}</span>
                </span>
              )}
            </div>
            <div className="p-4">
              {run ? (
                <div key={run.id} className={loading ? "stale" : ""}>
                  <RoutingResult mode={run.mode} userInput={run.userInput} context={run.context} options={run.options} result={run.result} threshold={run.threshold} />
                </div>
              ) : (
                <EmptyDecision loading={loading} />
              )}
            </div>
          </section>

          <details className="panel group">
            <summary className="panel-title cursor-pointer select-none list-none [&::-webkit-details-marker]:hidden">
              <span>How the boundary works</span>
              <span aria-hidden className="inline-block text-sm transition-transform duration-150 group-open:rotate-90">
                ▸
              </span>
            </summary>
            <ol className="list-decimal space-y-1.5 px-4 py-3 pl-8 text-sm leading-relaxed text-ink-2">
              <li>
                The app posts the input and the option list to <code className="font-mono text-xs">/api/route</code>.
              </li>
              <li>
                <code className="font-mono text-xs">createRouter</code> checks the fallback option is present, then asks Jev one{" "}
                <code className="font-mono text-xs">choice</code> question whose options are exactly the option ids.
              </li>
              <li>Jev returns a pick, a probability per option, and a confidence. Anything outside the list is rejected.</li>
              <li>Below the threshold the fallback policy runs: safe default (model) or ask the user (tool). Every decision is logged.</li>
              <li>
                The library returns an option id. <span className="text-ink">Executing it is your code&apos;s job.</span> This demo only prints what it would do.
              </li>
            </ol>
          </details>
        </div>
      </div>

      <section className="panel mt-5">
        <div className="panel-title">
          <span>
            <span className="step">4</span>Routing history
          </span>
          {history.length > 0 && <span className="panel-hint">{history.length} logged</span>}
        </div>
        <RoutingHistoryTable entries={history} onClear={clearHistory} onExport={exportHistory} onRecall={recall} />
      </section>

      <footer className="mt-8 flex flex-wrap items-center justify-center gap-x-3 gap-y-1 text-center text-xs text-muted">
        <span>
          Built on TypeSafe&apos;s Jev. Unofficial demo. Library in <code className="font-mono">lib/</code>, UI in <code className="font-mono">components/</code>.
        </span>
        <span aria-hidden>·</span>
        <span>Options, threshold and history are saved in this browser.</span>
        <button type="button" className="underline-offset-2 hover:text-ink hover:underline" onClick={resetEverything}>
          Reset everything
        </button>
      </footer>

      <ApiKeyPanel open={keyDialogOpen} onClose={() => setKeyDialogOpen(false)} serverHasKey={serverHasKey === true} />
    </div>
  );
}

function Spinner() {
  return (
    <svg viewBox="0 0 16 16" className="h-3.5 w-3.5 animate-spin" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden>
      <path d="M8 2a6 6 0 1 1-6 6" />
    </svg>
  );
}

function EmptyDecision({ loading }: { loading: boolean }) {
  return (
    <div className="py-8 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-panel-2 text-muted" aria-hidden>
        {loading ? (
          <Spinner />
        ) : (
          <svg viewBox="0 0 16 16" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round">
            <path d="M2 8h4l1.5-3 3 6L12 8h2" />
          </svg>
        )}
      </div>
      <p className="text-sm text-ink-2">{loading ? "Asking Jev which option fits…" : "No decision yet."}</p>
      <p className="mx-auto mt-1 max-w-xs text-xs leading-relaxed text-muted">
        {loading ? "One choice question, one round trip." : "Run a request to see the pick, its confidence, every option's score, and what your code would execute."}
      </p>
    </div>
  );
}

function StatusPill({ status, onClick }: { status: LiveStatus; onClick: () => void }) {
  const base =
    "inline-flex h-8 items-center gap-1.5 rounded-full border px-3 text-xs font-medium transition-[transform,border-color,background-color] duration-[160ms] ease-[cubic-bezier(0.2,0,0,1)] active:scale-[0.97]";
  if (status === "unknown") {
    return (
      <span className={`${base} border-line text-muted`}>
        <span className="h-1.5 w-1.5 rounded-full bg-line-strong" /> Checking…
      </span>
    );
  }
  const live = status !== "demo";
  const label = status === "live-user-key" ? "Live · your key" : status === "live" ? "Live · server key" : "Demo mode";
  return (
    <button
      type="button"
      onClick={onClick}
      title="Manage API key"
      className={`${base} ${live ? "border-teal/40 bg-teal/10 text-teal hover:border-teal/70" : "border-warn/40 bg-warn/10 text-warn hover:border-warn/70"}`}
    >
      <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-teal" : "bg-warn"}`} />
      {label}
      <svg viewBox="0 0 16 16" className="ml-0.5 h-3 w-3 opacity-70" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
        <circle cx="6" cy="8" r="3" />
        <path d="M9 8h5M12 8v2" />
      </svg>
    </button>
  );
}
