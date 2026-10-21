import { createContext, useContext, useEffect, useImperativeHandle, useRef, useState, type ReactNode, type Ref } from "react";
import { ChevronDown, ChevronUp, Loader2, Search, X } from "lucide-react";
import { useTranslation } from "react-i18next";
import type { SessionReplayDetail } from "@/lib/api";
import type { SearchScope, SessionSearchHit, SessionSearchRequest, SessionSearchResponse, SessionSearchResult } from "@/lib/session-search";

export type SessionSearchState = SessionSearchResult & {
  source: SessionReplayDetail;
  scope: SearchScope;
  active: boolean;
  pending: boolean;
  error: boolean;
};
export type SessionSearchHandle = { clear: () => void };
const EMPTY_RESULT: SessionSearchResult = { count: 0, index: 0, hit: null };

export function SessionSearchToolbar({ detail, scope, onChange, ref }: {
  detail: SessionReplayDetail;
  scope: SearchScope;
  onChange: (state: SessionSearchState) => void;
  ref: Ref<SessionSearchHandle>;
}) {
  const { t } = useTranslation();
  const [query, setQuery] = useState("");
  const [result, setResult] = useState(EMPTY_RESULT);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const workerRef = useRef<Worker | null>(null);
  const requestId = useRef(0);
  const selectedIndex = useRef(0);
  const failed = useRef(false);
  const enabled = query.length > 0;

  function send(message: SessionSearchRequest) {
    workerRef.current?.postMessage(message);
  }

  function clear() {
    requestId.current += 1;
    send({ type: "cancel" });
    setQuery("");
    setResult(EMPTY_RESULT);
    setPending(false);
    onChange({ ...EMPTY_RESULT, source: detail, scope, active: false, pending: false, error: false });
  }
  useImperativeHandle(ref, () => ({ clear }));

  useEffect(() => {
    failed.current = false;
    if (!enabled) return;
    const worker = new Worker(new URL("../lib/session-search.worker.ts", import.meta.url), { type: "module" });
    workerRef.current = worker;
    worker.postMessage({ type: "init", turns: detail.turns, rawJsonl: detail.rawJsonl } satisfies SessionSearchRequest);
    return () => {
      requestId.current += 1;
      worker.terminate();
      workerRef.current = null;
    };
  }, [detail, enabled]);

  useEffect(() => {
    const id = ++requestId.current;
    const active = query.length > 0;
    setResult(EMPTY_RESULT);
    selectedIndex.current = 0;
    setPending(active && !failed.current);
    setError(failed.current);
    send({ type: "cancel" });
    onChange({ ...EMPTY_RESULT, source: detail, scope, active, pending: active && !failed.current, error: failed.current });
    const worker = workerRef.current;
    if (!worker || !active || failed.current) return;
    worker.onerror = () => {
      if (workerRef.current !== worker) return;
      failed.current = true;
      setError(true);
      setPending(false);
      onChange({ ...EMPTY_RESULT, source: detail, scope, active: true, pending: false, error: true });
    };
    worker.onmessage = ({ data }: MessageEvent<SessionSearchResponse>) => {
      if (data.requestId !== requestId.current) return;
      selectedIndex.current = data.index;
      setResult(data);
      setPending(false);
      onChange({ ...data, source: detail, scope, active: true, pending: false, error: false });
    };
    const timer = window.setTimeout(() => {
      send({ type: "search", requestId: id, query, scope });
    }, 150);
    return () => {
      window.clearTimeout(timer);
      requestId.current += 1;
    };
  }, [detail, scope, query, onChange]);

  useEffect(() => {
    function focusSearch(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "f") {
        event.preventDefault();
        inputRef.current?.focus();
        inputRef.current?.select();
      }
    }
    window.addEventListener("keydown", focusSearch);
    return () => window.removeEventListener("keydown", focusSearch);
  }, []);

  function navigate(delta: number) {
    if (!result.count || pending || error) return;
    selectedIndex.current = (selectedIndex.current + delta + result.count) % result.count;
    send({ type: "select", requestId: ++requestId.current, index: selectedIndex.current });
  }

  return (
    <div role="search" className="flex shrink-0 items-center gap-2 border-b border-border/60 bg-surface px-4 py-1.5">
      <Search aria-hidden="true" className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        type="search"
        maxLength={512}
        aria-label={t("sessions.detail.search_placeholder")}
        placeholder={t("sessions.detail.search_placeholder")}
        className="h-7 min-w-0 flex-1 rounded border border-border bg-background px-2 text-xs outline-none focus-visible:ring-2 focus-visible:ring-ring [&::-webkit-search-cancel-button]:appearance-none"
        value={query}
        onChange={(event) => setQuery(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === "Enter") {
            event.preventDefault();
            navigate(event.shiftKey ? -1 : 1);
          } else if (event.key === "Escape" && query) {
            event.preventDefault();
            event.stopPropagation();
            clear();
          }
        }}
      />
      <span role="status" aria-live="polite" className="flex shrink-0 items-center gap-1 text-xs tabular-nums text-muted-foreground">
        {pending ? <><Loader2 aria-hidden="true" className="h-3 w-3 animate-spin" />{t("sessions.detail.search_pending")}</>
          : error ? t("sessions.detail.search_error")
            : query ? result.count ? `${result.index + 1} / ${result.count}` : t("sessions.detail.search_empty") : null}
      </span>
      {([-1, 1] as const).map((direction) => (
        <button key={direction} type="button" className="rounded p-1 text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40" disabled={!result.count || pending || error} aria-label={t(direction < 0 ? "sessions.detail.search_previous" : "sessions.detail.search_next")} onClick={() => navigate(direction)}>
          {direction < 0 ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </button>
      ))}
      <button type="button" disabled={!query} className="rounded p-1 text-muted-foreground hover:bg-muted focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-40" aria-label={t("sessions.detail.search_clear")} onClick={clear}>
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}

