// The token radar's model: one snapshot of the protocol universe in, one ranked board out.
//
// The board covers every slug in the snapshot's watchlist (the floor, never a ceiling) and may add
// pre-token protocols below the watchlist floor: the early rows the radar exists to find. A protocol is
// pre-token when its index entry records no token (no market cap, no CoinGecko id, no symbol); the
// snapshot's live-token protocols are kept apart and shown as the market's own values, never mixed into
// the ranked board.
//
// Implied value is a peer benchmark, not a house multiplier (model "benchmark-3"):
//
//   peers      = the snapshot's own protocols whose token already trades (mcap_usd and tvl_usd both
//                set). For each, multiple = mcap / tvl, kept when 0.001 <= multiple <= 60.
//   peerMult   = the median multiple of the protocol's category, shrunk toward the global median by
//                PRIOR_WEIGHT pseudo-peers: (n x median + w x global) / (n + w). Categories with no
//                trading peer fall back to the global median, so no row is ever scored by guesswork.
//   chainMult  = the primary chain's median multiple over the global median, shrunk the same way and
//                clamped to [CHAIN_FLOOR, CHAIN_CAP], times a breadth bonus for each extra chain the
//                protocol runs on (CHAIN_BREADTH_BONUS, at most CHAIN_BREADTH_MAX extra chains).
//   momentum   = 1 + GROWTH_WEIGHT x clamp(change_7d, GROWTH_FLOOR, GROWTH_CAP) / 100
//   patience   = PATIENCE_FLOOR + PATIENCE_RANGE x min(age_days, PATIENCE_DAYS) / PATIENCE_DAYS
//                (a protocol that has run longer with no token has a longer record; unknown age is
//                UNKNOWN_AGE_DAYS, the middle of the ramp)
//   implied    = round(tvl_usd x peerMult x chainMult x momentum x patience)
//
// Two caps refuse an absurd claim: no row may imply more than IMPLIED_CAP_MULTIPLE x its own TVL (the
// snapshot's 90th-percentile peer multiple, computed from the data), and the gate's own ceiling of
// 100,000,000,000,000 dollars is the last word. Which cap bit is recorded on the row.
//
// Every figure the model reads is in the snapshot. No protocol name is special-cased, no list of
// favourite projects is held anywhere, and the same function scores every row: the peer ratios are
// recomputed from the input, so a newer snapshot moves the whole board with it.

/** The snapshot's protocol entry: exactly the ten fields the sealed input carries. */
export interface SnapshotProtocol {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
}

/** The whole snapshot document. */
export interface Snapshot {
  as_of: string;
  source: string;
  floor_usd: number;
  protocols: SnapshotProtocol[];
  watchlist: string[];
}

/** The model's constants: peer benchmark, chain premium, momentum and the patience ramp. */
export interface ModelConstants {
  prior_weight: number;
  growth_weight: number;
  growth_floor: number;
  growth_cap: number;
  patience_floor: number;
  patience_range: number;
  patience_days: number;
  unknown_age_days: number;
  chain_floor: number;
  chain_cap: number;
  chain_breadth_bonus: number;
  chain_breadth_max: number;
  implied_cap_multiple: number;
}

export const MODEL: ModelConstants = {
  prior_weight: 6,
  growth_weight: 0.45,
  growth_floor: -40,
  growth_cap: 60,
  patience_floor: 0.8,
  patience_range: 0.3,
  patience_days: 1825,
  unknown_age_days: 730,
  chain_floor: 0.5,
  chain_cap: 1.8,
  chain_breadth_bonus: 0.05,
  chain_breadth_max: 4,
  implied_cap_multiple: 4,
};

/** The model's version label: the dashboard names it and the rules quote it. */
export const MODEL_VERSION = 'benchmark-3';

// The radar's ceiling: no board may exceed the gate's 4,000 rows. The snapshot's own pre-token
// universe is far smaller than this, so in practice every rankable protocol reaches the board.
export const MAX_BOARD_ROWS = 4000;

/** The gate's floor: fewer rows than this and the board is refused. */
export const MIN_BOARD_ROWS = 100;

/** How many live-token protocols the Live token view carries, by market cap. */
export const LIVE_ROWS = 24;

/** A farm step: the action, what it costs, and how long it takes. */
export interface FarmStep {
  text: string;
  cost: string;
  time: string;
}

/** One row of board.json: the ranked board's row, with every figure the model used. */
export interface BoardRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  primary_chain: string | null;
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  gecko_id: string | null;
  symbol: string | null;
  token_status: 'pre-token';
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  model: {
    version: string;
    peer_multiple: number;
    peer_peers: number;
    global_multiple: number;
    chain_multiple: number;
    chain_factor: number;
    breadth_factor: number;
    growth_pct: number;
    momentum_factor: number;
    patience_factor: number;
    effective_multiple: number;
    capped_by: 'none' | 'tvl_multiple' | 'gate';
    age_days: number | null;
  };
  farm_steps: string[];
}

