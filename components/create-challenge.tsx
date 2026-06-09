"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useStake } from "@/hooks/use-stake";
import { useBalances, attoToCrc } from "@/hooks/use-balances";
import { Modal } from "@/components/ui/modal";
import { TIME_CONTROLS, type Challenge, type ChallengeMode } from "@/lib/challenge/types";
import { challengeBlurb, challengeLink } from "@/lib/share";
import { Check, Copy, ExternalLink, Loader2, Search, Swords } from "lucide-react";

interface Friend {
  username: string;
  registered: boolean;
  online: boolean;
  playing: boolean;
}

type Phase = "idle" | "staking" | "creating" | "error";

export function CreateChallenge({ onCreated }: { onCreated?: () => void }) {
  const { address } = useWallet();
  const { stake } = useStake();
  const { balances } = useBalances();

  const [friends, setFriends] = React.useState<Friend[]>([]);
  const [query, setQuery] = React.useState("");
  const [target, setTarget] = React.useState("");
  const [tcKey, setTcKey] = React.useState(TIME_CONTROLS[2].key); // 5+3 default
  const [mode, setMode] = React.useState<ChallengeMode>("personal");
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<Challenge | null>(null);
  const [showGcrcInfo, setShowGcrcInfo] = React.useState(false);

  React.useEffect(() => {
    if (!address) return;
    let off = false;
    (async () => {
      try {
        const r = await fetch(`/api/friends?address=${address}`);
        const d = await r.json();
        if (!off) setFriends(Array.isArray(d.friends) ? d.friends : []);
      } catch {
        /* no friends list — typing a username still works */
      }
    })();
    return () => {
      off = true;
    };
  }, [address]);

  const tc = TIME_CONTROLS.find((t) => t.key === tcKey) ?? TIME_CONTROLS[2];
  const stakeCrc = tc.stake;
  const currency = mode === "personal" ? "CRC" : "gCRC";

  const heldPersonal = attoToCrc(balances?.heldPersonalAtto) + attoToCrc(balances?.mintableAtto);
  const heldGroup = attoToCrc(balances?.heldGroupAtto);
  const held = mode === "personal" ? heldPersonal : heldGroup;
  const enough = held >= stakeCrc;

  const q = query.trim().toLowerCase();
  const suggestions = (
    q ? friends.filter((f) => f.username.toLowerCase().includes(q)) : friends
  ).slice(0, 6);

  const pick = (username: string) => {
    setTarget(username);
    setQuery(username);
  };

  const submit = React.useCallback(async () => {
    if (!address) return;
    const name = (target || query).trim();
    if (!name) {
      setError("Pick a friend or type a Lichess username.");
      return;
    }
    setError(null);
    try {
      setPhase("staking");
      const hashes = await stake(stakeCrc, mode);
      setPhase("creating");
      let lastErr = "Couldn’t create the challenge.";
      for (const txHash of hashes) {
        const res = await fetch("/api/challenge/create", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            challengerAddress: address,
            targetUsername: name,
            timeControlKey: tcKey,
            stakeCrc,
            mode,
            txHash,
          }),
        });
        const d = await res.json();
        if (res.ok && d.challenge) {
          setCreated(d.challenge);
          setPhase("idle");
          onCreated?.();
          return;
        }
        lastErr = d.error ?? lastErr;
      }
      setError(lastErr);
      setPhase("error");
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setPhase("error");
    }
  }, [address, target, query, tcKey, stakeCrc, mode, stake, onCreated]);

  const reset = () => {
    setCreated(null);
    setTarget("");
    setQuery("");
    setPhase("idle");
    setError(null);
  };

  const busy = phase === "staking" || phase === "creating";

  if (created) return <ShareCard challenge={created} onDone={reset} />;

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Swords className="h-5 w-5 text-[var(--primary)]" />
          Challenge a friend
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Opponent — search your friends or type any Lichess name */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--muted-foreground)]">Who</label>
          <div className="relative">
            <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
            <input
              value={query}
              onChange={(e) => {
                setQuery(e.target.value);
                setTarget("");
              }}
              placeholder="Friend or Lichess username"
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-2 pl-8 pr-3 text-sm"
            />
          </div>
          {suggestions.length > 0 && target.toLowerCase() !== query.trim().toLowerCase() && (
            <div className="flex flex-wrap gap-1.5 pt-0.5">
              {suggestions.map((f) => (
                <button
                  key={f.username}
                  onClick={() => pick(f.username)}
                  className="flex items-center gap-1.5 rounded-full border border-[var(--border)] px-2.5 py-1 text-xs transition hover:border-[var(--primary)]"
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      f.playing
                        ? "bg-[var(--primary)]"
                        : f.online
                          ? "bg-[var(--accent)]"
                          : "bg-[var(--border)]"
                    }`}
                  />
                  {f.username}
                  {f.registered && <Check className="h-3 w-3 text-[var(--accent)]" />}
                </button>
              ))}
            </div>
          )}
          {friends.length === 0 && (
            <p className="text-[11px] text-[var(--muted-foreground)]">
              Type any Lichess username — they don’t need an account here yet.
            </p>
          )}
        </div>

        {/* Time control = stake */}
        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--muted-foreground)]">
            Game — longer game, bigger stake
          </label>
          <div className="grid grid-cols-4 gap-2">
            {TIME_CONTROLS.map((t) => (
              <button
                key={t.key}
                onClick={() => setTcKey(t.key)}
                className={`flex flex-col items-center rounded-lg border px-2 py-2 transition ${
                  tcKey === t.key
                    ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                    : "border-[var(--border)] hover:border-[var(--primary)]"
                }`}
              >
                <span className="text-sm font-semibold">{t.label}</span>
                <span className="text-[10px] opacity-80">
                  {t.stake} {currency}
                </span>
              </button>
            ))}
          </div>
        </div>

        <Button className="w-full" disabled={busy || !enough} onClick={submit}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {phase === "staking" ? "Staking…" : "Creating…"}
            </>
          ) : (
            <>
              <Swords className="h-4 w-4" />
              Stake {stakeCrc} {currency} &amp; challenge
            </>
          )}
        </Button>

        {!enough && mode === "personal" && (
          <p className="text-xs text-[var(--muted-foreground)]">
            Not enough personal CRC — you have {Math.floor(held)}. Pick a shorter game.
          </p>
        )}
        {!enough && mode === "group" && (
          <button
            onClick={() => setShowGcrcInfo(true)}
            className="text-left text-xs font-medium text-[var(--primary)] underline"
          >
            You don’t have enough gCRC — how to get it →
          </button>
        )}

        {/* Soft escalation to real money — de-emphasised */}
        <div className="flex items-center justify-between border-t border-[var(--border)] pt-2 text-xs">
          <span className="text-[var(--muted-foreground)]">
            Playing for{" "}
            <strong className="text-[var(--foreground)]">
              {mode === "personal" ? "fun (personal CRC)" : "real (group CRC)"}
            </strong>
          </span>
          <button
            onClick={() => setMode((m) => (m === "personal" ? "group" : "personal"))}
            className="font-medium text-[var(--primary)] underline"
          >
            {mode === "personal" ? "Play for real →" : "Back to fun"}
          </button>
        </div>

        {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}

        <Modal open={showGcrcInfo} onClose={() => setShowGcrcInfo(false)} title="Getting gCRC">
          <p>
            <strong className="text-[var(--foreground)]">Group CRC (gCRC)</strong> is the
            “real money” currency — about{" "}
            <strong className="text-[var(--foreground)]">€0.01 each</strong>. You create or
            buy it in the Circles app.
          </p>
          <p>
            You already have an account — so don’t register a new one. Open the Circles app
            and click <strong className="text-[var(--foreground)]">Log in</strong> with your
            passkey to finish your onboarding, then top up gCRC.
          </p>
          <a
            href="https://app.gnosis.io"
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 font-medium text-[var(--primary)] underline"
          >
            <ExternalLink className="h-3.5 w-3.5" /> Open app.gnosis.io
          </a>
        </Modal>
      </CardContent>
    </Card>
  );
}

/** After a challenge is staked: hand the player a ready-to-send invite. */
function ShareCard({ challenge, onDone }: { challenge: Challenge; onDone: () => void }) {
  const blurb = challengeBlurb(challenge);
  const link = challengeLink(challenge.id);
  const [copied, setCopied] = React.useState<"blurb" | "link" | null>(null);

  const copy = async (what: "blurb" | "link", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 1500);
    } catch {
      /* clipboard blocked — the text is selectable below */
    }
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Swords className="h-5 w-5 text-[var(--primary)]" />
          Challenge {challenge.targetUsername} — staked!
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-[var(--muted-foreground)]">
          Your {challenge.stakeCrc} {(challenge.mode ?? "group") === "personal" ? "CRC" : "gCRC"} is
          locked in. Send {challenge.targetUsername} this invite — they open it, connect Lichess,
          and accept.
        </p>
        <textarea
          readOnly
          value={blurb}
          rows={3}
          className="w-full resize-none rounded-lg border border-[var(--border)] bg-[var(--secondary)]/40 p-2.5 text-xs"
        />
        <div className="flex flex-wrap gap-2">
          <Button size="sm" onClick={() => copy("blurb", blurb)}>
            {copied === "blurb" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied === "blurb" ? "Copied" : "Copy invite"}
          </Button>
          <Button size="sm" variant="outline" onClick={() => copy("link", link)}>
            {copied === "link" ? <Check className="h-4 w-4" /> : <Copy className="h-4 w-4" />}
            {copied === "link" ? "Copied" : "Copy link only"}
          </Button>
        </div>
        <button
          onClick={onDone}
          className="text-xs font-medium text-[var(--primary)] underline"
        >
          ← New challenge
        </button>
      </CardContent>
    </Card>
  );
}
