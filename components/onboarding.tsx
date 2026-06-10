"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { LichessConnect } from "@/components/lichess-connect";
import { ConnectLichessFirst } from "@/components/connect-lichess-first";
import { Crowns } from "@/components/ui/crown";
import { Modal } from "@/components/ui/modal";

/**
 * Lichess-first onboarding. The headline action is "Connect your Lichess
 * account" — under the hood that runs Lichess OAuth and then creates a passkey
 * (the wallet), inheriting the Lichess username.
 *
 * Existing Circles users don't need a separate "log in" button: inside the host
 * their wallet is already connected (`address` is set), so they land directly on
 * the "connect Lichess to this wallet" branch.
 */
export function Onboarding({
  address,
  isMiniappHost,
  onLichessChange,
}: {
  address: string | null;
  isMiniappHost: boolean;
  lichessConnected: boolean | null;
  onLichessChange: (connected: boolean) => void;
}) {
  const [showInfo, setShowInfo] = React.useState(false);

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      {/* Pitch — lead with Lichess */}
      <div className="flex flex-col items-center gap-3 rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img src="/chess-puzzle-avatar-512.png" alt="Stakemate" className="h-16 w-16 rounded" />
        <h2 className="font-display text-xl font-bold text-[var(--foreground)]">
          Your Lichess games, with stakes
        </h2>
        <ul className="space-y-1.5 text-left text-sm">
          <li className="flex items-start gap-2">
            <span className="text-[var(--primary)]">♟</span>
            <span>
              Every player earns <Crowns value={1} /> an hour — no strings
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[var(--primary)]">♟</span>
            <span>
              Challenge anyone by staking your <Crowns />
            </span>
          </li>
          <li className="flex items-start gap-2">
            <span className="text-[var(--primary)]">♟</span>
            <span>
              Winner takes their stake back plus the loser’s <Crowns /> — for the trophy shelf
            </span>
          </li>
        </ul>
        <p className="text-xs text-[var(--muted-foreground)]">
          Stakemate uses Circles to track your <Crowns />.{" "}
          <button onClick={() => setShowInfo(true)} className="font-medium text-[var(--link)] underline">
            What’s Circles?
          </button>
        </p>
      </div>

      <Card>
        <CardContent className="space-y-3 pt-5">
          {!isMiniappHost ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Open Stakemate inside the Circles app to get started.
            </p>
          ) : address ? (
            // Wallet already connected (returning / existing Circles user) → just
            // connect Lichess to it.
            <>
              <p className="text-sm text-[var(--muted-foreground)]">
                Almost there — connect the Lichess account you’ll play with.
              </p>
              <LichessConnect onConnectionChange={onLichessChange} />
            </>
          ) : (
            // No wallet yet → Lichess-first: OAuth, then a passkey is created for you.
            <ConnectLichessFirst onConnected={() => onLichessChange(true)} />
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
          className="inline-flex font-medium text-[var(--link)] underline"
        >
          Learn more at aboutcircles.com →
        </a>
      </Modal>
    </div>
  );
}
