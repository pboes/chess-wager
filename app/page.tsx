"use client";

import * as React from "react";
import { HelpCircle, Loader2, Plus, RefreshCw, Trophy, User, Swords } from "lucide-react";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useChallenges } from "@/hooks/use-challenges";
import { useBalances, attoToCrc } from "@/hooks/use-balances";
import { computeCollection } from "@/lib/challenge/collection";
import { Button } from "@/components/ui/button";
import { Crowns } from "@/components/ui/crown";
import { Modal } from "@/components/ui/modal";
import { IncomingChallenges } from "@/components/incoming-challenges";
import { CreateChallenge } from "@/components/create-challenge";
import { ActiveGames } from "@/components/active-games";
import { Leaderboard } from "@/components/leaderboard";
import { Profile } from "@/components/profile";
import { Onboarding } from "@/components/onboarding";

export default function Home() {
  const { address, isMiniappHost } = useWallet();
  const [lichessConnected, setLichessConnected] = React.useState<boolean | null>(null);

  // Source-of-truth check (independent of which view is mounted) so a fully
  // onboarded returning user lands straight on the app.
  React.useEffect(() => {
    if (!address) {
      setLichessConnected(null);
      return;
    }
    let off = false;
    (async () => {
      try {
        const r = await fetch(`/api/lichess/status?address=${address}`);
        const d = await r.json();
        if (!off) setLichessConnected(Boolean(d.connected));
      } catch {
        if (!off) setLichessConnected(false);
      }
    })();
    return () => {
      off = true;
    };
  }, [address]);

  const ready = Boolean(address) && lichessConnected === true;
  const checking = Boolean(address) && lichessConnected === null;

  return (
    <div className="mx-auto w-full max-w-md space-y-4">
      {ready ? (
        <AppHome onLichessChange={setLichessConnected} />
      ) : checking ? (
        <div className="flex justify-center py-16 text-[var(--muted-foreground)]">
          <Loader2 className="h-6 w-6 animate-spin" />
        </div>
      ) : (
        <Onboarding
          address={address}
          isMiniappHost={isMiniappHost}
          lichessConnected={lichessConnected}
          onLichessChange={setLichessConnected}
        />
      )}
      {/* TEMP diagnostic — shows which signal is missing when stuck on the landing. */}
      <p className="select-all pt-2 text-center font-mono text-[10px] text-[var(--muted-foreground)]">
        dbg host:{isMiniappHost ? "y" : "n"} · wallet:
        {address ? `${address.slice(0, 6)}…${address.slice(-4)}` : "NONE"} · lichess:
        {lichessConnected === null ? "…" : lichessConnected ? "y" : "n"}
      </p>
    </div>
  );
}

type Tab = "play" | "board" | "profile";

const TABS: { key: Tab; label: string; icon: React.ComponentType<{ className?: string }> }[] = [
  { key: "play", label: "Challenges", icon: Swords },
  { key: "board", label: "Leaderboard", icon: Trophy },
  { key: "profile", label: "Profile", icon: User },
];

/** The hub for a fully-onboarded player: Challenges · Trophies · Profile. */
const fmt = (n: number) => Math.floor(n).toLocaleString();

