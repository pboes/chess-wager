"use client";

import * as React from "react";
import { Button } from "@/components/ui/button";
import { Crowns } from "@/components/ui/crown";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useStake } from "@/hooks/use-stake";
import { useBalances, attoToCrc } from "@/hooks/use-balances";
import { TIME_CONTROLS, type Challenge } from "@/lib/challenge/types";
import { challengeBlurb, challengeLink } from "@/lib/share";
import { Check, Copy, Loader2, Search, Swords, X } from "lucide-react";

interface Suggestion {
  username: string;
  online: boolean;
  friend: boolean;
}

type Phase = "idle" | "staking" | "creating" | "error";

/** Modal: pick an opponent, choose a game (= stake), stake, and get a share link. */
export function CreateChallenge({
  open,
  onClose,
  onCreated,
}: {
  open: boolean;
  onClose: () => void;
  onCreated?: () => void;
}) {
  const { address } = useWallet();
  const { stake } = useStake();
  const { balances } = useBalances();

  const friendsRef = React.useRef<Map<string, boolean>>(new Map()); // username → online
  const [, force] = React.useReducer((x) => x + 1, 0);
  const [query, setQuery] = React.useState("");
  const [target, setTarget] = React.useState("");
  const [scope, setScope] = React.useState<"friends" | "anyone">("friends");
  const [results, setResults] = React.useState<Suggestion[]>([]);
  const [tcKey, setTcKey] = React.useState(TIME_CONTROLS[2].key); // 5+3 default
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [created, setCreated] = React.useState<Challenge | null>(null);

  // Load the player's Lichess friends once the modal opens.
  React.useEffect(() => {
    if (!open || !address) return;
    let off = false;
    (async () => {
      try {
        const r = await fetch(`/api/friends?address=${address}`);
        const d = await r.json();
        if (off) return;
        const m = new Map<string, boolean>();
        for (const f of d.friends ?? []) m.set(f.username, Boolean(f.online));
        friendsRef.current = m;
        force();
      } catch {
        /* typing a username still works */
      }
    })();
    return () => {
      off = true;
    };
  }, [open, address]);

  // Live suggestions: friends first, then anyone on Lichess (autocomplete).
  React.useEffect(() => {
    const q = query.trim();
    const friendMatches: Suggestion[] = [...friendsRef.current.entries()]
      .filter(([name]) => (q ? name.toLowerCase().includes(q.toLowerCase()) : true))
      .map(([username, online]) => ({ username, online, friend: true }));

    // Friends-only scope, or too-short term for Lichess autocomplete (needs 3+).
    if (scope === "friends" || q.length < 3) {
      setResults(friendMatches.slice(0, 8));
      return;
    }
    let off = false;
    const t = setTimeout(async () => {
      try {
        const r = await fetch(`/api/lichess/search?term=${encodeURIComponent(q)}`);
        const d = await r.json();
        if (off) return;
        const have = new Set(friendMatches.map((f) => f.username.toLowerCase()));
        const others: Suggestion[] = (d.users ?? [])
          .filter((u: { name: string }) => u.name && !have.has(u.name.toLowerCase()))
          .map((u: { name: string; online: boolean }) => ({
            username: u.name,
            online: Boolean(u.online),
            friend: false,
          }));
        setResults([...friendMatches, ...others].slice(0, 8));
      } catch {
        if (!off) setResults(friendMatches.slice(0, 8));
      }
    }, 250);
    return () => {
      off = true;
      clearTimeout(t);
    };
  }, [query, scope]);

  const tc = TIME_CONTROLS.find((t) => t.key === tcKey) ?? TIME_CONTROLS[2];
  const stakeCrc = tc.stake;
  const amt = (value: number) => <Crowns value={value} />;

  // Crowns = held personal CRC + accrued (the stake mints the accrued part).
  const held = attoToCrc(balances?.heldPersonalAtto) + attoToCrc(balances?.mintableAtto);
  const enough = held >= stakeCrc;

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
      const hashes = await stake(stakeCrc, "personal");
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
            mode: "personal",
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
  }, [address, target, query, tcKey, stakeCrc, stake, onCreated]);

  const close = () => {
    setCreated(null);
    setTarget("");
    setQuery("");
    setResults([]);
    setPhase("idle");
    setError(null);
    onClose();
  };

  if (!open) return null;
  const busy = phase === "staking" || phase === "creating";
  const showSuggestions = results.length > 0 && target.toLowerCase() !== query.trim().toLowerCase();

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 p-0 backdrop-blur-sm sm:items-center sm:p-4"
      onClick={close}
    >
      <div
        className="w-full max-w-md rounded-t-2xl border border-[var(--border)] bg-[var(--card)] p-5 shadow-popup sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center justify-between">
          <h2 className="flex items-center gap-2 text-base font-semibold">
            <Swords className="h-5 w-5 text-[var(--primary)]" />
            {created ? `Challenge sent to ${created.targetUsername}` : "New challenge"}
          </h2>
          <button
            onClick={close}
            aria-label="Close"
            className="rounded-md p-1 text-[var(--muted-foreground)] hover:bg-[var(--secondary)]"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {created ? (
          <ShareView challenge={created} onDone={close} />
        ) : (
          <div className="space-y-4">
            {/* Opponent */}
            <div className="space-y-1.5">
              <div className="flex items-center justify-between">
                <label className="text-xs font-medium text-[var(--muted-foreground)]">Who</label>
                <div className="flex rounded-md border border-[var(--border)] p-0.5 text-[11px]">
                  {(["friends", "anyone"] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setScope(s)}
                      className={`rounded px-2 py-0.5 capitalize transition ${
                        scope === s
                          ? "bg-[var(--primary)] text-white"
                          : "text-[var(--muted-foreground)]"
                      }`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="relative">
                <Search className="pointer-events-none absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-[var(--muted-foreground)]" />
                <input
                  value={query}
                  onChange={(e) => {
                    setQuery(e.target.value);
                    setTarget("");
                  }}
                  placeholder={
                    scope === "friends" ? "Search your Lichess friends" : "Search any Lichess player"
                  }
                  type="text"
                  name="lichess-opponent"
                  autoComplete="off"
                  autoCorrect="off"
                  autoCapitalize="none"
                  spellCheck={false}
                  data-1p-ignore="true"
                  data-lpignore="true"
                  data-form-type="other"
                  className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] py-2 pl-8 pr-3 text-sm"
                />
              </div>
              {showSuggestions && (
                <div className="max-h-44 overflow-y-auto rounded-lg border border-[var(--border)]">
                  {results.map((s) => (
                    <button
                      key={s.username}
                      onClick={() => pick(s.username)}
                      className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm transition hover:bg-[var(--secondary)]"
                    >
                      <span
                        className={`h-1.5 w-1.5 shrink-0 rounded-full ${
                          s.online ? "bg-[var(--accent)]" : "bg-[var(--border)]"
                        }`}
                      />
                      <span className="truncate">{s.username}</span>
                      {s.friend && (
                        <span className="ml-auto text-[10px] text-[var(--muted-foreground)]">
                          friend
                        </span>
                      )}
                    </button>
                  ))}
                </div>
              )}
              <p className="text-[11px] text-[var(--muted-foreground)]">
                {scope === "friends"
                  ? "Your Lichess friends. Switch to “anyone” to challenge any player."
                  : "Any Lichess player — they don’t need an account here yet."}
              </p>
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
                    <span className="text-[10px] opacity-80">{amt(t.stake)}</span>
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
                  Stake {amt(stakeCrc)} &amp; challenge
                </>
              )}
            </Button>

            {!enough && (
              <p className="text-xs text-[var(--muted-foreground)]">
                Not enough Crowns — you have {Math.floor(held)}. Pick a shorter game, or wait —
                you earn 1 an hour.
              </p>
            )}

            {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
          </div>
        )}
      </div>
    </div>
  );
}

/** After staking: hand the player a ready-to-send invite. */
function ShareView({ challenge, onDone }: { challenge: Challenge; onDone: () => void }) {
  const blurb = challengeBlurb(challenge);
  const link = challengeLink(challenge.id);
  const [copied, setCopied] = React.useState<"blurb" | "link" | null>(null);

  const copy = async (what: "blurb" | "link", text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(what);
      setTimeout(() => setCopied((c) => (c === what ? null : c)), 1500);
    } catch {
      /* clipboard blocked — text is selectable */
    }
  };

  return (
    <div className="space-y-3">
      <p className="text-sm text-[var(--muted-foreground)]">
        Your <Crowns value={challenge.stakeCrc} /> are locked in. Send {challenge.targetUsername}{" "}
        this — they open it, connect Lichess, and accept.
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
          {copied === "link" ? "Copied" : "Copy link"}
        </Button>
      </div>
      <Button variant="outline" className="w-full" onClick={onDone}>
        Done
      </Button>
    </div>
  );
}
