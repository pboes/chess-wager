"use client";

import * as React from "react";
import { useWallet } from "@/components/wallet/wallet-provider";
import { Badge } from "@/components/ui/badge";
import { shortenAddress } from "@/lib/utils";
import { Swords } from "lucide-react";

export function Header() {
  const { address, isConnected } = useWallet();
  const [hasLogo, setHasLogo] = React.useState(true);

  return (
    <header className="mx-auto flex w-full max-w-5xl items-center justify-between py-5">
      <div className="flex items-center gap-2.5">
        <div
          aria-label="Chess Wager"
          className={`flex h-9 w-9 items-center justify-center overflow-hidden rounded-xl text-lg text-white shadow-sm ${
            hasLogo ? "" : "bg-[var(--primary)]"
          }`}
        >
          {hasLogo ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src="/chess-puzzle-avatar-512.png"
              alt="Chess Wager"
              className="h-full w-full object-cover"
              onError={() => setHasLogo(false)}
            />
          ) : (
            "♞"
          )}
        </div>
        <div className="leading-tight">
          <h1 className="text-base font-bold">Chess Wager</h1>
          <p className="flex items-center gap-1 text-[11px] text-[var(--muted-foreground)]">
            <Swords className="h-3 w-3 text-[var(--accent)]" />
            Stake · play on Lichess · winner takes the pot
          </p>
        </div>
      </div>
      {isConnected ? (
        <Badge variant="success">
          <span className="h-1.5 w-1.5 rounded-full bg-[var(--accent)]" />
          {shortenAddress(address)}
        </Badge>
      ) : (
        <Badge variant="muted">Not connected</Badge>
      )}
    </header>
  );
}
