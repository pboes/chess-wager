"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useStake } from "@/hooks/use-stake";
import { useBalances, attoToCrc } from "@/hooks/use-balances";
import { Modal } from "@/components/ui/modal";
import { TIME_CONTROLS, type ChallengeMode } from "@/lib/challenge/types";
import { MIN_STAKE_CRC } from "@/lib/circles-config";
import { ExternalLink, Loader2, Swords } from "lucide-react";

interface ConnectedUser {
  address: string;
  username: string;
}

type Phase = "idle" | "staking" | "creating" | "error";

export function CreateChallenge({ onCreated }: { onCreated?: () => void }) {
  const { address } = useWallet();
  const { stake } = useStake();
  const { balances } = useBalances();
  const [users, setUsers] = React.useState<ConnectedUser[]>([]);
  const [opponent, setOpponent] = React.useState<string>("");
  const [mode, setMode] = React.useState<ChallengeMode>("personal");
  const [tcKey, setTcKey] = React.useState(TIME_CONTROLS[1].key);
  const [stakeCrc, setStakeCrc] = React.useState<number>(MIN_STAKE_CRC);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);
  const [showGcrcInfo, setShowGcrcInfo] = React.useState(false);

  React.useEffect(() => {
    if (!address) return;
    let off = false;
    (async () => {
      try {
        const r = await fetch(`/api/connected-users?exclude=${address}`);
        const d = await r.json();
        if (!off) setUsers(d.users ?? []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      off = true;
    };
  }, [address]);

  const heldPersonal = attoToCrc(balances?.heldPersonalAtto);
  const heldGroup = attoToCrc(balances?.heldGroupAtto);
  const mintable = attoToCrc(balances?.mintableAtto);
  const currency = mode === "personal" ? "personal CRC" : "gCRC";
  const held = mode === "personal" ? heldPersonal : heldGroup;
  const enough = held >= stakeCrc;
  const canClaimEnough = mode === "personal" && held + mintable >= stakeCrc;

  const submit = React.useCallback(async () => {
    if (!address || !opponent) return;
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
            opponentAddress: opponent,
            timeControlKey: tcKey,
            stakeCrc,
            mode,
            txHash,
          }),
        });
        const d = await res.json();
        if (res.ok && d.challenge) {
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
  }, [address, opponent, tcKey, stakeCrc, mode, stake, onCreated]);

  const busy = phase === "staking" || phase === "creating";

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Swords className="h-5 w-5 text-[var(--primary)]" />
          Create a challenge
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Mode */}
        <div className="grid grid-cols-2 gap-2">
          {(["personal", "group"] as ChallengeMode[]).map((m) => (
            <button
              key={m}
              onClick={() => setMode(m)}
              className={`rounded-lg border px-3 py-2 text-left transition ${
                mode === m
                  ? "border-[var(--primary)] bg-[var(--primary)]/10"
                  : "border-[var(--border)] hover:border-[var(--primary)]"
              }`}
            >
              <div className="text-sm font-semibold">
                {m === "personal" ? "Personal" : "Group"}
              </div>
              <div className="text-[10px] text-[var(--muted-foreground)]">
                {m === "personal" ? "play money · free" : "real money"}
              </div>
            </button>
          ))}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--muted-foreground)]">Opponent</label>
          {users.length === 0 ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              No other connected players yet. Ask a friend to connect their Lichess account.
            </p>
          ) : (
            <select
              className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
              value={opponent}
              onChange={(e) => setOpponent(e.target.value)}
            >
              <option value="">Select a player…</option>
              {users.map((u) => (
                <option key={u.address} value={u.address}>
                  {u.username}
                </option>
              ))}
            </select>
          )}
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--muted-foreground)]">Time control</label>
          <div className="grid grid-cols-4 gap-2">
            {TIME_CONTROLS.map((tc) => (
              <button
                key={tc.key}
                onClick={() => setTcKey(tc.key)}
                className={`rounded-lg border px-2 py-2 text-sm font-medium transition ${
                  tcKey === tc.key
                    ? "border-[var(--primary)] bg-[var(--primary)] text-white"
                    : "border-[var(--border)] hover:border-[var(--primary)]"
                }`}
              >
                {tc.label}
              </button>
            ))}
          </div>
        </div>

        <div className="space-y-1.5">
          <label className="text-xs font-medium text-[var(--muted-foreground)]">
            Stake ({currency}) · you hold {Math.floor(held).toLocaleString()}
          </label>
          <input
            type="number"
            min={MIN_STAKE_CRC}
            step={1}
            value={stakeCrc}
            onChange={(e) => setStakeCrc(Math.max(MIN_STAKE_CRC, Number(e.target.value)))}
            className="w-full rounded-lg border border-[var(--border)] bg-[var(--background)] px-3 py-2 text-sm"
          />
        </div>

        <Button className="w-full" disabled={!opponent || busy || !enough} onClick={submit}>
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
            {canClaimEnough
              ? "Claim your personal CRC in the balance above first, then stake."
              : `Not enough personal CRC — you have ${Math.floor(held)}.`}
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

        <p className="text-xs text-[var(--muted-foreground)]">
          Your stake goes into escrow. The challenge opens once your opponent stakes the
          same; you both play on Lichess and the winner takes the pot.
        </p>
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
