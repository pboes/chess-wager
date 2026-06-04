"use client";

import * as React from "react";
import { useWallet } from "@/components/wallet/wallet-provider";
import { getPermissionlessGroup } from "@/lib/permissionless-group";
import { buildStakeTransferTxs, type SimpleTx } from "@/lib/stake-transfer";
import { ESCROW_ADDRESS } from "@/lib/circles-config";
import { crcToAtto } from "@/lib/challenge/accounting";

const atto = (v: bigint) => Number(v / 10n ** 12n) / 1e6;
const toTx = (t: { to: unknown; data?: unknown; value?: unknown }) => ({
  to: t.to as string,
  data: (t.data ?? "0x") as string,
  value: (t.value ?? "0").toString(),
});

export interface UseStake {
  /** Directly-spendable group-CRC (held). null until checked. */
  balanceCrc: number | null;
  /** Legacy CRC migratable into the group — only used when held < stake. */
  migratableCrc: number | null;
  refreshBalance: () => Promise<void>;
  /** Stake `stakeCrc` gCRC into the escrow; returns the broadcast tx hashes. */
  stake: (stakeCrc: number) => Promise<string[]>;
}

/**
 * Stake gCRC into the escrow as a single host-signed batch — migrating legacy
 * CRC in-app first when the held balance is short, exactly like the puzzle
 * entry (one signature, no Circles App detour).
 */
export function useStake(): UseStake {
  const { address, sendTransactions } = useWallet();
  const [balanceCrc, setBalanceCrc] = React.useState<number | null>(null);
  const [migratableCrc, setMigratableCrc] = React.useState<number | null>(null);

  const refreshBalance = React.useCallback(async () => {
    if (!address) return;
    try {
      const group = getPermissionlessGroup();
      const bal = await group.balance(address as `0x${string}`);
      setBalanceCrc(atto(bal.heldTotal));
      setMigratableCrc(atto(bal.migratable));
    } catch (err) {
      console.warn("[stake] balance read failed:", err);
      setBalanceCrc(null);
    }
  }, [address]);

  React.useEffect(() => {
    if (!address) {
      setBalanceCrc(null);
      setMigratableCrc(null);
      return;
    }
    void refreshBalance();
  }, [address, refreshBalance]);

  const stake = React.useCallback(
    async (stakeCrc: number): Promise<string[]> => {
      if (!address) throw new Error("Connect your Circles wallet first.");
      const avatar = address as `0x${string}`;
      const stakeAtto = crcToAtto(stakeCrc);
      const group = getPermissionlessGroup();

      const bal = await group.balance(avatar);
      setBalanceCrc(atto(bal.heldTotal));
      setMigratableCrc(atto(bal.migratable));

      let txs: SimpleTx[];
      if (bal.heldTotal >= stakeAtto) {
        txs = await buildStakeTransferTxs(group, avatar, ESCROW_ADDRESS, stakeAtto);
      } else {
        if (bal.heldTotal + bal.migratable < stakeAtto) {
          throw new Error(
            `You need ${stakeCrc} gCRC to stake, but only ${atto(
              bal.heldTotal + bal.migratable
            )} is available.`
          );
        }
        let migTarget = stakeAtto - bal.heldTotal + stakeAtto / 5n;
        if (migTarget > bal.migratable) migTarget = bal.migratable;
        const mig = await group.migration({ avatar, amount: migTarget });
        if (mig.amount === 0n || mig.txs.length === 0) {
          throw new Error("Couldn't route enough migratable CRC to cover the stake.");
        }
        const stakeTxs = await buildStakeTransferTxs(
          group,
          avatar,
          ESCROW_ADDRESS,
          stakeAtto,
          mig.amount
        );
        txs = [...mig.txs.map(toTx), ...stakeTxs];
      }

      const hashes = await sendTransactions(txs);
      await refreshBalance();
      return hashes;
    },
    [address, sendTransactions, refreshBalance]
  );

  return { balanceCrc, migratableCrc, refreshBalance, stake };
}