/** The dashboard's compact view of one row, with farm plans generated in the page. */
export interface RadarRow {
  rank: number;
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  primary_chain: string | null;
  tvl_usd: number;
  change_7d: number | null;
  mcap_usd: number | null;
  listed_at: string | null;
  age_days: number | null;
  on_watchlist: boolean;
  implied_value_usd: number;
  peer_multiple: number;
  peer_peers: number;
  chain_factor: number;
  breadth_factor: number;
  momentum_factor: number;
  patience_factor: number;
  effective_multiple: number;
  capped_by: 'none' | 'tvl_multiple' | 'gate';
  /** The same eight steps board.json carries, so the page and the dossier cannot disagree. */
  steps: string[];
}

/** A live-token protocol: it already trades, so the board shows the market's own value, not a model's. */
export interface LiveRow {
  slug: string;
  name: string;
  category: string | null;
  chains: string[];
  tvl_usd: number;
  mcap_usd: number | null;
  change_7d: number | null;
}

/** Everything the dashboard needs: the board, the live set, and the model it runs. */
export interface RadarData {
  as_of: string;
  source: string;
  floor_usd: number;
  model: ModelConstants;
  model_version: string;
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
  /** How many live-token protocols stood behind the peer benchmark. */
  peer_pairs: number;
  /** The benchmark's global median multiple of TVL, and its 90th percentile (the model's cap multiple). */
  global_multiple: number;
  multiple_p90: number;
  /** How many protocols the snapshot carries in total, and the gate's ceiling on any implied value. */
  universe_size: number;
  gate_max_implied_usd: number;
  rows: RadarRow[];
  live: LiveRow[];
}

/** Why the snapshot is not one this model can score. */
export class SnapshotError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SnapshotError';
  }
}

const DAY_MS = 86_400_000;

/** A finite number, else `fallback`. */
function finite(value: unknown, fallback: number): number {
  return typeof value === 'number' && Number.isFinite(value) ? value : fallback;
}

/** A whole day count from `from` to `to`, clamped at zero; null when either date is absent or bad. */
export function ageDays(asOf: string, listedAt: string | null): number | null {
  if (listedAt === null) return null;
  const a = Date.parse(`${asOf}T00:00:00Z`);
  const b = Date.parse(`${listedAt}T00:00:00Z`);
  if (!Number.isFinite(a) || !Number.isFinite(b)) return null;
  return Math.max(0, Math.floor((a - b) / DAY_MS));
}

/** The peer benchmark: what the snapshot's own traded tokens say a multiple of TVL is worth. */
export interface PeerStats {
  /** How many live-token protocols carried a usable market cap / TVL ratio. */
  pairs: number;
  /** The median multiple across every pair. */
  global_median: number;
  /** The 90th-percentile multiple: the cap the model refuses to exceed. */
  multiple_p90: number;
  /** Median multiple per category, and how many peers stood behind it. */
  by_category: Map<string, { median: number; n: number }>;
  /** Median multiple per chain (a protocol counts on every chain it runs on). */
  by_chain: Map<string, { median: number; n: number }>;
}

/** A ratio below this is a staked receipt, above it a market cap that is not about TVL. */
const PEER_RATIO_FLOOR = 0.001;
const PEER_RATIO_CEIL = 60;

/** The median of a non-empty list of numbers. */
function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  const mid = sorted.length >> 1;
  return sorted.length % 2 === 1 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

/** A quantile of a non-empty list of numbers, by the nearest-rank rule. */
function quantile(values: number[], q: number): number {
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.floor(q * sorted.length)));
  return sorted[index];
}

/** Price the peer benchmark once: every later row is scored against these figures. */
export function peerStats(snapshot: Snapshot): PeerStats {
  const ratios: number[] = [];
  const byCategory = new Map<string, number[]>();
  const byChain = new Map<string, number[]>();
  for (const p of snapshot.protocols) {
    if (p.mcap_usd === null || p.mcap_usd <= 0 || p.tvl_usd <= 0) continue;
    const ratio = p.mcap_usd / p.tvl_usd;
    if (!(ratio >= PEER_RATIO_FLOOR && ratio <= PEER_RATIO_CEIL)) continue;
    ratios.push(ratio);
    if (p.category !== null) {
      const list = byCategory.get(p.category) ?? [];
      list.push(ratio);
      byCategory.set(p.category, list);
    }
    for (const chain of p.chains) {
      const list = byChain.get(chain) ?? [];
      list.push(ratio);
      byChain.set(chain, list);
    }
  }
  if (ratios.length === 0) {
    throw new SnapshotError('the snapshot carries no live-token protocol with a market cap and a TVL, so there is no peer benchmark to price a pre-token protocol against');
  }
  const shrink = (list: number[] | undefined, prior: number, universal: number): { median: number; n: number } => {
    if (list === undefined || list.length === 0) return { median: universal, n: 0 };
    const n = list.length;
    const w = MODEL.prior_weight;
    return { median: (n * median(list) + w * universal) / (n + w), n };
  };
  const global = median(ratios);
  const by_category = new Map<string, { median: number; n: number }>();
  for (const [category, list] of byCategory) by_category.set(category, shrink(list, MODEL.prior_weight, global));
  const by_chain = new Map<string, { median: number; n: number }>();
  for (const [chain, list] of byChain) by_chain.set(chain, shrink(list, MODEL.prior_weight * 2, global));
  return { pairs: ratios.length, global_median: global, multiple_p90: quantile(ratios, 0.9), by_category, by_chain };
}

