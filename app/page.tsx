"use client";

import * as React from "react";
import { Loader2 } from "lucide-react";
import { useWallet } from "@/components/wallet/wallet-provider";
import { LichessConnect } from "@/components/lichess-connect";
import { CreateChallenge } from "@/components/create-challenge";
import { MyChallenges } from "@/components/my-challenges";
import { Onboarding } from "@/components/onboarding";

export default function Home() {
  const { address, isMiniappHost } = useWallet();
  const [lichessConnected, setLichessConnected] = React.useState<boolean | null>(null);
  const [refreshKey, setRefreshKey] = React.useState(0);

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
  }, [address, refreshKey]);

  const ready = Boolean(address) && lichessConnected === true;
  const checking = Boolean(address) && lichessConnected === null;

  return (
    <div className="mx-auto w-full max-w-5xl space-y-4">
      {ready ? (
        <div className="grid gap-4 md:grid-cols-2">
          <div className="space-y-4">
            <LichessConnect onConnectionChange={setLichessConnected} />
            <CreateChallenge onCreated={() => setRefreshKey((k) => k + 1)} />
          </div>
          <div className="space-y-4">
            <MyChallenges refreshKey={refreshKey} />
          </div>
        </div>
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
