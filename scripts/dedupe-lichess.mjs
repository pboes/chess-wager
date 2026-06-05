/**
 * One-off: enforce one Lichess account ↔ one Circles wallet on existing data.
 * Finds Lichess ids claimed by more than one address in the shared connection
 * hash, keeps the EARLIEST link (first-come-first-served, matching the new
 * connect-time rule), and reverts the rest.
 *
 * Usage: REDIS_URL=... node scripts/dedupe-lichess.mjs [--apply]
 * Without --apply it only reports (dry run).
 */
import IORedis from "ioredis";

const KEY = "circles:lichess";
const apply = process.argv.includes("--apply");
const url = process.env.REDIS_URL;
if (!url) {
  console.error("REDIS_URL not set");
  process.exit(1);
}
const redis = new IORedis(url, { maxRetriesPerRequest: 3 });

const all = await redis.hgetall(KEY);
const byId = new Map();
for (const [field, raw] of Object.entries(all)) {
  let c;
  try {
    c = JSON.parse(raw);
  } catch {
    continue;
  }
  const id = c.lichessId ?? "(none)";
  (byId.get(id) ?? byId.set(id, []).get(id)).push({ field, ...c });
}

console.log(`${Object.keys(all).length} connection(s) in ${KEY}\n`);
let removed = 0;
for (const [id, conns] of byId) {
  if (conns.length < 2) continue;
  conns.sort((a, b) => (a.connectedAt ?? 0) - (b.connectedAt ?? 0));
  const keep = conns[0];
  const drop = conns.slice(1);
  console.log(`Lichess "${conns[0].username}" (${id}) claimed by ${conns.length} wallets:`);
  console.log(`   KEEP  ${keep.address}  (connected ${new Date(keep.connectedAt).toISOString()})`);
  for (const d of drop) {
    console.log(`   DROP  ${d.address}  (connected ${new Date(d.connectedAt).toISOString()})`);
    if (apply) {
      await redis.hdel(KEY, d.field);
      removed++;
    }
  }
  console.log();
}

console.log(apply ? `Removed ${removed} duplicate link(s).` : "Dry run — re-run with --apply to revert.");
await redis.quit();