/** Every input of one row's implied value, kept so the page can show the arithmetic. */
export interface Score {
  implied: number;
  age: number | null;
  peer_multiple: number;
  peer_peers: number;
  global_multiple: number;
  chain_multiple: number;
  chain_factor: number;
  breadth_factor: number;
  growth_pct: number;
  momentum_factor: number;
  patience_factor: number;
  effective_multiple: number;
  capped_by: 'none' | 'tvl_multiple' | 'gate';
}

/**
 * The implied value of one protocol under `model`, benchmarked against `peers`.
 *
 * The multiplication is the model: TVL is the size of the business, the peer multiple is what the
 * market pays for that size in this category, the chain factor is what the chain's own traded peers
 * add, and momentum and patience adjust for a record that is growing and old enough to trust.
 */
export function impliedValue(protocol: SnapshotProtocol, asOf: string, model: ModelConstants, peers: PeerStats): Score {
  const age = ageDays(asOf, protocol.listed_at);
  const peer = protocol.category !== null ? peers.by_category.get(protocol.category) : undefined;
  const peerMultiple = peer?.median ?? peers.global_median;

  const primary = protocol.chains.length > 0 ? protocol.chains[0] : null;
  const chain = primary !== null ? peers.by_chain.get(primary) : undefined;
  const chainFactor = chain === undefined ? 1 : Math.min(model.chain_cap, Math.max(model.chain_floor, chain.median / peers.global_median));
  const breadthFactor = 1 + model.chain_breadth_bonus * Math.min(Math.max(protocol.chains.length - 1, 0), model.chain_breadth_max);
  const chainMultiple = chainFactor * breadthFactor;

  const growthPct = Math.min(model.growth_cap, Math.max(model.growth_floor, finite(protocol.change_7d, 0)));
  const momentumFactor = 1 + (growthPct / 100) * model.growth_weight;

  const ageForModel = age ?? model.unknown_age_days;
  const patienceFactor = model.patience_floor + (Math.min(Math.max(ageForModel, 0), model.patience_days) / model.patience_days) * model.patience_range;

  const effective = peerMultiple * chainMultiple * momentumFactor * patienceFactor;
  const raw = protocol.tvl_usd * effective;

  // Cap one: no claim above the snapshot's own 90th-percentile peer multiple of its TVL.
  const multipleCap = protocol.tvl_usd * Math.max(model.implied_cap_multiple, peers.multiple_p90);
  let capped: Score['capped_by'] = 'none';
  let cappedValue = raw;
  if (cappedValue > multipleCap) {
    cappedValue = multipleCap;
    capped = 'tvl_multiple';
  }
  // Cap two: the gate's own ceiling of 100,000,000,000,000 dollars, the last word on any claim.
  if (cappedValue > GATE_MAX_IMPLIED_USD) {
    cappedValue = GATE_MAX_IMPLIED_USD;
    capped = 'gate';
  }

  return {
    implied: Math.max(1, Math.round(cappedValue)),
    age,
    peer_multiple: round4(peerMultiple),
    peer_peers: peer?.n ?? 0,
    global_multiple: round4(peers.global_median),
    chain_multiple: round4(chain?.median ?? peers.global_median),
    chain_factor: round4(chainFactor),
    breadth_factor: round4(breadthFactor),
    growth_pct: round4(growthPct),
    momentum_factor: round4(momentumFactor),
    patience_factor: round4(patienceFactor),
    effective_multiple: round4(effective),
    capped_by: capped,
  };
}

/** The gate's ceiling on any row's implied value, in dollars. */
export const GATE_MAX_IMPLIED_USD = 100_000_000_000_000;

/** DefiLlama's version-marker rule: a name ending in a release is a pool of another protocol. */
const VERSIONED = /\s(V\d+(\.\d+)?|v\d+(\.\d+)?|\d+\.\d+)$/;

/** Whether a protocol records no token at all. */
export function isPreToken(p: SnapshotProtocol): boolean {
  return p.mcap_usd === null && p.gecko_id === null && p.symbol === null;
}

