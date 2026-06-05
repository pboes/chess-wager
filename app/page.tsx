"use client";

import * as React from "react";
import { useWallet } from "@/components/wallet/wallet-provider";
import { LichessConnect } from "@/components/lichess-connect";
import { CreateChallenge } from "@/components/create-challenge";
import { MyChallenges } from "@/components/my-challenges";

export default function Home() {
  const { address, isConnected } = useWallet();
  const [lichessConnected, setLichessConnected] = React.useState<boolean | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

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
  }, [address, refreshKey]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      {!isConnected && (
        <div className="rounded-2xl border border-[var(--border)] bg-[var(--card)] p-6 text-center text-sm text-[var(--muted-foreground)]">
          Open this app inside Circles to connect your wallet and start dueling.
        </div>
      )}

      <div className="grid gap-4 md:grid-cols-2">
        <div className="space-y-4">
          <LichessConnect onConnectionChange={setLichessConnected} />
          {isConnected && lichessConnected && (
            <CreateChallenge onCreated={() => setRefreshKey((k) => k + 1)} />
          )}
          {isConnected && lichessConnected === false && (
            <p className="px-1 text-xs text-[var(--muted-foreground)]">
              Connect your Lichess account above to create a challenge.
            </p>
          )}
        </div>
        <div className="space-y-4">
          <MyChallenges refreshKey={refreshKey} />
        </div>
      </div>
    </div>
  );
}
