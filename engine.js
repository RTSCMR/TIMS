/* TIMS signal engine: module definitions (geometry + behaviour) and a time-stepped simulator. */
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const lin = (a, b) => ({ map: p => a + (b - a) * p, unmap: v => (v - a) / (b - a) });
  const log = (a, b) => ({ map: p => a * Math.pow(b / a, p), unmap: v => Math.log(v / a) / Math.log(b / a) });
  const fHz = v => (v >= 1000 ? (v / 1000).toFixed(3) + ' kHz' : v.toFixed(0) + ' Hz');
  const fV = v => v.toFixed(2) + ' V';
  const fG = v => v.toFixed(2);
  const fUs = v => (v * 1e6).toFixed(0) + ' µs';

  // socket: [name, kind i/o, signal a(analog)/t(TTL)/g(ground), x, y, label, labelPos]
  // knob:   {n, x, y, l, def, ...scale, fmt}
  const TYPES = {
    audio: {
      title: ['AUDIO', 'OSCILLATOR'], w: 100, h: 290,
      sockets: [['sync', 'i', 'a', 50, 62, 'SYNC'], ['cos', 'o', 'a', 50, 104, 'cos ωt'], ['ttl', 'o', 't', 50, 222, 'TTL'], ['sin', 'o', 'a', 50, 262, 'sin ωt']],
      knobs: [{ n: 'f', x: 50, y: 160, l: 'Δf', def: 0.47, ...log(300, 10000), fmt: fHz }],
      sim(c) {
        const f = c.p('f'), oc = c.out('cos'), os = c.out('sin'), ot = c.out('ttl'), V = c.V;
        return t => { const ph = TAU * f * t, s = Math.sin(ph); V[oc] = 2 * Math.cos(ph); V[os] = 2 * s; V[ot] = s >= 0 ? 5 : 0; };
      }
    },
    adder: {
      title: ['ADDER'], w: 100, h: 290,
      sockets: [['a', 'i', 'a', 50, 62, 'A'], ['b', 'i', 'a', 50, 158, 'B'], ['out', 'o', 'a', 50, 258, 'GA+gB']],
      knobs: [{ n: 'G', x: 50, y: 108, l: 'G', def: 0.3, ...lin(0, -2), fmt: fG }, { n: 'g', x: 50, y: 204, l: 'g', def: 0.72, ...lin(0, -2), fmt: fG }],
      sim(c) {
        const G = c.p('G'), g = c.p('g'), a = c.in('a'), b = c.in('b'), o = c.out('out'), V = c.V;
        return () => { V[o] = G * V[a] + g * V[b]; };
      }
    },
    mult: {
      title: ['MULTIPLIER'], w: 100, h: 290,
      sockets: [['x', 'i', 'a', 50, 70, 'X'], ['y', 'i', 'a', 50, 128, 'Y'], ['out', 'o', 'a', 50, 250, 'kXY']],
      knobs: [], deco: [{ t: 'DC', x: 50, y: 192 }, { t: 'k = ½', x: 50, y: 206 }],
      sim(c) {
        const x = c.in('x'), y = c.in('y'), o = c.out('out'), V = c.V;
        return () => { V[o] = 0.5 * V[x] * V[y]; };
      }
    },
    vco: {
      title: ['VCO'], w: 100, h: 290,
      sockets: [['vin', 'i', 'a', 27, 215, 'Vin'], ['ttl', 'o', 't', 73, 215, 'TTL'], ['sin', 'o', 'a', 50, 258, 'sin ωt']],
      knobs: [{ n: 'gain', x: 50, y: 82, l: 'GAIN', def: 0.2, ...lin(0, 10000), fmt: v => (v / 1000).toFixed(2) + ' kHz/V' },
        { n: 'f0', x: 50, y: 148, l: 'fo', def: 0.33, ...lin(70000, 130000), fmt: fHz }],
      sim(c) {
        const k = c.p('gain'), f0 = c.p('f0'), vin = c.in('vin'), os = c.out('sin'), ot = c.out('ttl'), V = c.V, dt = c.dt;
        let ph = 0;
        // The lab's own readings: +2 V gives a lower frequency, -2 V a higher one.
        return () => { const f = Math.max(0, f0 - k * V[vin]); ph += TAU * f * dt; if (ph > TAU) ph -= TAU; const s = Math.sin(ph); V[os] = 2 * s; V[ot] = s >= 0 ? 5 : 0; };
      }
    },
    twin: {
      title: ['TWIN PULSE', 'GENERATOR'], w: 100, h: 290,
      sockets: [['q1', 'o', 't', 50, 138, 'Q1'], ['q2', 'o', 't', 50, 228, 'Q2'], ['clk', 'i', 't', 50, 264, 'CLK']],
      knobs: [{ n: 'width', x: 50, y: 92, l: 'WIDTH', def: 0.3, ...lin(5e-6, 90e-6), fmt: fUs }, { n: 'delay', x: 50, y: 182, l: 'DELAY', def: 0.2, ...lin(10e-6, 110e-6), fmt: fUs }],
      leds: [{ n: 'error', x: 78, y: 52, l: 'ERROR' }],
      sim(c) {
        const w = c.p('width'), d = c.p('delay'), ck = c.in('clk'), o1 = c.out('q1'), o2 = c.out('q2'), V = c.V;
        let prev = false, tE = -Infinity, per = Infinity;
        c.onEnd(() => c.led('error', d + w > per * 1.01));
        return t => {
          const hi = V[ck] > 1.5;
          if (hi && !prev) { if (tE > -Infinity) per = t - tE; tE = t; }
          prev = hi; const ts = t - tE;
          V[o1] = ts < w ? 5 : 0; V[o2] = (ts >= d && ts < d + w) ? 5 : 0;
        };
      }
    },
    dsw: {
      title: ['DUAL ANALOG', 'SWITCH'], w: 100, h: 290,
      sockets: [['in1', 'i', 'a', 50, 62, 'IN 1'], ['c1', 'i', 't', 50, 106, 'CONTROL 1'], ['c2', 'i', 't', 50, 152, 'CONTROL 2'], ['in2', 'i', 'a', 50, 198, 'IN 2'], ['out', 'o', 'a', 50, 252, 'OUT']],
      knobs: [],
      sim(c) {
        const i1 = c.in('in1'), i2 = c.in('in2'), c1 = c.in('c1'), c2 = c.in('c2'), o = c.out('out'), V = c.V;
        return () => { V[o] = (V[c1] > 1.5 ? V[i1] : 0) + (V[c2] > 1.5 ? V[i2] : 0); };
      }
    },
    lpf: {
      title: ['TUNEABLE', 'LPF'], w: 100, h: 290,
      sockets: [['clk', 'o', 't', 50, 58, 'CLK'], ['in', 'i', 'a', 27, 252, 'IN'], ['out', 'o', 'a', 73, 252, 'OUT']],
      knobs: [{ n: 'tune', x: 50, y: 104, l: 'TUNE', def: 0.5, ...lin(0, 1), fmt: v => v.toFixed(2) }, { n: 'gain', x: 50, y: 162, l: 'GAIN', def: 0.3, ...lin(0, 2.5), fmt: v => '×' + v.toFixed(2) }],
      switches: [{ n: 'wide', x: 50, y: 208, l: ['NORM', 'WIDE'] }],
      fc(m) { const p = m.p.tune; return m.sw && m.sw.wide ? 2000 * Math.pow(6, p) : 900 * Math.pow(5000 / 900, p); },
      sim(c) {
        const fc = TYPES.lpf.fc(c.m), G = c.p('gain'), iin = c.in('in'), o = c.out('out'), V = c.V;
        c.hint(c.out('clk'), fc * (c.m.sw && c.m.sw.wide ? 360 : 880));
        // Two cascaded 8th-order Butterworth filters (eight state-variable sections) for a steep
        // stop band like the module's elliptic filter; 0.9464 puts the combined -3 dB point at fc.
        const g = Math.tan(Math.PI * (fc / 0.9464) * c.dt), Q = [0.5098, 0.6013, 0.9, 2.5629, 0.5098, 0.6013, 0.9, 2.5629];
        const a1 = [], a2 = [], a3 = [], s1 = new Float64Array(8), s2 = new Float64Array(8);
        for (let i = 0; i < 8; i++) { const k = 1 / Q[i]; a1[i] = 1 / (1 + g * (g + k)); a2[i] = g * a1[i]; a3[i] = g * a2[i]; }
        return () => {
          let x = V[iin];
          for (let i = 0; i < 8; i++) {
            const v3 = x - s2[i], v1 = a1[i] * s1[i] + a2[i] * v3, v2 = s2[i] + a2[i] * s1[i] + a3[i] * v3;
            s1[i] = 2 * v1 - s1[i]; s2[i] = 2 * v2 - s2[i]; x = v2;
          }
          V[o] = G * x;
        };
      }
    },
    util: {
      title: ['UTILITIES'], w: 100, h: 290,
      sockets: [['ref', 'i', 'a', 27, 68, 'REF'], ['cin', 'i', 'a', 73, 68, 'IN'], ['cout', 'o', 't', 50, 104, 'OUT', 'r'],
        ['rin', 'i', 'a', 27, 156, ''], ['rout', 'o', 'a', 73, 156, ''], ['din', 'i', 'a', 27, 206, ''], ['dout', 'o', 'a', 73, 206, ''], ['lin', 'i', 'a', 27, 256, ''], ['lout', 'o', 'a', 73, 256, '']],
      knobs: [],
      deco: [{ t: 'COMPARATOR', x: 50, y: 46, b: 1 }, { t: 'RECTIFIER', x: 50, y: 138, b: 1 }, { t: 'DIODE + LPF', x: 50, y: 188, b: 1 }, { t: 'RC LPF', x: 50, y: 238, b: 1 },
        { t: '→', x: 50, y: 160 }, { t: '→', x: 50, y: 210 }, { t: '→', x: 50, y: 260 }],
      sim(c) {
        const V = c.V, ref = c.in('ref'), ci = c.in('cin'), co = c.out('cout'), ri = c.in('rin'), ro = c.out('rout'),
          di = c.in('din'), dout = c.out('dout'), li = c.in('lin'), lo = c.out('lout');
        const a = 1 - Math.exp(-TAU * 2800 * c.dt); let yd = 0, yl = 0;
        return () => {
          V[co] = V[ci] > V[ref] ? 5 : 0;
          V[ro] = V[ri] > 0 ? V[ri] : 0;
          yd += a * ((V[di] > 0 ? V[di] : 0) - yd); V[dout] = yd;
          yl += a * (V[li] - yl); V[lo] = yl;
        };
      }
    },
    // ---- fixed lower-row modules ----
    dc: {
      title: ['VARIABLE', 'DC'], w: 90, h: 220, fixed: 1,
      sockets: [['out', 'o', 'a', 28, 172, 'DC'], ['gnd', 'o', 'g', 63, 172, 'GND']],
      knobs: [{ n: 'v', x: 45, y: 98, l: '−        +', def: 0.62, ...lin(-2.5, 2.5), fmt: fV }],
      sim(c) { c.V[c.out('out')] = c.p('v'); c.V[c.out('gnd')] = 0; return null; }
    },
    buf: {
      title: ['BUFFER', 'AMPLIFIERS'], w: 100, h: 220, fixed: 1,
      sockets: [['ina', 'i', 'a', 24, 62, 'A', 'r'], ['outa', 'o', 'a', 24, 100, 'k1·A', 'r'], ['inb', 'i', 'a', 24, 148, 'B', 'r'], ['outb', 'o', 'a', 24, 186, 'k2·B', 'r']],
      knobs: [{ n: 'k1', x: 72, y: 76, l: 'K1', def: 0.4, ...lin(0, 2.5), fmt: v => '×' + v.toFixed(2) }, { n: 'k2', x: 72, y: 162, l: 'K2', def: 0.4, ...lin(0, 2.5), fmt: v => '×' + v.toFixed(2) }],
      sim(c) {
        const V = c.V, k1 = c.p('k1'), k2 = c.p('k2'), a = c.in('ina'), b = c.in('inb'), oa = c.out('outa'), ob = c.out('outb');
        return () => { V[oa] = k1 * V[a]; V[ob] = k2 * V[b]; };
      }
    },
    master: {
      title: ['MASTER', 'SIGNALS'], w: 110, h: 220, fixed: 1,
      sockets: [['cos', 'o', 'a', 90, 58, '100kHz cos', 'l'], ['sin', 'o', 'a', 90, 88, '100kHz sin', 'l'], ['ttl', 'o', 't', 90, 118, '100kHz TTL', 'l'],
        ['clk8', 'o', 't', 90, 154, '8.3kHz TTL', 'l'], ['msg', 'o', 'a', 90, 190, '2kHz sin', 'l']],
      knobs: [],
      sim(c) {
        const V = c.V, oc = c.out('cos'), os = c.out('sin'), ot = c.out('ttl'), o8 = c.out('clk8'), om = c.out('msg');
        const f8 = 1e5 / 12, fm = 1e5 / 48;
        return t => {
          const ph = TAU * 1e5 * t, s = Math.sin(ph); V[oc] = 2 * Math.cos(ph); V[os] = 2 * s; V[ot] = s >= 0 ? 5 : 0;
          const x = t * f8; V[o8] = (x - Math.floor(x)) < 0.5 ? 5 : 0; V[om] = 2 * Math.sin(TAU * fm * t);
        };
      }
    },
    counter: {
      title: ['FREQUENCY COUNTER'], w: 230, h: 220, fixed: 1,
      sockets: [['analog', 'i', 'a', 40, 140, 'ANALOG', 'r'], ['ttl', 'i', 't', 40, 182, 'TTL', 'r']],
      knobs: [], switches: [{ n: 'gate', x: 160, y: 158, l: ['0.1s', '1s', '10s'], pos: 3, def: 1 }]
    },
    trunks: { title: ['TRUNKS', 'PANEL'], w: 70, h: 220, fixed: 1, sockets: [], knobs: [], inert: [[35, 70, 'SIGNAL 1'], [35, 118, 'SIGNAL 2'], [35, 166, 'SIGNAL 3']] },
    scope: {
      title: ['SCOPE', 'SELECTOR'], w: 100, h: 220, fixed: 1,
      sockets: [['a1', 'i', 'a', 34, 64, 'A', 'l'], ['b1', 'i', 'a', 34, 98, 'B', 'l'], ['a2', 'i', 'a', 34, 146, 'A', 'l'], ['b2', 'i', 'a', 34, 180, 'B', 'l']],
      knobs: [], switches: [{ n: 'sw1', x: 72, y: 81, l: ['A', 'B'] }, { n: 'sw2', x: 72, y: 163, l: ['A', 'B'] }],
      deco: [{ t: 'CH 1', x: 50, y: 44, b: 1 }, { t: 'CH 2', x: 50, y: 126, b: 1 }]
    },
    head: { title: ['HEADPHONE', 'AMPLIFIER'], w: 100, h: 220, fixed: 1, sockets: [], knobs: [], inert: [[30, 80, 'IN'], [30, 176, 'LPF']], decoKnob: [70, 128] }
  };

  const knobDef = (type, n) => TYPES[type].knobs.find(k => k.n === n);
  const phys = (m, n) => knobDef(m.type, n).map(m.p[n]);

  function build(st, dt) {
    const idx = {}, owner = [null]; let n = 1;
    for (const m of st.modules) for (const s of TYPES[m.type].sockets) {
      const key = m.id + '.' + s[0];
      idx[key] = { i: s[1] === 'o' ? n : 0, out: s[1] === 'o', m };
      if (s[1] === 'o') { owner[n] = m; n++; }
    }
    const par = {}; const find = k => { while (par[k] !== k) { par[k] = par[par[k]]; k = par[k]; } return k; };
    for (const k in idx) par[k] = k;
    for (const w of st.wires) if (idx[w.a] && idx[w.b]) par[find(w.a)] = find(w.b);
    const driver = {}, conflicts = [];
    for (const k in idx) if (idx[k].out) { const r = find(k); if (driver[r] === undefined) driver[r] = idx[k].i; else if (!conflicts.includes(r)) conflicts.push(r); }
    const src = key => (idx[key] ? (driver[find(key)] || 0) : 0);
    const same = (a, b) => !!(idx[a] && idx[b]) && find(a) === find(b);
    const V = new Float64Array(n), hints = {}, leds = {}, ends = [], fns = new Map();
    // order modules so drivers run before the modules they feed
    const order = [], mark = new Map();
    const visit = m => {
      if (mark.get(m)) return; mark.set(m, 1);
      for (const s of TYPES[m.type].sockets) if (s[1] === 'i') { const i = src(m.id + '.' + s[0]); if (i && owner[i] !== m) visit(owner[i]); }
      order.push(m);
    };
    st.modules.forEach(visit);
    const steps = [];
    for (const m of order) {
      const T = TYPES[m.type]; if (!T.sim) continue;
      const f = T.sim({
        V, dt, m, p: nm => phys(m, nm), in: nm => src(m.id + '.' + nm), out: nm => idx[m.id + '.' + nm].i,
        hint: (i, f) => { hints[i] = f; }, led: (nm, on) => { leds[m.id + '.' + nm] = on; }, onEnd: fn => ends.push(fn)
      });
      if (f) steps.push(f);
    }
    return { V, steps, src, same, hints, leds, ends, conflicts: conflicts.length };
  }

  function stats(buf, i0, n, dt) {
    if (n < 2) return null;
    let mx = -Infinity, mn = Infinity, sum = 0;
    for (let i = i0; i < i0 + n; i++) { const v = buf[i]; if (v > mx) mx = v; if (v < mn) mn = v; sum += v; }
    const pp = mx - mn, out = { max: mx, min: mn, pp, mean: sum / n, freq: null };
    if (pp < 0.02) return out;
    const mid = (mx + mn) / 2, lo = mid - 0.1 * pp, hi = mid + 0.1 * pp;
    let up = false, dn = false, rf = -1, rl = -1, rk = 0, af = -1, al = -1, ak = 0;
    for (let i = i0 + 1; i < i0 + n; i++) {
      const v = buf[i], u = buf[i - 1];
      if (v < lo) up = true; if (v > hi) dn = true;
      let tt = -1;
      if (up && v >= mid && u < mid) { tt = (i - 1) + (mid - u) / (v - u); up = false; if (rf < 0) rf = tt; rl = tt; rk++; }
      else if (dn && v <= mid && u > mid) { tt = (i - 1) + (mid - u) / (v - u); dn = false; }
      if (tt >= 0) { if (af < 0) af = tt; al = tt; ak++; }
    }
    if (rk >= 2) out.freq = (rk - 1) / ((rl - rf) * dt);
    else if (ak >= 2) out.freq = (ak - 1) / (2 * (al - af) * dt);
    return out;
  }

  function run(st, opt) {
    const win = opt.tdiv * 10, pre = 3e-3, Tm = Math.max(win + 4e-3, 20e-3);
    const dt = Math.max(0.25e-6, Tm / 120000);
    const b = build(st, dt), V = b.V, steps = b.steps, ns = steps.length;
    const sc = st.modules.find(m => m.type === 'scope'), sw = (sc && sc.sw) || {};
    const iA = b.src('scope.' + (sw.sw1 ? 'b1' : 'a1')), iB = b.src('scope.' + (sw.sw2 ? 'b2' : 'a2'));
    const iC = b.src('counter.analog') || b.src('counter.ttl');
    const nPre = Math.round(pre / dt), nMain = Math.round(Tm / dt), nWin = Math.min(nMain, Math.round(win / dt));
    const A = new Float32Array(nMain), B = new Float32Array(nMain), C = new Float32Array(nMain);
    for (let n = 0; n < nPre + nMain; n++) {
      const t = n * dt;
      for (let j = 0; j < ns; j++) steps[j](t, dt);
      if (n >= nPre) { const k = n - nPre; A[k] = V[iA]; B[k] = V[iB]; C[k] = V[iC]; }
    }
    b.ends.forEach(f => f());
    // trigger: first rising crossing of the mid level on the chosen channel
    let i0 = 0; const tb = opt.trig === 'A' ? (iA ? A : null) : opt.trig === 'B' ? (iB ? B : null) : null;
    if (tb) {
      const s = stats(tb, 0, nMain, dt);
      if (s && s.pp > 0.02) {
        const mid = (s.max + s.min) / 2, lo = mid - 0.1 * s.pp; let armed = false;
        for (let i = 1; i <= nMain - nWin; i++) { const v = tb[i]; if (v < lo) armed = true; else if (armed && v >= mid) { i0 = i; break; } }
      }
    }
    let fC = 0;
    if (iC) { if (b.hints[iC]) fC = b.hints[iC]; else { const s = stats(C, 0, nMain, dt); fC = (s && s.freq) || 0; } }
    return { dt, A, B, i0, nWin, connA: !!iA, connB: !!iB, connC: !!iC, fC, leds: b.leds, conflicts: b.conflicts, same: b.same };
  }

  const api = { TYPES, phys, knobDef, build, run, stats };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TIMS = api;
})(typeof window !== 'undefined' ? window : globalThis);
