import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import * as C from '../src/core.js';
import { run, truthP, PARAMS } from '../data/generate.mjs';

const near = (a, b, tol, msg) => assert.ok(Math.abs(a - b) <= tol, `${msg ?? ''} ${a} vs ${b}`);

test('Clopper-Pearson upper bound matches the closed form for zero defects', () => {
  near(C.cpUpper(0, 100, 0.05), 1 - 0.05 ** (1 / 100), 1e-6);
  near(C.cpUpper(0, 3000, 0.01), 1 - 0.01 ** (1 / 3000), 1e-7);
  assert.equal(C.cpUpper(5, 5, 0.05), 1);
});

test('Clopper-Pearson bound inverts the binomial CDF and grows with k', () => {
  let prev = 0;
  for (let k = 0; k < 20; k++) {
    const u = C.cpUpper(k, 400, 0.025);
    near(C.binomCdf(k, 400, u), 0.025, 1e-6, `k=${k}`);
    assert.ok(u > prev);
    prev = u;
  }
});

test('incomplete beta satisfies I_x(a,b) = 1 - I_{1-x}(b,a) (randomized)', () => {
  const rng = C.mulberry32(1);
  for (let i = 0; i < 200; i++) {
    const x = rng(), a = 0.5 + rng() * 30, b = 0.5 + rng() * 300;
    near(C.ibeta(x, a, b), 1 - C.ibeta(1 - x, b, a), 1e-9);
  }
});

test('PAVA: textbook example and properties (randomized)', () => {
  assert.deepEqual(C.pava([1, 3, 2, 4], [1, 1, 1, 1]), [1, 2.5, 2.5, 4]);
  const rng = C.mulberry32(2);
  for (let t = 0; t < 100; t++) {
    const n = 2 + Math.floor(rng() * 25);
    const y = Array.from({ length: n }, () => rng());
    const w = Array.from({ length: n }, () => (rng() < 0.15 ? 0 : 1 + Math.floor(rng() * 50)));
    const f = C.pava(y, w);
    for (let i = 1; i < n; i++) assert.ok(f[i] >= f[i - 1] - 1e-12, 'nondecreasing');
    const W = w.reduce((s, x) => s + x, 0);
    if (W > 0) near(f.reduce((s, x, i) => s + x * w[i], 0) / W, y.reduce((s, x, i) => s + x * w[i], 0) / W, 1e-9, 'mean preserved');
  }
});

test('monotone upper band is nondecreasing and sits above the isotonic fit', () => {
  const job = JSON.parse(readFileSync(new URL('../data/job.json', import.meta.url)));
  for (const cls of Object.keys(job.fleet)) {
    const e = C.fitEnvelope(job.fleet[cls].n, job.fleet[cls].k, { tau: 0.01, delta: 0.05 });
    for (let i = 0; i < e.upper.length; i++) {
      assert.ok(e.upper[i] >= e.iso[i] - 1e-12);
      if (i) assert.ok(e.upper[i] >= e.upper[i - 1]);
    }
  }
});

test('simultaneous coverage: the band covers a known monotone curve in >= 95% of simulations', () => {
  const rng = C.mulberry32(3);
  const K = C.N_BINS, sims = 150;
  const p = Array.from({ length: K }, (_, i) => 0.002 + 0.3 / (1 + Math.exp(-(i - 18) / 2)));
  let covered = 0;
  for (let s = 0; s < sims; s++) {
    const n = Array.from({ length: K }, (_, i) => 50 + Math.floor(rng() * 400 * Math.exp(-i / 10)));
    const k = n.map((nn, i) => { let d = 0; for (let j = 0; j < nn; j++) d += rng() < p[i]; return d; });
    const U = C.monotoneUpperBand(n, k, 0.05);
    if (U.every((u, i) => u >= p[i])) covered++;
  }
  assert.ok(covered / sims >= 0.95, `coverage ${covered / sims}`);
});

test('certified gap is the left edge of the last bin under tau', () => {
  const U = Array.from({ length: C.N_BINS }, (_, i) => 0.001 * (i + 1));
  near(C.certifiedGap(U, 0.0095), 8 * C.BIN_MM, 1e-12);
  assert.equal(C.certifiedGap(U.map(() => 0.5), 0.01), 0);
});

test('AWS D1.1 fillet rules: leg upsizing above 1/16 in, refit above 3/16 in', () => {
  near(C.requiredLegIn(0.25, C.MM_PER_IN / 8), 0.375, 1e-12);       // 1/4 leg, 1/8 gap -> 3/8
  assert.equal(C.requiredLegIn(0.25, C.MM_PER_IN / 16 - 0.01), 0.25); // within 1/16: as detailed
  assert.equal(C.fracIn(0.375), '3/8"');
  const env = C.fitEnvelope(new Array(C.N_BINS).fill(1000), new Array(C.N_BINS).fill(1), { tau: 0.01 });
  assert.equal(C.seamDecision(env, 5.0, 0.8, PARAMS.costs).reason, 'code');
  assert.equal(C.seamDecision(env, 0.5, 0.8, PARAMS.costs).action, 'weld');
});

