/**
 * Stakemate store.
 *
 * Per-key namespaced model:
 *
 *   challenge:{id}   str   the Challenge object
 *   user:{address}   set   challenge ids involving this address
 *   usedtx           set   stake-payment tx hashes already consumed
 *   usedgame         set   Lichess game ids already settled
 *   settle:{id}      str   settlement claim sentinel (SET NX → pay once)
 *   circles:lichess  hash  address -> LichessConnection (SHARED with the puzzle
 *                          app so a connection made in either app works in both)
 *
 * In production this is **Redis** (`REDIS_URL`): the exactly-once payout guard
 * (`claimSettle`, SET NX) and the used-tx/used-game sets are atomic per-key, so
 * concurrent settle clicks across serverless instances can't double-pay. The
 * Challenge object itself is read-modify-write at the app layer — acceptable
 * because the money-moving step is the one guarded by `claimSettle`.
 *
 * For local `pnpm dev` a JSON file backend is used; in-memory is the last resort.
 */
import type { LichessConnection, LichessHandoff } from "@/lib/lichess";
import type { Challenge } from "@/lib/challenge/types";

export interface StoreBackend {
  createChallenge(c: Challenge): Promise<void>;
  getChallenge(id: string): Promise<Challenge | null>;
  /** Overwrite a challenge (used for phase transitions). */
  saveChallenge(c: Challenge): Promise<void>;
  listChallengesForUser(address: string): Promise<Challenge[]>;

  isTxUsed(txHash: string): Promise<boolean>;
  markTxUsed(txHash: string): Promise<void>;
  isGameUsed(gameId: string): Promise<boolean>;
  markGameUsed(gameId: string): Promise<void>;

  /** Atomically reserve a challenge for settlement; false if already claimed —
   *  the guarantee that the winner/refund is paid at most once. */
  claimSettle(id: string): Promise<boolean>;
  /** Release a settle claim (it failed) so it can be retried. */
  unclaimSettle(id: string): Promise<void>;

  /** Shared Lichess connection for a Circles address. */
  getLichess(address: string): Promise<LichessConnection | null>;
  /** Reverse lookup — the connection that owns a given Lichess id, if any.
   *  Used to enforce one Lichess account ↔ one Circles wallet. */
  getLichessByLichessId(lichessId: string): Promise<LichessConnection | null>;
  setLichess(address: string, conn: LichessConnection): Promise<void>;
  deleteLichess(address: string): Promise<void>;
  listLichess(): Promise<LichessConnection[]>;

  /** Transient OAuth handoff (short TTL), keyed by its token. */
  getHandoff(token: string): Promise<LichessHandoff | null>;
  setHandoff(handoff: LichessHandoff): Promise<void>;
}

// ─────────────────────────────── Redis ───────────────────────────────

import IORedis from "ioredis";

const K = {
  challenge: (id: string) => `cw:challenge:${id}`,
  user: (a: string) => `cw:user:${a.toLowerCase()}`,
  usedtx: "cw:usedtx",
  usedgame: "cw:usedgame",
  settle: (id: string) => `cw:settle:${id}`,
  lichess: "circles:lichess", // shared with the puzzle app
  handoff: (t: string) => `cw:lichess-handoff:${t}`,
};

const HANDOFF_TTL = 900; // seconds

const parse = <T>(v: string | null): T | null => {
  if (v == null) return null;
  try {
    return JSON.parse(v) as T;
  } catch {
    return null;
  }
};

class RedisBackend implements StoreBackend {
  private redis: IORedis;
  constructor(redis: IORedis) {
    this.redis = redis;
  }

