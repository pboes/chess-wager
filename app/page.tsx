"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useWallet } from "@/components/wallet/wallet-provider";
import { useChallenges } from "@/hooks/use-challenges";
import { LichessConnect } from "@/components/lichess-connect";
import { SummaryBar } from "@/components/summary-bar";
import { IncomingChallenges } from "@/components/incoming-challenges";
import { CreateChallenge } from "@/components/create-challenge";
import { ActiveGames } from "@/components/active-games";
import { Rivals } from "@/components/rivals";
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
    <div className="mx-auto w-full max-w-3xl space-y-4">
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

/** The hub for a fully-onboarded player. */
function AppHome({ onLichessChange }: { onLichessChange: (c: boolean) => void }) {
  const { challenges, refresh } = useChallenges();

  return (
    <>
      <SummaryBar challenges={challenges} />
      <IncomingChallenges challenges={challenges} onChange={refresh} />
      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <CreateChallenge onCreated={refresh} />
          <ActiveGames challenges={challenges} onChange={refresh} />
        </div>
        <div className="space-y-4">
          <Rivals challenges={challenges} />
        </div>
      </div>
      <LichessConnect onConnectionChange={onLichessChange} />
    </>
  );
}
