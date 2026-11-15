/**
 * The run map generator (Milestone 6 design sheet, section 2). Seed in, map
 * out: rows of 2 to 4 nodes in 4 lanes, each node linked to 1 or 2 nodes in
 * the next row in its own or a neighbouring lane, with no crossing lines and
 * every node reachable from row 1. Then node types by the odds and rules in
 * src/content/run.ts.
 *
 * Deterministic: the same seed always gives the same map.
 */
import { RUN, type NodeType } from '../content/run.ts';
import { Rng } from '../sim/rng.ts';
import type { MapNode, RunMap } from '../sim/run.ts';

interface Draft {
  row: number;
  lane: number;
  type: NodeType;
  links: number[];
}

const idOf = (row: number, lane: number) => `r${row}l${lane}`;

/**
 * Links from one row to the next, left to right. Each node may link to its own
 * lane or a neighbour, and never to a lane left of where the node before it
 * linked to, so lines cannot cross. Returns the lanes of the next row.
 */
function linkRow(rng: Rng, from: Draft[]): number[] {
  const lanes = RUN.map.lanes;
  let prevMax = 0;
  for (const n of from) {
    const lo = Math.max(n.lane - 1, prevMax, 0);
    const hi = Math.min(n.lane + 1, lanes - 1);
    const a = rng.int(lo, hi);
    const two = hi > lo && rng.chance(RUN.map.twoLinkChance);
    const b = two ? (a < hi ? a + 1 : a - 1) : a;
    n.links = [...new Set([a, b])].sort((x, y) => x - y);
    prevMax = Math.max(prevMax, n.links[n.links.length - 1]!);
  }
  return [...new Set(from.flatMap((n) => n.links))].sort((x, y) => x - y);
}

/** Widen a row that came out with one node: give a node with room a second link next to its first. */
function widen(from: Draft[]): void {
  const lanes = RUN.map.lanes;
  const used = new Set(from.flatMap((n) => n.links));
  if (used.size >= RUN.map.nodesPerRow[0]) return;
  for (let i = from.length - 1; i >= 0; i--) {
    const n = from[i]!;
    const next = from[i + 1];
    const last = n.links[n.links.length - 1]!;
    // Going right must not cross the next node's links; going left must not cross the previous node's.
    if (last + 1 <= Math.min(n.lane + 1, lanes - 1) && (!next || last + 1 <= next.links[0]!)) {
      n.links.push(last + 1);
      return;
    }
  }
  for (let i = 0; i < from.length; i++) {
    const n = from[i]!;
    const prev = from[i - 1];
    const first = n.links[0]!;
    if (first - 1 >= Math.max(n.lane - 1, 0) && (!prev || first - 1 >= prev.links[prev.links.length - 1]!)) {
      n.links.unshift(first - 1);
      return;
    }
  }
}

function rollType(rng: Rng, row: number, courseOnly: boolean): NodeType {
  const o = RUN.map.odds;
  const r = rng.float(0, o.course + o.hard + o.shop + o.cache);
  let t: NodeType = r < o.course ? 'course' : r < o.course + o.hard ? 'hard' : r < o.course + o.hard + o.shop ? 'shop' : 'cache';
  if (t === 'hard' && row < RUN.map.firstHardRow) t = 'course';
  if (t === 'shop' && row < RUN.map.firstShopRow) t = 'course';
  if (courseOnly && (t === 'shop' || t === 'cache')) t = 'course';
  return t;
}

export function generateRunMap(seed: string): RunMap {
  const rng = Rng.fromSeed(seed).fork('map');
  const m = RUN.map;
  const rows: Draft[][] = [];
  // Row 1: three courses side by side.
  const start = rng.int(0, m.lanes - m.firstRowNodes);
  rows.push(Array.from({ length: m.firstRowNodes }, (_, i) => ({ row: 1, lane: start + i, type: 'course' as NodeType, links: [] })));
  for (let row = 2; row <= m.rows; row++) {
    const from = rows[row - 2]!;
    let lanes = linkRow(rng, from);
    if (lanes.length < m.nodesPerRow[0]) {
      widen(from);
      lanes = [...new Set(from.flatMap((n) => n.links))].sort((x, y) => x - y);
    }
    const courseOnly = row >= m.courseOnlyFromRow && rng.chance(m.courseOnlyChance);
    const nodes: Draft[] = lanes.map((lane) => ({ row, lane, type: rollType(rng, row, courseOnly), links: [] }));
    // At most one shop per row.
    let shops = 0;
    for (const n of nodes) if (n.type === 'shop' && ++shops > 1) n.type = 'course';
    // A shop never links straight to another shop.
    for (const n of nodes) {
      if (n.type === 'shop' && from.some((p) => p.type === 'shop' && p.links.includes(n.lane))) n.type = 'course';
    }
    // One early boss node in some rows (offered only once the countdown is low; see typeOf in sim/run.ts).
    if (row >= m.earlyBossFromRow && rng.chance(m.earlyBossChance)) rng.pick(nodes).type = 'boss';
    rows.push(nodes);
  }
  const out: MapNode[][] = rows.map((r, i) =>
    r.map((n) => ({
      id: idOf(n.row, n.lane),
      row: n.row,
      lane: n.lane,
      type: n.type,
      links: i + 1 < rows.length ? n.links.map((l) => idOf(n.row + 1, l)) : [],
    })),
  );
  return { rows: out };
}
