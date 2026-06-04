"use client";

import * as React from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useStake } from "@/hooks/use-stake";
import { TIME_CONTROLS } from "@/lib/challenge/types";
import { MIN_STAKE_CRC } from "@/lib/circles-config";
import { Loader2, Swords } from "lucide-react";

interface ConnectedUser {
  address: string;
  username: string;
}

type Phase = "idle" | "staking" | "creating" | "error";

export function CreateChallenge({ onCreated }: { onCreated?: () => void }) {
  const { address } = useWallet();
  const { stake, balanceCrc } = useStake();
  const [users, setUsers] = React.useState<ConnectedUser[]>([]);
  const [opponent, setOpponent] = React.useState<string>("");
  const [tcKey, setTcKey] = React.useState(TIME_CONTROLS[1].key);
  const [stakeCrc, setStakeCrc] = React.useState<number>(MIN_STAKE_CRC);
  const [phase, setPhase] = React.useState<Phase>("idle");
  const [error, setError] = React.useState<string | null>(null);

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

  const submit = React.useCallback(async () => {
    if (!address || !opponent) return;
    setError(null);
    try {
      setPhase("staking");
      const hashes = await stake(stakeCrc);
      setPhase("creating");
      let lastErr = "Couldn't create the challenge.";
      for (const txHash of hashes) {
        const res = await fetch("/api/challenge/create", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({
            challengerAddress: address,
            opponentAddress: opponent,
            timeControlKey: tcKey,
            stakeCrc,
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
  }, [address, opponent, tcKey, stakeCrc, stake, onCreated]);

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
            Stake (gCRC){balanceCrc != null && ` · you hold ${balanceCrc}`}
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

        <Button className="w-full" disabled={!opponent || busy} onClick={submit}>
          {busy ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              {phase === "staking" ? "Staking…" : "Creating…"}
            </>
          ) : (
            <>
              <Swords className="h-4 w-4" />
              Stake {stakeCrc} gCRC &amp; challenge
            </>
          )}
        </Button>
        <p className="text-xs text-[var(--muted-foreground)]">
          Your stake goes into escrow. The challenge opens once your opponent stakes the
          same; you both play on Lichess and the winner takes the pot.
        </p>
        {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
      </CardContent>
    </Card>
  );
}
