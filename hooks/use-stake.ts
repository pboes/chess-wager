"use client";

import * as React from "react";
import { useWallet } from "@/components/wallet/wallet-provider";
import type { ChallengeMode } from "@/lib/challenge/types";

export interface UseStake {
  /** Stake `stakeCrc` of the chosen currency into the escrow; returns tx hashes.
   *  Tx batch is built server-side (personal = direct CRC, group = gCRC). */
  stake: (stakeCrc: number, mode: ChallengeMode) => Promise<string[]>;
}

export function useStake(): UseStake {
  const { address, sendTransactions } = useWallet();

  const stake = React.useCallback(
    async (stakeCrc: number, mode: ChallengeMode): Promise<string[]> => {
      if (!address) throw new Error("Connect your Circles wallet first.");
      const res = await fetch("/api/stake-txs", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ address, mode, stakeCrc }),
      });
      const d = await res.json();
      if (!res.ok || !d.txs) throw new Error(d.error ?? "Couldn’t build the stake transaction.");
      return sendTransactions(d.txs);
    },
    [address, sendTransactions]
  );

  return { stake };
}