/** Whether a protocol is one the board may rank: pre-token, not an exchange, not a versioned pool. */
export function isRankable(p: SnapshotProtocol): boolean {
  return isPreToken(p) && p.category !== 'CEX' && !VERSIONED.test(p.name);
}

/** The snapshot's protocol by slug. */
function bySlug(protocols: SnapshotProtocol[]): Map<string, SnapshotProtocol> {
  return new Map(protocols.map((p) => [p.slug, p]));
}

/** The headline sentence's figures: how many watchlist slugs, how many rows, how many live protocols. */
export interface BoardSummary {
  watchlist_size: number;
  board_size: number;
  early_size: number;
  live_size: number;
}

/** The protocols the board ranks, strongest first, with ranks 1..n. */
export function buildBoard(snapshot: Snapshot, model: ModelConstants = MODEL): BoardRow[] {
  const index = bySlug(snapshot.protocols);
  const peers = peerStats(snapshot);
  const watched = new Set(snapshot.watchlist);
  const chosen = new Map<string, SnapshotProtocol>();
  // The watchlist is the floor: every slug is on the board, whatever its category or TVL.
  for (const slug of snapshot.watchlist) {
    const p = index.get(slug);
    if (p !== undefined) chosen.set(slug, p);
  }
  // The early radar: every pre-token protocol the snapshot carries, strongest TVL first, up to the
  // gate's row ceiling. A watchlist row is never displaced; the floor is never the whole board.
  const early = snapshot.protocols
    .filter((p) => !chosen.has(p.slug) && isRankable(p))
    .sort((a, b) => b.tvl_usd - a.tvl_usd || compareSlug(a, b))
    .slice(0, Math.max(0, MAX_BOARD_ROWS - chosen.size));
  for (const p of early) chosen.set(p.slug, p);

  const scored = [...chosen.values()].map((p) => ({ p, s: impliedValue(p, snapshot.as_of, model, peers) }));
  scored.sort((a, b) => b.s.implied - a.s.implied || b.p.tvl_usd - a.p.tvl_usd || compareSlug(a.p, b.p));
  return scored.map(({ p, s }, i) => ({
    rank: i + 1,
    slug: p.slug,
    name: p.name,
    category: p.category,
    chains: p.chains,
    primary_chain: p.chains.length > 0 ? p.chains[0] : null,
    tvl_usd: p.tvl_usd,
    change_7d: p.change_7d,
    mcap_usd: p.mcap_usd,
    listed_at: p.listed_at,
    gecko_id: p.gecko_id,
    symbol: p.symbol,
    token_status: 'pre-token',
    age_days: s.age,
    on_watchlist: watched.has(p.slug),
    implied_value_usd: s.implied,
    model: {
      version: MODEL_VERSION,
      peer_multiple: s.peer_multiple,
      peer_peers: s.peer_peers,
      global_multiple: s.global_multiple,
      chain_multiple: s.chain_multiple,
      chain_factor: s.chain_factor,
      breadth_factor: s.breadth_factor,
      growth_pct: s.growth_pct,
      momentum_factor: s.momentum_factor,
      patience_factor: s.patience_factor,
      effective_multiple: s.effective_multiple,
      capped_by: s.capped_by,
      age_days: s.age,
    },
    farm_steps: farmSteps(p, s.age, s.implied).map(stepText),
  }));
}

/** Slug order, for a deterministic tie-break that does not depend on the input's order. */
function compareSlug(a: SnapshotProtocol, b: SnapshotProtocol): number {
  return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
}

const round4 = (n: number): number => Math.round(n * 1e4) / 1e4;

/** A step as one string: its action, then its cost and time, within the gate's 20..600 characters. */
export function stepText(step: FarmStep): string {
  let s = `${step.text} Cost: ${step.cost}. Time: ${step.time}.`;
  if (s.length > 600) s = `${s.slice(0, 596)}...`;
  if (s.length < 20) s = `${s} Hold the position and check the protocol's own page.`;
  return s;
}

/** The first chain a protocol names, or a neutral phrase. */
function chainOf(p: SnapshotProtocol): string {
  return p.chains.length > 0 ? p.chains[0]! : 'its main chain';
}

/** How much capital one farm position needs, from the protocol's own TVL. */
function capitalFor(p: SnapshotProtocol): number {
  if (p.tvl_usd >= 5_000_000_000) return 250;
  if (p.tvl_usd >= 1_000_000_000) return 150;
  if (p.tvl_usd >= 100_000_000) return 100;
  return 50;
}

/** How long to hold, from the protocol's age: younger protocols get a longer qualifying window. */
function holdDaysFor(age: number | null): number {
  if (age === null) return 30;
  if (age < 180) return 60;
  if (age < 365) return 45;
  return 30;
}

