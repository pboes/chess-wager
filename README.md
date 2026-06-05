# Stakemate

A Circles mini-app for staked 1v1 chess. Challenge a connected player, both
stake gCRC, play the game on Lichess, and the winner takes the pot. Sibling app
to the Daily Chess Puzzle — separate deploy, shared Redis + Lichess connection.

## How it works

1. **Connect Lichess** (wallet signature + Lichess OAuth — shared with the puzzle
   app, so you connect once).
2. **Create a challenge**: pick an opponent, a time control (10+0, 5+3, 3+2,
   5+0), and a stake. Your stake goes into the **escrow org Safe**.
3. **Opponent accepts** by staking the same amount. The app then creates a
   **Lichess open challenge** bound to the two usernames and hands each player
   their color link.
4. Play on Lichess. Afterwards, **anyone** can hit *settle* — the backend reads
   the authoritative result by game id and the **winner is paid** from escrow.
   Draw / abort / no-show → both refunded.

## Design notes

- **Custody**: backend escrow (one registered org Safe, EOA signer, payouts via
  `SafeContractRunner`). Token-agnostic so a future personal-CRC "trophy mode"
  can slot in. v1 uses group CRC (gCRC).
- **Accounting under demurrage**: stakes are stored in **static** (time-invariant)
  units; payout = `toDemurrage(Σ static) − dust float`. A spike proved the
  escrow can never over-draw (worst residual −1 wei). Demurrage is day-quantized
  economic decay (0% over minutes), borne uniformly — the winner takes the pot.
- **Oracle**: app-created Lichess open challenges. The app owns the game id and
  restricts it to the two usernames, so players can't cherry-pick a favorable
  game or sub in a ringer. Settlement is permissionless + idempotent (`SET NX`).

## Layout

- `lib/challenge/` — types, state machine, demurrage accounting
- `lib/lichess-game.ts` — open-challenge create + result export (the oracle)
- `lib/stake-transfer.ts` — buffered group-CRC stake into escrow (one signature)
- `lib/server/` — store (Redis/file), escrow payout, stake verification
- `app/api/challenge/` — create / accept / settle / get / list

## Env

See `.env.example`. Local dev works with no env (file-backed store); live
stakes/payouts need `ESCROW_ORG_ADDRESS`, `ESCROW_PRIVATE_KEY`, and `REDIS_URL`.
