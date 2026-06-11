"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { LichessConnect } from "@/components/lichess-connect";
import { ConnectLichessFirst } from "@/components/connect-lichess-first";
import { LandingCarousel } from "@/components/landing-carousel";

/**
 * Lichess-first onboarding. Leads with reassurance (it's chess, not crypto), a
 * how-it-works visual, and a peek at the real app — so a new player understands
 * and trusts it before being asked to connect. The headline action runs Lichess
 * OAuth and then creates a passkey, inheriting the Lichess username.
 *
 * Existing users skip straight to "connect Lichess to this wallet" because their
 * wallet is already connected in the host (`address` is set).
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
  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      {/* Hero — lead with chess + reassurance */}
      <div className="flex flex-col items-center gap-2 pt-2 text-center">
        <h2 className="font-display text-2xl font-bold text-[var(--foreground)]">
          Your Lichess games, with stakes
        </h2>
        <p className="text-sm text-[var(--muted-foreground)]">
          Wager Crowns on your games and climb the leaderboard. No gambling, no tokens — just
          bragging rights.
        </p>
      </div>

      {/* How it works — the visual carries the steps + the "not crypto" reassurance */}
      <div className="overflow-hidden rounded-2xl border border-[var(--border)] bg-[var(--card)]">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/stakemate_how_it_works_portrait_4x5.svg"
          alt="How Stakemate works: connect Lichess, challenge anyone, play on Lichess, win their Crowns."
          className="w-full"
        />
      </div>

      {/* The ask */}
      <Card>
        <CardContent className="space-y-3 pt-5">
          {!isMiniappHost ? (
            <p className="text-sm text-[var(--muted-foreground)]">
              Open Stakemate inside the Circles app to get started.
            </p>
          ) : address ? (
            // Wallet already connected (returning user) → just connect Lichess to it.
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

      {/* Proof — a peek at the real app */}
      <LandingCarousel />

      <p className="px-2 text-center text-[11px] text-[var(--muted-foreground)]">
        No Lichess account? It’s free —{" "}
        <a href="https://lichess.org/signup" target="_blank" rel="noopener noreferrer" className="underline">
          lichess.org/signup
        </a>
        .
      </p>
    </div>
  );
}
