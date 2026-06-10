"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet/wallet-provider";
import { randomString } from "@/lib/lichess";
import { Copy, KeyRound, Link2, Loader2 } from "lucide-react";

type Phase = "idle" | "awaiting" | "lichess_done" | "finishing" | "error";

/**
 * Lichess-first onboarding for a brand-new user (no wallet yet):
 *   1. OAuth Lichess (address-less handoff) — the primary action,
 *   2. then a passkey is created and bound to the captured Lichess identity.
 * The passkey is framed as "finishing", not "make another account".
 */
export function ConnectLichessFirst({ onConnected }: { onConnected: () => void }) {
  const { isMiniappHost, createAccount, signMessage } = useWallet();
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [username, setUsername] = React.useState<string | null>(null);
  const [token, setToken] = React.useState<string | null>(null);
  const [startUrl, setStartUrl] = React.useState<string | null>(null);
  const [tabOpened, setTabOpened] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);

  React.useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    []
  );

  const lichessDone = React.useCallback((name: string | null) => {
    if (pollRef.current) clearInterval(pollRef.current);
    setUsername(name);
    setPhase("lichess_done");
  }, []);

  const startPolling = React.useCallback(
    (tok: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/lichess/handoff/status?token=${tok}`, { cache: "no-store" });
          const d = await r.json();
          if (d.status === "completed") {
            lichessDone(d.username ?? null);
          } else if (d.status === "failed" || d.status === "expired") {
            if (pollRef.current) clearInterval(pollRef.current);
            setError(d.error ?? "Lichess sign-in didn’t complete. Please try again.");
            setPhase("error");
          }
        } catch {
          /* transient — keep polling */
        }
      }, 2000);
    },
    [lichessDone]
  );

  // Smooth-popup completion (finalize page → opener postMessage).
  React.useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      if (ev.data?.type !== "lichess-connected") return;
      lichessDone(ev.data.username ?? null);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [lichessDone]);

  const connectLichess = React.useCallback(async () => {
    setError(null);
    setCopied(false);
    if (!isMiniappHost) {
      setError("Open Stakemate inside the Circles app to connect.");
      setPhase("error");
      return;
    }
    let tok: string;
    try {
      const res = await fetch("/api/lichess/handoff/start", { method: "POST" });
      const d = await res.json();
      if (!res.ok || !d.token) {
        setError(d.error ?? "Couldn’t start the connection.");
        setPhase("error");
        return;
      }
      tok = d.token;
    } catch {
      setError("Couldn’t start the connection.");
      setPhase("error");
      return;
    }
    setToken(tok);
    const url = `${window.location.origin}/api/lichess/oauth/start?token=${tok}`;
    setStartUrl(url);
    setPhase("awaiting");
    startPolling(tok);
    const popup = window.open(url, "lichess-oauth", "width=480,height=760");
    setTabOpened(Boolean(popup));
  }, [isMiniappHost, startPolling]);

  const finish = React.useCallback(async () => {
    if (!token) return;
    setError(null);
    setPhase("finishing");
    try {
      // Passkey creation — must run in this click gesture.
      const { address } = await createAccount();
      const nonce = randomString(8);
      const message = `Link my Lichess account to Circles ${address}\nnonce: ${nonce}`;
      const { signature } = await signMessage(message);
      const res = await fetch("/api/lichess/bind", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ token, address, message, signature }),
      });
      const d = await res.json();
      if (!res.ok) {
        setError(d.error ?? "Couldn’t finish setup. Please try again.");
        setPhase("error");
        return;
      }
      onConnected();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Setup was cancelled.");
      setPhase("error");
    }
  }, [token, createAccount, signMessage, onConnected]);

  const copy = React.useCallback(async () => {
    if (!startUrl) return;
    try {
      await navigator.clipboard.writeText(startUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — link is selectable */
    }
  }, [startUrl]);

  if (phase === "lichess_done" || phase === "finishing") {
    return (
      <div className="space-y-3">
        <p className="text-sm">
          Lichess connected{username ? <> as <strong>{username}</strong></> : ""} ✓ One last tap to
          create your secure key — it’s instant, with nothing to write down.
        </p>
        <Button className="w-full" disabled={phase === "finishing"} onClick={finish}>
          {phase === "finishing" ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" /> Setting up…
            </>
          ) : (
            <>
              <KeyRound className="h-4 w-4" /> Finish — create my key
            </>
          )}
        </Button>
        {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
      </div>
    );
  }

  if (phase === "awaiting" && startUrl) {
    return (
      <div className="space-y-2">
        <div className="flex items-center gap-2 text-sm font-medium text-[var(--primary)]">
          <Loader2 className="h-4 w-4 animate-spin" /> Authorize on Lichess to continue…
        </div>
        <p className="text-sm text-[var(--muted-foreground)]">
          {tabOpened
            ? "A Lichess tab opened — authorize there and come back."
            : "Couldn’t open the Lichess tab. Copy this link into a new browser tab:"}
        </p>
        <div className="flex items-center gap-2">
          <code className="block flex-1 overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--background)] p-2 font-mono text-[11px] break-all select-all">
            {startUrl}
          </code>
          <Button variant="outline" size="sm" onClick={copy}>
            <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
          </Button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <Button className="w-full" size="lg" onClick={connectLichess}>
        <Link2 className="h-5 w-5" /> Connect your Lichess account
      </Button>
      {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
    </div>
  );
}
