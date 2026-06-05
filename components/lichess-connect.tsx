"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useWallet } from "@/components/wallet/wallet-provider";
import { randomString } from "@/lib/lichess";
import { CheckCircle2, Copy, Link2, Loader2, ShieldCheck, Unlink } from "lucide-react";

type Phase = "idle" | "signing" | "awaiting" | "connected" | "error";

export function LichessConnect() {
  const { address, isConnected, isMiniappHost, signMessage } = useWallet();
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [username, setUsername] = React.useState<string | null>(null);
  const [sigVerified, setSigVerified] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [startUrl, setStartUrl] = React.useState<string | null>(null);
  const [tabOpened, setTabOpened] = React.useState(false);
  const [copied, setCopied] = React.useState(false);
  const pollRef = React.useRef<ReturnType<typeof setInterval> | null>(null);
  const popupRef = React.useRef<Window | null>(null);

  const finish = React.useCallback((name: string | null) => {
    if (pollRef.current) clearInterval(pollRef.current);
    try {
      popupRef.current?.close();
    } catch {
      /* ignore */
    }
    setUsername(name);
    setSigVerified(true);
    setPhase("connected");
  }, []);

  // Load any existing connection for this address.
  React.useEffect(() => {
    if (!address) {
      setUsername(null);
      setPhase("idle");
      return;
    }
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/lichess/status?address=${address}`);
        const data = await res.json();
        if (cancelled) return;
        if (data.connected) {
          setUsername(data.username);
          setSigVerified(Boolean(data.sigVerified));
          setPhase("connected");
        } else {
          setPhase("idle");
        }
      } catch {
        if (!cancelled) setPhase("idle");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [address]);

  // Instant completion from the smooth popup route (same-origin postMessage).
  React.useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev.origin !== window.location.origin) return;
      if (ev.data?.type !== "lichess-connected") return;
      finish(ev.data.username ?? null);
    };
    window.addEventListener("message", onMsg);
    return () => window.removeEventListener("message", onMsg);
  }, [finish]);

  React.useEffect(
    () => () => {
      if (pollRef.current) clearInterval(pollRef.current);
    },
    []
  );

  // Both routes (popup + copy-paste) complete the same handoff; poll it.
  const startPolling = React.useCallback(
    (token: string) => {
      if (pollRef.current) clearInterval(pollRef.current);
      pollRef.current = setInterval(async () => {
        try {
          const r = await fetch(`/api/lichess/handoff/status?token=${token}`, { cache: "no-store" });
          const d = await r.json();
          if (d.status === "completed") {
            finish(d.username ?? null);
          } else if (d.status === "failed" || d.status === "expired") {
            if (pollRef.current) clearInterval(pollRef.current);
            setError(d.error ?? "The sign-in didn’t complete. Please try again.");
            setPhase("error");
          }
        } catch {
          /* transient — keep polling */
        }
      }, 2000);
    },
    [finish]
  );

  const connect = React.useCallback(async () => {
    if (!address) return;
    setError(null);
    setCopied(false);
    setTabOpened(false);
    if (!isMiniappHost) {
      setError("Open Chess Wager inside the Circles app to connect.");
      setPhase("error");
      return;
    }

    // ── Sign FIRST — no tab while we wait for the wallet. ──
    setPhase("signing");
    const nonce = randomString(8);
    const message = `Link my Lichess account to Circles ${address}\nnonce: ${nonce}`;
    let signature: string;
    try {
      signature = (await signMessage(message)).signature;
    } catch {
      setError("Wallet signature was declined.");
      setPhase("error");
      return;
    }

    // Store the handoff, get the OAuth start URL.
    let token: string;
    try {
      const res = await fetch("/api/lichess/handoff/store", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, message, signature }),
      });
      const data = await res.json();
      if (!res.ok || !data.token) {
        setError(data.error ?? "Couldn’t start the connection.");
        setPhase("error");
        return;
      }
      token = data.token;
    } catch {
      setError("Couldn’t start the connection.");
      setPhase("error");
      return;
    }

    const url = `${window.location.origin}/api/lichess/oauth/start?token=${token}`;
    setStartUrl(url);
    setPhase("awaiting");
    startPolling(token);

    // Now (after signing) open the Lichess tab. If the gesture lapsed during
    // signing and the host blocks it, the copy-paste fallback is surfaced.
    const popup = window.open(url, "lichess-oauth", "width=480,height=760");
    popupRef.current = popup;
    setTabOpened(Boolean(popup));
  }, [address, isMiniappHost, signMessage, startPolling]);

  const disconnect = React.useCallback(async () => {
    if (!address) return;
    await fetch("/api/lichess/disconnect", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ address }),
    });
    setUsername(null);
    setSigVerified(false);
    setPhase("idle");
  }, [address]);

  const copy = React.useCallback(async () => {
    if (!startUrl) return;
    try {
      await navigator.clipboard.writeText(startUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      /* clipboard blocked — the text is selectable as a fallback */
    }
  }, [startUrl]);

  return (
    <Card>
      <CardHeader className="flex-row items-center justify-between">
        <CardTitle className="flex items-center gap-2">
          <Link2 className="h-5 w-5 text-[var(--primary)]" />
          Lichess
        </CardTitle>
        {username && (
          <Badge variant="success">
            <CheckCircle2 className="h-3.5 w-3.5" />
            {username}
          </Badge>
        )}
      </CardHeader>
      <CardContent className="space-y-3">
        {phase === "connected" && username ? (
          <>
            <p className="text-sm text-[var(--muted-foreground)]">
              Linked to{" "}
              <span className="font-semibold text-[var(--foreground)]">{username}</span>
              {sigVerified && (
                <span className="ml-1 inline-flex items-center gap-1 text-[var(--accent)]">
                  <ShieldCheck className="h-3.5 w-3.5" /> wallet-verified
                </span>
              )}
              .
            </p>
            <Button variant="outline" size="sm" onClick={disconnect}>
              <Unlink className="h-4 w-4" /> Disconnect
            </Button>
          </>
        ) : phase === "awaiting" && startUrl ? (
          <>
            <div className="flex items-center gap-2 text-sm font-medium text-[var(--primary)]">
              <Loader2 className="h-4 w-4 animate-spin" />
              Authorize on Lichess to finish…
            </div>
            {tabOpened ? (
              <>
                <p className="text-sm text-[var(--muted-foreground)]">
                  A Lichess tab opened — authorize there and it’ll close and connect
                  automatically.
                </p>
                <details className="text-xs text-[var(--muted-foreground)]">
                  <summary className="cursor-pointer select-none">
                    Tab didn’t open or showed an error? Copy this link into a new tab
                  </summary>
                  <div className="mt-2 flex items-center gap-2">
                    <code className="block flex-1 overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--background)] p-2 font-mono text-[11px] break-all select-all">
                      {startUrl}
                    </code>
                    <Button variant="outline" size="sm" onClick={copy}>
                      <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
                    </Button>
                  </div>
                </details>
              </>
            ) : (
              <>
                <p className="text-sm text-[var(--muted-foreground)]">
                  We couldn’t open the Lichess tab automatically. Copy this link and
                  open it in a new browser tab:
                </p>
                <div className="flex items-center gap-2">
                  <code className="block flex-1 overflow-x-auto rounded-md border border-[var(--border)] bg-[var(--background)] p-2 font-mono text-[11px] break-all select-all">
                    {startUrl}
                  </code>
                  <Button variant="outline" size="sm" onClick={copy}>
                    <Copy className="h-3.5 w-3.5" /> {copied ? "Copied" : "Copy"}
                  </Button>
                </div>
              </>
            )}
          </>
        ) : (
          <>
            <p className="text-sm text-[var(--muted-foreground)]">
              Connect your Lichess account — sign with your Circles wallet, then
              authorize on Lichess.
            </p>
            <Button
              className="w-full"
              disabled={!isConnected || phase === "signing"}
              onClick={connect}
            >
              {phase === "signing" ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Confirm in your wallet…
                </>
              ) : (
                <>
                  <Link2 className="h-4 w-4" />
                  Connect Lichess
                </>
              )}
            </Button>
            {!isConnected && (
              <p className="text-xs text-[var(--muted-foreground)]">
                Connect your Circles wallet first.
              </p>
            )}
          </>
        )}
        {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
      </CardContent>
    </Card>
  );
}
