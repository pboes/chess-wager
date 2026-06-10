"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useWallet } from "@/components/wallet/wallet-provider";
import { LichessConnect } from "@/components/lichess-connect";
import { ConnectLichessFirst } from "@/components/connect-lichess-first";
import { Modal } from "@/components/ui/modal";
import { Loader2 } from "lucide-react";

/**
 * Lichess-first onboarding. The headline action is "Connect your Lichess
 * account" — under the hood that runs Lichess OAuth and then creates a passkey
 * (the wallet), inheriting the Lichess username. Existing Circles users get a
 * secondary "I already have an account" route. The flow shown is chosen by
 * whether a wallet already exists.
 */
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
  const [loggingIn, setLoggingIn] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);
  const [showInfo, setShowInfo] = React.useState(false);

  // Existing Circles user logging in: open the host's log-in flow; the resulting
  // address flips us into the "connect Lichess to this wallet" branch.
  const loginExisting = React.useCallback(async () => {
    setError(null);
    setLoggingIn(true);
    try {
      await createAccount();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Log-in was cancelled.");
    } finally {
      setLoggingIn(false);
    }
  }, [createAccount]);

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      {/* Pitch — lead with Lichess */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/chess-puzzle-avatar-512.png" alt="Stakemate" className="h-16 w-16 rounded-2xl" />
        <h2 className="text-xl font-bold">Your Lichess games, with stakes</h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Challenge anyone on Lichess, put Crowns on the line, and climb the leaderboard.
        </p>
        <ul className="space-y-1.5 text-left text-sm">
          <li className="flex items-start gap-2">
            <span className="text-[var(--primary)]">♟</span>
            <span>Connect your Lichess account to start</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[var(--primary)]">♟</span>
            <span>Earn a Crown an hour — stake them on challenges</span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[var(--primary)]">♟</span>
            <span>Beat stronger players to score more</span>
          </li>
        </ul>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-5">
          {!isMiniappHost ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Open Stakemate inside the Circles app to get started.
            </p>
          ) : address ? (
            // Wallet exists (returning user, or just logged in) → connect Lichess to it.
            <>
              <p className="text-sm text-[var(--muted-foreground)]">
                Almost there — connect the Lichess account you’ll play with.
              </p>
              <LichessConnect onConnectionChange={onLichessChange} />
            </>
          ) : (
            // No wallet yet → Lichess-first: OAuth, then a passkey is created for you.
            <>
              <ConnectLichessFirst onConnected={() => onLichessChange(true)} />
              <div className="flex items-center justify-between pt-1 text-xs">
                <button
                  onClick={loginExisting}
                  disabled={loggingIn}
                  className="font-medium text-[var(--primary)] underline disabled:opacity-60"
                >
                  {loggingIn ? (
                    <span className="inline-flex items-center gap-1">
                      <Loader2 className="h-3 w-3 animate-spin" /> Opening…
                    </span>
                  ) : (
                    "I already have a Circles account"
                  )}
                </button>
                <button
                  onClick={() => setShowInfo(true)}
                  className="text-[var(--muted-foreground)] underline"
                >
                  What’s Circles?
                </button>
              </div>
              {error && <p className="text-xs text-[var(--destructive)]">{error}</p>}
            </>
          )}
        </CardContent>
      </Card>

      <p className="px-2 text-center text-[11px] text-[var(--muted-foreground)]">
        No Lichess account? It’s free —{" "}
        <a href="https://lichess.org/signup" target="_blank" rel="noopener noreferrer" className="underline">
          lichess.org/signup
        </a>
        .
      </p>

      <Modal open={showInfo} onClose={() => setShowInfo(false)} title="What’s Circles?">
        <p>
          Circles is money you create yourself —{" "}
          <strong className="text-[var(--foreground)]">everyone earns 1 personal CRC an hour</strong>.
          In Stakemate those are your <strong className="text-[var(--foreground)]">Crowns</strong>: the
          stake you put on your games.
        </p>
        <p>
          Connecting Lichess sets up a Circles account for you automatically — a passkey on your
          device, nothing to write down.
        </p>
        <a
          href="https://aboutcircles.com/"
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex font-medium text-[var(--primary)] underline"
        >
          Learn more at aboutcircles.com →
        </a>
      </Modal>
    </div>
  );
}
