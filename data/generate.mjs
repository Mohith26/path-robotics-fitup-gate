// Seeded data + evaluation script. `node data/generate.mjs` rewrites data/job.json and
// data/results.json deterministically. Every number the app or README shows comes from here
// or is recomputed in the browser from job.json with src/core.js.
import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import * as C from '../src/core.js';

const HERE = path.dirname(fileURLToPath(import.meta.url));
export const SEED = 20261111;

// ---------------------------------------------------------------- assumptions
// Joint classes and the cell's true (hidden) defect curve vs root gap. Logistic in gap:
// p(g) = a + (b - a) / (1 + exp(-(g - g50) / s)). Calibrated so that with this part's fit-up
// spread the simulated cell's part-level first-pass yield lands near Path's published "97%+".
export const CLASSES = {
  FT516: { label: 'Fillet T-JOINT', legIn: 5 / 16, a: 0.0005, b: 0.55, g50: 4.0, s: 0.38 },
  FT14: { label: 'Fillet T-JOINT', legIn: 1 / 4, a: 0.0005, b: 0.55, g50: 3.3, s: 0.32 },
  FL38: { label: 'Fillet LAP-JOINT', legIn: 3 / 8, a: 0.0005, b: 0.5, g50: 4.4, s: 0.42 },
};
export const PARAMS = {
  invisibleShare: 0.4,   // share of weld defects the post-weld scan cannot see (root fusion)
  ndtSensitivity: 0.9,   // probability targeted NDT (PAUT/MT) finds a defect it is pointed at
  spotFraction: 0.05,    // baseline random spot-check rate; the gate gets the same minutes
  costs: { refit: 35, defect: 420 }, // USD: re-fit before welding vs gouge + reweld + re-inspect
  tau: 0.01, delta: 0.05,
  cusumK: 0.5, targetArl: 100000,
  outlierRate: 0.025, outlierMeanMm: 1.0, stationSdMm: 0.15,
  driftMmPerPart: 0.008,
  partsPerShift: 12,
};
export const truthP = (cls, g) => { const c = CLASSES[cls]; return c.a + (c.b - c.a) / (1 + Math.exp(-(g - c.g50) / c.s)); };