test('knapsack is exactly optimal against brute force (randomized)', () => {
  const rng = C.mulberry32(4);
  for (let t = 0; t < 80; t++) {
    const n = 1 + Math.floor(rng() * 11);
    const v = Array.from({ length: n }, () => rng());
    const w = Array.from({ length: n }, () => 1 + Math.floor(rng() * 12));
    const cap = Math.floor(rng() * 40);
    let best = 0;
    for (let m = 0; m < 1 << n; m++) {
      let vv = 0, ww = 0;
      for (let i = 0; i < n; i++) if (m & (1 << i)) { vv += v[i]; ww += w[i]; }
      if (ww <= cap && vv > best) best = vv;
    }
    const ch = C.knapsack(v, w, cap);
    assert.ok(ch.reduce((s, i) => s + w[i], 0) <= cap);
    near(ch.reduce((s, i) => s + v[i], 0), best, 1e-12);
  }
});

test('NDT plan stays inside the minute budget and prefers high-risk seams', () => {
  const seams = [{ risk: 0.2, lengthIn: 10 }, { risk: 0.001, lengthIn: 10 }, { risk: 0.05, lengthIn: 24 }];
  const plan = C.planNdt(seams, 8, 0.4, 0.9);
  assert.deepEqual(plan.chosen, [0]);
  assert.ok(plan.minutes <= 8);
});

test('Brook-Evans ARL matches simulation and calibration hits its target', () => {
  const rng = C.mulberry32(5);
  const zs = Array.from({ length: 20000 }, () => C.randn(rng));
  const arl = C.cusumArl(zs, 0.5, 4, 150);
  near(arl, 336, 25, 'one-sided ARL(k=.5,h=4) for N(0,1) is ~336 (Siegmund)');
  const ref = { mu: 0, sigma: 1 };
  let tot = 0; const reps = 1500;
  for (let r = 0; r < reps; r++) {
    let s = 0, t = 0;
    while (true) { t++; s = Math.max(0, s + Math.max(-C.Z_CLIP, Math.min(C.Z_CLIP, C.randn(rng))) - 0.5); if (s > 4) break; }
    tot += t;
  }
  near(tot / reps, C.cusumArl(zs.map((z) => C.zScore(z, ref)), 0.5, 4, 150), 0.1 * (tot / reps), 'simulated vs Markov');
  const h = C.calibrateCusumH(zs.map((z) => C.zScore(z, ref)), 0.5, 1000, 120);
  near(C.cusumArl(zs.map((z) => C.zScore(z, ref)), 0.5, h, 120), 1000, 5);
});

test('Theil-Sen recovers a drift slope despite outliers; parts-to-limit forecast', () => {
  const ys = Array.from({ length: 40 }, (_, i) => 1 + 0.01 * i + (i % 9 === 0 ? 3 : 0));
  near(C.theilSen(ys).slope, 0.01, 1e-9);
  assert.equal(C.partsToLimit(ys, 1.59), 20);
  assert.equal(C.partsToLimit(Array(40).fill(1), 2), Infinity);
});

test('CSV export escapes commas and quotes', () => {
  assert.equal(C.toCsv([{ a: 'x,y', b: 'he said "hi"' }]), 'a,b\n"x,y","he said ""hi"""');
});

test('data script is deterministic and matches the committed results file', () => {
  const a = run(), b = run();
  assert.deepEqual(a.results, b.results);
  const disk = JSON.parse(readFileSync(new URL('../data/results.json', import.meta.url)));
  assert.deepEqual(disk, JSON.parse(JSON.stringify(a.results)));
});

test('headline numbers are recomputed from the per-policy evaluation and the envelope is valid', () => {
  const { results } = run();
  const p = results.ndt.policies;
  assert.equal(results.headline.gateCatchPct, Math.round(p.gate.catchShare * 100));
  assert.equal(results.headline.randomCatchPct, Math.round(p.random.catchShare * 100));
  assert.ok(p.gate.minutesPerPart <= p.random.minutesPerPart * 1.02, 'same minutes as spot checks');
  assert.ok(p.gate.catchShare > 5 * p.random.catchShare);
  assert.ok(p.gate.catchShare <= p.oracle.catchShare + 0.02);
  for (const [cls, e] of Object.entries(results.envelope)) {
    assert.ok(e.gStarMm <= e.trueLimitMm, `${cls} certified gap must not exceed the true 1% limit`);
    assert.ok(truthP(cls, e.gStarMm) <= PARAMS.tau);
  }
  assert.ok(results.refit.gate.costPerPart < results.refit.code.costPerPart);
  assert.ok(results.drift.cusum.medianDelay < results.drift.partsUntilMeanLeavesEnvelope);
  assert.ok(results.ndtDuringDrift.policies.gapRule.minutesPerPart > 1.5 * results.ndtDuringDrift.policies.gate.minutesPerPart, 'gap rule minutes balloon under drift');
});