function AppHome({ onLichessChange }: { onLichessChange: (c: boolean) => void }) {
  const { address } = useWallet();
  const { challenges, refresh } = useChallenges();
  const { balances, loading: balLoading, refresh: refreshBalances } = useBalances();
  const [tab, setTab] = React.useState<Tab>("play");
  const [creating, setCreating] = React.useState(false);
  const [showHelp, setShowHelp] = React.useState(false);

  // Incoming invites waiting on me → a count badge on the Challenges tab.
  const me = address?.toLowerCase() ?? "";
  const incomingCount = challenges.filter(
    (c) => c.status === "created" && c.challenger.address !== me
  ).length;

  const crowns = attoToCrc(balances?.heldPersonalAtto) + attoToCrc(balances?.mintableAtto);
  const { collected, players } = computeCollection(challenges, address ?? "");
  const refreshAll = () => {
    refresh();
    refreshBalances();
  };

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h1 className="flex items-center gap-1.5 font-display text-base font-bold">
          <span className="text-[var(--primary)]">♟</span> Stakemate
        </h1>
        <div className="flex items-center gap-3 text-[var(--muted-foreground)]">
          <button
            onClick={refreshAll}
            disabled={balLoading}
            aria-label="Refresh"
            className="transition hover:text-[var(--foreground)] disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${balLoading ? "animate-spin" : ""}`} />
          </button>
          <button
            onClick={() => setShowHelp(true)}
            aria-label="How it works"
            className="transition hover:text-[var(--foreground)]"
          >
            <HelpCircle className="h-5 w-5" />
          </button>
        </div>
      </div>

      {/* Standing — Crowns + score, above the tabs, always visible */}
      <div className="flex items-stretch rounded-[var(--radius)] border border-[var(--border)] bg-[var(--card)]">
        <div className="flex-1 py-2.5 text-center">
          <div className="font-display text-2xl font-bold leading-none">
            <Crowns value={fmt(crowns)} />
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
            Crowns to play
          </div>
        </div>
        <div className="w-px bg-[var(--border)]" />
        <div className="flex-1 py-2.5 text-center">
          <div className="font-display text-2xl font-bold leading-none text-[var(--accent)]">
            {fmt(collected)}
          </div>
          <div className="mt-1 text-[10px] uppercase tracking-wide text-[var(--muted-foreground)]">
            score{players > 0 ? ` · ${players} beaten` : ""}
          </div>
        </div>
      </div>

      <Modal open={showHelp} onClose={() => setShowHelp(false)} title="How Stakemate works">
        <p>
          It’s your Lichess games — <strong className="text-[var(--foreground)]">with stakes</strong>.
        </p>
        <p>
          You earn <strong className="text-[var(--foreground)]">1 Crown an hour</strong>,
          automatically. Stake them to challenge any Lichess player to a game.
        </p>
        <p>
          <strong className="text-[var(--foreground)]">Win</strong> and you get your stake back plus
          your opponent’s Crowns — for the trophy shelf.{" "}
          <strong className="text-[var(--foreground)]">Lose</strong> and you forfeit your stake. Out
          of Crowns? Wait a bit — they tick back up.
        </p>
        <p>
          Your <strong className="text-[var(--foreground)]">score</strong> is the value of everyone
          you’ve beaten — and beating stronger players is worth more. Climb the leaderboard.
        </p>
      </Modal>

      {/* Tab bar */}
      <div className="flex rounded-xl border border-[var(--border)] bg-[var(--card)] p-1">
        {TABS.map(({ key, label, icon: Icon }) => (
          <button
            key={key}
            onClick={() => setTab(key)}
            className={`relative flex flex-1 items-center justify-center gap-1.5 rounded-lg py-2 text-sm font-medium transition ${
              tab === key
                ? "bg-[var(--primary)] text-white"
                : "text-[var(--muted-foreground)] hover:text-[var(--foreground)]"
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
            {key === "play" && incomingCount > 0 && (
              <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-[var(--accent)] px-1 text-[10px] font-bold text-white">
                {incomingCount}
              </span>
            )}
          </button>
        ))}
      </div>

      {tab === "play" && (
        <div className="space-y-4">
          <Button className="w-full" size="lg" onClick={() => setCreating(true)}>
            <Plus className="h-5 w-5" /> Create new challenge
          </Button>
          <IncomingChallenges challenges={challenges} onChange={refreshAll} />
          <ActiveGames challenges={challenges} onChange={refreshAll} />
        </div>
      )}

      {tab === "board" && <Leaderboard challenges={challenges} />}

      {tab === "profile" && <Profile onLichessChange={onLichessChange} />}

      <CreateChallenge
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={refreshAll}
      />
    </>
  );
}