// ---------------------------------------------------------------- part geometry (mm)
const RAIL_Y = 430, RAIL_H = 305, FL = 90, T = 10, LEN = 12200;
const CMX = [1500, 3150, 4800, 6450, 8100, 9750, 11400];
function box(x0, x1, y0, y1, z0, z1, kind = 'steel') { return { min: [x0, y0, z0], max: [x1, y1, z1], kind }; }
function buildGeometry() {
  const boxes = [];
  for (const sgn of [-1, 1]) {
    const yw0 = sgn > 0 ? RAIL_Y - T : -RAIL_Y, yw1 = sgn > 0 ? RAIL_Y : -RAIL_Y + T;
    const yf0 = sgn > 0 ? RAIL_Y - FL : -RAIL_Y, yf1 = sgn > 0 ? RAIL_Y : -RAIL_Y + FL;
    boxes.push(box(0, LEN, yw0, yw1, 0, RAIL_H));
    boxes.push(box(0, LEN, yf0, yf1, RAIL_H - T, RAIL_H));
    boxes.push(box(0, LEN, yf0, yf1, 0, T));
  }
  for (const x of CMX) {
    boxes.push(box(x - 5, x + 5, -RAIL_Y + T, RAIL_Y - T, 25, 279));
    boxes.push(box(x - 5, x + 65, -RAIL_Y + T, RAIL_Y - T, 269, 279));
    boxes.push(box(x - 5, x + 65, -RAIL_Y + T, RAIL_Y - T, 25, 35));
  }
  boxes.push(box(250, 1560, -RAIL_Y - 20, RAIL_Y + 20, -10, 0, 'plate'));      // kingpin plate (3/8 in)
  boxes.push(box(10300, 10656, -RAIL_Y, -RAIL_Y + 90, -260, 0));                 // hangers
  boxes.push(box(10300, 10656, RAIL_Y - 90, RAIL_Y, -260, 0));
  return boxes;
}
function buildFeatures() {
  const f = [];
  const add = (cls, lengthIn, station, name, seam, nominalMm, sdMm) => f.push({
    id: `MF-${String(f.length + 1).padStart(3, '0')}`, cls, lengthIn, station, name, seam, nominalMm, sdMm,
  });
  CMX.forEach((x, i) => {
    const st = i < 2 ? 'A' : i < 5 ? 'B' : 'C';
    for (const [side, y] of [['left', -RAIL_Y + T], ['right', RAIL_Y - T]]) {
      add('FT516', 10, st, `Crossmember ${i + 1} to ${side} rail`, [[x + 5, y, 25], [x + 5, y, 279]], 0.7 + 0.06 * ((i * 7 + (side === 'left' ? 3 : 0)) % 5), 0.36 + 0.02 * (i % 3));
    }
  });
  for (const [x, st, tag] of [[1500, 'A', 'front'], [11400, 'C', 'rear']]) {
    for (const [side, y] of [['left', -RAIL_Y + T], ['right', RAIL_Y - T]]) {
      add('FT14', 6, st, `${tag[0].toUpperCase() + tag.slice(1)} gusset, ${side} rail`, [[x + 70, y, RAIL_H - T], [x + 222, y, RAIL_H - T]], 0.6 + (side === 'left' ? 0.05 : 0.1), 0.32);
    }
  }
  for (const [x0, x1] of [[300, 910], [910, 1520]]) {
    for (const [side, y] of [['left', -RAIL_Y + FL], ['right', RAIL_Y - FL]]) {
      add('FL38', 24, 'A', `Kingpin plate lap, ${side} rail ${x0 < 900 ? 'fwd' : 'aft'}`, [[x0, y, 0], [x1, y, 0]], 0.9 + (x0 < 900 ? 0 : 0.1), 0.42);
    }
  }
  for (const [side, y] of [['left', -RAIL_Y + 45], ['right', RAIL_Y - 45]]) {
    add('FT516', 14, 'C', `Suspension hanger, ${side} rail`, [[10300, y, 0], [10656, y, 0]], 0.85, 0.38);
  }
  return f;
}

// ---------------------------------------------------------------- simulation
const DRIFT_IDS = ['MF-011', 'MF-012', 'MF-013', 'MF-014']; // crossmembers 6-7: station C clamp
export function samplePart(rng, features, driftMm = 0) {
  const st = { A: C.randn(rng) * PARAMS.stationSdMm, B: C.randn(rng) * PARAMS.stationSdMm, C: C.randn(rng) * PARAMS.stationSdMm };
  return features.map((f) => {
    let g = f.nominalMm + st[f.station] + C.randn(rng) * f.sdMm;
    if (rng() < PARAMS.outlierRate) g += -Math.log(1 - rng()) * PARAMS.outlierMeanMm;
    if (DRIFT_IDS.includes(f.id)) g += driftMm;
    return Math.max(0, g);
  });
}
export const r3 = (x) => Math.round(x * 1000) / 1000;

