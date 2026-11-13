/* UI: draws the TIMS rack as SVG, handles wires/knobs/switches, and renders the scope on a canvas. */
(function () {
  'use strict';
  const { TYPES, phys, run, stats } = window.TIMS, { LABS, fresh, applyCase } = window.TLABS;
  const NS = 'http://www.w3.org/2000/svg';
  const $ = s => document.querySelector(s);
  const el = (tag, at, parent, text) => {
    const e = document.createElementNS(NS, tag);
    for (const k in at) e.setAttribute(k, at[k]);
    if (text != null) e.textContent = text;
    if (parent) parent.appendChild(e);
    return e;
  };
  const COLORS = { r: '#d6252b', b: '#1e6fd0', y: '#efc000', g: '#2b9a48', k: '#26282b' };
  const SOCK = { a: '#f2c400', t: '#d8261f', g: '#2b9a48' };
  const BX = 40, BY = 34, LY = 344, SLOTS = 8;
  const TDIVS = [5e-6, 10e-6, 20e-6, 50e-6, 100e-6, 200e-6, 500e-6, 1e-3, 2e-3, 5e-3];
  const RANGES = [0.05, 0.1, 0.2, 0.5, 1, 2, 5, 10, 20];

  const states = {};
  [5, 7, 9, 10].forEach(l => { states[l] = fresh(l); applyCase(states[l], LABS[l].cases[0]); });
  let lab = 5, st = states[5], res = null;
  const ui = { color: 'r', fine: false, cheat: false, sel: -1, knob: null };
  const COARSE = window.matchMedia && window.matchMedia('(pointer: coarse)').matches;
  const HINT = COARSE ? 'السلك: اضغط على مقبس ثم اضغط على المقبس الثاني (أو اسحب بينهم). اضغط على السلك عشان تحذفه أو تنقل طرفه. الكنوب: اضغط عليه ثم لفه من الشريط اللي تحت الجهاز.' : 'السلك: اسحب من مقبس إلى مقبس، أو اضغط على الأول ثم الثاني. اضغط على السلك عشان تحذفه أو تنقل طرفه. الكنوب: اسحبه، أو اضغط عليه ولفه من الشريط اللي تحت الجهاز.';
  const svg = $('#rack');
  let pos = {}, knobEls = {}, swEls = {}, ledEls = {}, segG = null, layers = {};
  const mod = id => st.modules.find(m => m.id === id);

  // ---------------- rack drawing ----------------
  function layout() {
    let x = BX;
    st.modules.forEach(m => {
      const T = TYPES[m.type];
      if (T.fixed) { m.x = x; m.y = LY; x += T.w; } else { m.x = BX + m.slot * 100; m.y = BY; }
    });
  }
  function renderRack() {
    svg.textContent = ''; pos = {}; knobEls = {}; swEls = {}; ledEls = {};
    layout();
    const body = el('g', {}, svg);
    el('ellipse', { cx: 440, cy: 606, rx: 430, ry: 14, fill: '#00000022' }, body);
    el('rect', { x: 12, y: 8, width: 856, height: 592, rx: 12, fill: '#d6d0bc', stroke: '#9a947f', 'stroke-width': 2 }, body);
    el('rect', { x: 22, y: 18, width: 836, height: 572, rx: 6, fill: 'none', stroke: '#bcb6a2', 'stroke-width': 1.5 }, body);
    [[24, 60], [24, 300], [24, 380], [24, 540], [856, 60], [856, 300], [856, 380], [856, 540]].forEach(p => {
      el('circle', { cx: p[0], cy: p[1], r: 6, fill: '#8e8e8e', stroke: '#555' }, body);
      el('path', { d: `M${p[0] - 4},${p[1]} h8`, stroke: '#444', 'stroke-width': 1.5 }, body);
    });
    el('rect', { x: BX - 4, y: BY - 4, width: 808, height: 298, fill: '#1e2024' }, body);
    el('rect', { x: BX - 4, y: LY - 4, width: 808, height: 228, fill: '#1e2024' }, body);
    const used = new Set(st.modules.filter(m => m.slot >= 0).map(m => m.slot));
    for (let s = 0; s < SLOTS; s++) if (!used.has(s)) {
      const x = BX + s * 100;
      el('rect', { x: x + 1, y: BY, width: 98, height: 290, fill: '#2a2d32' }, body);
      for (let i = 1; i < 4; i++) el('rect', { x: x + i * 25 - 1, y: BY + 6, width: 2, height: 278, fill: '#3b3f46' }, body);
      el('rect', { x: x + 30, y: BY + 2, width: 40, height: 7, rx: 2, fill: '#c0392b' }, body);
      el('rect', { x: x + 30, y: BY + 281, width: 40, height: 7, rx: 2, fill: '#c0392b' }, body);
      el('text', { x: x + 50, y: BY + 150, 'text-anchor': 'middle', 'font-size': 20, style: 'fill:#555b64' }, body, String(s + 1));
    }
    el('text', { x: 440, y: 586, 'text-anchor': 'middle', 'font-size': 11, 'letter-spacing': 2, style: 'fill:#6d6857' }, body, 'TIMS-301 · TELECOMMUNICATION INSTRUCTIONAL MODELLING SYSTEM');

    layers.mods = el('g', {}, svg);
    layers.wires = el('g', {}, svg);
    layers.hits = el('g', {}, svg);
    layers.top = el('g', {}, svg);
    layers.temp = el('g', { class: 'noev' }, svg);
    st.modules.forEach(drawModule);
    // black leads from the scope selector to the PicoScope
    const sc = mod('scope');
    [81, 163].forEach((y, i) => {
      el('circle', { cx: sc.x + 92, cy: sc.y + y + 22, r: 5, fill: '#111' }, layers.mods);
      el('path', { d: `M${sc.x + 92},${sc.y + y + 22} C${sc.x + 110},${sc.y + y + 90} ${850},${610 - i * 14} 880,${600 - i * 16}`, stroke: '#151515', 'stroke-width': 5, fill: 'none', 'stroke-linecap': 'round', class: 'noev' }, layers.mods);
    });
    renderWires();
  }

  function drawModule(m) {
    const T = TYPES[m.type], g = el('g', { transform: `translate(${m.x},${m.y})` }, layers.mods);
    el('rect', { x: 1, y: 0, width: T.w - 2, height: T.h, rx: 2, fill: '#efe9d6', stroke: '#8d8773' }, g);
    el('rect', { x: 1, y: 0, width: T.w - 2, height: T.title.length > 1 ? 32 : 24, rx: 2, fill: '#e2dcc6' }, g);
    T.title.forEach((t, i) => el('text', { x: T.w / 2, y: 14 + i * 12, 'text-anchor': 'middle', 'font-size': 11.5, 'font-weight': 700 }, g, t));
    (T.deco || []).forEach(d => el('text', { x: d.x, y: d.y, 'text-anchor': 'middle', 'font-size': d.b ? 9.5 : 10, 'font-weight': d.b ? 700 : 500, style: d.b ? 'fill:#5a5546' : '' }, g, d.t));
    (T.inert || []).forEach(s => {
      el('circle', { cx: s[0], cy: s[1], r: 9, fill: '#cdb85a' }, g); el('circle', { cx: s[0], cy: s[1], r: 4.2, fill: '#2b2b2b' }, g);
      el('text', { x: s[0], y: s[1] + 20, 'text-anchor': 'middle', 'font-size': 8.5, style: 'fill:#7a7566' }, g, s[2]);
    });
    if (T.decoKnob) { el('circle', { cx: T.decoKnob[0], cy: T.decoKnob[1], r: 15, fill: '#1b1b1b' }, g); el('circle', { cx: T.decoKnob[0], cy: T.decoKnob[1], r: 9.5, fill: '#d9b200' }, g); }
    if (m.type === 'scope') { el('text', { x: 72, y: 110, 'text-anchor': 'middle', 'font-size': 8.5, style: 'fill:#1b4fd6', 'font-weight': 700 }, g, 'PICO A'); el('text', { x: 72, y: 192, 'text-anchor': 'middle', 'font-size': 8.5, style: 'fill:#d6202a', 'font-weight': 700 }, g, 'PICO B'); }
    if (m.type === 'counter') {
      el('rect', { x: 18, y: 40, width: 194, height: 52, rx: 3, fill: '#170303', stroke: '#000' }, g);
      segG = el('g', { transform: 'translate(26,52)' }, g);
      el('text', { x: 205, y: 104, 'text-anchor': 'end', 'font-size': 9.5, 'font-weight': 700 }, g, 'kHz');
      el('text', { x: 160, y: 126, 'text-anchor': 'middle', 'font-size': 8.5 }, g, 'GATE TIME');
    }
    T.sockets.forEach(s => {
      const [n, , sig, x, y, label, lp] = s, key = m.id + '.' + n;
      pos[key] = { x: m.x + x, y: m.y + y };
      el('circle', { cx: x, cy: y, r: 9.5, fill: SOCK[sig], stroke: '#00000055' }, g);
      el('circle', { cx: x, cy: y, r: 4.4, fill: '#161616' }, g);
      if (label) {
        if (lp === 'l') el('text', { x: x - 13, y: y + 3.5, 'text-anchor': 'end', 'font-size': 9.5 }, g, label);
        else if (lp === 'r') el('text', { x: x + 13, y: y + 3.5, 'text-anchor': 'start', 'font-size': 9.5 }, g, label);
        else el('text', { x, y: y + 20, 'text-anchor': 'middle', 'font-size': 9.5 }, g, label);
      }
      const h = el('circle', { cx: m.x + x, cy: m.y + y, r: COARSE ? 16 : 12.5, class: 'hit sock', 'data-sock': key }, layers.hits);
      el('title', {}, h, T.title.join(' ') + ' · ' + (label || n));
    });
    T.knobs.forEach(k => {
      const kg = el('g', { transform: `translate(${k.x},${k.y})` }, g);
      for (let i = 0; i <= 10; i++) { const a = (-135 + i * 27 - 90) * Math.PI / 180; el('line', { x1: 19 * Math.cos(a), y1: 19 * Math.sin(a), x2: 22 * Math.cos(a), y2: 22 * Math.sin(a), stroke: '#55503f', 'stroke-width': 1 }, kg); }
      el('circle', { r: 16.5, fill: '#1b1b1b' }, kg);
      const rot = el('g', {}, kg);
      el('circle', { r: 10.5, fill: '#e9bd00', stroke: '#a88900' }, rot);
      el('line', { x1: 0, y1: -4, x2: 0, y2: -16, stroke: '#fff', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, rot);
      const txt = el('text', { x: k.x, y: k.y + 34, 'text-anchor': 'middle', 'font-size': 9.5, 'font-weight': 700, 'xml:space': 'preserve' }, g, k.l);
      const hit = el('circle', { cx: m.x + k.x, cy: m.y + k.y, r: COARSE ? 23 : 18, class: 'hit knob', 'data-knob': m.id + '.' + k.n, tabindex: 0, role: 'slider', 'aria-label': T.title.join(' ') + ' ' + k.l }, layers.hits);
      knobEls[m.id + '.' + k.n] = { rot, txt, k, m, hit };
      updateKnob(m.id + '.' + k.n);
    });
    (T.switches || []).forEach(s => {
      const sg = el('g', { transform: `translate(${s.x},${s.y})` }, g), key = m.id + '.' + s.n;
      if (s.pos === 3) {
        el('circle', { r: 13, fill: '#1b1b1b' }, sg); const rot = el('g', {}, sg);
        el('line', { x1: 0, y1: -2, x2: 0, y2: -12, stroke: '#fff', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, rot);
        s.l.forEach((t, i) => el('text', { x: (i - 1) * 26, y: i === 1 ? -19 : -13, 'text-anchor': 'middle', 'font-size': 9 }, sg, t));
        swEls[key] = { rot, s, m };
      } else {
        el('rect', { x: -8, y: -12, width: 16, height: 24, rx: 3, fill: '#8f9399', stroke: '#444' }, sg);
        const lever = el('circle', { cx: 0, r: 5.5, fill: '#e8e8e8', stroke: '#333' }, sg);
        if (m.type !== 'scope') { el('text', { x: 0, y: -16, 'text-anchor': 'middle', 'font-size': 8.5 }, sg, s.l[0]); el('text', { x: 0, y: 23, 'text-anchor': 'middle', 'font-size': 8.5 }, sg, s.l[1]); }
        else { el('text', { x: 14, y: -4, 'font-size': 8.5 }, sg, 'A'); el('text', { x: 14, y: 10, 'font-size': 8.5 }, sg, 'B'); }
        swEls[key] = { lever, s, m };
      }
      el('rect', { x: m.x + s.x - 16, y: m.y + s.y - 16, width: 32, height: 32, class: 'hit', 'data-sw': key, tabindex: 0, role: 'button', 'aria-label': T.title.join(' ') + ' switch' }, layers.hits);
      updateSwitch(key);
    });
    (T.leds || []).forEach(l => {
      ledEls[m.id + '.' + l.n] = el('circle', { cx: l.x, cy: l.y, r: 4.5, fill: '#4a1210', stroke: '#222' }, g);
      el('text', { x: l.x - 9, y: l.y + 3, 'text-anchor': 'end', 'font-size': 8.5 }, g, l.l);
    });
  }
  function updateKnob(key) {
    const K = knobEls[key]; if (!K) return;
    const p = K.m.p[K.k.n];
    K.rot.setAttribute('transform', `rotate(${-135 + 270 * p})`);
    const val = K.k.fmt(K.k.map(p));
    K.txt.textContent = ui.cheat ? (K.k.l.trim().length > 2 || K.k.l.includes('+') ? val : K.k.l + ' = ' + val) : K.k.l;
    K.hit.setAttribute('aria-valuenow', p.toFixed(3));
    if (key === ui.knob) syncKnobPanel();
  }
  function updateSwitch(key) {
    const S = swEls[key]; if (!S) return; const v = S.m.sw[S.s.n] || 0;
    if (S.rot) S.rot.setAttribute('transform', `rotate(${(v - 1) * 42})`); else S.lever.setAttribute('cy', v ? 6 : -6);
  }

  // ---------------- wires ----------------
  function wireGeo(a, b) {
    const d = Math.hypot(b.x - a.x, b.y - a.y), sag = Math.min(110, 26 + d * 0.3);
    return { d: `M${a.x},${a.y} C${a.x},${a.y + sag} ${b.x},${b.y + sag} ${b.x},${b.y}`, mx: (a.x + b.x) / 2, my: (a.y + b.y) / 2 + 0.75 * sag };
  }
  function plug(parent, p, c) {
    el('circle', { cx: p.x, cy: p.y, r: 8, fill: COLORS[c], stroke: '#00000066', 'stroke-width': 1.2 }, parent);
    el('circle', { cx: p.x, cy: p.y, r: 3, fill: '#00000040' }, parent);
  }
  function renderWires() {
    layers.wires.textContent = ''; layers.top.textContent = '';
    st.wires.forEach((w, i) => {
      const a = pos[w.a], b = pos[w.b]; if (!a || !b) return;
      const geo = wireGeo(a, b), g = el('g', {}, layers.wires);
      if (i === ui.sel) el('path', { d: geo.d, stroke: '#fff', 'stroke-width': 10, fill: 'none', 'stroke-linecap': 'round', opacity: .9, class: 'noev' }, g);
      el('path', { d: geo.d, stroke: '#000', 'stroke-width': 7.5, fill: 'none', opacity: .28, class: 'noev' }, g);
      el('path', { d: geo.d, stroke: COLORS[w.c], 'stroke-width': 5.2, fill: 'none', 'stroke-linecap': 'round', class: 'noev' }, g);
      el('path', { d: geo.d, 'stroke-width': 15, class: 'wirehit', 'data-wire': i }, g);
      const pg = el('g', { class: 'noev' }, g); plug(pg, a, w.c); plug(pg, b, w.c);
      if (i === ui.sel) {
        el('circle', { cx: a.x, cy: a.y, r: 12, class: 'handle', 'data-handle': i + ':a' }, layers.top);
        el('circle', { cx: b.x, cy: b.y, r: 12, class: 'handle', 'data-handle': i + ':b' }, layers.top);
        const dg = el('g', { class: 'del', 'data-del': i, transform: `translate(${geo.mx},${geo.my})`, tabindex: 0, role: 'button', 'aria-label': 'احذف السلك' }, layers.top);
        el('circle', { r: 11, fill: '#fff', stroke: '#b3261e', 'stroke-width': 2 }, dg);
        el('path', { d: 'M-4.5,-4.5 L4.5,4.5 M4.5,-4.5 L-4.5,4.5', stroke: '#b3261e', 'stroke-width': 2.4, 'stroke-linecap': 'round' }, dg);
      }
    });
  }

  let drag = null;
  const svgPt = e => { const p = svg.createSVGPoint(); p.x = e.clientX; p.y = e.clientY; return p.matrixTransform(svg.getScreenCTM().inverse()); };
  const sockAt = e => { const t = document.elementFromPoint(e.clientX, e.clientY), s = t && t.closest && t.closest('[data-sock]'); return s ? s.dataset.sock : null; };
  function tempWire(from, p, c) {
    layers.temp.textContent = '';
    const geo = wireGeo(from, p);
    el('path', { d: geo.d, stroke: COLORS[c], 'stroke-width': 5.2, fill: 'none', 'stroke-linecap': 'round', opacity: .85 }, layers.temp);
    plug(layers.temp, from, c); plug(layers.temp, p, c);
  }
  function endDrag() {
    drag = null; layers.temp.textContent = ''; layers.top.removeAttribute('pointer-events');
    svg.querySelectorAll('.tgt').forEach(n => n.classList.remove('tgt'));
  }
  function finishWire(tgt) {
    if (drag.mode === 'new') {
      if (tgt && tgt !== drag.from && !st.wires.some(w => (w.a === drag.from && w.b === tgt) || (w.b === drag.from && w.a === tgt))) st.wires.push({ a: drag.from, b: tgt, c: ui.color });
    } else if (tgt && tgt !== drag.from) { drag.wire[drag.end] = tgt; }
    endDrag(); renderWires(); changed();
  }
  svg.addEventListener('pointerdown', e => {
    const t = e.target;
    if (drag && drag.sticky) { const s = sockAt(e); if (s) finishWire(s); else { endDrag(); renderWires(); } e.preventDefault(); return; }
    const delEl = t.closest('[data-del]');
    if (delEl) { st.wires.splice(+delEl.dataset.del, 1); ui.sel = -1; renderWires(); changed(); return; }
    if (t.dataset.handle) {
      const [i, end] = t.dataset.handle.split(':'), w = st.wires[+i];
      drag = { mode: 'move', wire: w, end, from: w[end === 'a' ? 'b' : 'a'], color: w.c, x: e.clientX, y: e.clientY, moved: true };
      layers.top.setAttribute('pointer-events', 'none'); svg.setPointerCapture(e.pointerId); e.preventDefault(); return;
    }
    if (t.dataset.sock) {
      ui.sel = -1; renderWires();
      drag = { mode: 'new', from: t.dataset.sock, color: ui.color, x: e.clientX, y: e.clientY, moved: false };
      svg.setPointerCapture(e.pointerId); e.preventDefault(); return;
    }
    if (t.dataset.knob) {
      const K = knobEls[t.dataset.knob];
      selectKnob(t.dataset.knob);
      drag = { mode: 'knob', key: t.dataset.knob, p0: K.m.p[K.k.n], x: e.clientX, y: e.clientY };
      svg.setPointerCapture(e.pointerId); t.focus(); e.preventDefault(); return;
    }
    if (t.dataset.sw) { toggleSwitch(t.dataset.sw); return; }
    if (t.dataset.wire != null) { ui.sel = +t.dataset.wire; renderWires(); return; }
    if (ui.sel >= 0) { ui.sel = -1; renderWires(); }
  });
  svg.addEventListener('pointermove', e => {
    if (!drag) return;
    if (drag.mode === 'knob') {
      const K = knobEls[drag.key], d = ((e.clientX - drag.x) - (e.clientY - drag.y)) / ((ui.fine || e.shiftKey) ? 4000 : 320);
      K.m.p[K.k.n] = Math.min(1, Math.max(0, drag.p0 + d)); updateKnob(drag.key); changed(); return;
    }
    if (Math.hypot(e.clientX - drag.x, e.clientY - drag.y) > 6) drag.moved = true;
    const s = sockAt(e);
    svg.querySelectorAll('.tgt').forEach(n => n.classList.remove('tgt'));
    if (s && s !== drag.from) { const h = svg.querySelector(`[data-sock="${s}"]`); if (h) h.classList.add('tgt'); }
    tempWire(pos[drag.from], s && s !== drag.from ? pos[s] : svgPt(e), drag.color);
  });
  svg.addEventListener('pointerup', e => {
    if (!drag || drag.sticky) return;
    if (drag.mode === 'knob') { drag = null; return; }
    const s = sockAt(e);
    if (drag.mode === 'new' && !drag.moved) { drag.sticky = true; tempWire(pos[drag.from], svgPt(e), drag.color); return; }
    finishWire(s);
  });
  svg.addEventListener('pointercancel', () => { if (drag && drag.mode !== 'knob') { endDrag(); renderWires(); } else drag = null; });
  svg.addEventListener('dblclick', e => { if (e.target.dataset.wire != null) { st.wires.splice(+e.target.dataset.wire, 1); ui.sel = -1; renderWires(); changed(); } });
  svg.addEventListener('wheel', e => {
    const k = e.target.dataset && e.target.dataset.knob; if (!k) return;
    e.preventDefault(); nudge(k, -Math.sign(e.deltaY) * ((ui.fine || e.shiftKey) ? 0.0004 : 0.005));
  }, { passive: false });
  svg.addEventListener('keydown', e => {
    const d = e.target.dataset || {};
    if (d.knob && /^Arrow/.test(e.key)) { e.preventDefault(); nudge(d.knob, (/Up|Right/.test(e.key) ? 1 : -1) * ((ui.fine || e.shiftKey) ? 0.0004 : 0.005)); }
    if ((d.sw) && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); toggleSwitch(d.sw); }
    if (e.target.closest('[data-del]') && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); removeSel(); }
  });
  document.addEventListener('keydown', e => {
    if (e.key === 'Escape' && drag) { endDrag(); renderWires(); }
    if ((e.key === 'Delete' || e.key === 'Backspace') && ui.sel >= 0 && !/INPUT|SELECT/.test(document.activeElement.tagName)) { e.preventDefault(); removeSel(); }
  });
  function removeSel() { if (ui.sel < 0) return; st.wires.splice(ui.sel, 1); ui.sel = -1; renderWires(); changed(); }
  function nudge(key, d) { const K = knobEls[key]; K.m.p[K.k.n] = Math.min(1, Math.max(0, K.m.p[K.k.n] + d)); updateKnob(key); changed(); }
  function toggleSwitch(key) { const S = swEls[key]; S.m.sw[S.s.n] = ((S.m.sw[S.s.n] || 0) + 1) % (S.s.pos || 2); updateSwitch(key); changed(); }

  svg.addEventListener('touchstart', e => { if (e.target.closest && e.target.closest('.hit,.handle,[data-del]')) e.preventDefault(); }, { passive: false });

  // ---------------- knob panel (touch-friendly) ----------------
  function selectKnob(key) {
    ui.knob = key && knobEls[key] ? key : null;
    svg.querySelectorAll('.selk').forEach(n => n.classList.remove('selk'));
    if (ui.knob) knobEls[ui.knob].hit.classList.add('selk');
    syncKnobPanel();
  }
  function syncKnobPanel() {
    const K = ui.knob && knobEls[ui.knob], sl = $('#kslider');
    $('#kpanel').classList.toggle('on', !!K); sl.disabled = !K;
    if (!K) { $('#kname').textContent = 'اضغط على أي كنوب في الجهاز عشان تلفه من هنا'; return; }
    const nm = K.k.l.includes('+') ? 'DC' : K.k.l;
    $('#kname').innerHTML = '<b dir="ltr">' + TYPES[K.m.type].title.join(' ') + ' · ' + nm + '</b>' + (ui.cheat ? ' <span class="m">' + K.k.fmt(K.k.map(K.m.p[K.k.n])) + '</span>' : '');
    if (document.activeElement !== sl) sl.value = K.m.p[K.k.n];
  }
  $('#kslider').addEventListener('input', e => { if (!ui.knob) return; const K = knobEls[ui.knob]; K.m.p[K.k.n] = +e.target.value; updateKnob(ui.knob); changed(); });
  let rep = null;
  const stopRep = () => { clearTimeout(rep); clearInterval(rep); rep = null; };
  $('#kpanel').addEventListener('pointerdown', e => {
    const b = e.target.closest('[data-d]'); if (!b || !ui.knob) return; e.preventDefault();
    const d = +b.dataset.d; nudge(ui.knob, d); stopRep();
    rep = setTimeout(() => { rep = setInterval(() => nudge(ui.knob, d), 60); }, 350);
  });
  ['pointerup', 'pointerleave', 'pointercancel'].forEach(ev => $('#kpanel').addEventListener(ev, stopRep));
  $('#kpanel').addEventListener('keydown', e => { const b = e.target.closest('[data-d]'); if (b && ui.knob && (e.key === 'Enter' || e.key === ' ')) { e.preventDefault(); nudge(ui.knob, +b.dataset.d); } });

  // ---------------- 7-segment counter ----------------
  const SEG = { a: [2, 0, 11, 3], b: [12.5, 2, 3, 10.5], c: [12.5, 15.5, 3, 10.5], d: [2, 25, 11, 3], e: [-.5, 15.5, 3, 10.5], f: [-.5, 2, 3, 10.5], g: [2, 12.5, 11, 3] };
  const DIG = { 0: 'abcdef', 1: 'bc', 2: 'abged', 3: 'abgcd', 4: 'fgbc', 5: 'afgcd', 6: 'afgedc', 7: 'abc', 8: 'abcdefg', 9: 'abfgcd', ' ': '' };
  function drawCounter(f, conn) {
    if (!segG) return; segG.textContent = '';
    const dec = [2, 3, 4][mod('counter').sw.gate || 0];
    const s = (conn ? f / 1000 : 0).toFixed(dec), cells = [];
    for (const ch of s) { if (ch === '.') cells[cells.length - 1].dot = true; else cells.push({ ch }); }
    while (cells.length < 8) cells.unshift({ ch: ' ' });
    cells.slice(-8).forEach((c, i) => {
      const g = el('g', { transform: `translate(${i * 22.5},0) skewX(-6)` }, segG);
      for (const k in SEG) { const r = SEG[k]; el('rect', { x: r[0], y: r[1], width: r[2], height: r[3], rx: 1.2, fill: DIG[c.ch].includes(k) ? '#ff3a2a' : '#290706' }, g); }
      el('circle', { cx: 18.5, cy: 26.5, r: 1.7, fill: c.dot ? '#ff3a2a' : '#290706' }, g);
    });
  }

  // ---------------- simulation loop ----------------
  let pending = false;
  function changed() { if (pending) return; pending = true; requestAnimationFrame(() => { pending = false; simulate(); }); }
  function helpers() {
    return {
      C: res.same, S: a => ['a1', 'b1', 'a2', 'b2'].some(s => res.same(a, 'scope.' + s)), near: (x, t, e) => Math.abs(x - t) <= e,
      v: (id, k) => phys(mod(id), k), lpfFc: () => TYPES.lpf.fc(mod('lpf'))
    };
  }
  function simulate() {
    res = run(st, st.scope);
    drawCounter(res.fC, res.connC);
    for (const k in ledEls) ledEls[k].setAttribute('fill', res.leds[k] ? '#ff3a2a' : '#4a1210');
    const hint = $('#hint');
    if (res.conflicts) {
      const nm = k => { const [id, n] = k.split('.'), m = mod(id), so = TYPES[m.type].sockets.find(x => x[0] === n); return TYPES[m.type].title.join(' ') + ' (' + (so[5] || n) + ')'; };
      hint.textContent = 'تنبيه: مخرجين موصلين ببعض: ' + res.clash.map(g => g.map(nm).join(' مع ')).join('، و ') + '. المخرج لازم يروح لمدخل، مو لمخرج ثاني. اضغط على السلك اللي بينهم واحذفه.';
      hint.classList.add('warn');
    }
    else { hint.textContent = HINT; hint.classList.remove('warn'); }
    updateGuide(); drawScope(); updateMeas();
  }

  // ---------------- guide ----------------
  function renderGuide() {
    const L = LABS[lab], g = $('#guide');
    let n = 0;
    g.innerHTML = `<h2>${L.title} <span>${L.tab}</span></h2><p class="idea">${L.idea}</p>
      <div class="cases"><span>شغّل حالة جاهزة:</span>${L.cases.map((c, i) => `<button type="button" data-case="${i}"><span class="m">${c.label}</span></button>`).join('')}</div>
      <div class="gcols"><section class="steps"><h3>خطوات التشبيك</h3><ol>${L.steps.map(s => s.h ? `<li class="sub">${s.h}</li>` : `<li data-step="${n++}">${s.t}</li>`).join('')}</ol>
      <p class="note">علامة ✓ تطلع لما الخطوة تكون صحيحة على الجهاز الحين. جرّب «ابدأ من الصفر» وشبّك بنفسك.</p></section>
      <section class="theory"><h3>الفكرة والحسابات</h3>${L.theory}
      <div class="truth" id="truth" ${ui.cheat ? '' : 'hidden'}><h3>القيم الحقيقية الحين</h3><dl></dl></div></section></div>`;
    g.querySelectorAll('.cases button .m').forEach(s => { s.style.fontFamily = 'inherit'; });
  }
  function updateGuide() {
    const L = LABS[lab], h = helpers(), list = L.steps.filter(s => !s.h);
    document.querySelectorAll('#guide li[data-step]').forEach(li => { const s = list[+li.dataset.step]; li.classList.toggle('ok', !!(s.ok && s.ok(h))); });
    const tr = $('#truth'); if (!tr) return; tr.hidden = !ui.cheat;
    if (ui.cheat) tr.querySelector('dl').innerHTML = L.truth(h).map(r => `<div><dt>${r[0]}:</dt> <dd>${r[1]}</dd></div>`).join('');
  }
  $('#guide').addEventListener('click', e => {
    const b = e.target.closest('[data-case]'); if (!b) return;
    applyCase(st, LABS[lab].cases[+b.dataset.case]); ui.sel = -1;
    for (const k in knobEls) updateKnob(k); for (const k in swEls) updateSwitch(k);
    renderWires(); syncScopeUI(); changed();
  });

  // ---------------- scope ----------------
  const cv = $('#cv'), ctx = cv.getContext('2d');
  let P = { x: 50, y: 12, w: 100, h: 100 }, hover = null, rdrag = null, RA = 5, RB = 5;
  const act = f => f > 0.012;
  const fmtT = t => { const a = Math.abs(t); return a === 0 ? '0' : a < 1e-3 ? (t * 1e6).toFixed(a < 1e-5 ? 2 : 1).replace(/\.0+$/, '') + ' µs' : (t * 1e3).toFixed(3).replace(/\.?0+$/, '') + ' ms'; };
  const fmtV = v => (Math.abs(v) < 0.995 && v !== 0 ? (v * 1000).toFixed(0) + ' mV' : v.toFixed(2) + ' V');
  const fmtF = f => (f == null ? '—' : f >= 1000 ? (f / 1000).toFixed(f >= 1e5 ? 1 : 3) + ' kHz' : f.toFixed(1) + ' Hz');
  function autoR(buf) { let m = 0; for (let i = res.i0; i < res.i0 + res.nWin; i++) { const a = Math.abs(buf[i]); if (a > m) m = a; } return RANGES.find(r => r >= m * 1.02) || 20; }
  function drawScope() {
    const box = cv.parentElement.getBoundingClientRect(), dpr = window.devicePixelRatio || 1, W = Math.max(200, box.width), H = Math.max(160, box.height);
    if (cv.width !== Math.round(W * dpr) || cv.height !== Math.round(H * dpr)) { cv.width = Math.round(W * dpr); cv.height = Math.round(H * dpr); }
    const g = ctx; g.setTransform(dpr, 0, 0, dpr, 0, 0); g.clearRect(0, 0, W, H);
    P = { x: 56, y: 26, w: W - 112, h: H - 58 };
    g.fillStyle = '#fff'; g.fillRect(0, 0, W, H);
    g.lineWidth = 1;
    for (let i = 0; i <= 10; i++) {
      g.strokeStyle = i === 5 ? '#9aa4b1' : '#d3d9e0'; g.setLineDash(i === 0 || i === 10 ? [] : [2, 3]);
      const x = Math.round(P.x + i * P.w / 10) + .5, y = Math.round(P.y + i * P.h / 10) + .5;
      g.beginPath(); g.moveTo(x, P.y); g.lineTo(x, P.y + P.h); g.moveTo(P.x, y); g.lineTo(P.x + P.w, y); g.stroke();
    }
    g.setLineDash([]);
    if (!res) return;
    const S = st.scope, showA = S.onA && res.connA, showB = S.onB && res.connB;
    RA = S.rA === 'auto' ? (res.connA ? autoR(res.A) : 5) : +S.rA; RB = S.rB === 'auto' ? (res.connB ? autoR(res.B) : 5) : +S.rB;
    g.font = '11px "IBM Plex Mono", monospace'; g.textBaseline = 'middle';
    const stepY = P.h > 300 ? 1 : 2, lab = r => v => (r < 1 ? (v * 1000).toFixed(0) : v.toFixed(r < 5 ? 1 : 0));
    for (let i = 0; i <= 10; i += stepY) {
      const y = P.y + i * P.h / 10;
      if (S.onA) { g.fillStyle = '#1b4fd6'; g.textAlign = 'right'; g.fillText(lab(RA)(RA - i * RA / 5), P.x - 7, y); }
      if (S.onB) { g.fillStyle = '#d6202a'; g.textAlign = 'left'; g.fillText(lab(RB)(RB - i * RB / 5), P.x + P.w + 7, y); }
    }
    g.textBaseline = 'alphabetic';
    if (S.onA) { g.fillStyle = '#1b4fd6'; g.textAlign = 'right'; g.fillText(RA < 1 ? 'A  mV' : 'A  V', P.x - 7, P.y - 12); }
    if (S.onB) { g.fillStyle = '#d6202a'; g.textAlign = 'left'; g.fillText(RB < 1 ? 'mV  B' : 'V  B', P.x + P.w + 7, P.y - 12); }
    g.fillStyle = '#566372'; g.textAlign = 'center';
    const us = S.tdiv * 10 < 2e-3, stepX = P.w > 460 ? 1 : 2;
    for (let i = 0; i <= 10; i += stepX) { const t = i * S.tdiv; g.fillText(us ? (t * 1e6).toFixed(0) : (t * 1e3).toFixed(S.tdiv < 1e-3 ? 1 : 0), P.x + i * P.w / 10, P.y + P.h + 15); }
    g.textAlign = 'right'; g.fillText(us ? 'µs' : 'ms', P.x + P.w + 44, P.y + P.h + 15);

    g.save(); g.beginPath(); g.rect(P.x, P.y, P.w, P.h); g.clip();
    const trace = (buf, R, color, alpha) => {
      const n = res.nWin, i0 = res.i0, y = v => P.y + P.h / 2 - v / R * (P.h / 2);
      g.beginPath();
      if (n <= P.w * 1.5) { for (let i = 0; i < n; i++) { const x = P.x + i / (n - 1) * P.w; if (i) g.lineTo(x, y(buf[i0 + i])); else g.moveTo(x, y(buf[i0])); } }
      else {
        const cols = Math.floor(P.w);
        for (let c = 0; c < cols; c++) {
          const a = i0 + Math.floor(c * n / cols), b = i0 + Math.floor((c + 1) * n / cols); let lo = Infinity, hi = -Infinity;
          for (let i = a; i < b; i++) { const v = buf[i]; if (v < lo) lo = v; if (v > hi) hi = v; }
          const x = P.x + c + .5; if (c) g.lineTo(x, y(buf[a])); else g.moveTo(x, y(buf[a]));
          g.lineTo(x, y(lo)); g.lineTo(x, y(hi)); g.lineTo(x, y(buf[b - 1]));
        }
      }
      g.globalAlpha = alpha; g.strokeStyle = color; g.lineWidth = 1.4; g.lineJoin = 'round'; g.stroke(); g.globalAlpha = 1;
    };
    if (showA) trace(res.A, RA, '#1b4fd6', 0.9);
    if (showB) trace(res.B, RB, '#d6202a', 1);
    g.restore();
    if (!showA && !showB) {
      g.fillStyle = '#566372'; g.textAlign = 'center'; g.font = '14px "IBM Plex Sans Arabic", sans-serif';
      g.fillText('ما فيه إشارة. وصّل سلك بمدخل A أو B في SCOPE SELECTOR', P.x + P.w / 2, P.y + P.h / 2 - 8);
    }
    // ruler handles, parked like PicoScope 6: voltage at the top-left corner, time at the bottom-left
    g.fillStyle = '#1b4fd6'; g.fillRect(P.x - 11, P.y - 11, 10, 10);
    g.fillStyle = '#fff'; g.strokeStyle = '#333'; g.lineWidth = 1; g.fillRect(P.x - 10.5, P.y + P.h + 1.5, 9, 9); g.strokeRect(P.x - 10.5, P.y + P.h + 1.5, 9, 9);
    g.setLineDash([6, 4]); g.lineWidth = 1.3; g.strokeStyle = '#111';
    S.h.forEach(f => { if (!act(f)) return; const y = P.y + f * P.h; g.beginPath(); g.moveTo(P.x, y); g.lineTo(P.x + P.w, y); g.stroke(); g.fillStyle = '#1b4fd6'; g.fillRect(P.x - 11, y - 5, 10, 10); });
    S.v.forEach(f => { if (!act(f)) return; const x = P.x + f * P.w; g.beginPath(); g.moveTo(x, P.y); g.lineTo(x, P.y + P.h); g.stroke(); g.fillStyle = '#fff'; g.fillRect(x - 5, P.y + P.h + 1.5, 10, 9); g.setLineDash([]); g.strokeRect(x - 5, P.y + P.h + 1.5, 10, 9); g.setLineDash([6, 4]); });
    g.setLineDash([]);
    if (hover && !rdrag) {
      g.strokeStyle = '#00000055'; g.lineWidth = 1; g.beginPath(); g.moveTo(hover.x + .5, P.y); g.lineTo(hover.x + .5, P.y + P.h); g.moveTo(P.x, hover.y + .5); g.lineTo(P.x + P.w, hover.y + .5); g.stroke();
    }
    updateReadout();
  }
  function updateReadout() {
    const S = st.scope, parts = []; if (!res) return;
    const win = S.tdiv * 10;
    if (hover) {
      const fx = (hover.x - P.x) / P.w, fy = (hover.y - P.y) / P.h, i = res.i0 + Math.min(res.nWin - 1, Math.round(fx * (res.nWin - 1)));
      parts.push(`المؤشر: <b>t = ${fmtT(fx * win)}</b> · مستوى الخط <span class="a">A ${fmtV(RA * (1 - 2 * fy))}</span> / <span class="b">B ${fmtV(RB * (1 - 2 * fy))}</span>` +
        (res.connA ? ` · <span class="a">A(t) = ${fmtV(res.A[i])}</span>` : '') + (res.connB ? ` · <span class="b">B(t) = ${fmtV(res.B[i])}</span>` : ''));
    } else parts.push('المس الرسمة أو مرّر فوقها عشان تقرأ الوقت والجهد عند أي نقطة. المساطر: اسحب المربع الأزرق (فوق يسار) لتحت، أو المربع الأبيض (تحت يسار) لليمين.');
    const hs = S.h.filter(act), vs = S.v.filter(act);
    if (hs.length || vs.length) {
      const bits = [];
      if (vs.length === 2) { const dt = Math.abs(vs[1] - vs[0]) * win; bits.push(`<b>Δt = ${fmtT(dt)}</b> · <b>1/Δt = ${dt > 0 ? fmtF(1 / dt) : '—'}</b>`); }
      else if (vs.length === 1) bits.push(`<b>t = ${fmtT(vs[0] * win)}</b>`);
      if (hs.length) {
        const yA = hs.map(f => RA * (1 - 2 * f)), yB = hs.map(f => RB * (1 - 2 * f));
        bits.push(`<span class="a">A: ${yA.map(fmtV).join(' و ')}${hs.length === 2 ? '، Δ = ' + fmtV(Math.abs(yA[0] - yA[1])) : ''}</span>`);
        bits.push(`<span class="b">B: ${yB.map(fmtV).join(' و ')}${hs.length === 2 ? '، Δ = ' + fmtV(Math.abs(yB[0] - yB[1])) : ''}</span>`);
      }
      parts.push('المساطر: ' + bits.join(' · '));
    }
    $('#rulers').checked = hs.length + vs.length > 0;
    $('#readout').innerHTML = parts.map(p => `<div dir="rtl">${p}</div>`).join('');
  }
  function updateMeas() {
    const rows = [['.rA', res.connA && st.scope.onA ? stats(res.A, res.i0, res.nWin, res.dt) : null], ['.rB', res.connB && st.scope.onB ? stats(res.B, res.i0, res.nWin, res.dt) : null]];
    rows.forEach(([sel, s]) => {
      const td = document.querySelectorAll('#meas ' + sel + ' td');
      const vals = s ? [fmtV(s.max), fmtV(s.min), fmtV(s.pp), fmtV(s.mean), fmtF(s.freq)] : ['—', '—', '—', '—', '—'];
      vals.forEach((v, i) => { td[i + 1].textContent = v; });
    });
  }
  const cvPt = e => { const r = cv.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top }; };
  cv.addEventListener('pointerdown', e => {
    const S = st.scope, p = cvPt(e), tol = e.pointerType === 'mouse' ? 9 : 22;
    let best = null, bd = tol;
    S.h.forEach((f, i) => { if (!act(f)) return; const d = Math.abs(p.y - (P.y + f * P.h)); if (d < bd) { bd = d; best = { k: 'h', i }; } });
    S.v.forEach((f, i) => { if (!act(f)) return; const d = Math.abs(p.x - (P.x + f * P.w)); if (d < bd) { bd = d; best = { k: 'v', i }; } });
    if (!best) {
      const nearX = Math.abs(p.x - (P.x - 6)) < tol + 6;
      if (nearX && Math.abs(p.y - (P.y - 6)) < tol + 6) best = { k: 'h', i: act(S.h[0]) ? 1 : 0 };
      else if (nearX && Math.abs(p.y - (P.y + P.h + 6)) < tol + 6) best = { k: 'v', i: act(S.v[0]) ? 1 : 0 };
    }
    if (best) { rdrag = best; cv.setPointerCapture(e.pointerId); e.preventDefault(); }
    else if (p.x >= P.x && p.x <= P.x + P.w && p.y >= P.y && p.y <= P.y + P.h) { hover = p; drawScope(); }
  });
  cv.addEventListener('pointermove', e => {
    const p = cvPt(e), S = st.scope;
    if (rdrag) { const f = rdrag.k === 'h' ? (p.y - P.y) / P.h : (p.x - P.x) / P.w; S[rdrag.k][rdrag.i] = Math.min(1, Math.max(0, f)); }
    hover = (p.x >= P.x && p.x <= P.x + P.w && p.y >= P.y && p.y <= P.y + P.h) ? p : null;
    let cur = 'crosshair';
    if (S.h.some(f => act(f) && Math.abs(p.y - (P.y + f * P.h)) < 7)) cur = 'ns-resize'; else if (S.v.some(f => act(f) && Math.abs(p.x - (P.x + f * P.w)) < 7)) cur = 'ew-resize';
    cv.style.cursor = cur; drawScope();
  });
  cv.addEventListener('pointerup', () => { rdrag = null; });
  cv.addEventListener('pointerleave', e => { if (!rdrag && e.pointerType === 'mouse') { hover = null; drawScope(); } });
  new ResizeObserver(() => { if (res) drawScope(); }).observe($('#plot'));

  // ---------------- controls ----------------
  const tlabel = t => (t < 1e-3 ? (t * 1e6) + ' µs/div' : (t * 1e3) + ' ms/div');
  $('#tdiv').innerHTML = TDIVS.map(t => `<option value="${t}">${tlabel(t)}</option>`).join('');
  ['#rA', '#rB'].forEach(id => { $(id).innerHTML = '<option value="off">Off</option><option value="auto">Auto</option>' + RANGES.map(r => `<option value="${r}">±${r < 1 ? r * 1000 + ' mV' : r + ' V'}</option>`).join(''); });
  function syncScopeUI() {
    const S = st.scope; $('#tdiv').value = String(TDIVS.find(t => Math.abs(t - S.tdiv) < 1e-12) || S.tdiv);
    $('#trig').value = S.trig; $('#rA').value = S.onA ? String(S.rA) : 'off'; $('#rB').value = S.onB ? String(S.rB) : 'off';
  }
  $('#tdiv').addEventListener('change', e => { st.scope.tdiv = +e.target.value; changed(); });
  const stepT = d => { const i = TDIVS.findIndex(t => Math.abs(t - st.scope.tdiv) < 1e-12), j = Math.min(TDIVS.length - 1, Math.max(0, i + d)); st.scope.tdiv = TDIVS[j]; syncScopeUI(); changed(); };
  $('#tprev').addEventListener('click', () => stepT(-1)); $('#tnext').addEventListener('click', () => stepT(1));
  $('#trig').addEventListener('change', e => { st.scope.trig = e.target.value; changed(); });
  const RLIST = ['off', 'auto'].concat(RANGES.map(String));
  const setR = (ch, v) => { const S = st.scope; if (v === 'off') S['on' + ch] = false; else { S['on' + ch] = true; S['r' + ch] = v === 'auto' ? 'auto' : +v; } syncScopeUI(); changed(); };
  $('#rA').addEventListener('change', e => setR('A', e.target.value));
  $('#rB').addEventListener('change', e => setR('B', e.target.value));
  document.querySelectorAll('[data-rstep]').forEach(b => b.addEventListener('click', () => {
    const [ch, d] = b.dataset.rstep.split(':'), i = RLIST.indexOf($('#r' + ch).value);
    setR(ch, RLIST[Math.min(RLIST.length - 1, Math.max(0, i + +d))]);
  }));
  $('#rulers').addEventListener('change', e => { const S = st.scope; if (e.target.checked) { S.h = [0.2, 0.8]; S.v = [0.3, 0.7]; } else { S.h = [0, 0]; S.v = [0, 0]; } drawScope(); });

  $('#swatches').innerHTML = Object.keys(COLORS).map(c => `<button type="button" data-c="${c}" style="background:${COLORS[c]}" aria-label="لون ${c}"${c === ui.color ? ' class="on"' : ''}></button>`).join('');
  $('#swatches').addEventListener('click', e => {
    const b = e.target.closest('[data-c]'); if (!b) return; ui.color = b.dataset.c;
    document.querySelectorAll('#swatches button').forEach(x => x.classList.toggle('on', x === b));
    if (ui.sel >= 0) { st.wires[ui.sel].c = ui.color; renderWires(); }
  });
  $('#cheat').addEventListener('change', e => { ui.cheat = e.target.checked; for (const k in knobEls) updateKnob(k); syncKnobPanel(); updateGuide(); });
  $('#clear').addEventListener('click', () => { st.wires = []; ui.sel = -1; renderWires(); changed(); });
  $('#reset').addEventListener('click', () => { states[lab] = st = fresh(lab); ui.sel = -1; renderRack(); selectKnob(null); syncScopeUI(); changed(); });

  $('#labs').innerHTML = [5, 7, 9, 10].map(l => `<button type="button" data-lab="${l}"${l === lab ? ' class="on"' : ''}><b>${LABS[l].tab}</b><small dir="ltr">${LABS[l].title}</small></button>`).join('');
  $('#labs').addEventListener('click', e => {
    const b = e.target.closest('[data-lab]'); if (!b) return;
    lab = +b.dataset.lab; st = states[lab]; ui.sel = -1;
    document.querySelectorAll('#labs button').forEach(x => x.classList.toggle('on', x === b));
    renderRack(); selectKnob(null); renderGuide(); syncScopeUI(); changed();
  });
  $('#view').addEventListener('click', e => {
    const b = e.target.closest('[data-view]'); if (!b) return;
    $('#main').className = b.dataset.view;
    document.querySelectorAll('#view button').forEach(x => x.classList.toggle('on', x === b));
    requestAnimationFrame(() => { if (res) drawScope(); });
  });
  // splitter (page is RTL: the device pane is on the right)
  const split = $('#split'), main = $('#main');
  const setSplit = pct => main.style.setProperty('--l', Math.min(78, Math.max(28, pct)) + '%');
  split.addEventListener('pointerdown', e => { split.setPointerCapture(e.pointerId); split.dataset.on = '1'; });
  split.addEventListener('pointermove', e => { if (!split.dataset.on) return; const r = main.getBoundingClientRect(); setSplit((r.right - e.clientX) / r.width * 100); });
  split.addEventListener('pointerup', () => { delete split.dataset.on; });
  split.addEventListener('keydown', e => {
    if (!/^Arrow(Left|Right)$/.test(e.key)) return;
    const cur = parseFloat(getComputedStyle(main).getPropertyValue('--l')) || 56; setSplit(cur + (e.key === 'ArrowLeft' ? 3 : -3));
  });

  renderRack(); selectKnob(null); renderGuide(); syncScopeUI(); simulate();
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(() => { if (res) drawScope(); });
})();