/** One rule of the playbook: which categories it answers, and the two moves it teaches. */
interface PlaybookRule {
  /** Category keywords, lower case; the first rule that matches wins. */
  match: string[];
  /** The main position, in the words a farmer can follow. `{cap}`, `{chain}`, `{name}` are filled in. */
  entry: string;
  /** A second use of the same protocol, so one wallet shows depth rather than a single deposit. */
  follow: string;
}

/**
 * The playbook, most specific category first. Each entry is a real move on that kind of protocol, not a
 * slogan: a curator vault is bought and held, a CDP is opened and repaid, a bridge is crossed and the
 * bridged funds are used on the far side, a chain is used through its own native bridge.
 */
const PLAYBOOK: PlaybookRule[] = [
  {
    match: ['risk curator', 'allocator'],
    entry: 'Buy {cap} of shares in a {name} vault on {chain} and read the vault page first: what collateral it accepts, what the curator fee is, and how long a withdrawal takes.',
    follow: 'Split the stake across two {name} curators instead of one, so a single vault closing does not empty the wallet, and keep the shares rather than the receipt token.',
  },
  {
    match: ['liquid restaking', 'restaked btc', 'restaking'],
    entry: 'Deposit {cap} of ETH or BTC into {name} on {chain} and take the liquid receipt token it mints, then confirm on the protocol page which operators your stake is delegated to.',
    follow: 'Use the receipt as collateral elsewhere is a second protocol\'s risk, so instead vote or delegate with the receipt if {name} allows it, and keep the stake in place.',
  },
  {
    match: ['liquid staking', 'staking pool'],
    entry: 'Stake {cap} of the chain\'s staking asset through {name} on {chain} and hold the liquid receipt; check the exchange rate before you stake, not after.',
    follow: 'Add a second, smaller stake through a different {name} validator or pool so the wallet shows more than one qualifying position.',
  },
  {
    match: ['canonical bridge', 'cross chain bridge', 'bridge'],
    entry: 'Bridge {cap} of USDC into {chain} through {name} and then actually use the bridged funds in an app on the far side; a bridge crossed and abandoned counts for little.',
    follow: 'Bridge a second, smaller amount back after the hold window, so the wallet shows traffic in both directions rather than a one-way transfer.',
  },
  {
    match: ['cdp manager', 'cdp'],
    entry: 'Open a {name} position on {chain} with {cap} of collateral, mint well under the maximum the protocol allows, and keep the position open rather than minting and closing in one day.',
    follow: 'Repay part of the debt and let the position run, then repay the rest before the hold window ends; never chase the maximum loan-to-value.',
  },
  {
    match: ['uncollateralized lending', 'collateral markets', 'lending', 'rwa lending'],
    entry: 'Supply {cap} of USDC to {name} on {chain} and check the utilisation and the oracle the market reads before you deposit, not the advertised APY alone.',
    follow: 'Borrow a small amount against the deposit if {name} allows it and repay it later; a supply plus a borrow is two qualifying actions on one position.',
  },
  {
    match: ['basis trading'],
    entry: 'Deposit {cap} into {name} on {chain} and read how the basis is hedged before you deposit; the yield comes from a spread, so the hedge is the product.',
    follow: 'Add a second, smaller deposit after the hold window so the position shows two entries instead of one.',
  },
  {
    match: ['interest rate derivative', 'derivative', 'perpetual'],
    entry: 'Post {cap} of USDC as margin on {name} on {chain}, open one small position and close it, then come back and keep a position open through the hold window.',
    follow: 'Use a second {name} market with a smaller size, so the wallet is not a single symbol\'s opinion.',
  },
  {
    match: ['yield aggregator', 'leveraged farm', 'farm', 'yield'],
    entry: 'Deposit {cap} into the vault on {name} on {chain} that you can explain in one sentence, and check the fee and the last rebalance before you deposit.',
    follow: 'Move part of the position into a second {name} vault with a different strategy so the wallet shows two strategies rather than one.',
  },
  {
    match: ['dex', 'liquidity manager'],
    entry: 'Provide {cap} of liquidity to {name}\'s deepest pool on {chain} at a range you are willing to hold, and note that an out-of-range position still counts as open.',
    follow: 'Swap a small amount through {name} itself each week, so the wallet shows volume as well as liquidity.',
  },
  {
    match: ['stablecoin wrapper', 'dual-token stablecoin', 'stable'],
    entry: 'Mint or deposit {cap} of the stable asset through {name} on {chain} and read what backs it before you do; hold the position rather than minting and burning the same day.',
    follow: 'Use the minted asset in a second app on {chain} if you can name the risk, which makes the position a use rather than a balance.',
  },
  {
    match: ['rwa', 'anchor btc', 'decentralized btc'],
    entry: 'Mint {cap} of the protocol\'s asset on {chain} through {name} and confirm who holds the underlying before you mint; hold it across the hold window.',
    follow: 'Move part of the minted asset into a second use on the same chain, so the wallet is not a single balance nobody touches.',
  },
  {
    match: ['prediction market'],
    entry: 'Fund {cap} on {name} on {chain} and take one position in a market you can actually judge, closing it when the market resolves rather than leaving it idle.',
    follow: 'Take a second, smaller position in a different market so the wallet shows a pattern rather than one bet.',
  },
  {
    match: ['insurance'],
    entry: 'Buy {cap} of cover from {name} on {chain} for a position you actually hold, and keep the policy until it expires rather than cancelling it early.',
    follow: 'Extend the same cover to a second position once the first policy is live, so the wallet shows a book rather than one policy.',
  },
  {
    match: ['chain'],
    entry: 'Move {cap} onto {chain} through its own native bridge and use one app on the chain in the first week; a chain with no activity on it is not a farm position.',
    follow: 'Keep a small balance on {chain} and transact there weekly, because a chain\'s own incentives usually weight native activity.',
  },
  {
    match: ['governance incentive'],
    entry: 'Deposit {cap} where {name} on {chain} directs its incentives and vote on at least one proposal with the position, since governance weight is often the qualifier.',
    follow: 'Vote again on the next proposal and keep the deposit in place; a vote without a position and a position without a vote both count for less.',
  },
  {
    match: ['cexdefi', 'cedefi', 'payments', 'crypto card', 'otc', 'index'],
    entry: 'Open the smallest position {name} on {chain} accepts, {cap} or the minimum if that is lower, and complete one full round trip of the product before adding size.',
    follow: 'Repeat the product once more after the hold window, so the wallet shows a returning user rather than a one-time signup.',
  },
];