  async createChallenge(c: Challenge) {
    await Promise.all([
      this.redis.set(K.challenge(c.id), JSON.stringify(c)),
      this.redis.sadd(K.user(c.challenger.address), c.id),
      this.redis.sadd(K.user(c.opponent.address), c.id),
    ]);
  }
  async getChallenge(id: string) {
    return parse<Challenge>(await this.redis.get(K.challenge(id)));
  }
  async saveChallenge(c: Challenge) {
    await this.redis.set(K.challenge(c.id), JSON.stringify(c));
  }
  async listChallengesForUser(address: string) {
    const ids = await this.redis.smembers(K.user(address));
    if (!ids.length) return [];
    const raw = await this.redis.mget(...ids.map(K.challenge));
    return raw.map((v) => parse<Challenge>(v)).filter((c): c is Challenge => !!c);
  }

  async isTxUsed(t: string) {
    return (await this.redis.sismember(K.usedtx, t.toLowerCase())) === 1;
  }
  async markTxUsed(t: string) {
    await this.redis.sadd(K.usedtx, t.toLowerCase());
  }
  async isGameUsed(g: string) {
    return (await this.redis.sismember(K.usedgame, g)) === 1;
  }
  async markGameUsed(g: string) {
    await this.redis.sadd(K.usedgame, g);
  }

  async claimSettle(id: string) {
    const res = await this.redis.set(K.settle(id), String(Date.now()), "NX");
    return res === "OK";
  }
  async unclaimSettle(id: string) {
    await this.redis.del(K.settle(id));
  }

  async getLichess(address: string) {
    return parse<LichessConnection>(await this.redis.hget(K.lichess, address.toLowerCase()));
  }
  async getLichessByLichessId(lichessId: string) {
    const all = await this.redis.hgetall(K.lichess);
    for (const v of Object.values(all)) {
      const c = parse<LichessConnection>(v);
      if (c && c.lichessId === lichessId) return c;
    }
    return null;
  }
  async setLichess(address: string, conn: LichessConnection) {
    await this.redis.hset(K.lichess, address.toLowerCase(), JSON.stringify(conn));
  }
  async deleteLichess(address: string) {
    await this.redis.hdel(K.lichess, address.toLowerCase());
  }
  async listLichess() {
    const all = await this.redis.hgetall(K.lichess);
    return Object.values(all)
      .map((v) => parse<LichessConnection>(v))
      .filter((c): c is LichessConnection => !!c);
  }
  async getHandoff(token: string) {
    return parse<LichessHandoff>(await this.redis.get(K.handoff(token)));
  }
  async setHandoff(h: LichessHandoff) {
    await this.redis.set(K.handoff(h.token), JSON.stringify(h), "EX", HANDOFF_TTL);
  }
}

// ──────────────────────── File / memory (dev) ────────────────────────

interface Doc {
  challenges: Record<string, Challenge>;
  userIndex: Record<string, string[]>;
  usedtx: string[];
  usedgame: string[];
  settled: string[];
  lichess: Record<string, LichessConnection>;
  handoffs: Record<string, LichessHandoff>;
}
const emptyDoc = (): Doc => ({
  challenges: {},
  userIndex: {},
  usedtx: [],
  usedgame: [],
  settled: [],
  lichess: {},
  handoffs: {},
});

abstract class JsonDocBackend implements StoreBackend {
  protected abstract load(): Promise<Doc>;
  protected abstract save(doc: Doc): Promise<void>;
  private chain: Promise<unknown> = Promise.resolve();
  private mutate<T>(fn: (doc: Doc) => T): Promise<T> {
    const run = this.chain.then(async () => {
      const doc = await this.load();
      const r = fn(doc);
      await this.save(doc);
      return r;
    });
    this.chain = run.then(() => undefined, () => undefined);
    return run;
  }

  async createChallenge(c: Challenge) {
    await this.mutate((d) => {
      d.challenges[c.id] = c;
      for (const a of [c.challenger.address, c.opponent.address]) {
        const key = a.toLowerCase();
        (d.userIndex[key] ??= []);
        if (!d.userIndex[key].includes(c.id)) d.userIndex[key].push(c.id);
      }
    });
  }
  async getChallenge(id: string) {
    return (await this.load()).challenges[id] ?? null;
  }
  async saveChallenge(c: Challenge) {
    await this.mutate((d) => {
      d.challenges[c.id] = c;
    });
  }
  async listChallengesForUser(address: string) {
    const d = await this.load();
    const ids = d.userIndex[address.toLowerCase()] ?? [];
    return ids.map((id) => d.challenges[id]).filter((c): c is Challenge => !!c);
  }

