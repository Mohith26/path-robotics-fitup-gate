// Fit-up Gate core: pure functions shared by the browser app, the seeded data
// script and the tests. No dependencies. All lengths in millimetres unless noted.

export const MM_PER_IN = 25.4;
// AWS D1.1 fillet weld assembly: up to 1/16 in weld as detailed, over 1/16 in
// increase the leg by the root opening, over 3/16 in not permitted (refit).
export const D11_UPSIZE_MM = MM_PER_IN / 16;      // 1.5875 mm
export const D11_MAX_MM = (3 * MM_PER_IN) / 16;   // 4.7625 mm
export const BIN_MM = 0.2;
export const N_BINS = 30;                          // 0 .. 6.0 mm

// ---------------------------------------------------------------- random
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function () {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
export function randn(rng) {
  let u = 0, v = 0;
  while (u === 0) u = rng();
  while (v === 0) v = rng();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ---------------------------------------------------------------- beta / binomial
function lgamma(x) {
  const g = 7;
  const c = [0.99999999999980993, 676.5203681218851, -1259.1392167224028, 771.32342877765313,
    -176.61502916214059, 12.507343278686905, -0.13857109526572012, 9.9843695780195716e-6, 1.5056327351493116e-7];
  if (x < 0.5) return Math.log(Math.PI / Math.sin(Math.PI * x)) - lgamma(1 - x);
  x -= 1;
  let a = c[0];
  const t = x + g + 0.5;
  for (let i = 1; i < g + 2; i++) a += c[i] / (x + i);
  return 0.5 * Math.log(2 * Math.PI) + (x + 0.5) * Math.log(t) - t + Math.log(a);
}
function betacf(a, b, x) {
  const MAXIT = 300, EPS = 3e-14, FPMIN = 1e-300;
  const qab = a + b, qap = a + 1, qam = a - 1;
  let c = 1, d = 1 - (qab * x) / qap;
  if (Math.abs(d) < FPMIN) d = FPMIN;
  d = 1 / d;
  let h = d;
  for (let m = 1; m <= MAXIT; m++) {
    const m2 = 2 * m;
    let aa = (m * (b - m) * x) / ((qam + m2) * (a + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d; h *= d * c;
    aa = (-(a + m) * (qab + m) * x) / ((a + m2) * (qap + m2));
    d = 1 + aa * d; if (Math.abs(d) < FPMIN) d = FPMIN;
    c = 1 + aa / c; if (Math.abs(c) < FPMIN) c = FPMIN;
    d = 1 / d;
    const del = d * c;
    h *= del;
    if (Math.abs(del - 1) < EPS) break;
  }
  return h;
}
/** Regularized incomplete beta I_x(a, b). */
export function ibeta(x, a, b) {
  if (x <= 0) return 0;
  if (x >= 1) return 1;
  const bt = Math.exp(lgamma(a + b) - lgamma(a) - lgamma(b) + a * Math.log(x) + b * Math.log(1 - x));
  if (x < (a + 1) / (a + b + 2)) return (bt * betacf(a, b, x)) / a;
  return 1 - (bt * betacf(b, a, 1 - x)) / b;
}
/** P(Binomial(n, p) <= k). */
export function binomCdf(k, n, p) {
  if (k < 0) return 0;
  if (k >= n) return 1;
  return 1 - ibeta(p, k + 1, n - k);
}
/** One-sided Clopper-Pearson upper bound: smallest p with P(Bin(n,p) <= k) <= alpha. */
export function cpUpper(k, n, alpha) {
  if (n <= 0 || k >= n) return 1;
  let lo = k / n, hi = 1;
  for (let i = 0; i < 80; i++) {
    const mid = (lo + hi) / 2;
    if (binomCdf(k, n, mid) > alpha) lo = mid; else hi = mid;
  }
  return hi;
}

// ---------------------------------------------------------------- isotonic
/** Weighted pool-adjacent-violators, nondecreasing fit. Zero-weight points take their left neighbour's fit. */
export function pava(y, w) {
  const idx = [];
  for (let i = 0; i < y.length; i++) if (w[i] > 0) idx.push(i);
  const blocks = []; // {v, w, start, end} over idx positions
  for (let p = 0; p < idx.length; p++) {
    const i = idx[p];
    blocks.push({ v: y[i], w: w[i], s: p, e: p });
    while (blocks.length > 1 && blocks[blocks.length - 2].v > blocks[blocks.length - 1].v) {
      const b = blocks.pop(), a = blocks.pop();
      const ww = a.w + b.w;
      blocks.push({ v: (a.v * a.w + b.v * b.w) / ww, w: ww, s: a.s, e: b.e });
    }
  }
  const out = new Array(y.length).fill(NaN);
  for (const b of blocks) for (let p = b.s; p <= b.e; p++) out[idx[p]] = b.v;
  let last = idx.length ? out[idx[0]] : 0;
  for (let i = 0; i < out.length; i++) { if (Number.isNaN(out[i])) out[i] = last; else last = out[i]; }
  return out;
}

// ---------------------------------------------------------------- envelope
export function binIndex(gapMm) {
  return Math.max(0, Math.min(N_BINS - 1, Math.floor(gapMm / BIN_MM)));
}
export function binCounts(gaps, defects) {
  const n = new Array(N_BINS).fill(0), k = new Array(N_BINS).fill(0);
  for (let i = 0; i < gaps.length; i++) { const b = binIndex(gaps[i]); n[b]++; k[b] += defects[i] ? 1 : 0; }
  return { n, k };
}
/**
 * Simultaneous one-sided upper band for a nondecreasing defect-rate curve.
 * For every bin interval [i, j] the pooled rate is bounded with Clopper-Pearson at
 * level delta / (#intervals) (Bonferroni). Monotonicity gives p_i <= pooled(i..j)
 * for every j >= i, and p_i <= p_i' for i' >= i, hence the running minimum from the right.
 */
export function monotoneUpperBand(n, k, delta) {
  const K = n.length, m = (K * (K + 1)) / 2, a = delta / m;
  const U0 = new Array(K).fill(1);
  for (let i = 0; i < K; i++) {
    let N = 0, D = 0, best = 1;
    for (let j = i; j < K; j++) {
      N += n[j]; D += k[j];
      if (N === 0) continue;
      const u = cpUpper(D, N, a);
      if (u < best) best = u;
    }
    U0[i] = best;
  }
  const U = U0.slice();
  for (let i = K - 2; i >= 0; i--) U[i] = Math.min(U[i], U[i + 1]);
  return U;
}
/** Certified gap: every gap below it has defect rate <= tau (simultaneously, prob >= 1 - delta). */
export function certifiedGap(U, tau) {
  let j = -1;
  for (let i = 0; i < U.length; i++) if (U[i] <= tau) j = i;
  return j < 0 ? 0 : j * BIN_MM;
}
export function fitEnvelope(n, k, { tau = 0.01, delta = 0.05 } = {}) {
  const rate = n.map((nn, i) => (nn > 0 ? k[i] / nn : 0));
  const iso = pava(rate, n);
  const upper = monotoneUpperBand(n, k, delta);
  const gStar = certifiedGap(upper, tau);
  return { n, k, rate, iso, upper, gStar, tau, delta, total: n.reduce((s, x) => s + x, 0), defects: k.reduce((s, x) => s + x, 0) };
}
export const riskAt = (env, gapMm) => env.iso[binIndex(gapMm)];
// Pointwise bound at a gap: by monotonicity p(g) <= mean rate of the next bin, so use U of the next bin.
export const upperAt = (env, gapMm) => env.upper[Math.min(N_BINS - 1, binIndex(gapMm) + 1)];

// ---------------------------------------------------------------- decisions
/** AWS D1.1 fillet leg requirement for a given gap (inches). */
export function requiredLegIn(legIn, gapMm) {
  return gapMm > D11_UPSIZE_MM ? legIn + gapMm / MM_PER_IN : legIn;
}
/**
 * Pre-weld decision for one seam. Refit when the gap is over the code limit, or when the
 * expected cost of a weld defect at this gap exceeds the cost of re-fitting
 * (re-fit returns the seam to its nominal-gap risk).
 */
export function seamDecision(env, gapMm, nominalMm, costs) {
  const risk = riskAt(env, gapMm);
  if (gapMm > D11_MAX_MM) return { action: 'refit', reason: 'code', risk };
  const gain = (risk - riskAt(env, nominalMm)) * costs.defect;
  if (gain > costs.refit) return { action: 'refit', reason: 'cost', risk };
  return { action: 'weld', reason: gapMm > env.gStar ? 'outside' : 'within', risk };
}
/** Exact 0/1 knapsack (weights in integer units). Returns chosen indices. */
export function knapsack(values, weights, capacity) {
  const n = values.length, C = Math.max(0, Math.floor(capacity));
  const dp = new Float64Array(C + 1);
  const take = new Uint8Array((n) * (C + 1));
  for (let i = 0; i < n; i++) {
    const w = weights[i], v = values[i];
    for (let c = C; c >= w; c--) {
      const cand = dp[c - w] + v;
      if (cand > dp[c] + 1e-15) { dp[c] = cand; take[i * (C + 1) + c] = 1; }
    }
  }
  const chosen = [];
  let c = C;
  for (let i = n - 1; i >= 0; i--) if (take[i * (C + 1) + c]) { chosen.push(i); c -= weights[i]; }
  return chosen.reverse();
}
export const ndtMinutes = (lengthIn) => 3 + 0.3 * lengthIn;
export const HALF_MIN = 2; // knapsack units per minute

/** NDT plan for a set of welded seams: maximise expected scan-invisible defects caught within budget minutes. */
export function planNdt(seams, budgetMin, invisibleShare, sensitivity) {
  const values = seams.map((s) => s.risk * invisibleShare * sensitivity);
  const weights = seams.map((s) => Math.round(ndtMinutes(s.lengthIn) * HALF_MIN));
  const chosen = knapsack(values, weights, budgetMin * HALF_MIN);
  const minutes = chosen.reduce((t, i) => t + weights[i] / HALF_MIN, 0);
  const expected = chosen.reduce((t, i) => t + values[i], 0);
  return { chosen, minutes, expected };
}

// ---------------------------------------------------------------- drift
export function mean(a) { return a.reduce((s, x) => s + x, 0) / a.length; }
export function sd(a) { const m = mean(a); return Math.sqrt(a.reduce((s, x) => s + (x - m) ** 2, 0) / (a.length - 1)); }
export function median(a) { const b = [...a].sort((x, y) => x - y), m = b.length >> 1; return b.length % 2 ? b[m] : (b[m - 1] + b[m]) / 2; }
export const Z_CLIP = 3;
export function robustRef(gaps) {
  const med = median(gaps);
  const mad = median(gaps.map((g) => Math.abs(g - med))) * 1.4826;
  return { mu: med, sigma: Math.max(mad, 1e-3) };
}
export const zScore = (g, ref) => Math.max(-Z_CLIP, Math.min(Z_CLIP, (g - ref.mu) / ref.sigma));
/** One-sided upper CUSUM on clipped robust z-scores. */
export function cusum(gaps, ref, k, h) {
  const S = [];
  let s = 0, alarm = -1;
  for (let i = 0; i < gaps.length; i++) {
    s = Math.max(0, s + zScore(gaps[i], ref) - k);
    S.push(s);
    if (alarm < 0 && s > h) alarm = i;
  }
  return { S, alarm };
}
/**
 * In-control ARL of an upper CUSUM via the Brook-Evans Markov chain, using the empirical
 * distribution of (clipped) z-scores. States discretise [0, h).
 */
export function cusumArl(zs, k, h, states = 120) {
  // States are midpoints j*t, j = 0..N-1, with t = 2h/(2N-1): state j covers ((j-1/2)t, (j+1/2)t],
  // state 0 also takes everything <= t/2 (the reflection at zero), and > h is the alarm.
  const N = states, t = (2 * h) / (2 * N - 1);
  const incr = zs.map((z) => z - k);
  const A = [];
  for (let i = 0; i < N; i++) {
    const row = new Float64Array(N + 1);
    const s = i * t;
    for (const d of incr) {
      const nx = s + d;
      if (nx > h) continue;
      const j = nx <= t / 2 ? 0 : Math.min(N - 1, Math.round(nx / t));
      row[j] += 1 / incr.length;
    }
    for (let j = 0; j < N; j++) row[j] = (i === j ? 1 : 0) - row[j];
    row[N] = 1;
    A.push(row);
  }
  for (let c = 0; c < N; c++) {
    let p = c;
    for (let r = c + 1; r < N; r++) if (Math.abs(A[r][c]) > Math.abs(A[p][c])) p = r;
    [A[c], A[p]] = [A[p], A[c]];
    for (let r = 0; r < N; r++) {
      if (r === c) continue;
      const f = A[r][c] / A[c][c];
      if (f === 0) continue;
      for (let cc = c; cc <= N; cc++) A[r][cc] -= f * A[c][cc];
    }
  }
  return A[0][N] / A[0][0];
}
export function calibrateCusumH(zs, k, targetArl, states = 120) {
  let lo = 0.5, hi = 40;
  for (let it = 0; it < 40; it++) {
    const mid = (lo + hi) / 2;
    if (cusumArl(zs, k, mid, states) < targetArl) lo = mid; else hi = mid;
  }
  return hi;
}
/** Theil-Sen slope and intercept (index -> value). */
export function theilSen(ys) {
  const sl = [];
  for (let i = 0; i < ys.length; i++) for (let j = i + 1; j < ys.length; j++) sl.push((ys[j] - ys[i]) / (j - i));
  const b = median(sl);
  const a = median(ys.map((y, i) => y - b * i));
  return { slope: b, intercept: a };
}
/** Parts until the trend line of the last `win` gaps reaches `limit` (Infinity if flat or falling). */
export function partsToLimit(gaps, limit, win = 40) {
  const ys = gaps.slice(-win);
  const { slope, intercept } = theilSen(ys);
  const now = intercept + slope * (ys.length - 1);
  if (now >= limit) return 0;
  if (slope <= 1e-6) return Infinity;
  return Math.ceil((limit - now) / slope);
}

// ---------------------------------------------------------------- formatting / export
export const toIn = (mm) => mm / MM_PER_IN;
export function fmtIn(mm, d = 3) { return `${toIn(mm).toFixed(d).replace(/^0\./, '0.')}"`; }
export function fracIn(inches) {
  const s = Math.round(inches * 32);
  const whole = Math.floor(s / 32);
  let num = s % 32, den = 32;
  while (num && num % 2 === 0) { num /= 2; den /= 2; }
  if (!num) return `${whole}"`;
  return whole ? `${whole} ${num}/${den}"` : `${num}/${den}"`;
}
export function toCsv(rows) {
  if (!rows.length) return '';
  const cols = Object.keys(rows[0]);
  const esc = (v) => { const s = String(v ?? ''); return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s; };
  return [cols.join(','), ...rows.map((r) => cols.map((c) => esc(r[c])).join(','))].join('\n');
}
