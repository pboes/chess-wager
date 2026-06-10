"use client";

import * as React from "react";
import { HelpCircle, Loader2, Plus, Swords, Trophy, User } from "lucide-react";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useChallenges } from "@/hooks/use-challenges";
import { Button } from "@/components/ui/button";
import { Modal } from "@/components/ui/modal";
import { SummaryBar } from "@/components/summary-bar";
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
function AppHome({ onLichessChange }: { onLichessChange: (c: boolean) => void }) {
  const { address } = useWallet();
  const { challenges, refresh } = useChallenges();
  const [tab, setTab] = React.useState<Tab>("play");
  const [creating, setCreating] = React.useState(false);

  // Incoming invites waiting on me → a count badge on the Challenges tab.
  const me = address?.toLowerCase() ?? "";
  const incomingCount = challenges.filter(
    (c) => c.status === "created" && c.challenger.address !== me
  ).length;
  const [showHelp, setShowHelp] = React.useState(false);

  return (
    <>
      {/* Header */}
      <div className="flex items-center justify-between px-1">
        <h1 className="flex items-center gap-1.5 text-base font-bold">
          <span className="text-[var(--primary)]">♟</span> Stakemate
        </h1>
        <button
          onClick={() => setShowHelp(true)}
          aria-label="How it works"
          className="text-[var(--muted-foreground)] transition hover:text-[var(--foreground)]"
        >
          <HelpCircle className="h-5 w-5" />
        </button>
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
          <strong className="text-[var(--foreground)]">Win</strong> and you keep your Crowns and
          take your opponent’s. <strong className="text-[var(--foreground)]">Lose</strong> and you
          forfeit your stake. Out of Crowns? Wait a bit — they tick back up.
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
          <SummaryBar challenges={challenges} />
          <Button className="w-full" size="lg" onClick={() => setCreating(true)}>
            <Plus className="h-5 w-5" /> Create new challenge
          </Button>
          <IncomingChallenges challenges={challenges} onChange={refresh} />
          <ActiveGames challenges={challenges} onChange={refresh} />
        </div>
      )}

      {tab === "board" && <Leaderboard challenges={challenges} />}

      {tab === "profile" && <Profile onLichessChange={onLichessChange} />}

      <CreateChallenge
        open={creating}
        onClose={() => setCreating(false)}
        onCreated={refresh}
      />
    </>
  );
}