/** The fallback rule: a deposit held long enough to be counted twice. */
const DEFAULT_RULE: PlaybookRule = {
  match: [],
  entry: 'Deposit {cap} of USDC into {name} on {chain} and keep the position open; read what the deposit actually earns before you sign.',
  follow: 'Add one more qualifying action on {name} after a week, such as a second deposit or a withdrawal and re-deposit, so the wallet is not a single transaction.',
};

/** Fill a playbook template with this protocol's own figures. */
function fill(template: string, name: string, chain: string, cap: number): string {
  return template.split('{name}').join(name).split('{chain}').join(chain).split('{cap}').join(`$${cap}`);
}

/** The rule that answers this protocol's category. */
function ruleFor(p: SnapshotProtocol): PlaybookRule {
  const c = (p.category ?? '').toLowerCase();
  for (const rule of PLAYBOOK) {
    if (rule.match.some((key) => c.includes(key))) return rule;
  }
  return DEFAULT_RULE;
}

/**
 * A protocol's farm plan: eight steps, each an action with a cost and a time. Everything is derived
 * from the protocol's own record - category, chains, TVL, age, 7d momentum, implied value - and its
 * name is the only hand-written part, so two protocols in different categories never get the same plan.
 */
export function farmSteps(p: SnapshotProtocol, age: number | null, implied: number): FarmStep[] {
  const chain = chainOf(p);
  const capital = capitalFor(p);
  const hold = holdDaysFor(age);
  const rule = ruleFor(p);
  const gas = p.tvl_usd >= 1_000_000_000 ? 12 : 5;
  const growth = finite(p.change_7d, 0);
  const steps: FarmStep[] = [];

  steps.push({
    text: `Do all of this from one fresh wallet on ${chain} that holds only the capital you plan to farm, with the seed phrase written down offline; never sign a permit the ${p.name} app did not put in front of you.`,
    cost: `under $${gas} of gas to open, plus $${capital} of working capital`,
    time: '10 minutes to set the wallet up',
  });
  steps.push({
    text: fill(rule.entry, p.name, chain, capital),
    cost: `$${capital} of capital and about $${gas} of gas`,
    time: '15 minutes to open',
  });
  steps.push({
    text: fill(rule.follow, p.name, chain, Math.max(25, Math.round(capital / 2))),
    cost: `$${Math.max(25, Math.round(capital / 2))} more, or a move you were going to make anyway with $${gas} of gas`,
    time: '10 minutes, a week after the entry',
  });
  steps.push({
    text: growth <= -10
      ? `${p.name}'s TVL fell ${Math.abs(growth).toFixed(1)}% in the last seven days, so open at half the size above and only add the rest after two weeks of the TVL holding its level.`
      : growth >= 10
        ? `${p.name}'s TVL grew ${growth.toFixed(1)}% in the last seven days, so the size above is fair today, but check the figure again before you add anything to it.`
        : `${p.name}'s TVL moved ${growth.toFixed(1)}% over the last seven days, so its size is not stretched by a spike; keep the cadence and re-read the figure weekly.`,
    cost: 'no cost to check, and it decides how much goes in',
    time: '5 minutes',
  });
  steps.push({
    text: `Keep the position open for at least ${hold} days${age === null ? '' : `, which is short next to ${p.name}'s ${age} days of history`}, so the activity falls inside more than one weekly snapshot.`,
    cost: `the $${capital} stays in the position, and nothing is earned in the first days`,
    time: `${hold} days`,
  });
  steps.push({
    text: p.chains.length >= 2
      ? `${p.name} also runs on ${p.chains.slice(1, 3).join(' and ')}, where incentives are often counted per chain; keep the position on ${chain} but spend a small amount on the second chain so both sides see the wallet.`
      : `${p.name} runs on ${chain} alone, so there is no second chain to spread across; prove depth on ${chain} itself instead of opening wallets elsewhere.`,
    cost: `about $${gas} of gas on the second chain, or nothing if there is none`,
    time: '20 minutes',
  });
  steps.push({
    text: `Check ${p.name}'s own site or docs for a points, rewards or claim page once a month, and claim only from a link the protocol publishes; anyone asking for a fee or a seed phrase to claim is not ${p.name}.`,
    cost: 'no fee to check, and never pay to claim',
    time: '10 minutes a month',
  });
  steps.push({
    text: `Give the position an implied value of about $${formatUsd(implied)} in the log, and write the wallet, the dates, every transaction and the exit route down; with $${formatUsd(p.tvl_usd)} of TVL, a full exit should not move the pool.`,
    cost: 'nothing but a written log',
    time: '10 minutes to record and revisit',
  });
  return steps;
}

