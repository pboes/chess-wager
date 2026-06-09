"use client";

import * as React from "react";
import { useWallet } from "@/components/wallet/wallet-provider";
import type { Challenge } from "@/lib/challenge/types";

export interface UseChallenges {
  challenges: Challenge[];
  loading: boolean;
  refresh: () => Promise<void>;
}

/**
 * The single source of the player's challenges — sent, received (invites), and
 * settled — shared by the summary bar, incoming list, active games and rivals so
 * the page makes one request and one poll. Auto-polls while anything is pending
 * (opponent may accept; the server auto-settles finished games).
 */
export function useChallenges(): UseChallenges {
  const { address } = useWallet();
  const [challenges, setChallenges] = React.useState<Challenge[]>([]);
  const [loading, setLoading] = React.useState(false);

  const load = React.useCallback(async () => {
    if (!address) {
      setChallenges([]);
      return;
    }
    try {
      const r = await fetch(`/api/challenges?address=${address}`, { cache: "no-store" });
      const d = await r.json();
      setChallenges(Array.isArray(d.challenges) ? d.challenges : []);
    } catch {
      /* keep the last good list */
    }
  }, [address]);

  const refresh = React.useCallback(async () => {
    setLoading(true);
    await Promise.all([load(), new Promise((r) => setTimeout(r, 300))]);
    setLoading(false);
  }, [load]);

  React.useEffect(() => {
    void load();
  }, [load]);

  const hasPending = challenges.some((c) => c.status === "created" || c.status === "accepted");
  React.useEffect(() => {
    if (!hasPending) return;
    const t = setInterval(() => void load(), 12000);
    return () => clearInterval(t);
  }, [hasPending, load]);

  return { challenges, loading, refresh };
}
