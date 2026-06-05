"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useWallet } from "@/components/wallet/wallet-provider";
import { LichessConnect } from "@/components/lichess-connect";
import { CheckCircle2, Loader2, Wallet } from "lucide-react";

type StepState = "todo" | "active" | "done";

function StepBadge({ n, state }: { n: number; state: StepState }) {
  return (
    <span
      className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
        state === "done"
          ? "bg-[var(--accent)] text-white"
          : state === "active"
            ? "bg-[var(--primary)] text-white"
            : "bg-[var(--secondary)] text-[var(--muted-foreground)]"
      }`}
    >
      {state === "done" ? <CheckCircle2 className="h-4 w-4" /> : n}
    </span>
  );
}

export function Onboarding({
  address,
  isMiniappHost,
  lichessConnected,
  onLichessChange,
}: {
  address: string | null;
  isMiniappHost: boolean;
  lichessConnected: boolean | null;
  onLichessChange: (connected: boolean) => void;
}) {
  const { createAccount } = useWallet();
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const hasCircles = Boolean(address);

  const create = React.useCallback(async () => {
    setError(null);
    setCreating(true);
    try {
      // Resolves with the new registered account; onWalletChange also fires and
      // advances the wizard. Called straight from this click (passkey gesture).
      await createAccount();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Account creation was cancelled.");
    } finally {
      setCreating(false);
    }
  }, [createAccount]);

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      {/* Pitch */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/chess-puzzle-avatar-512.png"
          alt="Chess Wager"
          className="h-16 w-16 rounded-2xl"
        />
        <h2 className="text-xl font-bold">Welcome to Chess Wager</h2>
        <ul className="space-y-1.5 text-left text-sm">
          <li className="flex items-start gap-2">
            <span className="text-[var(--primary)]">♟</span>
            <span>Challenge a friend to a game on Lichess</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[var(--primary)]">♟</span>
            <span>Both put up a small stake</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[var(--primary)]">♟</span>
            <span>Winner takes the pot</span>
          </li>
        </ul>
      </div>

      {/* Step 1 — Circles account */}
      <Card>
        <CardContent className="space-y-3 pt-5">
          <div className="flex items-center gap-2">
            <StepBadge n={1} state={hasCircles ? "done" : "active"} />
            <h3 className="text-sm font-semibold">Your Circles account</h3>
          </div>
          {hasCircles ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Ready — you can stake and get paid.{" "}
              <span className="font-mono text-xs">
                {address!.slice(0, 6)}…{address!.slice(-4)}
              </span>
            </p>
          ) : !isMiniappHost ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Open Chess Wager inside the Circles app to get started.
            </p>
          ) : (
            <>
              <p className="text-sm text-[var(--muted-foreground)]">
                This holds your stake and your winnings. No seed phrase — just a passkey on
                your device. We’ll set it up in a few taps.
              </p>
              <Button className="w-full" disabled={creating} onClick={create}>
                {creating ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" /> Creating your account…
                  </>
                ) : (
                  <>
                    <Wallet className="h-4 w-4" /> Create my Circles account
                  </>
                )}
              </Button>
              {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
            </>
          )}
        </CardContent>
      </Card>

      {/* Step 2 — Lichess */}
      <div className="space-y-2">
        <div className="flex items-center gap-2 px-1">
          <StepBadge
            n={2}
            state={lichessConnected ? "done" : hasCircles ? "active" : "todo"}
          />
          <h3
            className={`text-sm font-semibold ${
              hasCircles ? "" : "text-[var(--muted-foreground)]"
            }`}
          >
            Your Lichess account
          </h3>
        </div>

        {!hasCircles ? (
          <Card>
            <CardContent className="pt-5">
              <p className="text-sm text-[var(--muted-foreground)]">
                Create your Circles account first, then connect Lichess.
              </p>
            </CardContent>
          </Card>
        ) : (
          <>
            <p className="px-1 text-xs text-[var(--muted-foreground)]">
              Connect the Lichess account you’ll play with. No account yet? It’s free —
              create one at{" "}
              <a
                href="https://lichess.org/signup"
                target="_blank"
                rel="noopener noreferrer"
                className="underline"
              >
                lichess.org/signup
              </a>
              , then come back and connect.
            </p>
            <LichessConnect onConnectionChange={onLichessChange} />
          </>
        )}
      </div>
    </div>
  );
}
