"use client";

import { useCallback, useEffect, useState } from "react";
import ApiKeyPanel, { useHasStoredApiKey } from "@/components/ApiKeyPanel";
import ModeToggle from "@/components/ModeToggle";
import OptionEditor from "@/components/OptionEditor";
import RoutingHistoryTable from "@/components/RoutingHistoryTable";
import RoutingResult from "@/components/RoutingResult";
import ThresholdSlider from "@/components/ThresholdSlider";
import { apiKeyHeaders } from "@/lib/apiKeyStorage";
import { DEFAULT_CONFIDENCE_THRESHOLD } from "@/lib/jevRouter";
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
  mode: RouterMode;
  userInput: string;
  options: RouteOption[];
  threshold: number;
  result: RouteApiResponse["result"];
};

function cloneOptions(mode: RouterMode): RouteOption[] {
  return defaultOptions[mode].map((o) => ({ ...o, metadata: o.metadata ? { ...o.metadata } : undefined }));
}

export default function RouterLab() {
  const [mode, setMode] = useState<RouterMode>("tool");
  const [input, setInput] = useState<string>(SAMPLE_INPUTS.tool[0]);
  const [optionsByMode, setOptionsByMode] = useState<Record<RouterMode, RouteOption[]>>(() => ({
    model: cloneOptions("model"),
    tool: cloneOptions("tool"),
  }));
  const [threshold, setThreshold] = useState<number>(DEFAULT_CONFIDENCE_THRESHOLD);
  /** null = still checking. */
  const [serverHasKey, setServerHasKey] = useState<boolean | null>(null);
  const userHasKey = useHasStoredApiKey();
  // Derived, never stored: the user's browser key wins, then the server key, else demo.
  const liveStatus: LiveStatus = serverHasKey === null ? "unknown" : userHasKey ? "live-user-key" : serverHasKey ? "live" : "demo";
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [run, setRun] = useState<RunState | null>(null);
  const [history, setHistory] = useState<RoutingLogEntry[]>([]);

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

  const setOptions = useCallback(
    (next: RouteOption[]) => setOptionsByMode((prev) => ({ ...prev, [mode]: next })),
    [mode],
  );

  function changeMode(next: RouterMode) {
    setMode(next);
    setError(null);
    if (!input.trim() || SAMPLE_INPUTS[mode].includes(input)) setInput(SAMPLE_INPUTS[next][0]);
  }

  async function runRouting() {
    if (!canRun) return;
    setLoading(true);
    setError(null);
    const snapshot: Omit<RunState, "result"> = { mode, userInput: input, options: options.map((o) => ({ ...o })), threshold };
    const body: RouteApiRequest = { mode, userInput: input, options: snapshot.options, confidenceThreshold: threshold };

    try {
      const response = await fetch("/api/route", {
        method: "POST",
        // apiKeyHeaders() adds x-typesafe-api-key if the user saved a key in this browser.
        headers: { "Content-Type": "application/json", ...apiKeyHeaders() },
        body: JSON.stringify(body),
      });
      const payload = (await response.json()) as RouteApiResponse | RouteApiError;
      if (!response.ok || "error" in payload) {
        const err = payload as RouteApiError;
        throw new Error(err.error ?? `Request failed with HTTP ${response.status}.`);
      }
      setRun({ ...snapshot, result: payload.result });
      setHistory((prev) => [payload.logEntry, ...prev].slice(0, 200));
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto max-w-6xl px-4 py-6 sm:px-6">
      {/* Header */}
      <header className="mb-5 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Jev Router Lab</h1>
          <p className="mt-1 max-w-2xl text-sm text-ink-2">
            Jev picks the best option from a fixed list and reports how sure it is. It never calls a tool and never generates text.{" "}
            <span className="text-ink">Jev decides, your code executes.</span>
          </p>
        </div>
        <StatusBadge status={liveStatus} />
      </header>

      {liveStatus === "demo" && (
        <div role="status" className="mb-5 rounded-md border border-warn/50 bg-warn/10 px-3 py-2 text-sm text-ink-2">
          <span className="font-semibold text-warn">Demo mode — simulated routing, not real Jev calls.</span> No{" "}
          <code className="font-mono text-xs">TYPESAFE_API_KEY</code> is configured, so decisions come from a local keyword matcher. Add your own key in the{" "}
          <span className="text-ink">API key</span> panel below (stored in this browser, never displayed), or copy{" "}
          <code className="font-mono text-xs">.env.local.example</code> to <code className="font-mono text-xs">.env.local</code>.
        </div>
      )}

      <div className="grid gap-5 lg:grid-cols-[minmax(0,5fr)_minmax(0,6fr)]">
        {/* Left column: inputs */}
        <div className="space-y-5">
          <section className="panel">
            <div className="panel-title">
              <span>1 · Request</span>
              <ModeToggle mode={mode} onChange={changeMode} disabled={loading} />
            </div>
            <div className="space-y-3 p-4">
              <label className="block">
                <span className="mb-1 block text-sm text-ink-2">User input</span>
                <textarea
                  className="field min-h-[6rem] resize-y font-sans"
                  value={input}
                  onChange={(e) => setInput(e.target.value)}
                  placeholder={mode === "model" ? "What should the model handle?" : "What does the user want?"}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") runRouting();
                  }}
                />
              </label>
              <div className="flex flex-wrap gap-1.5">
                {SAMPLE_INPUTS[mode].map((sample) => (
                  <button
                    key={sample}
                    type="button"
                    className="rounded border border-line px-2 py-0.5 text-xs text-muted hover:border-line-strong hover:text-ink"
                    onClick={() => setInput(sample)}
                    disabled={loading}
                    title={sample}
                  >
                    {sample.length > 34 ? `${sample.slice(0, 34)}…` : sample}
                  </button>
                ))}
              </div>
              <ThresholdSlider value={threshold} onChange={setThreshold} />
              <div className="flex items-center gap-3 pt-1">
                <button type="button" className="btn btn-primary" onClick={runRouting} disabled={!canRun}>
                  {loading ? "Routing…" : "Run Routing Decision"}
                </button>
                <span className="text-xs text-muted">⌘/Ctrl + Enter</span>
              </div>
              {!hasRequired && (
                <p className="text-xs text-bad">
                  The option list must include <code className="font-mono">{requiredId}</code>. The router refuses to run without a fallback option.
                </p>
              )}
              {error && (
                <p role="alert" className="rounded-md border border-bad/50 bg-bad/10 px-3 py-2 text-sm text-bad">
                  {error}
                </p>
              )}
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">
              <span>2 · Options ({mode === "model" ? "models" : "tools"})</span>
              <span className="normal-case tracking-normal">{options.length} options · Jev may only pick one of these ids</span>
            </div>
            <div className="p-4">
              <OptionEditor
                options={options}
                requiredId={requiredId}
                onChange={setOptions}
                onReset={() => setOptions(cloneOptions(mode))}
                disabled={loading}
              />
            </div>
          </section>

          <ApiKeyPanel serverHasKey={serverHasKey === true} />
        </div>

        {/* Right column: result */}
        <div className="space-y-5">
          <section className="panel">
            <div className="panel-title">
              <span>3 · Decision</span>
              {run && (
                <span className="normal-case tracking-normal">
                  {run.mode === "model" ? "model router" : "tool router"} · {run.result.source === "jev" ? "live Jev" : "simulated"}
                </span>
              )}
            </div>
            <div className="p-4">
              {run ? (
                <RoutingResult mode={run.mode} userInput={run.userInput} options={run.options} result={run.result} threshold={run.threshold} />
              ) : (
                <div className="py-10 text-center text-sm text-muted">
                  <p>Run a routing decision to see Jev&apos;s pick, its confidence, the full score breakdown, and what your code would execute.</p>
                </div>
              )}
              {run && loading && <p className="mt-3 text-xs text-muted">Routing a new request…</p>}
            </div>
          </section>

          <section className="panel">
            <div className="panel-title">
              <span>How the boundary works</span>
            </div>
            <ol className="list-decimal space-y-1.5 px-4 py-3 pl-8 text-sm text-ink-2">
              <li>
                The app posts the input and the option list to <code className="font-mono text-xs">/api/route</code>.
              </li>
              <li>
                <code className="font-mono text-xs">createRouter</code> checks that the fallback option is present, then asks Jev one{" "}
                <code className="font-mono text-xs">choice</code> question whose options are exactly the option ids.
              </li>
              <li>Jev returns a pick, a probability per option, and a confidence. Anything not in the list is rejected as an invalid route.</li>
              <li>Below the threshold, the fallback policy runs: safe default (model) or ask the user (tool). The decision is logged.</li>
              <li>
                The library returns an option id. <span className="text-ink">Executing it is your code&apos;s job.</span> This demo only prints what it would do.
              </li>
            </ol>
          </section>
        </div>
      </div>

      <section className="panel mt-5">
        <div className="panel-title">
          <span>4 · Routing history</span>
        </div>
        <RoutingHistoryTable entries={history} onClear={() => setHistory([])} />
      </section>

      <footer className="mt-6 text-center text-xs text-muted">
        Built on TypeSafe&apos;s Jev. Unofficial demo. Source in <code className="font-mono">lib/</code>, UI in <code className="font-mono">components/</code>.
      </footer>
    </div>
  );
}

function StatusBadge({ status }: { status: LiveStatus }) {
  if (status === "unknown") return <span className="rounded-full border border-line px-2.5 py-1 text-xs text-muted">Checking API key…</span>;
  if (status === "live-user-key")
    return (
      <span className="rounded-full border border-teal/50 bg-teal/10 px-2.5 py-1 text-xs text-teal">
        ● Live · routing with Jev · your key
      </span>
    );
  if (status === "live")
    return (
      <span className="rounded-full border border-teal/50 bg-teal/10 px-2.5 py-1 text-xs text-teal">
        ● Live · routing with Jev · server key
      </span>
    );
  return <span className="rounded-full border border-warn/50 bg-warn/10 px-2.5 py-1 text-xs text-warn">○ Demo mode · simulated</span>;
}