  async isTxUsed(t: string) {
    return (await this.load()).usedtx.includes(t.toLowerCase());
  }
  async markTxUsed(t: string) {
    await this.mutate((d) => {
      if (!d.usedtx.includes(t.toLowerCase())) d.usedtx.push(t.toLowerCase());
    });
  }
  async isGameUsed(g: string) {
    return (await this.load()).usedgame.includes(g);
  }
  async markGameUsed(g: string) {
    await this.mutate((d) => {
      if (!d.usedgame.includes(g)) d.usedgame.push(g);
    });
  }
  async claimSettle(id: string) {
    return this.mutate((d) => {
      if (d.settled.includes(id)) return false;
      d.settled.push(id);
      return true;
    });
  }
  async unclaimSettle(id: string) {
    await this.mutate((d) => {
      d.settled = d.settled.filter((x) => x !== id);
    });
  }

  async getLichess(address: string) {
    return (await this.load()).lichess[address.toLowerCase()] ?? null;
  }
  async getLichessByLichessId(lichessId: string) {
    const d = await this.load();
    return Object.values(d.lichess).find((c) => c.lichessId === lichessId) ?? null;
  }
  async setLichess(address: string, conn: LichessConnection) {
    await this.mutate((d) => {
      d.lichess[address.toLowerCase()] = conn;
    });
  }
  async deleteLichess(address: string) {
    await this.mutate((d) => {
      delete d.lichess[address.toLowerCase()];
    });
  }
  async listLichess() {
    return Object.values((await this.load()).lichess);
  }
  async getHandoff(token: string) {
    return (await this.load()).handoffs[token] ?? null;
  }
  async setHandoff(h: LichessHandoff) {
    await this.mutate((d) => {
      d.handoffs[h.token] = h;
    });
  }
}

class FileBackend extends JsonDocBackend {
  private file: string;
  constructor(file: string) {
    super();
    this.file = file;
  }
  protected async load(): Promise<Doc> {
    try {
      const { readFile } = await import("node:fs/promises");
      return { ...emptyDoc(), ...JSON.parse(await readFile(this.file, "utf8")) };
    } catch {
      return emptyDoc();
    }
  }
  protected async save(doc: Doc): Promise<void> {
    const { writeFile, mkdir } = await import("node:fs/promises");
    const { dirname } = await import("node:path");
    await mkdir(dirname(this.file), { recursive: true });
    await writeFile(this.file, JSON.stringify(doc, null, 2));
  }
}

class MemoryBackend extends JsonDocBackend {
  private doc = emptyDoc();
  protected async load() {
    return this.doc;
  }
  protected async save(d: Doc) {
    this.doc = d;
  }
}

// ─────────────────────────── selection ───────────────────────────

let backend: StoreBackend | null = null;
let redisClient: IORedis | null = null;

function redisFromEnv(): IORedis | null {
  const url =
    process.env.REDIS_URL ?? process.env.KV_URL ?? process.env.UPSTASH_REDIS_URL;
  if (!url) return null;
  if (!redisClient) {
    redisClient = new IORedis(url, { maxRetriesPerRequest: 3, enableReadyCheck: true });
    redisClient.on("error", (e) => console.warn("[redis]", e?.message ?? e));
  }
  return redisClient;
}

export function getStore(): StoreBackend {
  if (backend) return backend;
  const redis = redisFromEnv();
  if (redis) {
    backend = new RedisBackend(redis);
  } else if (process.env.NODE_ENV !== "production") {
    backend = new FileBackend(process.env.STORE_FILE ?? ".data/store.json");
  } else {
    console.warn("[store] No Redis env in production — using in-memory (NOT durable).");
    backend = new MemoryBackend();
  }
  return backend;
}