export function generate() {
  const rng = C.mulberry32(SEED);
  const features = buildFeatures();
  const boxes = buildGeometry();

  // Audit / first-article period: 600 parts with full outcome labels (post-weld scan + UT).
  const AUDIT = 600;
  const auditGaps = features.map(() => []);
  const byClass = {};
  for (const cls of Object.keys(CLASSES)) byClass[cls] = { gaps: [], defects: [] };
  let partsClean = 0;
  for (let p = 0; p < AUDIT; p++) {
    const g = samplePart(rng, features);
    let clean = true;
    features.forEach((f, i) => {
      const gg = r3(g[i]);
      const d = rng() < truthP(f.cls, gg) ? 1 : 0;
      if (d) clean = false;
      auditGaps[i].push(gg);
      byClass[f.cls].gaps.push(gg); byClass[f.cls].defects.push(d);
    });
    if (clean) partsClean++;
  }
  // Certification evidence: fleet history for the same joint class + weld procedure across
  // Path cells (outcomes from post-weld scans and customer NDT records). Fleet parts span a
  // much wider fit-up range than this one job, which is what lets the envelope reach real gaps.
  const FLEET = { FT516: 160000, FT14: 60000, FL38: 40000 };
  const audit = {}, fleet = {};
  for (const [cls, v] of Object.entries(byClass)) audit[cls] = C.binCounts(v.gaps, v.defects);
  for (const [cls, nSeams] of Object.entries(FLEET)) {
    const gs = [], ds = [];
    for (let i = 0; i < nSeams; i++) {
      const g = r3(rng() < 0.82 ? Math.abs(0.9 + C.randn(rng) * 0.65) : rng() * 5.6);
      gs.push(g); ds.push(rng() < truthP(cls, g) ? 1 : 0);
    }
    fleet[cls] = { ...C.binCounts(gs, ds), cells: { FT516: 14, FT14: 9, FL38: 6 }[cls] };
  }

  // Per-feature robust reference + CUSUM threshold calibrated to the in-control ARL.
  for (let i = 0; i < features.length; i++) {
    const ref = C.robustRef(auditGaps[i]);
    const zs = auditGaps[i].map((g) => C.zScore(g, ref));
    features[i].ref = { mu: r3(ref.mu), sigma: r3(ref.sigma) };
    features[i].h = Math.round(C.calibrateCusumH(zs.map((z) => z), PARAMS.cusumK, PARAMS.targetArl) * 1000) / 1000;
  }

  // Production stream shown in the app: SN 4410-0601 .. 4410-1020, drift from SN 4410-0951.
  const STREAM = 413, DRIFT_AT = 330;
  const sns = [], gaps = [], scannedAt = [];
  const tEnd = Date.UTC(2026, 10, 11, 19, 40); // last scan 2:40 PM ET, Wed Nov 11 2026
  for (let p = 0; p < STREAM; p++) {
    const drift = p >= DRIFT_AT ? (p - DRIFT_AT + 1) * PARAMS.driftMmPerPart : 0;
    gaps.push(samplePart(rng, features, drift).map(r3));
    sns.push(`4410-${String(601 + p).padStart(4, '0')}`);
    scannedAt.push(new Date(tEnd - (STREAM - 1 - p) * 30 * 60 * 1000).toISOString()); // one part every 30 min, 24/7
  }

  const job = {
    job: { name: 'HD_Trailer_Mainframe_4410', status: 'Released', partNumber: '4410', cell: 'Cell 2 (AW-3, dual arm)', auditParts: AUDIT },
    classes: Object.fromEntries(Object.entries(CLASSES).map(([k, v]) => [k, { label: v.label, legIn: v.legIn }])),
    params: PARAMS,
    features: features.map(({ sdMm, nominalMm, ...f }) => ({ ...f, nominalMm: r3(nominalMm) })),
    boxes,
    audit,
    fleet,
    stream: { sns, scannedAt, gaps, driftStartSn: sns[DRIFT_AT] },
  };
  return { job, hidden: { features, partsCleanAudit: partsClean / AUDIT, DRIFT_AT } };
}

// ---------------------------------------------------------------- evaluation
export function envelopes(job, tau = PARAMS.tau, delta = PARAMS.delta) {
  const out = {};
  for (const cls of Object.keys(job.classes)) out[cls] = C.fitEnvelope(job.fleet[cls].n, job.fleet[cls].k, { tau, delta });
  return out;
}