/** A compact dollar phrase for the plan text: $1.2B, $340M, $4.0k. */
export function formatUsd(value: number): string {
  if (!Number.isFinite(value)) return '$0';
  const abs = Math.abs(value);
  if (abs >= 1e12) return `$${(value / 1e12).toFixed(1)}T`;
  if (abs >= 1e9) return `$${(value / 1e9).toFixed(1)}B`;
  if (abs >= 1e6) return `$${(value / 1e6).toFixed(1)}M`;
  if (abs >= 1e3) return `$${(value / 1e3).toFixed(1)}k`;
  return `$${Math.round(value)}`;
}

/** The live-token protocols, by market cap, for the dashboard's Live token view. */
export function liveRows(snapshot: Snapshot): LiveRow[] {
  return snapshot.protocols
    .filter((p) => !isPreToken(p) && p.category !== 'CEX')
    .sort((a, b) => (b.mcap_usd ?? 0) - (a.mcap_usd ?? 0) || b.tvl_usd - a.tvl_usd)
    .slice(0, LIVE_ROWS)
    .map((p) => ({
      slug: p.slug,
      name: p.name,
      category: p.category,
      chains: p.chains,
      tvl_usd: p.tvl_usd,
      mcap_usd: p.mcap_usd,
      change_7d: p.change_7d,
    }));
}

/** A board row's compact form for data.js, with the farm plan generated in the page. */
export function radarRow(row: BoardRow): RadarRow {
  return {
    rank: row.rank,
    slug: row.slug,
    name: row.name,
    category: row.category,
    chains: row.chains,
    primary_chain: row.primary_chain,
    tvl_usd: row.tvl_usd,
    change_7d: row.change_7d,
    mcap_usd: row.mcap_usd,
    listed_at: row.listed_at,
    age_days: row.age_days,
    on_watchlist: row.on_watchlist,
    implied_value_usd: row.implied_value_usd,
    peer_multiple: row.model.peer_multiple,
    peer_peers: row.model.peer_peers,
    chain_factor: row.model.chain_factor,
    breadth_factor: row.model.breadth_factor,
    momentum_factor: row.model.momentum_factor,
    patience_factor: row.model.patience_factor,
    effective_multiple: row.model.effective_multiple,
    capped_by: row.model.capped_by,
    steps: row.farm_steps,
  };
}

/** Everything the dashboard renders, from the snapshot. */
export function buildRadar(snapshot: Snapshot, model: ModelConstants = MODEL): { board: BoardRow[]; radar: RadarData } {
  const board = buildBoard(snapshot, model);
  const live = liveRows(snapshot);
  const peers = peerStats(snapshot);
  const early = board.filter((r) => !r.on_watchlist).length;
  const radar: RadarData = {
    as_of: snapshot.as_of,
    source: snapshot.source,
    floor_usd: snapshot.floor_usd,
    model,
    model_version: MODEL_VERSION,
    watchlist_size: snapshot.watchlist.length,
    board_size: board.length,
    early_size: early,
    live_size: live.length,
    peer_pairs: peers.pairs,
    global_multiple: round4(peers.global_median),
    multiple_p90: round4(peers.multiple_p90),
    universe_size: snapshot.protocols.length,
    gate_max_implied_usd: GATE_MAX_IMPLIED_USD,
    rows: board.map(radarRow),
    live,
  };
  return { board, radar };
}