export const SessionSearchContext = createContext<SessionSearchHit | null>(null);

// Search temporarily opens the current match without changing the user's disclosure state.
export function useSessionSearchExpansion(initial = false) {
  const hit = useContext(SessionSearchContext);
  const [expanded, setExpanded] = useState(initial);
  return [expanded || hit !== null, setExpanded] as const;
}

export function SessionSearchTarget({ target, children }: { target: string; children: ReactNode }) {
  const hit = useContext(SessionSearchContext);
  return <SessionSearchContext value={hit?.target === target ? hit : null}>{children}</SessionSearchContext>;
}

export function SessionSearchText({ text, field, full = false, children }: { text: string; field?: string; full?: boolean; children?: ReactNode }) {
  const hit = useContext(SessionSearchContext);
  const { t } = useTranslation();
  const [showFull, setShowFull] = useState(false);
  if (!hit || (field && hit.field !== field) || text.length !== hit.length || text.slice(hit.windowStart, hit.windowStart + hit.text.length) !== hit.text) {
    return <>{children ?? text}</>;
  }
  const bounded = text.length > 32_000 && !full && !showFull;
  const content = bounded ? hit.text : text;
  const start = bounded ? hit.highlightStart : hit.offset;
  const end = start + hit.highlightEnd - hit.highlightStart;
  return <span className="whitespace-pre-wrap break-words" data-session-search-hit>
    <span data-testid="session-search-window">{bounded && hit.windowStart > 0 ? "…\n" : ""}{content.slice(0, start)}<mark className="rounded bg-yellow-300 text-black" data-testid="session-search-current">{content.slice(start, end)}</mark>{content.slice(end)}{bounded && hit.windowStart + content.length < text.length ? "\n…" : ""}</span>
    {bounded ? <button type="button" className="mt-2 block text-xs text-primary hover:underline" onClick={() => setShowFull(true)}>{t("sessions.detail.show_full_text")}</button> : null}
  </span>;
}
