/* The four exam labs: which modules sit in the rack, wiring steps, ready-made cases, and the theory notes. */
(function (root) {
  'use strict';
  const T = root.TIMS || require('./engine.js');
  const FIXED = ['dc', 'buf', 'master', 'counter', 'trunks', 'scope', 'head'];
  const clamp = p => Math.min(1, Math.max(0, p));
  const m = s => '<span class="m" dir="ltr">' + s + '</span>';
  const b = s => '<b dir="ltr">' + s + '</b>';

  function fresh(lab) {
    const L = LABS[lab], mods = [];
    const add = (type, slot) => {
      const D = T.TYPES[type], p = {}, sw = {};
      D.knobs.forEach(k => { p[k.n] = k.def; });
      (D.switches || []).forEach(s => { sw[s.n] = s.def || 0; });
      mods.push({ id: type, type, slot, p, sw });
    };
    Object.keys(L.slots).forEach(t => add(t, L.slots[t]));
    FIXED.forEach(t => add(t, -1));
    return { modules: mods, wires: [], scope: { tdiv: 200e-6, trig: 'A', rA: 'auto', rB: 'auto', onA: true, onB: true, h: [0, 0], v: [0, 0] } };
  }
  function setKnob(st, id, knob, value) {
    const mod = st.modules.find(x => x.id === id); if (!mod) return;
    mod.p[knob] = clamp(T.knobDef(mod.type, knob).unmap(value));
  }
  function applyCase(st, c) {
    st.wires = c.wires.map(w => ({ a: w[0], b: w[1], c: w[2] }));
    (c.knobs || []).forEach(k => setKnob(st, k[0], k[1], k[2]));
    (c.sw || []).forEach(s => { const mod = st.modules.find(x => x.id === s[0]); if (mod) mod.sw[s[1]] = s[2]; });
    Object.assign(st.scope, { rA: 'auto', rB: 'auto', onA: true, onB: true }, c.scope || {});
  }

  // ---------- Lab 5 ----------
  const W5 = [['audio.cos', 'counter.analog', 'b'], ['audio.cos', 'adder.a', 'b'], ['dc.out', 'adder.b', 'r'], ['adder.out', 'mult.x', 'r'],
    ['master.sin', 'mult.y', 'y'], ['mult.out', 'scope.a1', 'r'], ['adder.out', 'scope.a2', 'b']];
  const K5 = g => [['audio', 'f', 1000], ['dc', 'v', -2], ['adder', 'G', -1], ['adder', 'g', g]];
  const S5 = { tdiv: 200e-6, trig: 'B', rA: 'auto', rB: 'auto', onA: true, onB: true };
  // ---------- Lab 7 ----------
  const W7a = [['vco.sin', 'counter.analog', 'b'], ['dc.out', 'scope.a1', 'y'], ['dc.out', 'vco.vin', 'y'], ['vco.sin', 'scope.a2', 'b']];
  const W7b = [['audio.sin', 'counter.analog', 'b'], ['audio.cos', 'vco.vin', 'y'], ['vco.sin', 'scope.a1', 'r'], ['audio.sin', 'scope.a2', 'b']];
  const K7 = v => [['vco', 'f0', 100000], ['vco', 'gain', 5000], ['dc', 'v', v], ['audio', 'f', 500]];
  // ---------- Lab 9 ----------
  const W9 = [['audio.cos', 'counter.analog', 'r'], ['audio.cos', 'dsw.in1', 'b'], ['audio.cos', 'scope.a1', 'r'], ['master.clk8', 'twin.clk', 'y'],
    ['twin.q1ac', 'dsw.c1', 'b'], ['dsw.out', 'scope.a2', 'k'], ['dsw.out', 'lpf.in', 'b'], ['lpf.out', 'scope.b2', 'y']];
  const K9 = f => [['audio', 'f', f], ['twin', 'width', 25e-6], ['twin', 'delay', 10e-6], ['lpf', 'tune', 1], ['lpf', 'gain', 4.8]];
  // ---------- Lab 10 ----------
  const W10 = [['audio.sin', 'counter.analog', 'b'], ['audio.sin', 'adder.a', 'b'], ['dc.out', 'adder.b', 'y'], ['adder.out', 'util.ref', 'r'],
    ['master.clk8', 'twin.clk', 'r'], ['twin.q2', 'util.cin', 'k'], ['util.cout', 'scope.a1', 'r'], ['audio.sin', 'scope.a2', 'y']];
  const K10 = dc => [['audio', 'f', 2000], ['dc', 'v', dc], ['adder', 'G', -1], ['adder', 'g', -1], ['twin', 'width', 14e-6], ['twin', 'delay', 65e-6]];

  const LABS = {
    5: {
      tab: 'Lab 5', title: 'Amplitude Modulation',
      idea: 'نجمع الرسالة مع جهد DC بالـADDER، وبعدين نضرب الناتج بالكارير 100 kHz بالـMULTIPLIER فيطلع AM. قيمة الـDC مقارنة بالرسالة هي اللي تحدد μ.',
      slots: { audio: 1, adder: 2, mult: 3 },
      cases: [
        { label: 'Critical (μ = 1)', wires: W5, knobs: K5(-1), scope: S5, sw: [['scope', 'sw1', 0], ['scope', 'sw2', 0]] },
        { label: 'Under (μ < 1)', wires: W5, knobs: K5(-1.6), scope: S5, sw: [['scope', 'sw1', 0], ['scope', 'sw2', 0]] },
        { label: 'Over (μ > 1)', wires: W5, knobs: K5(-0.5), scope: S5, sw: [['scope', 'sw1', 0], ['scope', 'sw2', 0]] }
      ],
      steps: [
        { t: `وصّل ${b('AUDIO OSCILLATOR cos')} بمدخل ${b('ANALOG')} في FREQUENCY COUNTER، ولف ${b('Δf')} لين العداد يقرأ ${m('1.000 kHz')}.`, ok: h => h.C('audio.cos', 'counter.analog') && h.near(h.v('audio', 'f'), 1000, 15) },
        { t: `وصّل ${b('VARIABLE DC')} بالسكوب (مدخل ${b('A')}) واضبطه لين الخط يوقف على ${m('−2 V')}. هذا السلك مؤقت للقراءة بس، بتنقله في الخطوة الجاية.`, ok: h => h.near(h.v('dc', 'v'), -2, 0.06) && (h.S('dc.out') || h.C('dc.out', 'adder.b')) },
        { t: `وصّل ${b('AUDIO cos')} بـ${b('ADDER A')}. وانقل سلك الـDC من السكوب إلى ${b('ADDER B')} (اضغط على السلك واسحب طرفه، أو احذفه ومد واحد جديد).`, ok: h => h.C('audio.cos', 'adder.a') && h.C('dc.out', 'adder.b') },
        { t: `وصّل خرج الـADDER ${b('GA+gB')} بالسكوب (CH2، يطلع بالأحمر) واضبط ${b('G')} و ${b('g')} على ${m('−1')}.<br>لضبط ${b('G')}: احذف سلك الـDC الداخل على مدخل ${b('B')} في الـADDER (مو سلك السكوب)، فيطلع بالأحمر الرسالة لحالها. لف G لين جدول القياسات يقرأ للقناة B ${m('Max = 2.00 V')} و ${m('Min = −2.00 V')}.<br>لضبط ${b('g')}: رجّع سلك الـDC، واحذف سلك الرسالة الداخل على مدخل ${b('A')} في الـADDER. الأحمر يصير خط مستقيم؛ لف g لين ${m('DC Average = 2.00 V')}. بعدها رجّع سلك A.`, ok: h => h.near(h.v('adder', 'G'), -1, 0.06) && (h.S('adder.out') || h.C('adder.out', 'mult.x')) },
        { t: `وصّل ${b('MASTER SIGNALS 100kHz sin')} بـ${b('MULTIPLIER Y')}.`, ok: h => h.C('master.sin', 'mult.y') },
        { t: `وصّل خرج الـADDER بـ${b('MULTIPLIER X')}.`, ok: h => h.C('adder.out', 'mult.x') },
        { t: `وصّل خرج الـMULTIPLIER ${b('kXY')} بالسكوب (CH1 مدخل A) عشان تشوف إشارة AM، وخل خرج الـADDER على CH2 للمقارنة. تأكد ما فيه سلك ثاني على CH1 A.`, ok: h => h.S('mult.out') }
      ],
      theory: `
        <p>المعادلة اللي نبنيها:</p><p>${m('AM = −1·(DC + m(t)) · sin(2π·100k·t)')}</p>
        <p>مع ${m('DC = −2 V')} و ${m('m(t) = 2cos(2π·1k·t)')} و ${m('G = g = −1')} يطلع خرج الـADDER:</p><p>${m('2 − 2cos(2π·1k·t)')}</p>
        <p>${m('Vm = |G| × 2')} (ارتفاع الرسالة) و ${m('Vc = |g| × |DC|')} (مستوى الـDC).</p>
        <table class="mini"><tr><th>الطريقة</th><th>القانون</th></tr>
        <tr><td>من الجهود</td><td>${m('μ = Vm / Vc')}</td></tr><tr><td>من الرسمة</td><td>${m('μ = (P − Q) / (P + Q)')}</td></tr><tr><td>النسبة</td><td>${m('%μ = μ × 100')}</td></tr></table>
        <p>${b('P')} أكبر ارتفاع للإشارة من فوق لتحت، وهو نفسه قراءة ${b('Pk-Pk')} لقناة الـAM في جدول القياسات. ${b('Q')} أصغر ارتفاع عند الخصر؛ شغّل المساطر وحط الأفقيتين على طرفي الخصر واقرأ الفرق.</p>
        <ul><li>${b('Critical')}: ${m('Vc = Vm')}، الخصر يلمس الصفر، ${m('Q = 0')} و ${m('μ = 1')}.</li>
        <li>${b('Under')}: ${m('Vc > Vm')}. كبّر ${b('g')} (أو الـDC)، يطلع ${m('μ < 1')}.</li>
        <li>${b('Over')}: ${m('Vc < Vm')}. صغّر ${b('g')}، الغلاف يتقاطع ويطلع ${m('μ > 1')}. في قانون P و Q اعتبر Q سالبة.</li></ul>
        <p class="tip">لو غيّرت المهندسة الأرقام: التردد تضبطه من Δf وتقرأه من العداد، الـDC تقرأه خط على السكوب، و G و g تضبطهم بمقارنة ارتفاع خرج الـADDER.</p>`,
      truth: h => {
        const Vm = Math.abs(h.v('adder', 'G')) * 2, Vc = Math.abs(h.v('adder', 'g') * h.v('dc', 'v'));
        return [['fm', (h.v('audio', 'f') / 1000).toFixed(3) + ' kHz'], ['DC', h.v('dc', 'v').toFixed(2) + ' V'], ['G', h.v('adder', 'G').toFixed(2)], ['g', h.v('adder', 'g').toFixed(2)],
          ['Vm', Vm.toFixed(2) + ' V'], ['Vc', Vc.toFixed(2) + ' V'], ['μ = Vm/Vc', Vc > 0.01 ? (Vm / Vc).toFixed(2) : '∞']];
      }
    },
    7: {
      tab: 'Lab 7', title: 'Frequency Modulation',
      idea: 'الـVCO يغيّر تردده حسب الجهد الداخل على Vin. بالجزء الأول ندخل DC ونقيس كم يتغير التردد، وبالجزء الثاني نبدّل الـDC برسالة 500 Hz فيطلع FM.',
      slots: { audio: 1, vco: 2 },
      cases: [
        { label: 'Part 1: DC = −2 V', wires: W7a, knobs: K7(-2), scope: { tdiv: 5e-6, trig: 'B' } },
        { label: 'Part 1: DC = 0 V', wires: W7a, knobs: K7(0), scope: { tdiv: 5e-6, trig: 'B' } },
        { label: 'Part 1: DC = +2 V', wires: W7a, knobs: K7(2), scope: { tdiv: 5e-6, trig: 'B' } },
        { label: 'Part 2: FM', wires: W7b, knobs: K7(0), scope: { tdiv: 500e-6, trig: 'B' } }
      ],
      steps: [
        { h: 'Part 1: ضبط الـFrequency Deviation' },
        { t: `وصّل ${b('VCO sin')} بمدخل ${b('ANALOG')} في العداد، ولف ${b('fo')} لين يقرأ قريب من ${m('100 kHz')} (و Vin فاضي أو الـDC على صفر).`, ok: h => h.C('vco.sin', 'counter.analog') && h.near(h.v('vco', 'f0'), 100000, 1500) },
        { t: `وصّل ${b('VARIABLE DC')} بالسكوب (CH1 مدخل A) عشان تقرأ قيمته.`, ok: h => h.S('dc.out') },
        { t: `وصّل ${b('VARIABLE DC')} بـ${b('VCO Vin')}، ووصّل ${b('VCO sin')} بالسكوب (CH2).`, ok: h => h.C('dc.out', 'vco.vin') },
        { t: `حط الـDC على ${m('−2 V')} ولف ${b('GAIN')} لين العداد يقرأ ${m('≈ 110 kHz')}. بعدها غيّر الـDC إلى ${m('0')} ثم ${m('+2 V')} وسجّل القراءات (المفروض ${m('≈ 100')} و ${m('≈ 90 kHz')}).`, ok: h => h.C('dc.out', 'vco.vin') && h.near(h.v('vco', 'gain'), 5000, 300) },
        { h: 'Part 2: توليد FM' },
        { t: `فك الـDC. وصّل ${b('AUDIO sin')} بمدخل ${b('ANALOG')} في العداد واضبط ${b('Δf')} على ${m('0.500 kHz')}.`, ok: h => h.C('audio.sin', 'counter.analog') && h.near(h.v('audio', 'f'), 500, 10) },
        { t: `وصّل ${b('AUDIO cos')} بـ${b('VCO Vin')} (الرسالة تدخل مكان الـDC).`, ok: h => h.C('audio.cos', 'vco.vin') },
        { t: `وصّل ${b('VCO sin')} بالسكوب (مدخل A في CH1) و${b('AUDIO sin')} بـCH2 عشان تشوف الرسالة فوق الـFM.`, ok: h => h.S('vco.sin') && (h.S('audio.sin') || h.S('audio.cos')) }
      ],
      theory: `
        <p>تردد خرج الـVCO على هذا الجهاز يمشي عكس الجهد، مثل قراءاتكم في اللاب:</p>
        <table class="mini"><tr><th>DC</th><th>${m('fo')} المتوقع</th></tr><tr><td>${m('−2 V')}</td><td>${m('≈ 110 kHz')}</td></tr><tr><td>${m('0 V')}</td><td>${m('≈ 100 kHz')}</td></tr><tr><td>${m('+2 V')}</td><td>${m('≈ 90 kHz')}</td></tr></table>
        <p>${m('Frequency deviation = Vm × sensitivity')}</p>
        <p>الحساسية هنا ${m('10 kHz ÷ 2 V = 5 kHz/V')}، والرسالة ارتفاعها ${m('2 V')} فالانحراف ${m('±10 kHz')}.</p>
        <p>${m('BW (Carson) = 2 × (fm + Δf) = 2 × (0.5 + 10) = 21 kHz')}</p>
        <p>شكل الـFM: الارتفاع ثابت (ما فيه غلاف يتغير)، واللي يتغير هو تقارب الموجات. قرّب الـtimebase وتشوفها تتزاحم وتتباعد مع الرسالة.</p>
        <p class="tip">لو غيّرت الأرقام: تردد مركزي غير 100 تضبطه من ${b('fo')}، وانحراف غير 10 kHz تضبطه من ${b('GAIN')} بنفس طريقة الـDC. تردد الرسالة من ${b('Δf')}.</p>`,
      truth: h => [['fo', (h.v('vco', 'f0') / 1000).toFixed(2) + ' kHz'], ['GAIN', (h.v('vco', 'gain') / 1000).toFixed(2) + ' kHz/V'], ['DC', h.v('dc', 'v').toFixed(2) + ' V'],
        ['fm', (h.v('audio', 'f') / 1000).toFixed(3) + ' kHz'], ['Δf عند 2 V', '±' + (h.v('vco', 'gain') * 2 / 1000).toFixed(2) + ' kHz']]
    },
    9: {
      tab: 'Lab 9', title: 'Sampling',
      idea: 'الـDUAL ANALOG SWITCH يفتح ويقفل على الرسالة بسرعة نبضات الـTWIN PULSE GENERATOR (8.3 kHz) فتطلع إشارة معيّنة (sampled). بعدها الـLPF يرجّع الرسالة الأصلية إذا كان fs أكبر من 2fm.',
      slots: { audio: 1, twin: 2, dsw: 3, lpf: 4 },
      cases: [
        { label: 'fs > 2fm (fm = 1 kHz)', wires: W9, knobs: K9(1000), scope: { tdiv: 200e-6, trig: 'A' }, sw: [['scope', 'sw2', 1], ['lpf', 'wide', 0]] },
        { label: 'fs = 2fm (fm = 4.17 kHz)', wires: W9, knobs: K9(4166.7), scope: { tdiv: 100e-6, trig: 'A' }, sw: [['scope', 'sw2', 1], ['lpf', 'wide', 0]] },
        { label: 'fs < 2fm (fm = 6 kHz)', wires: W9, knobs: K9(6000), scope: { tdiv: 100e-6, trig: 'A' }, sw: [['scope', 'sw2', 1], ['lpf', 'wide', 0]] },
        { label: 'شوف الإشارة المعيّنة', wires: W9, knobs: K9(1000), scope: { tdiv: 200e-6, trig: 'A' }, sw: [['scope', 'sw2', 0], ['lpf', 'wide', 0]] }
      ],
      steps: [
        { t: `وصّل ${b('AUDIO cos')} بمدخل ${b('ANALOG')} في العداد واضبط ${b('Δf')} على تردد الرسالة (${m('1 kHz')} بالمانيوال، وباللاب اشتغلتوا على ${m('≈ 2 kHz')}).`, ok: h => h.C('audio.cos', 'counter.analog') && (h.near(h.v('audio', 'f'), 1000, 20) || h.near(h.v('audio', 'f'), 2000, 40)) },
        { t: `وصّل ${b('AUDIO cos')} بـ${b('IN 1')} في DUAL ANALOG SWITCH.`, ok: h => h.C('audio.cos', 'dsw.in1') },
        { t: `وصّل ${b('AUDIO cos')} بالسكوب (CH1 مدخل A) عشان تشوف الرسالة.`, ok: h => h.S('audio.cos') },
        { t: `وصّل ${b('8.3kHz TTL')} من MASTER SIGNALS بـ${b('CLK')} في TWIN PULSE GENERATOR، ولف ${b('WIDTH')} للآخر.`, ok: h => h.C('master.clk8', 'twin.clk') && h.v('twin', 'width') > 23.5e-6 },
        { t: `وصّل المقبس الأصفر ${b('Q1 (AC)')} في الـTWIN (اللي جنب DELAY) بـ${b('CONTROL 1')} في DUAL ANALOG SWITCH. (Q1 الأحمر تحته يشتغل بعد.)`, ok: h => h.C('twin.q1', 'dsw.c1') || h.C('twin.q1ac', 'dsw.c1') || h.C('twin.q2', 'dsw.c1') },
        { t: `وصّل ${b('OUT')} حق الـDUAL ANALOG SWITCH بالسكوب (CH2 مدخل A) وشوف الإشارة المعيّنة.`, ok: h => h.S('dsw.out') },
        { t: `وصّل نفس الـ${b('OUT')} بـ${b('IN')} في TUNEABLE LPF.`, ok: h => h.C('dsw.out', 'lpf.in') },
        { t: `وصّل ${b('OUT')} حق الـLPF بالسكوب (CH2 مدخل B وحوّل مفتاح CH2 على B). لف ${b('TUNE')} للآخر، واضبط ${b('GAIN')} لين ارتفاعها يساوي الرسالة.`, ok: h => h.S('lpf.out') && h.v('lpf', 'tune') > 0.95 },
        { t: `غيّر تردد الرسالة من ${b('Δf')} للحالات الثلاث وصوّر كل وحدة: ${m('fs > 2fm')} ثم ${m('fs = 2fm')} (${m('fm ≈ 4.17 kHz')}) ثم ${m('fs < 2fm')}.`, ok: null }
      ],
      theory: `
        <p>${m('fs = 1 / Ts = 1 / 120 µs ≈ 8.33 kHz')}</p>
        <p>تقدر تقيس ${b('Ts')} بنفسك: حط خرج الـTWIN على السكوب، شغّل المساطر، وحط العموديتين على بداية نبضتين ورا بعض. الفرق ${b('Δt')} هو Ts و ${b('1/Δt')} هو fs.</p>
        <table class="mini"><tr><th>الحالة</th><th>الشرط</th><th>النتيجة</th></tr>
        <tr><td>Oversampling</td><td>${m('fs > 2fm')}</td><td>الرسالة ترجع سليمة</td></tr>
        <tr><td>Nyquist</td><td>${m('fs = 2fm')} أي ${m('fm = 4.17 kHz')}</td><td>على الحد، الارتفاع يعتمد على لحظة العيّنة</td></tr>
        <tr><td>Undersampling</td><td>${m('fs < 2fm')}</td><td>aliasing: يطلع تردد غلط أقل من الأصلي</td></tr></table>
        <p>في الـaliasing التردد اللي يطلع بعد الـLPF هو ${m('fs − fm')}. مثال: ${m('fm = 6 kHz')} يطلع ${m('8.33 − 6 = 2.33 kHz')}. اقرأ ${b('Frequency')} للقناتين في جدول القياسات وقارن.</p>
        <p class="tip">لو غيّرت الأرقام: المطلوب غالباً تردد رسالة مختلف. احسب ${m('2fm')} وقارنه بـ${m('8.33 kHz')} عشان تعرف أي حالة قبل لا تشبّك.</p>`,
      truth: h => {
        const fm = h.v('audio', 'f'), fs = 1e5 / 12;
        return [['fm', (fm / 1000).toFixed(3) + ' kHz'], ['fs', '8.333 kHz'], ['2fm', (2 * fm / 1000).toFixed(2) + ' kHz'], ['الحالة', Math.abs(fs - 2 * fm) < 150 ? 'fs = 2fm' : fs > 2 * fm ? 'fs > 2fm' : 'fs < 2fm'],
          ['WIDTH', (h.v('twin', 'width') * 1e6).toFixed(0) + ' µs'], ['LPF cut-off', (h.lpfFc() / 1000).toFixed(2) + ' kHz'], ['LPF GAIN', '×' + h.v('lpf', 'gain').toFixed(2)]];
      }
    },
    10: {
      tab: 'Lab 10', title: 'Pulse Width Modulation',
      idea: 'الـCOMPARATOR يقارن نبضات الـTWIN PULSE GENERATOR بمستوى مرجعي REF. الـREF هنا هو الرسالة مجموعة مع DC، فكل ما تغيّر مستوى الرسالة تغيّر عرض النبضة الطالعة.',
      slots: { audio: 1, adder: 2, twin: 3, util: 4 },
      cases: [
        { label: 'PWM (DC = −1.2 V)', wires: W10, knobs: K10(-1.2), scope: { tdiv: 100e-6, trig: 'B' }, sw: [['scope', 'sw1', 0], ['scope', 'sw2', 0]] },
        { label: 'جرّب DC = −0.5 V', wires: W10, knobs: K10(-0.5), scope: { tdiv: 100e-6, trig: 'B' }, sw: [['scope', 'sw1', 0], ['scope', 'sw2', 0]] }
      ],
      steps: [
        { t: `وصّل ${b('AUDIO sin')} بمدخل ${b('ANALOG')} في العداد واضبط ${b('Δf')} على ${m('2.000 kHz')}.`, ok: h => h.C('audio.sin', 'counter.analog') && h.near(h.v('audio', 'f'), 2000, 30) },
        { t: `وصّل ${b('VARIABLE DC')} بالسكوب (مدخل A) واضبطه على ${m('−1.2 V')}. هذا السلك مؤقت، بتنقله للـADDER في الخطوة الجاية.`, ok: h => h.near(h.v('dc', 'v'), -1.2, 0.06) && (h.S('dc.out') || h.C('dc.out', 'adder.b')) },
        { t: `وصّل ${b('AUDIO sin')} بـ${b('ADDER A')}، وانقل سلك الـDC من السكوب إلى ${b('ADDER B')}، واضبط ${b('G')} و ${b('g')} على ${m('−1')}.`, ok: h => h.C('audio.sin', 'adder.a') && h.C('dc.out', 'adder.b') && h.near(h.v('adder', 'G'), -1, 0.06) && h.near(h.v('adder', 'g'), -1, 0.06) },
        { t: `وصّل خرج الـADDER ${b('GA+gB')} بـ${b('REF')} في UTILITIES (قسم COMPARATOR).`, ok: h => h.C('adder.out', 'util.ref') },
        { t: `وصّل ${b('8.3kHz TTL')} من MASTER SIGNALS بـ${b('CLK')} في TWIN PULSE GENERATOR، وخل ${b('WIDTH')} و ${b('DELAY')} بالنص.`, ok: h => h.C('master.clk8', 'twin.clk') && h.near(h.v('twin', 'width'), 14e-6, 4e-6) && h.near(h.v('twin', 'delay'), 65e-6, 15e-6) },
        { t: `وصّل ${b('Q2')} من الـTWIN بـ${b('IN')} حق الـCOMPARATOR.`, ok: h => h.C('twin.q2', 'util.cin') },
        { t: `وصّل ${b('OUT')} حق الـCOMPARATOR بالسكوب (CH1 مدخل A). هذي إشارة الـPWM.`, ok: h => h.S('util.cout') },
        { t: `وصّل ${b('AUDIO sin')} بالسكوب (CH2) عشان تشوف الرسالة فوق النبضات.`, ok: h => h.S('audio.sin') }
      ],
      theory: `
        <p>خرج الـADDER (الداخل على REF):</p><p>${m('REF = G·m(t) + g·DC = −2sin(2π·2k·t) + 1.2')}</p>
        <p>الـCOMPARATOR يطلّع ${m('5 V')} لما ${m('IN > REF')} ويطلّع ${m('0 V')} لما ${m('IN < REF')}.</p>
        <p>لما الرسالة تطلع فوق، الـREF ينزل، فالخرج يبقى عالي مدة أطول والنبضة تعرض. ولما الرسالة تنزل، الـREF يرتفع والنبضة ترجع لعرضها الأصلي. يعني عرض النبضة يتبع مستوى الرسالة، وهذا هو الـPWM.</p>
        <p>عدد النبضات في دورة وحدة من الرسالة: ${m('fs / fm = 8.33 / 2 ≈ 4')}.</p>
        <p class="tip">لو غيّرت الأرقام: DC مختلف يحرّك مستوى الـREF فيتغير كم نبضة تعرض (جرّب زر ${m('DC = −0.5 V')}). تردد رسالة مختلف يغيّر كم نبضة تشوف في الدورة.</p>`,
      truth: h => [['fm', (h.v('audio', 'f') / 1000).toFixed(3) + ' kHz'], ['DC', h.v('dc', 'v').toFixed(2) + ' V'], ['G', h.v('adder', 'G').toFixed(2)], ['g', h.v('adder', 'g').toFixed(2)],
        ['WIDTH', (h.v('twin', 'width') * 1e6).toFixed(0) + ' µs'], ['DELAY', (h.v('twin', 'delay') * 1e6).toFixed(0) + ' µs'], ['REF', (h.v('adder', 'g') * h.v('dc', 'v')).toFixed(2) + ' ± ' + Math.abs(h.v('adder', 'G') * 2).toFixed(2) + ' V']]
    }
  };

  const api = { LABS, fresh, applyCase, setKnob, FIXED };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TLABS = api;
})(typeof window !== 'undefined' ? window : globalThis);