export function evaluateNdt(job, envs, features, shifts = 1000, seed = SEED + 1) {
  const rng = C.mulberry32(seed);
  const P = PARAMS;
  const pol = { random: { caught: 0, min: 0 }, gapRule: { caught: 0, min: 0 }, gate: { caught: 0, min: 0 }, oracle: { caught: 0, min: 0 } };
  let invisible = 0, parts = 0, visible = 0, cleanParts = 0;
  for (let s = 0; s < shifts; s++) {
    const seams = [];
    for (let p = 0; p < P.partsPerShift; p++) {
      const g = samplePart(rng, features);
      let clean = true;
      features.forEach((f, i) => {
        if (g[i] > C.D11_MAX_MM) return; // refit by code in every policy
        const pt = truthP(f.cls, g[i]);
        const def = rng() < pt;
        const vis = def && rng() < 1 - P.invisibleShare;
        if (def) clean = false;
        if (vis) visible++;
        const inv = def && !vis;
        if (inv) invisible++;
        seams.push({ gap: g[i], lengthIn: f.lengthIn, risk: C.riskAt(envs[f.cls], g[i]), truth: pt, inv, u: rng(), det: rng() < P.ndtSensitivity });
      });
      if (clean) cleanParts++;
      parts++;
    }
    const totalMin = seams.reduce((t, x) => t + C.ndtMinutes(x.lengthIn), 0);
    const budget = P.spotFraction * totalMin;
    const credit = (name, idx) => { for (const i of idx) { pol[name].min += C.ndtMinutes(seams[i].lengthIn); if (seams[i].inv && seams[i].det) pol[name].caught++; } };
    credit('random', seams.map((x, i) => (x.u < P.spotFraction ? i : -1)).filter((i) => i >= 0));
    credit('gapRule', seams.map((x, i) => (x.gap > C.D11_UPSIZE_MM ? i : -1)).filter((i) => i >= 0));
    credit('gate', C.planNdt(seams, budget, P.invisibleShare, P.ndtSensitivity).chosen);
    credit('oracle', C.planNdt(seams.map((x) => ({ ...x, risk: x.truth })), budget, P.invisibleShare, P.ndtSensitivity).chosen);
  }
  const res = { shifts, parts, invisibleDefects: invisible, visibleDefects: visible, firstPassYield: cleanParts / parts, policies: {} };
  for (const [k, v] of Object.entries(pol)) {
    res.policies[k] = { caught: v.caught, catchShare: v.caught / invisible, minutesPerPart: v.min / parts, escapesPer1000Parts: ((invisible - v.caught) / parts) * 1000 };
  }
  return res;
}

export function evaluateRefit(job, envs, features, nParts = 12000, seed = SEED + 2) {
  const rng = C.mulberry32(seed);
  const P = PARAMS;
  const acc = { code: { refits: 0, defects: 0 }, gate: { refits: 0, defects: 0 } };
  for (let p = 0; p < nParts; p++) {
    const g = samplePart(rng, features);
    features.forEach((f, i) => {
      const u1 = rng(), u2 = rng();
      const regap = Math.max(0, f.nominalMm + C.randn(rng) * f.sdMm);
      const dWeld = u1 < truthP(f.cls, g[i]);
      const dRefit = u2 < truthP(f.cls, regap);
      // code-only: refit only above 3/16 in
      if (g[i] > C.D11_MAX_MM) { acc.code.refits++; acc.code.defects += dRefit; } else acc.code.defects += dWeld;
      const dec = C.seamDecision(envs[f.cls], g[i], f.nominalMm, P.costs);
      if (dec.action === 'refit') { acc.gate.refits++; acc.gate.defects += dRefit; } else acc.gate.defects += dWeld;
    });
  }
  const out = { parts: nParts };
  for (const [k, v] of Object.entries(acc)) {
    out[k] = { refitsPerPart: v.refits / nParts, defectsPer100Parts: (v.defects / nParts) * 100, costPerPart: (v.refits * P.costs.refit + v.defects * P.costs.defect) / nParts };
  }
  return out;
}

