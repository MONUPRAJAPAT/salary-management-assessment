/**
 * A small seeded PRNG (mulberry32).
 *
 * Math.random() would make the seeded database different on every run, which would make
 * every number in the demo, the performance measurements and the documentation a moving
 * target. With a fixed seed, `npm run seed` produces byte-identical data every time, on
 * every machine — so "the median Engineering salary in Germany is €X" stays true.
 */
export class Random {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** Uniform in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [min, max], inclusive at both ends. */
  int(min: number, max: number): number {
    return min + Math.floor(this.next() * (max - min + 1));
  }

  float(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  chance(probability: number): boolean {
    return this.next() < probability;
  }

  pick<T>(items: readonly T[]): T {
    const item = items[this.int(0, items.length - 1)];
    if (item === undefined) throw new Error('Cannot pick from an empty list.');
    return item;
  }

  /** Picks by relative weight. Weights need not sum to anything in particular. */
  weighted<T>(entries: ReadonlyArray<readonly [T, number]>): T {
    const total = entries.reduce((sum, [, weight]) => sum + weight, 0);
    let threshold = this.next() * total;
    for (const [value, weight] of entries) {
      threshold -= weight;
      if (threshold <= 0) return value;
    }
    const last = entries[entries.length - 1];
    if (last === undefined) throw new Error('Cannot pick from an empty distribution.');
    return last[0];
  }

  /** Normal deviate via Box–Muller, clamped so no salary ends up absurd. */
  normal(mean: number, standardDeviation: number, min = -Infinity, max = Infinity): number {
    const u1 = Math.max(this.next(), Number.EPSILON);
    const u2 = this.next();
    const value = mean + standardDeviation * Math.sqrt(-2 * Math.log(u1)) * Math.cos(2 * Math.PI * u2);
    return Math.min(Math.max(value, min), max);
  }

  /** Fisher–Yates, in place, using this generator so shuffles are reproducible too. */
  shuffle<T>(items: T[]): T[] {
    for (let i = items.length - 1; i > 0; i -= 1) {
      const j = this.int(0, i);
      const a = items[i] as T;
      const b = items[j] as T;
      items[i] = b;
      items[j] = a;
    }
    return items;
  }
}
