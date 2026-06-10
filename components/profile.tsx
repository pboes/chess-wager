"use client";

import * as React from "react";
import { Card, CardContent } from "@/components/ui/card";
import { ShieldCheck } from "lucide-react";
import { useWallet } from "@/components/wallet/wallet-provider";
import { LichessConnect } from "@/components/lichess-connect";

/** Account screen: Circles account status + Lichess link/unlink. */
export function Profile({ onLichessChange }: { onLichessChange: (c: boolean) => void }) {
  const { address } = useWallet();
  return (
    <div className="space-y-4">
      <Card>
        <CardContent className="flex items-center gap-2 py-3 text-sm">
          <ShieldCheck className="h-4 w-4 text-[var(--accent)]" />
          <span className={address ? "" : "text-[var(--muted-foreground)]"}>
            {address ? "Circles account active — it holds your Crowns" : "No account yet"}
          </span>
        </CardContent>
      </Card>
      <LichessConnect onConnectionChange={onLichessChange} />
    </div>
  );
}
