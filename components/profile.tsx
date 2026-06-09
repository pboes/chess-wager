"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { useWallet } from "@/components/wallet/wallet-provider";
import { LichessConnect } from "@/components/lichess-connect";

/** Account screen: Circles wallet + Lichess link/unlink. */
export function Profile({ onLichessChange }: { onLichessChange: (c: boolean) => void }) {
  const { address } = useWallet();
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="space-y-1 py-4">
          <div className="text-[11px] font-medium uppercase tracking-wide text-[var(--muted-foreground)]">
            Circles wallet
          </div>
          <div className="font-mono text-sm">
            {address ? `${address.slice(0, 10)}…${address.slice(-6)}` : "—"}
          </div>
          <p className="text-[11px] text-[var(--muted-foreground)]">
            Holds your coins and your winnings.
          </p>
        </CardContent>
      </Card>
      <LichessConnect onConnectionChange={onLichessChange} />
    </div>
  );
}
