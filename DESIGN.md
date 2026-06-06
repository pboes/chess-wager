# Stakemate — design notes

Status: **planning** (personal-CRC mode not yet implemented). gCRC mode is live.

## Two modes

- **Personal (default, free).** Both players stake their *own* personal CRC.
  Anyone with a Circles account can play immediately — a fresh account already
  has ~48 of its own CRC (you mint 1/hour). You never have to leave the mini-app.
- **Group / gCRC (advanced, "real money").** Both stake group CRC. gCRC is
  acquired *outside* the app (see "Getting gCRC").

Framing/storyline: default is personal — free, 1/hour, no friction, "just play."
Upgrade is "want to make it real money? that's group CRC — you set that up in the
Circles app." Ladder: **personal (anyone, free) → gCRC (real money, advanced)**,
and in personal mode the prize is literally the loser's personal CRC (a trophy).

## Personal challenge mechanics (the correction)

- A stakes A's personal CRC, B stakes B's personal CRC, via **direct**
  `Hub.safeTransferFrom` (ERC1155) / wrapped ERC20 — **not** through the
  pathfinder/trust graph. Trust only governs transitive routing + group backing,
  not direct holds, so this works for strangers. (Our gCRC stake already proves a
  raw `safeTransferFrom` isn't trust-gated.)
- The pool is two distinct tokens held in escrow: `{A-CRC amount, B-CRC amount}`.
- Settle → escrow does **two direct transfers** to the winner (A-CRC + B-CRC).
  Winner holds the loser's personal CRC = the trophy. Draw/abort/void → each
  token returns to its staker.
- No escrow-trust bootstrap, no migration — simpler than the gCRC path.
- **Confirm on-chain:** a direct `safeTransferFrom` of a personal token to a
  non-trusting recipient doesn't revert in a Hub hook. (gCRC analogue works.)
- **SDK caveat (important):** `@aboutcircles/sdk-permissionless-groups` only
  handles **gCRC** (balance/transferGroupCrc/migration). For personal CRC use
  **direct on-chain interaction** (viem: `Hub.balanceOf` / `safeTransferFrom` /
  `personalMint` / wrapper calls — which is already how our final stake transfer
  is built) or the dedicated **transfers SDK**. Don't route personal CRC through
  the groups SDK.

## Amounts, units, demurrage — DECISION: keep demurraged quoting

- **Quote stakes in demurraged units** ("today's CRC"), like the rest of the app.
  A challenge = a fixed demurraged amount; the opponent stakes the **same
  demurraged amount**. We prioritise UI convenience over exact received-amount
  fairness.
- **Background static accounting (unchanged).** Record each stake's actually-
  received amount in **static** (time-invariant) units; settle by
  `toDemurrageNow(Σ static) − dustFloat`. Conserves value, never over-draws
  (spike: worst residual −1 wei). For personal, track A-CRC static and B-CRC
  static separately and pay each out as a direct transfer.
- **Fairness via the accept window.** A and B stake at different times, so the
  same demurraged nominal differs slightly in conserved value. The existing
  **24h accept window** keeps the drift negligible — keep `ACCEPT_WINDOW_MS` at 24h.

### How gCRC accounting works today (reference)
Player picks a whole number `n` → treated as `n` demurraged CRC today
(`n × 1e18`) → `safeTransferFrom` that → server reads the received demurraged
amount and stores its **static** equivalent → payout =
`toDemurrageNow(challengerStatic + opponentStatic) − dustFloat`.

## Wallet view (on login)

Show three figures so a player knows what they can enter:
- **Mintable personal CRC** — accrued-but-unminted (the ~48 on a fresh account).
- **Held personal CRC** — current balance, aggregated across forms (native
  ERC1155 + demurrage/inflationary ERC20 wrappers).
- **Held group CRC** — current gCRC.

DECISION: **simple/safe** — just the user's current holdings. Ignore
pathfinder-reachable balance for now.

## Minting — DECISION: separate "Claim" that mints **and wraps**

- A distinct **Claim** action mints accrued personal CRC **and immediately wraps
  it to an ERC20** so the claimed amount stays constant (doesn't demurrage away).
  Use the **inflationary (static)** wrapper since that's the one that keeps a
  constant nominal balance. (`personalMint` on the Hub → wrap.)

## Getting gCRC — DECISION: none in-app, send to app.gnosis.io

- **No way to obtain gCRC inside the mini-app.** Personal mode is fully
  self-contained.
- gCRC mode requires **pre-held gCRC**. If short, open a **gCRC explainer modal**
  → CTA to **app.gnosis.io**.
- **gCRC explainer modal copy** (and a "Learn more" out): gCRC is the "real money"
  currency, priced ~**€0.01 / gCRC**; you create or buy it in the Circles app.
  **Framing matters:** present this as *"finish your onboarding"*, NOT "set up /
  register a new account" — the user **already has an account** (their passkey),
  so they must click **Log in** (use existing passkey) at app.gnosis.io, then top
  up / buy gCRC. Wrong-button risk (Register vs Log in) is the main pitfall.
- **Drop the current auto-migration** (personal/legacy → group) from the gCRC
  stake path — it conflicts with "gCRC = real money acquired elsewhere."

## Code / data-model deltas (for the build, later)

- `Challenge.mode: "personal" | "group"`. Personal token id =
  `uint256(uint160(playerAddress))`; group uses `SCORE_GROUP_ADDRESS`.
- `StakeRecord` carries its token id (personal differs per player).
- Generalise `buildStakeTransferTxs` to any token id (avatar's own personal
  token, or the group token).
- Escrow payout: direct `safeTransferFrom(tokenId)` per token for personal; the
  existing buffered/transferGroupCrc path for group.
- create-challenge: mode toggle (personal default), gate by balances; gCRC short
  → CTA out.
- New: balances hook/endpoint (mintable + held personal + held gCRC) and the
  Claim (mint + wrap) action.

## Decided

- Accept window: **24h** (unchanged).
- gCRC balances: **current holdings only**, no pathfinder.
- gCRC acquisition: **out of app → app.gnosis.io** (log in with passkey = finish
  onboarding); auto-migration **dropped**.
- Minting: separate **Claim** = mint + wrap to **inflationary** ERC20.
- Personal sends/reads: **direct on-chain / transfers SDK**, not the groups SDK.

## Still to verify during build

1. Direct `safeTransferFrom` of a personal token to a non-trusting recipient
   doesn't revert.
2. Exact calls for `personalMint` + wrap, and reading mintable/held personal CRC.