export function evaluateDrift(job, envs, features, reps = 300, seed = SEED + 3) {
  const rng = C.mulberry32(seed);
  const P = PARAMS, ONSET = 150, LEN = 450;
  const fIdx = features.map((f, i) => (DRIFT_IDS.includes(f.id) ? i : -1)).filter((i) => i >= 0);
  const cus = [], shew = [], cusFalse = [], shewFalse = [];
  for (let r = 0; r < reps; r++) {
    const series = fIdx.map(() => []);
    for (let p = 0; p < LEN; p++) {
      const g = samplePart(rng, features, p >= ONSET ? (p - ONSET + 1) * P.driftMmPerPart : 0);
      fIdx.forEach((fi, j) => series[j].push(g[fi]));
    }
    let ca = Infinity, sa = Infinity;
    fIdx.forEach((fi, j) => {
      const f = features[fi];
      const { alarm } = C.cusum(series[j], f.ref, P.cusumK, f.h);
      if (alarm >= 0) ca = Math.min(ca, alarm);
      const s = series[j].findIndex((g) => (g - f.ref.mu) / f.ref.sigma > 3);
      if (s >= 0) sa = Math.min(sa, s);
    });
    cusFalse.push(ca < ONSET); shewFalse.push(sa < ONSET);
    if (ca >= ONSET && Number.isFinite(ca)) cus.push(ca - ONSET + 1);
    // Shewhart delay measured from onset, restarting the chart at onset (generous to Shewhart)
    let sDelay = Infinity;
    fIdx.forEach((fi, j) => {
      const f = features[fi];
      const s = series[j].slice(ONSET).findIndex((g) => (g - f.ref.mu) / f.ref.sigma > 3);
      if (s >= 0) sDelay = Math.min(sDelay, s + 1);
    });
    if (Number.isFinite(sDelay)) shew.push(sDelay);
  }
  const gStar = envs.FT516.gStar;
  const mu = C.mean(fIdx.map((fi) => features[fi].ref.mu));
  const q = (a, p) => { const b = [...a].sort((x, y) => x - y); return b[Math.min(b.length - 1, Math.floor(p * b.length))]; };
  return {
    reps, onset: ONSET, driftMmPerPart: P.driftMmPerPart,
    cusum: { medianDelay: C.median(cus), p90Delay: q(cus, 0.9), falseAlarmBeforeOnset: cusFalse.filter(Boolean).length / reps },
    shewhart3s: { medianDelay: C.median(shew), falseAlarmBeforeOnset: shewFalse.filter(Boolean).length / reps },
    partsUntilMeanLeavesEnvelope: Math.ceil((gStar - mu) / P.driftMmPerPart),
  };
}

export function run() {
  const { job, hidden } = generate();
  const envs = envelopes(job);
  const ndt = evaluateNdt(job, envs, hidden.features);
  const refit = evaluateRefit(job, envs, hidden.features);
  const drift = evaluateDrift(job, envs, hidden.features);
  const envelopeSummary = Object.fromEntries(Object.entries(envs).map(([cls, e]) => {
    // true certified-gap check: largest bin-left-edge g with true p(g) <= tau for all gaps below it
    let trueG = 0; for (let g = 0; g < 6; g += 0.001) { if (truthP(cls, g) <= PARAMS.tau) trueG = g; else break; }
    return [cls, { gStarMm: r3(e.gStar), gStarIn: r3(C.toIn(e.gStar)), trueLimitMm: r3(trueG), fleetSeams: e.total, fleetDefects: e.defects }];
  }));
  const g = ndt.policies;
  const results = {
    seed: SEED,
    defaults: { tau: PARAMS.tau, delta: PARAMS.delta, spotFraction: PARAMS.spotFraction },
    audit: { parts: job.job.auditParts, firstPassYield: r3(hidden.partsCleanAudit) },
    envelope: envelopeSummary,
    ndt, refit, drift,
    headline: {
      gateCatchPct: Math.round(g.gate.catchShare * 100),
      randomCatchPct: Math.round(g.random.catchShare * 100),
      gapRuleCatchPct: Math.round(g.gapRule.catchShare * 100),
      gapRuleMinutesPerPart: Math.round(g.gapRule.minutesPerPart * 10) / 10,
      gateMinutesPerPart: Math.round(g.gate.minutesPerPart * 10) / 10,
      randomMinutesPerPart: Math.round(g.random.minutesPerPart * 10) / 10,
      escapesCutPct: Math.round((1 - g.gate.escapesPer1000Parts / g.random.escapesPer1000Parts) * 100),
      cusumMedianDelay: drift.cusum.medianDelay,
      leadOverEnvelope: drift.partsUntilMeanLeavesEnvelope - drift.cusum.medianDelay,
      certifiedGapFT516In: envelopeSummary.FT516.gStarIn,
    },
  };
  return { job, results };
}

if (process.argv[1] && fileURLToPath(import.meta.url) === path.resolve(process.argv[1])) {
  const t = Date.now();
  const { job, results } = run();
  writeFileSync(path.join(HERE, 'job.json'), JSON.stringify(job));
  writeFileSync(path.join(HERE, 'results.json'), JSON.stringify(results, null, 1) + '\n');
  console.log(JSON.stringify(results.headline), JSON.stringify(results.envelope), JSON.stringify(results.ndt), JSON.stringify(results.refit), JSON.stringify(results.drift), results.audit, `${Date.now() - t} ms`);
}