/** The snapshot out of a file's text, refused unless it is the shape the model scores. */
export function parseSnapshot(text: string): Snapshot {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new SnapshotError('snapshot.json is not JSON');
  }
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) throw new SnapshotError('snapshot.json is not a JSON object');
  const o = raw as Record<string, unknown>;
  if (typeof o.as_of !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(o.as_of)) throw new SnapshotError('snapshot.json has no as_of date');
  if (typeof o.source !== 'string') throw new SnapshotError('snapshot.json has no source');
  if (typeof o.floor_usd !== 'number' || !Number.isSafeInteger(o.floor_usd) || o.floor_usd <= 0) throw new SnapshotError('snapshot.json has no floor_usd');
  if (!Array.isArray(o.protocols)) throw new SnapshotError('snapshot.json has no protocols array');
  if (!Array.isArray(o.watchlist) || o.watchlist.some((s) => typeof s !== 'string')) throw new SnapshotError('snapshot.json has no watchlist of slugs');
  const protocols = o.protocols.map((v, i) => {
    if (typeof v !== 'object' || v === null || Array.isArray(v)) throw new SnapshotError(`snapshot.json's protocol ${i} is not an object`);
    const p = v as Record<string, unknown>;
    if (typeof p.slug !== 'string' || typeof p.name !== 'string' || typeof p.tvl_usd !== 'number' || !Number.isFinite(p.tvl_usd)) {
      throw new SnapshotError(`snapshot.json's protocol ${i} lacks a slug, a name or a TVL`);
    }
    return {
      slug: p.slug,
      name: p.name,
      category: typeof p.category === 'string' ? p.category : null,
      chains: Array.isArray(p.chains) ? p.chains.filter((c): c is string => typeof c === 'string') : [],
      tvl_usd: p.tvl_usd,
      change_7d: typeof p.change_7d === 'number' && Number.isFinite(p.change_7d) ? p.change_7d : null,
      mcap_usd: typeof p.mcap_usd === 'number' && Number.isFinite(p.mcap_usd) ? p.mcap_usd : null,
      listed_at: typeof p.listed_at === 'string' ? p.listed_at : null,
      gecko_id: typeof p.gecko_id === 'string' ? p.gecko_id : null,
      symbol: typeof p.symbol === 'string' ? p.symbol : null,
    };
  });
  return {
    as_of: o.as_of,
    source: o.source,
    floor_usd: o.floor_usd,
    protocols,
    watchlist: o.watchlist as string[],
  };
}

/** Why a board is not one the gate will take, or null: coverage, ranks, order, one shared implied value, and farm steps. */
export function boardIssue(board: BoardRow[], snapshot: Snapshot): string | null {
  const slugs = new Set(board.map((r) => r.slug));
  const missing = snapshot.watchlist.filter((s) => !slugs.has(s));
  if (missing.length > 0) return `the board misses ${missing.length} watchlist slug${missing.length === 1 ? '' : 's'}: ${missing.slice(0, 5).join(', ')}`;
  const ranks = board.map((r) => r.rank).sort((a, b) => a - b);
  for (let i = 0; i < ranks.length; i++) if (ranks[i] !== i + 1) return `rank ${i + 1} is ${ranks[i]}`;
  for (let i = 1; i < board.length; i++) if (board[i]!.implied_value_usd > board[i - 1]!.implied_value_usd) return `row ${i + 1} outranks row ${i} on implied value`;
  if (board.length >= 2 && board[0]!.implied_value_usd === board[board.length - 1]!.implied_value_usd) {
    return `all ${board.length} rows share the same implied value $${board[0]!.implied_value_usd}: a board that ranks nothing by value is not a ranking`;
  }
  for (const r of board) {
    const steps = r.farm_steps;
    if (steps.length < 3 || steps.length > 12) return `${r.slug} has ${steps.length} farm steps`;
    for (const s of steps) if (s.length < 20 || s.length > 600) return `${r.slug} has a farm step of ${s.length} characters`;
    if (!Number.isSafeInteger(r.implied_value_usd) || r.implied_value_usd <= 0) return `${r.slug} has implied value ${r.implied_value_usd}`;
  }
  return null;
}

/**
 * The source line the page shows: the snapshot's source with the scheme taken off, because the page is a
 * single offline bundle and must not carry anything that looks like a request. board.json and the
 * dossier keep the source exactly as the snapshot states it.
 */
export function sourceLabel(source: string): string {
  return source.replace(/https?:\/\//g, '');
}

/** A compact data.js: the dashboard's whole dataset as one script, no fetch and no network. */
export function dataScript(radar: RadarData): string {
  const page: RadarData = { ...radar, source: sourceLabel(radar.source) };
  return `window.RADAR=${JSON.stringify(page)};\n`;
}
