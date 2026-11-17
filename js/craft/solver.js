/* 流放 2 做装台 · 求解器
 *
 * 问题：给定物品、目标词缀、价格，求「期望花费最低」的做装策略，并告诉玩家下一步做什么。
 *
 * 建模：随机最短路（SSP）。
 *   状态 = 稀有度 × 每个目标的状态（缺 / 已命中 / 被同家族词缀占位）× 两侧废词数 × 亵渎状态
 *   动作 = 分档通货、预兆组合、精华、亵渎与揭露，以及「换底子重开」
 *   V(s) = min_a [ 成本(a) + Σ P(s'|s,a) · V(s') ]，V(完成) = 0
 *
 * 为什么要有「换底子重开」：流放 2 没有重铸石，一件做废的装备最便宜的出路就是换下一个白底。
 * 没有它，求解器只会建议无限混沌，期望花费是天文数字。
 *
 * 求解：策略迭代。重开的代价是 B + V(新底子)，自己引用自己；固定一个策略时，
 * 「终止前的期望花费 A」和「做成的概率 S」是一组稀疏线性方程，精确解出来之后
 * V(新底子) = (A + (1 − S)·B) / S 有闭式，再据此逐状态换成更便宜的动作，十几轮就停。
 * 线性方程按策略图的强连通分量从下游往上游解：单点直接代入，小环消元，大环用预条件 BiCGSTAB。
 * （早先用的是「牛顿 + 值迭代」，成功率低到千分之一时要扫几万轮；它还留着当兜底，结果两者一致。）
 *
 * 性能上另外两件事：状态编码成整数并驻留，转移直接写进扁平数组；同一组目标 / 价格只解一次，
 * 玩家每做一步只是换个起点查表，「当前这一步」的转移和说明现算。
 *
 * 抽象带来的近似（都偏保守或影响很小）：
 *   · 废词不区分具体是哪条，只记每侧数量；它们占掉的池子份额按期望值扣除。
 *   · 削切预兆要看词缀等级：展示「当前这一步」时按真实物品精确计算，求解时按池子的等级分布估计。
 *   · 已揭露的亵渎词缀如果占着目标的互斥组或移不掉，视为这件装备不能再亵渎。
 */
(function (root) {
  /* 整个模块包在 factory 里：页面直接调用它；离线双击打开（file://）时浏览器不许从文件建后台线程，
   * 界面就把 factory 的源码拼成一段脚本塞进后台线程，所以这里面不能引用 factory 之外的变量。 */
  const factory = function (global) {
  'use strict';

  const R = global.CraftRules || (typeof require !== 'undefined' ? require('./rules.js') : null);

  const MINS = [0, 35, 44, 50, 70];
  const BIG = 1e9;
  const SIDE = { p: 0, s: 1 };
  const GEN = ['p', 's'];

  /* ------------------------------------------------------------------ 模型 */
  function buildModel(item, targets, opts) {
    opts = opts || {};
    const base = R.baseOf(item);
    const empty = R.newItem(base.id, { ilvl: item.ilvl });
    empty.rarity = 'rare';
    const cap = R.caps(empty);
    const T = (targets || []).map((t, i) => {
      const rows = t.row ? [R.row(t.row)].filter(Boolean)
        : R.data.rows.filter((r) => r.type === t.type && R.targetAccepts(base, t, { type: r.type, lvl: r.lvl, row: r.id, pool: r.pool }));
      const fams = new Set();
      for (const r of rows) for (const f of r.fam) fams.add(f);
      const gen = rows.length ? rows[0].gen : 'p';
      return { i, spec: t, gen, fams, natural: 0, fracHit: false, fracBlock: false };
    });
    const model = {
      item, base, ilvl: item.ilvl, cap: [cap.p, cap.s], T, k: T.length,
      /* 底子价不能是负数或 NaN：负的底子价会让「换白底重来」这条路径的期望花费变成负数，
       * 直接显示给玩家（实测能到 -1e10）。这里钳到 0 以上。 */
      prices: opts.prices || {}, basePrice: Math.max(0, Number(opts.basePrice == null ? (R.DEFAULT_PRICES.base || 0) : opts.basePrice) || 0),
      allow: opts.allow || null, legacyOmens: !!opts.legacyOmens, empty,
      frac: [0, 0], pools: new Map(), revealCache: new Map(), addMemo: new Map(), problems: [],
    };
    classifyItem(model);
    for (const t of T) t.natural = naturalShare(model, t);
    model.essences = essenceOptions(model);
    diagnose(model);
    return model;
  }

  /* 把一条词缀行归类：命中第几个目标 / 占住第几个目标的家族 / 废词 */
  function classifyRow(model, row) {
    const probe = { type: row.type, lvl: row.lvl, row: row.id, pool: row.pool };
    for (const t of model.T) if (R.targetAccepts(model.base, t.spec, probe)) return { hit: t.i };
    for (const t of model.T) if (row.fam.some((f) => t.fams.has(f))) return { block: t.i };
    return { junk: true };
  }
  function classifyItem(model) {
    const a = abstractItem(model, model.item, true);
    model.init = a.state;
    model.initLevels = a.levels;
    model.hasFracture = model.item.affixes.some((x) => x.fractured);
    model.fresh = { r: 0, st: model.T.map(() => 0), jp: 0, js: 0, d: 0 };
  }
  /* 具体物品 → 抽象状态。setup 为真时顺便登记破裂词缀（它们在整个求解里是常量）。 */
  function abstractItem(model, item, setup) {
    const st = model.T.map(() => 0);
    let jp = 0;
    let js = 0;
    let d = 0;
    let desAt = null;
    const lv = { hit: model.T.map(() => null), block: model.T.map(() => null), junk: [[], []] };
    for (const a of item.affixes) {
      if (a.unrevealed) { d = (a.gen === 'p' ? 1 : 2) + ((a.minLvl || 0) >= 40 ? 3 : 0); continue; }
      const c = classifyRow(model, { type: a.type, lvl: a.lvl, id: a.row, pool: a.pool, fam: a.fam || [] });
      if (a.desecrated) desAt = D_USED;
      if (c.hit != null && st[c.hit] === 0) {
        if (a.desecrated && !a.fractured) desAt = D_HIT + c.hit;
        st[c.hit] = 1; lv.hit[c.hit] = a.lvl;
        if (a.fractured && setup) model.T[c.hit].fracHit = true;
      } else if (c.block != null && st[c.block] === 0) {
        st[c.block] = a.gen === 'p' ? 2 : 3; lv.block[c.block] = a.lvl;
        if (a.fractured && setup) model.T[c.block].fracBlock = true;
      } else if (a.fractured) { if (setup) model.frac[SIDE[a.gen]]++; }
      else {
        if (a.gen === 'p') jp++; else js++;
        lv.junk[SIDE[a.gen]].push(a.lvl);
        if (a.desecrated) desAt = a.gen === 'p' ? 3 : 6;
      }
    }
    if (!d && desAt != null) d = desAt;
    const r = item.rarity === 'normal' ? 0 : item.rarity === 'magic' ? 1 : 2;
    return { state: { r, st, jp, js, d }, levels: lv };
  }
  /* 已解出的策略在某件具体物品上建议做什么：动作 / { restart } / { done } / null（状态不在已解范围内） */
  function actionAt(sol, model, item) {
    const s = abstractItem(model, item, false).state;
    const id = sol.G.index.get(keyOf(s));
    if (id === undefined) return null;
    if (sol.G.done[id]) return { done: true };
    if (sol.pol[id] < 0) return { restart: true };
    return sol.G.actionOf[sol.G.c.actStart[id] + sol.pol[id]];
  }
  /* 揭露出的三个选项里按策略该拿哪条：有目标拿最难自然出的目标，否则拿一条不占目标家族的 */
  function pickReveal(model, options) {
    const cls = options.map((row) => classifyRow(model, row));
    let best = -1;
    cls.forEach((c, j) => { if (c.hit != null && (best < 0 || model.T[c.hit].natural < model.T[cls[best].hit].natural)) best = j; });
    if (best >= 0) return options[best];
    const junk = cls.findIndex((c) => c.junk);
    return options[junk >= 0 ? junk : 0];
  }

  /* 最低词缀等级为 m 时，空的稀有物品上「加一条」的权重分解 */
  function poolStats(model, m) {
    let ps = model.pools.get(m);
    if (ps) return ps;
    ps = {
      hit: [model.T.map(() => 0), model.T.map(() => 0)],
      block: [model.T.map(() => 0), model.T.map(() => 0)],
      junkW: [0, 0], junkE: [0, 0],
      lvHit: model.T.map(() => new Map()), lvBlock: model.T.map(() => new Map()), lvJunk: [new Map(), new Map()],
    };
    const junkFam = [new Map(), new Map()];
    const bump = (map, k, w) => map.set(k, (map.get(k) || 0) + w);
    for (const { row, w } of R.addPool(model.empty, { minLvl: m })) {
      const g = SIDE[row.gen];
      const c = classifyRow(model, row);
      if (c.hit != null) { ps.hit[g][c.hit] += w; bump(ps.lvHit[c.hit], row.lvl, w); }
      else if (c.block != null) { ps.block[g][c.block] += w; bump(ps.lvBlock[c.block], row.lvl, w); }
      else { ps.junkW[g] += w; bump(junkFam[g], row.fam.join('+') || row.type, w); bump(ps.lvJunk[g], row.lvl, w); }
    }
    for (const g of [0, 1]) {
      let sq = 0;
      for (const w of junkFam[g].values()) sq += w * w;
      ps.junkE[g] = ps.junkW[g] > 0 ? sq / ps.junkW[g] : 0;   // 一条废词平均占掉多少池子权重
    }
    model.pools.set(m, ps);
    return ps;
  }
  function naturalShare(model, t) {
    const ps = poolStats(model, 0);
    const tot = ps.junkW[0] + ps.junkW[1] + sum(ps.hit[0]) + sum(ps.hit[1]) + sum(ps.block[0]) + sum(ps.block[1]);
    return tot > 0 ? (ps.hit[0][t.i] + ps.hit[1][t.i]) / tot : 0;
  }
  const sum = (a) => a.reduce((n, x) => n + x, 0);

  /* 哪些精华的保底词缀正好满足某个目标 */
  function essenceOptions(model) {
    const out = [];
    for (const ess of R.data.essences) {
      const eff = R.essenceEffect(model.empty, ess);
      if (!eff) continue;
      const row = eff.row ? R.row(eff.row) : null;
      const probe = row ? { type: row.type, lvl: row.lvl, row: row.id, pool: row.pool } : { type: 'essence:' + ess.id, lvl: 1, row: null };
      const t = model.T.find((x) => R.targetAccepts(model.base, x.spec, probe));
      if (!t || SIDE[eff.gen] !== SIDE[t.gen]) continue;
      out.push({ id: ess.id, i: t.i, removing: R.isRemovingEssence(ess), g: SIDE[eff.gen] });
    }
    return out;
  }
  /* 揭露：某一侧三个选项里出现目标 i 的概率 */
  function revealStats(model, g, m) {
    const key = g + '|' + m;
    let rs = model.revealCache.get(key);
    if (rs) return rs;
    const probeItem = R.clone(model.empty);
    probeItem.affixes.push({ row: null, type: null, fam: [], gen: GEN[g], lvl: 0, tags: [], values: [], desecrated: true, unrevealed: true, minLvl: m });
    const pool = R.revealPool(probeItem);
    const all = pool.exclusive.concat(pool.regular);
    const share = (rows) => {
      const w = model.T.map(() => 0);
      for (const r of rows) { const c = classifyRow(model, r); if (c.hit != null) w[c.hit] += 1; }
      return w.map((x) => (rows.length ? x / rows.length : 0));
    };
    const qAll = share(all);
    const qEx = model.ilvl >= 65 && pool.exclusive.length ? share(pool.exclusive) : qAll;
    rs = { offered: model.T.map((t, i) => 1 - (1 - qEx[i]) * (1 - qAll[i]) * (1 - qAll[i])), exclusive: pool.exclusive.length };
    model.revealCache.set(key, rs);
    return rs;
  }

  /* 揭露的候选按「类型」汇总：三个选项类型互不相同，抽中一个类型后它的所有档位都退出候选 */
  function revealTypes(model, g, m) {
    const key = 'T' + g + '|' + m;
    let list = model.revealCache.get(key);
    if (list) return list;
    const probeItem = R.clone(model.empty);
    probeItem.affixes.push({ row: null, type: null, fam: [], gen: GEN[g], lvl: 0, tags: [], values: [], desecrated: true, unrevealed: true, minLvl: m });
    const pool = R.revealPool(probeItem);
    const byType = new Map();
    const feed = (rows, ex) => {
      for (const r of rows) {
        let t = byType.get(r.type);
        if (!t) { t = { w: 0, sat: 0, ti: -1, ex }; byType.set(r.type, t); }
        t.w += 1;
        const c = classifyRow(model, r);
        if (c.hit != null) { t.sat += 1; t.ti = c.hit; } else if (c.block != null && t.ti < 0) t.ti = c.block;
      }
    };
    feed(pool.exclusive, true);
    feed(pool.regular, false);
    list = [...byType.values()];
    model.revealCache.set(key, list);
    return list;
  }
  /* 当前状态下，三个选项里出现「满足目标 i 的词缀」的概率 */
  function revealOffered(model, s, g, m) {
    const ps = poolStats(model, m);
    const have = g === 0 ? s.jp : s.js;
    const junkScale = ps.junkW[g] > 0 ? Math.max(0.05, 1 - (have * ps.junkE[g]) / ps.junkW[g]) : 1;
    const types = revealTypes(model, g, m)
      .filter((t) => t.ti < 0 || s.st[t.ti] === 0)
      .map((t) => ({ w: t.ti < 0 && !t.ex ? t.w * junkScale : t.w, sat: t.sat, ti: t.ti, ex: t.ex }));
    const tot = (list) => list.reduce((n, t) => n + t.w, 0);
    const sizeBiased = (list, skip) => {
      let a = 0;
      let b = 0;
      for (const t of list) if (t !== skip) { a += t.w * t.w; b += t.w; }
      return b > 0 ? a / b : 0;
    };
    const exTypes = types.filter((t) => t.ex);
    const wAll = tot(types);
    const wEx = tot(exTypes);
    const forced = model.ilvl >= 65 && wEx > 0;
    const out = model.T.map(() => 0);
    for (const t of types) {
      if (t.ti < 0 || !t.sat) continue;
      const sbAll = sizeBiased(types, t);
      let miss;
      if (forced) {
        const p1 = t.ex ? t.w / wEx : 0;
        const left = wAll - sizeBiased(exTypes, t);
        miss = (1 - p1) * (1 - Math.min(1, t.w / Math.max(t.w, left))) * (1 - Math.min(1, t.w / Math.max(t.w, left - sbAll)));
      } else {
        miss = (1 - t.w / wAll) * (1 - Math.min(1, t.w / Math.max(t.w, wAll - sbAll))) * (1 - Math.min(1, t.w / Math.max(t.w, wAll - 2 * sbAll)));
      }
      out[t.ti] = Math.max(out[t.ti], (1 - miss) * (t.sat / t.w));
    }
    return out;
  }

  /* 做不出来的原因，用人话说 */
  function diagnose(model) {
    if (model.k > MAX_TARGETS) model.problems.push({ kind: 'slots', text: '目标太多了（最多 ' + MAX_TARGETS + ' 条）' });
    const perSide = [0, 0];
    for (const t of model.T) perSide[SIDE[t.gen]]++;
    for (const g of [0, 1]) {
      if (perSide[g] + model.frac[g] > model.cap[g]) {
        model.problems.push({ kind: 'slots', text: (g ? '后缀' : '前缀') + '目标有 ' + perSide[g] + ' 条，但这一侧最多 ' + (model.cap[g] - model.frac[g]) + ' 个可用位置' });
      }
    }
    for (const a of model.T) for (const b of model.T) {
      if (a.i < b.i && [...a.fams].some((f) => b.fams.has(f))) model.problems.push({ kind: 'conflict', targets: [a.i, b.i], text: '有两条目标属于同一互斥组，不能同时出现在一件装备上' });
    }
    for (const t of model.T) {
      if (model.init.st[t.i] === 1) continue;
      if (t.fracBlock) { model.problems.push({ kind: 'blocked', targets: [t.i], text: '有一条破裂词缀占住了目标的互斥组，移不掉' }); continue; }
      const viaEssence = model.essences.some((e) => e.i === t.i);
      const viaReveal = [0, 1].some((g) => revealStats(model, g, 0).offered[t.i] > 0);
      if (t.natural > 0 || viaEssence || viaReveal) continue;
      const rows = t.spec.row ? [] : R.ladder(model.base, t.spec.type, t.spec.pool);
      const floor = rows[Math.min(rows.length, t.spec.tier || rows.length) - 1];
      model.problems.push(floor && floor.lvl > model.ilvl
        ? { kind: 'ilvl', targets: [t.i], need: floor.lvl, text: '物品等级不够：这一档需要物品等级 ' + floor.lvl + '，当前 ' + model.ilvl }
        : { kind: 'pool', targets: [t.i], text: '这个底子出不了这条词缀' });
    }
  }

  /* ------------------------------------------------------------------ 状态
   * d（亵渎）：0 没有；1 / 2 待揭露的前 / 后缀；4 / 5 同上但来自远古之骨（最低词缀等级 40）；
   *            3 / 6 已揭露、是前 / 后缀废词；7+i 已揭露、正是第 i 个目标；31 已揭露、移不掉或占着目标家族。
   * 编码时 d 占 5 位（< 32），所以目标最多 MAX_TARGETS 条——超过了 7+i 会撞上 31。 */
  const D_HIT = 7;
  const D_USED = 31;
  const MAX_TARGETS = 12;
  const isUnrevealed = (d) => d === 1 || d === 2 || d === 4 || d === 5;
  /* 状态编码成一个整数并缓存在对象上：枚举时要查几百万次，字符串键太慢 */
  function encode(s) {
    let c = s.r;
    const st = s.st;
    for (let i = 0; i < st.length; i++) c = c * 4 + st[i];
    return ((c * 8 + s.jp) * 8 + s.js) * 32 + s.d;
  }
  const keyOf = (s) => (s.k !== undefined ? s.k : (s.k = encode(s)));
  function sideCounts(model, s) {
    let p = model.frac[0] + s.jp;
    let q = model.frac[1] + s.js;
    for (let i = 0; i < model.k; i++) {
      const v = s.st[i];
      if (v === 1) { if (model.T[i].gen === 'p') p++; else q++; } else if (v === 2) p++; else if (v === 3) q++;
    }
    if (s.d === 1 || s.d === 4) p++;
    if (s.d === 2 || s.d === 5) q++;
    return [p, q];
  }
  const capsOf = (model, r) => (r === 1 ? [1, 1] : model.cap);
  const isDone = (s) => s.st.every((v) => v === 1);
  /* 状态对象按编码驻留：同一个状态只建一次对象。枚举时「改一位」的操作有几百万次，
   * 新状态的编码可以直接从旧编码加减出来，查到已有对象就不用再分配内存（浏览器里分配很贵）。
   * 状态只是纯数据、与具体模型无关，所以按目标条数分表、跨模型共用。 */
  const POW4 = [1, 4, 16, 64, 256, 1024, 4096, 16384, 65536, 262144, 1048576, 4194304, 16777216];
  const INTERN = [];
  const internTable = (k) => INTERN[k] || (INTERN[k] = new Map());
  const withSt = (s, i, v) => {
    const k = s.st.length;
    const code = keyOf(s) + (v - s.st[i]) * POW4[k - 1 - i] * 2048;
    const tab = internTable(k);
    let o = tab.get(code);
    if (!o) {
      const st = s.st.slice();
      st[i] = v;
      o = { r: s.r, st, jp: s.jp, js: s.js, d: s.d, k: code };
      if (tab.size > 400000) tab.clear();
      tab.set(code, o);
    }
    return o;
  };
  const mod = (s, patch) => {
    const r = patch.r !== undefined ? patch.r : s.r;
    const jp = patch.jp !== undefined ? patch.jp : s.jp;
    const js = patch.js !== undefined ? patch.js : s.js;
    const d = patch.d !== undefined ? patch.d : s.d;
    const k = s.st.length;
    const code = keyOf(s) + (r - s.r) * POW4[k] * 2048 + (jp - s.jp) * 256 + (js - s.js) * 32 + (d - s.d);
    const tab = internTable(k);
    let o = tab.get(code);
    if (!o) {
      o = { r, st: s.st, jp, js, d, k: code };
      if (tab.size > 400000) tab.clear();
      tab.set(code, o);
    }
    return o;
  };

  /* 可移除的词缀，按「实体」列出：[{ g, n, next }]，n 是这类实体的条数 */
  function removables(model, s, g) {
    const out = [];
    for (let i = 0; i < model.k; i++) {
      const v = s.st[i];
      const t = model.T[i];
      if (v === 1 && !t.fracHit) {
        const sg = SIDE[t.gen];
        const isDes = s.d === D_HIT + i;
        if (g == null || g === sg) out.push({ g: sg, n: 1, next: isDes ? mod(withSt(s, i, 0), { d: 0 }) : withSt(s, i, 0), lose: i, ent: 'hit', i, des: isDes });
      }
      if ((v === 2 || v === 3) && !t.fracBlock) { const sg = v - 2; if (g == null || g === sg) out.push({ g: sg, n: 1, next: withSt(s, i, 0), ent: 'block', i }); }
    }
    /* 废词里可能有一条是已揭露的亵渎词缀：移掉它之后可以重新亵渎 */
    if (s.jp && (g == null || g === 0)) {
      const plain = s.jp - (s.d === 3 ? 1 : 0);
      if (s.d === 3) out.push({ g: 0, n: 1, next: mod(s, { jp: s.jp - 1, d: 0 }), ent: 'junk', des: true });
      if (plain) out.push({ g: 0, n: plain, next: mod(s, { jp: s.jp - 1 }), ent: 'junk' });
    }
    if (s.js && (g == null || g === 1)) {
      const plain = s.js - (s.d === 6 ? 1 : 0);
      if (s.d === 6) out.push({ g: 1, n: 1, next: mod(s, { js: s.js - 1, d: 0 }), ent: 'junk', des: true });
      if (plain) out.push({ g: 1, n: plain, next: mod(s, { js: s.js - 1 }), ent: 'junk' });
    }
    if ((s.d === 1 || s.d === 4) && (g == null || g === 0)) out.push({ g: 0, n: 1, next: mod(s, { d: 0 }), ent: 'des', des: true });
    if ((s.d === 2 || s.d === 5) && (g == null || g === 1)) out.push({ g: 1, n: 1, next: mod(s, { d: 0 }), ent: 'des', des: true });
    return out;
  }
  function removeDist(model, s, g) {
    const list = removables(model, s, g);
    const n = list.reduce((a, x) => a + x.n, 0);
    return list.map((x) => ({ p: x.n / n, s: x.next, lose: x.lose }));
  }

  /* 加一条：opts = { g: 只加某侧, m: 最低词缀等级, r: 加完后的稀有度 } */
  function addOne(model, s, opts) {
    const variant = ((opts.g == null ? 2 : opts.g) * 5 + MINS.indexOf(opts.m || 0)) * 4 + (opts.r == null ? 3 : opts.r);
    let memo = model.addMemo.get(variant);
    if (!memo) { memo = new Map(); model.addMemo.set(variant, memo); }
    const key = keyOf(s);
    let hit = memo.get(key);
    if (!hit) { hit = addOneRaw(model, s, opts); memo.set(key, hit); }
    return hit;
  }
  function addOneRaw(model, s, opts) {
    const r = opts.r == null ? s.r : opts.r;
    const cnt = sideCounts(model, s);
    const cap = capsOf(model, r);
    if (r === 1 && cnt[0] + cnt[1] >= 2) return [];
    const ps = poolStats(model, opts.m || 0);
    const ev = [];
    const sideTotals = [0, 0];
    for (const g of [0, 1]) {
      if (opts.g != null && opts.g !== g) continue;
      if (cnt[g] >= cap[g]) continue;
      for (let i = 0; i < model.k; i++) {
        if (s.st[i] !== 0) continue;
        if (ps.hit[g][i] > 0) { ev.push({ g, w: ps.hit[g][i], s: mod(withSt(s, i, 1), { r }), hit: i }); sideTotals[g] += ps.hit[g][i]; }
        if (ps.block[g][i] > 0) { ev.push({ g, w: ps.block[g][i], s: mod(withSt(s, i, 2 + g), { r }), block: i }); sideTotals[g] += ps.block[g][i]; }
      }
      const have = g === 0 ? s.jp : s.js;
      const jw = Math.max(ps.junkW[g] * 0.05, ps.junkW[g] - have * ps.junkE[g]);
      if (jw > 0) { ev.push({ g, w: jw, s: mod(s, g === 0 ? { r, jp: s.jp + 1 } : { r, js: s.js + 1 }), junk: true }); sideTotals[g] += jw; }
    }
    if (!ev.length) return [];
    if (R.sideModel() === 'sideFirst' && opts.g == null) {
      const live = [0, 1].filter((g) => sideTotals[g] > 0).length;
      return ev.map((e) => ({ p: e.w / sideTotals[e.g] / live, s: e.s, hit: e.hit, block: e.block, junk: e.junk }));
    }
    const tot = sideTotals[0] + sideTotals[1];
    return ev.map((e) => ({ p: e.w / tot, s: e.s, hit: e.hit, block: e.block, junk: e.junk }));
  }
  /* 把「先 A 再 B」的两段分布接起来 */
  function chain(first, fn) {
    const out = [];
    for (const a of first) {
      const second = fn(a.s);
      if (!second.length) { out.push(a); continue; }
      for (const b of second) out.push({ p: a.p * b.p, s: b.s, hit: b.hit != null ? b.hit : a.hit, lose: a.lose != null ? a.lose : b.lose, junk: b.junk, block: b.block });
    }
    return out;
  }
  function chainMerge(first, fn) {
    const map = new Map();
    const put = (p, s, hit, lose, junk, block) => {
      const k = keyOf(s);
      const cur = map.get(k);
      if (cur) cur.p += p; else map.set(k, { p, s, hit, lose, junk, block });
    };
    for (const a of first) {
      const second = fn(a.s);
      if (!second.length) { put(a.p, a.s, a.hit, a.lose, a.junk, a.block); continue; }
      for (const b of second) put(a.p * b.p, b.s, b.hit != null ? b.hit : a.hit, a.lose != null ? a.lose : b.lose, b.junk, b.block);
    }
    return [...map.values()];
  }
  function merge(dist) {
    const map = new Map();
    for (const d of dist) {
      const k = keyOf(d.s);
      const cur = map.get(k);
      if (cur) cur.p += d.p; else map.set(k, Object.assign({}, d));
    }
    return [...map.values()];
  }

  /* 削切：移除等级最低的词缀。当前真实物品精确算；其它状态按池子的等级分布估计。 */
  function whittleDist(model, s) {
    const list = removables(model, s, null).filter((x) => x.ent !== 'des');
    if (!list.length) return [];
    const atInit = model.exactInit === true && keyOf(s) === keyOf(model.init);
    const ps = poolStats(model, 0);
    const norm = (m) => {
      if (!m.dist) {
        const tot = [...m.values()].reduce((a, b) => a + b, 0);
        m.dist = tot ? [...m].map(([lv, w]) => [lv, w / tot]) : [[1, 1]];
      }
      return m.dist;
    };
    const distOf = (x) => {
      if (atInit) {
        const lv = x.ent === 'hit' ? model.initLevels.hit[x.i] : x.ent === 'block' ? model.initLevels.block[x.i] : null;
        if (lv != null) return [[lv, 1]];
        if (x.ent === 'junk' && model.initLevels.junk[x.g].length) return [[Math.min.apply(null, model.initLevels.junk[x.g]), 1]];
      }
      return norm(x.ent === 'hit' ? ps.lvHit[x.i] : x.ent === 'block' ? ps.lvBlock[x.i] : ps.lvJunk[x.g]);
    };
    const ents = list.map((x) => ({ x, dist: distOf(x) }));
    const pGreater = (dist, lv) => {
      const memo = dist.pg || (dist.pg = new Map());
      let v = memo.get(lv);
      if (v === undefined) {
        v = 0;
        for (let j = 0; j < dist.length; j++) { const l = dist[j][0]; if (l > lv) v += dist[j][1]; else if (l === lv) v += dist[j][1] / 2; }
        memo.set(lv, v);
      }
      return v;
    };
    const raw = ents.map((e) => {
      let p = 0;
      for (const [lv, w] of e.dist) {
        let q = w;
        for (const o of ents) if (o !== e) q *= Math.pow(pGreater(o.dist, lv), o.x.n);
        p += q;
      }
      return p * e.x.n;
    });
    const tot = raw.reduce((a, b) => a + b, 0) || 1;
    return ents.map((e, i) => ({ p: raw[i] / tot, s: e.x.next, lose: e.x.lose })).filter((d) => d.p > 1e-12);
  }

  /* ------------------------------------------------------------------ 动作 */
  function allowed(model, action) {
    if (!model.allow) return true;
    if (action.cur && model.allow[action.cur] === false) return false;
    if (action.essence && model.allow.essence === false) return false;
    return !(action.omens || []).some((id) => model.allow[id] === false);
  }
  function actionsFor(model, s) {
    const out = [];
    const acts = model.actCache || (model.actCache = new Map());
    const push = (action, trans, distinct) => {
      if (!trans || !trans.length) return;
      const key = (action.cur || 'E' + action.essence) + (action.omens ? '+' + action.omens.join('+') : '');
      let known = acts.get(key);
      if (!known) { known = { action, cost: R.cost(action, model.prices), ok: allowed(model, action) }; acts.set(key, known); }
      if (!known.ok) return;
      out.push({ action: known.action, cost: known.cost, trans: distinct ? trans : merge(trans) });
    };
    const cnt = sideCounts(model, s);
    const tier = (id, m) => (m === 0 ? id : m === 35 || m === 44 ? id + '_greater' : id + '_perfect');
    if (s.r === 0) {
      for (const m of [0, 44, 70]) push({ cur: tier('transmute', m) }, addOne(model, s, { m, r: 1 }), true);
    }
    if (s.r === 1) {
      if (cnt[0] + cnt[1] === 1) for (const m of [0, 44, 70]) push({ cur: tier('augment', m) }, addOne(model, s, { m }), true);
      for (const m of [0, 35, 50]) {
        push({ cur: tier('regal', m) }, addOne(model, s, { m, r: 2 }), true);
        if (model.legacyOmens) {
          push({ cur: tier('regal', m), omens: ['omen_sinistral_coronation'] }, addOne(model, s, { m, r: 2, g: 0 }));
          push({ cur: tier('regal', m), omens: ['omen_dextral_coronation'] }, addOne(model, s, { m, r: 2, g: 1 }));
        }
      }
    }
    if (s.r <= 1 && !model.hasFracture) push({ cur: 'alchemy' }, alchemyDist(model), true);
    if (s.r >= 1) {
      push({ cur: 'annul' }, annulDist(model, s, null));
      if (s.r === 2) {
        if (removables(model, s, 0).length && removables(model, s, 1).length) {   // 只有一侧可移除时，左右旋预兆和不带预兆结果一样
          push({ cur: 'annul', omens: ['omen_sinistral_annulment'] }, annulDist(model, s, 0));
          push({ cur: 'annul', omens: ['omen_dextral_annulment'] }, annulDist(model, s, 1));
        }
        /* 光明预兆：剥离石只移除亵渎词缀——揭露没出目标时把它拿掉，可以再亵渎一次 */
        const des = removables(model, s, null).filter((x) => x.des);
        if (des.length) push({ cur: 'annul', omens: ['omen_light'] }, des.map((x) => ({ p: 1 / des.length, s: x.next, lose: x.lose })));
      }
    }
    for (const e of model.essences) {
      if (s.st[e.i] !== 0) continue;
      if (!e.removing) {
        if (s.r === 1 && cnt[e.g] < model.cap[e.g]) push({ essence: e.id }, [{ p: 1, s: mod(withSt(s, e.i, 1), { r: 2 }), hit: e.i }]);
        continue;
      }
      if (s.r !== 2) continue;
      for (const [omen, side] of [[null, null], ['omen_sinistral_crystallisation', 0], ['omen_dextral_crystallisation', 1]]) {
        const full = cnt[e.g] >= model.cap[e.g];
        if (full && side != null && side !== e.g) continue;
        const rm = removeDist(model, s, full ? e.g : side);
        if (!rm.length) continue;
        push(omen ? { essence: e.id, omens: [omen] } : { essence: e.id },
          rm.map((d) => (d.s.st[e.i] === 0 ? { p: d.p, s: withSt(d.s, e.i, 1), hit: e.i, lose: d.lose } : d)));
      }
    }
    if (s.r === 2) {
      /* 这些只跟状态有关、跟通货档位无关，算一次三档共用。
       * 另外：预兆在当前状态下不起作用时（另一侧本来就满了 / 没东西可移除 / 只剩一个空位），
       * 它和不带预兆的做法结果完全一样只是更贵，不必列出来。 */
      const openP = model.cap[0] - cnt[0];
      const openS = model.cap[1] - cnt[1];
      const sided = openP > 0 && openS > 0;
      const rmAll = removeDist(model, s, null);
      const rmSide = [removeDist(model, s, 0), removeDist(model, s, 1)];
      const rmSided = rmSide[0].length > 0 && rmSide[1].length > 0;
      const wh = isUnrevealed(s.d) || rmAll.length < 2 ? [] : whittleDist(model, s);
      for (const m of [0, 35, 50]) {
        const ex = tier('exalt', m);
        push({ cur: ex }, addOne(model, s, { m }), true);
        if (sided) {
          push({ cur: ex, omens: ['omen_sinistral_exalt'] }, addOne(model, s, { m, g: 0 }), true);
          push({ cur: ex, omens: ['omen_dextral_exalt'] }, addOne(model, s, { m, g: 1 }), true);
        }
        const two = (g) => chainMerge(addOne(model, s, { m, g }), (n) => addOne(model, n, { m, g }));
        if (openP + openS >= 2) push({ cur: ex, omens: ['omen_greater_exalt'] }, two(null), true);
        if (sided && openP >= 2) push({ cur: ex, omens: ['omen_sinistral_exalt', 'omen_greater_exalt'] }, two(0), true);
        if (sided && openS >= 2) push({ cur: ex, omens: ['omen_dextral_exalt', 'omen_greater_exalt'] }, two(1), true);
        const ch = tier('chaos', m);
        const thenAdd = (rm) => chainMerge(rm, (n) => addOne(model, n, { m }));
        push({ cur: ch }, thenAdd(rmAll), true);
        if (rmSided) {
          push({ cur: ch, omens: ['omen_sinistral_erasure'] }, thenAdd(rmSide[0]), true);
          push({ cur: ch, omens: ['omen_dextral_erasure'] }, thenAdd(rmSide[1]), true);
        }
        if (wh.length) push({ cur: ch, omens: ['omen_whittling'] }, thenAdd(wh), true);
      }
      if (s.d === 0) {
        for (const [cur, m] of [['bone_gnawed', 0], ['bone_preserved', 0], ['bone_ancient', 40]]) {
          if (cur === 'bone_gnawed' && model.ilvl > 64) continue;
          push({ cur }, desecrateDist(model, s, null, m));
          push({ cur, omens: ['omen_sinistral_necromancy'] }, desecrateDist(model, s, 0, m));
          push({ cur, omens: ['omen_dextral_necromancy'] }, desecrateDist(model, s, 1, m));
        }
      }
      if (isUnrevealed(s.d)) {
        push({ cur: 'reveal' }, revealDist(model, s, false));
        push({ cur: 'reveal', omens: ['omen_abyssal_echoes'] }, revealDist(model, s, true));
      }
    }
    return out;
  }
  function annulDist(model, s, g) {
    return removeDist(model, s, g).map((d) => {
      const c = sideCounts(model, d.s);
      return c[0] + c[1] === 0 ? { p: d.p, s: mod(d.s, { r: 0 }), lose: d.lose } : d;
    });
  }
  function alchemyDist(model) {
    if (model._alch) return model._alch;
    let cur = [{ p: 1, s: mod(model.fresh, { r: 2 }) }];
    for (let n = 0; n < 4; n++) cur = merge(chain(cur, (s) => addOne(model, s, {})));
    model._alch = cur;
    return cur;
  }
  function desecrateDist(model, s, side, m) {
    const cnt = sideCounts(model, s);
    const full = cnt[0] >= model.cap[0] && cnt[1] >= model.cap[1];
    const sides = [0, 1].filter((g) => {
      if (side != null && side !== g) return false;
      if (!full && cnt[g] >= model.cap[g]) return false;
      return !full || removables(model, s, g).length > 0;
    });
    if (!sides.length) return [];
    const w = sides.map((g) => Math.max(1, revealStats(model, g, m).exclusive));
    const tot = sum(w);
    const out = [];
    sides.forEach((g, j) => {
      const d = (g === 0 ? 1 : 2) + (m >= 40 ? 3 : 0);
      if (cnt[g] < model.cap[g]) out.push({ p: w[j] / tot, s: mod(s, { d }) });
      else for (const rm of removeDist(model, s, g)) out.push({ p: (w[j] / tot) * rm.p, s: mod(rm.s, { d }), lose: rm.lose });
    });
    return out;
  }
  /* 揭露三选一：有目标就拿（优先最难自然出的那条），否则拿一条废词 */
  function revealDist(model, s, echoes) {
    const g = s.d === 1 || s.d === 4 ? 0 : 1;
    const m = s.d >= 4 ? 40 : 0;
    const rs = { offered: revealOffered(model, s, g, m) };
    const order = model.T.filter((t) => s.st[t.i] === 0 && SIDE[t.gen] === g && rs.offered[t.i] > 0)
      .sort((a, b) => a.natural - b.natural);
    const out = [];
    let none = 1;
    for (const t of order) {
      const p = none * rs.offered[t.i];
      out.push({ p, s: mod(withSt(s, t.i, 1), { d: D_HIT + t.i }), hit: t.i });
      none *= 1 - rs.offered[t.i];
    }
    if (echoes && none < 1) {
      const scale = 1 + none;          // 第一次全空时再来一次
      for (const o of out) o.p *= scale;
      none *= none;
    } else if (echoes) return [];
    out.push({ p: none, s: mod(s, g === 0 ? { jp: s.jp + 1, d: 3 } : { js: s.js + 1, d: 6 }), junk: true });
    return out.filter((o) => o.p > 1e-12);
  }

  /* ------------------------------------------------------------------ 求解 */
  function enumerate(model) {
    const index = new Map();
    const states = [];
    const add = (s) => {
      const k = keyOf(s);
      let id = index.get(k);
      if (id === undefined) { id = states.length; index.set(k, id); states.push(s); }
      return id;
    };
    const initId = add(model.init);
    const freshId = model.hasFracture ? -1 : add(model.fresh);
    const limit = 60000;
    const grow = (arr, need) => {
      if (need <= arr.length) return arr;
      const next = new arr.constructor(Math.max(need, arr.length * 2));
      next.set(arr);
      return next;
    };
    let actStart = new Int32Array(4096);
    let edgeStart = new Int32Array(16384);
    let cost = new Float64Array(16384);
    let inv = new Float64Array(16384);          // 1 / (1 - 原地不动的概率)：自环解析消掉
    let to = new Int32Array(1 << 17);
    let pr = new Float64Array(1 << 17);
    const actionOf = [];
    let na = 0;
    let ne = 0;
    let i = 0;
    for (; i < states.length && states.length < limit; i++) {
      actStart = grow(actStart, i + 2);
      actStart[i] = na;
      const s = states[i];
      if (isDone(s)) continue;
      const list = actionsFor(model, s);
      for (let x = 0; x < list.length; x++) {
        const a = list[x];
        const e0 = ne;
        let self = 0;
        to = grow(to, ne + a.trans.length);
        pr = grow(pr, ne + a.trans.length);
        for (let y = 0; y < a.trans.length; y++) {
          const t = a.trans[y];
          const id = add(t.s);
          if (id === i) self += t.p; else { to[ne] = id; pr[ne] = t.p; ne++; }
        }
        if (self >= 1 - 1e-12) { ne = e0; continue; }      // 这个动作什么也改变不了
        edgeStart = grow(edgeStart, na + 2);
        cost = grow(cost, na + 1);
        inv = grow(inv, na + 1);
        edgeStart[na] = e0;
        cost[na] = a.cost;
        inv[na] = 1 / (1 - self);
        actionOf[na] = a.action;
        na++;
      }
    }
    const n = states.length;
    actStart = grow(actStart, n + 1);
    for (; i <= n; i++) actStart[i] = na;           // 超出上限、没展开的状态：只能重开
    edgeStart = grow(edgeStart, na + 1);
    edgeStart[na] = ne;
    const done = new Uint8Array(n);
    for (let j = 0; j < n; j++) done[j] = isDone(states[j]) ? 1 : 0;
    model.addMemo = new Map();                      // 枚举时攒下的中间结果有几十 MB，用完就放掉
    const c = {
      n, actStart: actStart.subarray(0, n + 1), edgeStart: edgeStart.subarray(0, na + 1),
      cost: cost.subarray(0, na), inv: inv.subarray(0, na), to: to.subarray(0, ne), pr: pr.subarray(0, ne), done,
    };
    return { index, states, actionOf, c, done, initId, freshId, truncated: n >= limit, actions: na, edges: ne };
  }
  const compile = (G) => G.c;
  /* 内层：重开的代价固定为 exit 时的最优值。从上界往下迭代，收敛轮数取决于路径长度而不是成功率。 */
  function valueIterate(c, exit, V, maxSweeps) {
    for (let i = 0; i < c.n; i++) if (!c.done[i] && V[i] > exit) V[i] = exit;
    let sweeps = 0;
    let delta = Infinity;
    while (sweeps++ < maxSweeps && delta > 1e-8) {
      delta = 0;
      for (let i = c.n - 1; i >= 0; i--) {
        if (c.done[i]) continue;
        let best = exit;
        for (let a = c.actStart[i], ae = c.actStart[i + 1]; a < ae; a++) {
          let q = c.cost[a];
          for (let e = c.edgeStart[a], ee = c.edgeStart[a + 1]; e < ee; e++) q += c.pr[e] * V[c.to[e]];
          q *= c.inv[a];
          if (q < best) best = q;
        }
        const d = (V[i] - best) / (1 + best);
        if (d > delta) delta = d;
        V[i] = best;
      }
    }
    return { sweeps, converged: delta <= 1e-8 };
  }
  function greedy(c, exit, V) {
    const pol = new Int32Array(c.n).fill(-1);      // -1 = 重开 / 放弃；否则是该状态内的动作序号
    for (let i = 0; i < c.n; i++) {
      if (c.done[i]) continue;
      let best = exit * (1 - 1e-9);
      for (let a = c.actStart[i], ae = c.actStart[i + 1]; a < ae; a++) {
        let q = c.cost[a];
        for (let e = c.edgeStart[a], ee = c.edgeStart[a + 1]; e < ee; e++) q += c.pr[e] * V[c.to[e]];
        q *= c.inv[a];
        if (q < best - 1e-12) { best = q; pol[i] = a - c.actStart[i]; }
      }
    }
    return pol;
  }
  /* 按策略走，最终落到「重开」的概率（每个状态） */
  function exitProb(c, pol) {
    const X = new Float64Array(c.n);
    for (let i = 0; i < c.n; i++) X[i] = c.done[i] ? 0 : 1;
    let delta = 1;
    let sweeps = 0;
    while (sweeps++ < 6000 && delta > 1e-13) {
      delta = 0;
      for (let i = c.n - 1; i >= 0; i--) {
        if (c.done[i] || pol[i] < 0) continue;
        const a = c.actStart[i] + pol[i];
        let x = 0;
        for (let e = c.edgeStart[a], ee = c.edgeStart[a + 1]; e < ee; e++) x += c.pr[e] * X[c.to[e]];
        x *= c.inv[a];
        const d = X[i] - x;
        if (d > delta) delta = d;
        X[i] = x;
      }
    }
    return X;
  }

  /* ---- 策略迭代 ----
   * 值迭代在「成功率很低」的问题上要扫几千轮（武器 T1 词缀就是这样），所以主求解改用策略迭代：
   * 固定策略时每个状态只有一个动作，图很稀疏，可以精确解出
   *   A = 终止（做成或重开）之前的期望花费，S = 以「做成」收场的概率，
   * 于是新底子的期望花费 x = (A + (1 − S)·底子价) / S 直接有闭式，不需要内外两层迭代。
   * 精确求值的做法：策略图按强连通分量拆开，从下游往上游逐块解；单点直接代入，成环的块用消元。 */
  const DENSE_MAX = 200;
  /* 大块用预条件 BiCGSTAB 解 (I − Q)x = b。这类链「几乎可分」，高斯-赛德尔要几千轮，
   * 克雷洛夫法几十轮就够；预条件子是一遍高斯-赛德尔（上三角回代）。 */
  function solveBlockKrylov(c, pol, A, S, list, start, m, ws, stamp) {
    let ne = 0;
    for (let k = 0; k < m; k++) { const i = list[start + k]; const a = c.actStart[i] + pol[i]; ne += c.edgeStart[a + 1] - c.edgeStart[a]; }
    const rs = new Int32Array(m + 1);
    const col = new Int32Array(ne);
    const val = new Float64Array(ne);
    const bA = new Float64Array(m);
    const bS = new Float64Array(m);
    let p = 0;
    for (let k = 0; k < m; k++) {
      const i = list[start + k];
      const a = c.actStart[i] + pol[i];
      const inv = c.inv[a];
      let ra = c.cost[a];
      let sv = 0;
      rs[k] = p;
      for (let e = c.edgeStart[a], ee = c.edgeStart[a + 1]; e < ee; e++) {
        const j = c.to[e];
        if (ws.blk[j] === stamp) { col[p] = ws.local[j]; val[p] = c.pr[e] * inv; p++; } else { ra += c.pr[e] * A[j]; sv += c.pr[e] * S[j]; }
      }
      bA[k] = ra * inv;
      bS[k] = sv * inv;
    }
    rs[m] = p;
    const mul = (x, out) => {                       // out = (I − Q) x
      for (let k = 0; k < m; k++) { let q = 0; for (let e = rs[k], ee = rs[k + 1]; e < ee; e++) q += val[e] * x[col[e]]; out[k] = x[k] - q; }
    };
    const pre = (r, z) => {                         // z = (I − U)⁻¹ r，U 是 Q 的严格上三角
      for (let k = m - 1; k >= 0; k--) { let q = r[k]; for (let e = rs[k], ee = rs[k + 1]; e < ee; e++) if (col[e] > k) q += val[e] * z[col[e]]; z[k] = q; }
    };
    const dot = (u, v) => { let q = 0; for (let k = 0; k < m; k++) q += u[k] * v[k]; return q; };
    const r = new Float64Array(m);
    const r0 = new Float64Array(m);
    const pv = new Float64Array(m);
    const v = new Float64Array(m);
    const y = new Float64Array(m);
    const z = new Float64Array(m);
    const t = new Float64Array(m);
    const sres = new Float64Array(m);
    const run = (b, x) => {
      const bn = Math.sqrt(dot(b, b)) || 1;
      for (let restart = 0; restart < 6; restart++) {
        mul(x, r);
        for (let k = 0; k < m; k++) { r[k] = b[k] - r[k]; r0[k] = r[k]; pv[k] = 0; v[k] = 0; }
        let rho = 1;
        let alpha = 1;
        let omega = 1;
        if (Math.sqrt(dot(r, r)) <= 1e-14 * bn) return true;
        for (let it = 0; it < 400; it++) {
          const rho1 = dot(r0, r);
          if (!(Math.abs(rho1) > 1e-300)) break;
          const beta = (rho1 / rho) * (alpha / omega);
          for (let k = 0; k < m; k++) pv[k] = r[k] + beta * (pv[k] - omega * v[k]);
          pre(pv, y);
          mul(y, v);
          const den = dot(r0, v);
          if (!(Math.abs(den) > 1e-300)) break;
          alpha = rho1 / den;
          for (let k = 0; k < m; k++) sres[k] = r[k] - alpha * v[k];
          pre(sres, z);
          mul(z, t);
          const tt = dot(t, t);
          omega = tt > 0 ? dot(t, sres) / tt : 0;
          for (let k = 0; k < m; k++) { x[k] += alpha * y[k] + omega * z[k]; r[k] = sres[k] - omega * t[k]; }
          rho = rho1;
          ws.krylovIts++;
          if (Math.sqrt(dot(r, r)) <= 1e-14 * bn) return true;
          if (!(omega !== 0) || !Number.isFinite(omega)) break;
        }
      }
      mul(x, r);
      let rn = 0;
      for (let k = 0; k < m; k++) { const d = b[k] - r[k]; rn += d * d; }
      return Math.sqrt(rn) <= 1e-11 * bn;
    };
    const xa = new Float64Array(m);
    const xs = new Float64Array(m);
    for (let k = 0; k < m; k++) { const i = list[start + k]; xa[k] = A[i]; xs[k] = S[i]; }
    if (!run(bA, xa) || !run(bS, xs)) return false;
    for (let k = 0; k < m; k++) {
      const i = list[start + k];
      if (!Number.isFinite(xa[k]) || !Number.isFinite(xs[k])) return false;
      A[i] = xa[k];
      S[i] = Math.min(1, Math.max(0, xs[k]));
    }
    return true;
  }
  function solveBlock(c, pol, A, S, list, start, m, ws) {
    if (m === 1) {
      const i = list[start];
      const a = c.actStart[i] + pol[i];
      let qa = c.cost[a];
      let qs = 0;
      for (let e = c.edgeStart[a], ee = c.edgeStart[a + 1]; e < ee; e++) { const j = c.to[e]; qa += c.pr[e] * A[j]; qs += c.pr[e] * S[j]; }
      A[i] = qa * c.inv[a];
      S[i] = qs * c.inv[a];
      return true;
    }
    if (m > ws.maxBlock) ws.maxBlock = m;
    const stamp = ++ws.stamp;
    for (let k = 0; k < m; k++) { const i = list[start + k]; ws.blk[i] = stamp; ws.local[i] = k; }
    if (m <= DENSE_MAX) {
      const W = m + 2;
      const M = new Float64Array(m * W);
      for (let k = 0; k < m; k++) {
        const i = list[start + k];
        const a = c.actStart[i] + pol[i];
        const inv = c.inv[a];
        const row = k * W;
        let ra = c.cost[a];
        let rs = 0;
        M[row + k] = 1;
        for (let e = c.edgeStart[a], ee = c.edgeStart[a + 1]; e < ee; e++) {
          const j = c.to[e];
          if (ws.blk[j] === stamp) M[row + ws.local[j]] -= c.pr[e] * inv;
          else { ra += c.pr[e] * A[j]; rs += c.pr[e] * S[j]; }
        }
        M[row + m] = ra * inv;
        M[row + m + 1] = rs * inv;
      }
      /* I − P 是对角占优的 M 矩阵，不选主元也稳定 */
      for (let col = 0; col < m; col++) {
        const pr = col * W;
        const piv = M[pr + col];
        if (!(piv > 1e-13)) return false;                 // 块内没有出口：这个策略永远停不下来
        for (let r = col + 1; r < m; r++) {
          const rr = r * W;
          const f = M[rr + col];
          if (f === 0) continue;
          const g = f / piv;
          for (let q = col + 1; q < W; q++) M[rr + q] -= g * M[pr + q];
        }
      }
      for (let col = m - 1; col >= 0; col--) {
        const pr = col * W;
        let xa = M[pr + m];
        let xs = M[pr + m + 1];
        for (let q = col + 1; q < m; q++) { const v = M[pr + q]; if (v !== 0) { const j = list[start + q]; xa -= v * A[j]; xs -= v * S[j]; } }
        const i = list[start + col];
        A[i] = xa / M[pr + col];
        S[i] = xs / M[pr + col];
      }
      return true;
    }
    ws.bigBlocks++;
    if (solveBlockKrylov(c, pol, A, S, list, start, m, ws, stamp)) return true;
    /* 兜底：块内高斯-赛德尔。上一轮策略的值是很好的初值。 */
    ws.gsBlocks++;
    for (let sweep = 0; sweep < 40000; sweep++) {
      let delta = 0;
      for (let k = m - 1; k >= 0; k--) {
        const i = list[start + k];
        const a = c.actStart[i] + pol[i];
        let qa = c.cost[a];
        let qs = 0;
        for (let e = c.edgeStart[a], ee = c.edgeStart[a + 1]; e < ee; e++) { const j = c.to[e]; qa += c.pr[e] * A[j]; qs += c.pr[e] * S[j]; }
        qa *= c.inv[a];
        qs *= c.inv[a];
        const d = Math.abs(qa - A[i]) / (1 + Math.abs(qa)) + Math.abs(qs - S[i]);
        if (d > delta) delta = d;
        A[i] = qa;
        S[i] = qs;
      }
      if (delta < 1e-12) return true;
    }
    ws.approx = true;
    return true;
  }
  function evaluatePolicy(c, pol, A, S, ws) {
    const n = c.n;
    const { idx, low, on, stack, cn, ce } = ws;
    idx.fill(-1);
    let counter = 0;
    let sp = 0;
    for (let i = 0; i < n; i++) {
      if (c.done[i]) { A[i] = 0; S[i] = 1; } else if (pol[i] < 0) { A[i] = 0; S[i] = 0; }
    }
    for (let root = 0; root < n; root++) {
      if (c.done[root] || pol[root] < 0 || idx[root] >= 0) continue;
      idx[root] = low[root] = counter++;
      stack[sp++] = root;
      on[root] = 1;
      cn[0] = root;
      ce[0] = c.edgeStart[c.actStart[root] + pol[root]];
      let cp = 1;
      while (cp > 0) {
        const v = cn[cp - 1];
        const e = ce[cp - 1];
        if (e < c.edgeStart[c.actStart[v] + pol[v] + 1]) {
          ce[cp - 1] = e + 1;
          const w = c.to[e];
          if (c.done[w] || pol[w] < 0) continue;
          if (idx[w] < 0) {
            idx[w] = low[w] = counter++;
            stack[sp++] = w;
            on[w] = 1;
            cn[cp] = w;
            ce[cp] = c.edgeStart[c.actStart[w] + pol[w]];
            cp++;
          } else if (on[w] && idx[w] < low[v]) low[v] = idx[w];
        } else {
          cp--;
          if (cp > 0) { const p = cn[cp - 1]; if (low[v] < low[p]) low[p] = low[v]; }
          if (low[v] === idx[v]) {
            let start = sp;
            do { start--; on[stack[start]] = 0; } while (stack[start] !== v);
            if (!solveBlock(c, pol, A, S, stack, start, sp - start, ws)) return false;
            sp = start;
          }
        }
      }
    }
    return true;
  }
  /* 策略改进：只有确实更便宜才换动作，避免在打平的动作之间来回跳 */
  function improve(c, exit, V, pol) {
    let changed = 0;
    for (let i = 0; i < c.n; i++) {
      if (c.done[i]) continue;
      let best = V[i] - 1e-9 * (1 + Math.abs(V[i]));
      let pick = -2;
      if (pol[i] >= 0 && exit < best) { best = exit; pick = -1; }
      for (let a = c.actStart[i], ae = c.actStart[i + 1]; a < ae; a++) {
        let q = c.cost[a];
        for (let e = c.edgeStart[a], ee = c.edgeStart[a + 1]; e < ee; e++) q += c.pr[e] * V[c.to[e]];
        q *= c.inv[a];
        if (q < best) { best = q; pick = a - c.actStart[i]; }
      }
      if (pick !== -2 && pick !== pol[i]) { pol[i] = pick; changed++; }
    }
    return changed;
  }
  function solvePolicy(model, G, c) {
    const n = c.n;
    const f = G.freshId;
    const bp = model.basePrice;
    let canRestart = f >= 0;
    const V = new Float64Array(n);
    const A = new Float64Array(n);
    const S = new Float64Array(n);
    const ws = {
      idx: new Int32Array(n), low: new Int32Array(n), on: new Uint8Array(n), stack: new Int32Array(n),
      cn: new Int32Array(n), ce: new Int32Array(n), blk: new Int32Array(n), local: new Int32Array(n),
      stamp: 0, maxBlock: 1, bigBlocks: 0, gsBlocks: 0, krylovIts: 0, approx: false,
    };
    /* 重开的代价先猜一个数，够大到「值得动手」就行；一旦策略能做成，就换成精确值 */
    let x = canRestart ? 2000 : Infinity;
    let exit = canRestart ? bp + x : BIG;
    let proper = !canRestart;
    let boost = 0;
    for (let i = 0; i < n; i++) V[i] = c.done[i] ? 0 : exit;
    valueIterate(c, exit, V, 6);                    // 几轮值迭代给出一个像样的初始策略
    const pol = greedy(c, exit, V);
    let rounds = 0;
    let settled = false;
    for (; rounds < 500; rounds++) {
      if (!evaluatePolicy(c, pol, A, S, ws)) return null;
      if (canRestart && pol[f] >= 0 && S[f] > 1e-13) {
        x = (A[f] + (1 - S[f]) * bp) / S[f];
        exit = bp + x;
        proper = true;
      }
      for (let i = 0; i < n; i++) V[i] = A[i] + (1 - S[i]) * exit;
      if (improve(c, exit, V, pol)) continue;
      if (proper) { settled = true; break; }
      /* 这个价位下连第一步都不值得做：把重开的代价再放大试试；实在不行就当作不能重开 */
      if (boost++ < 4) { x *= 60; exit = bp + x; } else { canRestart = false; proper = true; x = Infinity; exit = BIG; }
    }
    for (let i = 0; i < n; i++) if (!(V[i] >= 0) || !Number.isFinite(V[i])) return null;
    const X = new Float64Array(n);
    for (let i = 0; i < n; i++) X[i] = 1 - S[i];
    G.freshValue = x;
    return { G, V, pol, exit, X, converged: settled && !ws.approx, rounds, canRestart: f >= 0 && canRestart, method: 'policy', maxBlock: ws.maxBlock, bigBlocks: ws.bigBlocks, gsBlocks: ws.gsBlocks, krylovIts: ws.krylovIts };
  }

  /* 旧的求解路径（牛顿 + 值迭代），策略迭代出意外时兜底 */
  function solveValue(model, G, c) {
    const n = c.n;
    const V = new Float64Array(n);
    const canRestart = G.freshId >= 0;
    let exit = BIG;
    let pol = null;
    let converged = true;
    let rounds = 0;
    for (let i = 0; i < n; i++) V[i] = c.done[i] ? 0 : BIG;
    if (!canRestart) {
      converged = valueIterate(c, BIG, V, 20000).converged;
      pol = greedy(c, BIG, V);
    } else {
      let x = 2000;
      let boost = 0;
      for (rounds = 0; rounds < 120; rounds++) {
        exit = model.basePrice + x;
        for (let i = 0; i < n; i++) if (!c.done[i] && V[i] > exit) V[i] = exit;
        converged = valueIterate(c, exit, V, 4000).converged;
        pol = greedy(c, exit, V);
        const X = exitProb(c, pol);
        const slope = X[G.freshId];
        if (slope >= 1 - 1e-13) {
          if (boost++ >= 4) { x = Infinity; break; }
          x *= 60;
          for (let i = 0; i < n; i++) V[i] = c.done[i] ? 0 : BIG;
          continue;
        }
        const next = (V[G.freshId] - slope * x) / (1 - slope);
        if (next > x) {                       // 起点在不动点下方：跳到上方，V 要重新从上界开始
          x = next * (1 + 1e-9);
          for (let i = 0; i < n; i++) V[i] = c.done[i] ? 0 : BIG;
          continue;
        }
        const stop = x - next <= 1e-9 * (1 + Math.abs(x));
        x = next;
        if (stop) break;
      }
      if (Number.isFinite(x)) {
        exit = model.basePrice + x;
        converged = valueIterate(c, exit, V, 4000).converged;
        pol = greedy(c, exit, V);
      }
      G.freshValue = x;
    }
    const X = exitProb(c, pol);
    return { G, V, pol, exit, X, converged, rounds, canRestart, method: 'value' };
  }

  function solve(model, opts) {
    const G = enumerate(model);
    const c = compile(G);
    let sol = null;
    if (!(opts && opts.method === 'value')) {
      try { sol = solvePolicy(model, G, c); } catch (err) { sol = null; }
    }
    return sol || solveValue(model, G, c);
  }

  /* 花费分布：按策略在抽象状态上模拟；成功率太低时改用指数近似 */
  function costDistribution(model, sol, runs, startId, mean) {
    const { G, pol } = sol;
    const c = G.c;
    const rng = R.makeRng(20261116);
    const costs = [];
    let steps = 0;
    const budget = 600000;
    for (let n = 0; n < runs && steps < budget; n++) {
      if (steps > 20000 && costs.length * budget < 200 * steps) break;   // 照这个速度攒不够样本，早点改用近似
      let i = startId;
      let total = 0;
      let guard = 0;
      while (!c.done[i] && guard++ < 200000 && steps++ < budget) {
        if (pol[i] < 0) {
          if (!sol.canRestart) { total = Infinity; break; }
          total += model.basePrice; i = G.freshId; continue;
        }
        const a = c.actStart[i] + pol[i];
        total += c.cost[a];
        let r = rng() - (1 - 1 / c.inv[a]);
        if (r < 0) continue;
        let e = c.edgeStart[a];
        const last = c.edgeStart[a + 1] - 1;
        for (; e < last; e++) { r -= c.pr[e]; if (r < 0) break; }
        i = c.to[e];
      }
      if (c.done[i]) costs.push(total);
    }
    if (costs.length < Math.min(runs, 200)) {
      return { mean, p50: mean * Math.LN2, p90: mean * Math.log(10), approx: true };
    }
    costs.sort((a, b) => a - b);
    const at = (q) => costs[Math.min(costs.length - 1, Math.floor(q * costs.length))];
    return { mean, p50: at(0.5), p90: at(0.9), approx: false };
  }

  /* 同一个解、同一个起点的花费分布只模拟一次 */
  function costOf(model, sol, runs, startId, mean) {
    const memo = sol.costMemo || (sol.costMemo = new Map());
    const key = startId + '|' + runs;
    let out = memo.get(key);
    if (!out) { out = costDistribution(model, sol, runs, startId, mean); memo.set(key, out); }
    return Object.assign({}, out, { mean });
  }

  /* ------------------------------------------------------------------ 给界面的计划 */
  function targetName(model, i) { return model.T[i].spec.name || model.T[i].spec.type || ('目标 ' + (i + 1)); }
  const policyAction = (sol, id) => sol.G.actionOf[sol.G.c.actStart[id] + sol.pol[id]];
  function describe(model, sol, i, act) {
    const { G, V, pol } = sol;
    const groups = new Map();
    const done = (id) => id !== undefined && G.done[id] === 1;
    const nextName = (id) => {
      if (done(id)) return { kind: 'done', text: '完成' };
      if (id === undefined || pol[id] < 0) return sol.canRestart ? { kind: 'restart', text: '换一个底子重来' } : { kind: 'stop', text: '到此为止' };
      return { kind: 'go', text: R.actionName(policyAction(sol, id), model.item), action: policyAction(sol, id) };
    };
    const put = (kind, label, p, id) => {
      const nx = nextName(id);
      const key = kind + '|' + label + '|' + nx.text;
      const g = groups.get(key) || { kind, label, p: 0, then: nx, value: 0 };
      g.p += p; g.value += p * (done(id) ? 0 : id === undefined ? sol.exit : V[id]);
      groups.set(key, g);
    };
    if (act.self > 0) put('same', '没有变化', act.self, i);
    const before = G.states[i];
    for (const t of act.trans) {
      const id = G.index.get(keyOf(t.s));
      if (id === i) continue;
      const lost = [];
      const got = [];
      for (let k = 0; k < model.k; k++) {
        if (before.st[k] === 1 && t.s.st[k] !== 1) lost.push(targetName(model, k));
        if (before.st[k] !== 1 && t.s.st[k] === 1) got.push(targetName(model, k));
      }
      const blockGain = [];
      let blockGone = 0;
      for (let k = 0; k < model.k; k++) {
        if (before.st[k] < 2 && t.s.st[k] >= 2) blockGain.push(targetName(model, k));
        if (before.st[k] >= 2 && t.s.st[k] < 2) blockGone++;
      }
      const dp = t.s.jp - before.jp;
      const ds = t.s.js - before.js;
      if (lost.length) put('lose', '丢了「' + lost.join('、') + '」' + (got.length ? '，换来「' + got.join('、') + '」' : ''), t.p, id);
      else if (got.length) put('hit', '出了「' + got.join('、') + '」', t.p, id);
      else if (blockGain.length) put('block', '出了档位不够的「' + blockGain.join('、') + '」', t.p, id);
      else if (isUnrevealed(t.s.d) && !isUnrevealed(before.d)) put('des', '多了一条待揭露的' + (t.s.d === 1 || t.s.d === 4 ? '前缀' : '后缀'), t.p, id);
      else if (dp + ds > 0) put('junk', '多了一条没用的' + (dp > 0 ? '前缀' : '后缀'), t.p, id);
      else if (dp + ds < 0 || blockGone) put('clean', '去掉了一条没用的词缀', t.p, id);
      else if (dp !== 0) put('junk', '没用的词缀换到了' + (dp > 0 ? '前缀' : '后缀') + '一侧', t.p, id);
      else put('same', '没出目标', t.p, id);
    }
    const order = { hit: 0, clean: 1, des: 2, junk: 3, same: 4, block: 5, lose: 6 };
    return [...groups.values()].map((g) => ({ kind: g.kind, label: g.label, p: g.p, then: g.then, after: g.p > 0 ? g.value / g.p : 0 }))
      .sort((a, b) => order[a.kind] - order[b.kind] || b.p - a.p);
  }

  /* 某个状态下每个动作的总期望花费：现算转移，值用已解出的 V。
   * 转移不留在内存里（几百万条），要给玩家看的时候再对这一个状态算一遍。 */
  function lookahead(model, sol, id, exact) {
    const { G, V } = sol;
    model.exactInit = !!exact;
    const list = actionsFor(model, G.states[id]);
    model.exactInit = false;
    return list.map((act) => {
      let q = act.cost;
      let self = 0;
      for (const t of act.trans) {
        const to = G.index.get(keyOf(t.s));
        if (to === id) self += t.p;
        else q += t.p * (to === undefined ? sol.exit : V[to]);
      }
      act.self = self;
      return { act, total: self < 1 - 1e-12 ? q / (1 - self) : Infinity };
    }).filter((o) => Number.isFinite(o.total)).sort((a, b) => a.total - b.total);
  }

  /* 同一组目标、价格、底子下，解一次就够：玩家每做一步只是换了个起点。
   * 所以把最近一次的解留着，下一步直接查表。 */
  let lastSolve = null;
  /* 只缓存真正影响计算的字段。目标的显示名（spec.name）随界面语言变，放进来会让切语言触发重解。 */
  function signature(model) {
    return JSON.stringify([
      model.base.id, model.ilvl,
      model.T.map((t) => [t.spec.type || null, t.spec.row || null, t.spec.tier || 0, t.spec.pool || null, t.fracHit, t.fracBlock]),
      model.frac, model.hasFracture,
      model.prices, model.basePrice, model.allow, model.legacyOmens, R.sideModel(),
    ]);
  }
  function solveCached(model, fresh) {
    const sig = signature(model);
    if (!fresh && lastSolve && lastSolve.sig === sig) {
      const id = lastSolve.sol.G.index.get(keyOf(model.init));
      if (id !== undefined) {
        const m = lastSolve.model;
        m.item = model.item; m.init = model.init; m.initLevels = model.initLevels;
        /* 名字只用来显示：沿用缓存里的解，但换成这次请求的（当前语言的）目标写法 */
        for (let i = 0; i < m.T.length; i++) if (model.T[i]) m.T[i].spec = model.T[i].spec;
        return { model: m, sol: lastSolve.sol, startId: id, cached: true };
      }
    }
    const sol = solve(model);
    const out = { model, sol, startId: sol.G.initId, cached: false };
    if (!fresh) lastSolve = { sig, model, sol };
    return out;
  }
  function clearCache() { lastSolve = null; }

  function plan(item, targets, opts) {
    opts = opts || {};
    const built = buildModel(item, targets, opts);
    const ev = R.evaluate(item, targets);
    const head = { matched: ev.matched, total: ev.total, problems: built.problems, estimates: ['weights', 'sideModel'] };
    if (!built.k) return Object.assign(head, { status: 'empty' });
    if (ev.done) return Object.assign(head, { status: 'done' });
    if (item.corrupted) return Object.assign(head, { status: 'corrupted' });
    if (built.problems.length) return Object.assign(head, { status: 'impossible' });
    const { model, sol, startId: i0, cached } = solveCached(built, opts.noCache);
    const { G, pol } = sol;
    const options = lookahead(model, sol, i0, true);
    const top = options[0];
    const value = top ? Math.min(top.total, sol.exit) : sol.exit;
    if (!(value < BIG * 0.5) || !Number.isFinite(value)) {
      return Object.assign(head, { status: 'impossible', problems: [{ kind: 'prob', text: '按现有手段几乎不可能做出来' }] });
    }
    const restartFirst = !top || !(top.total < sol.exit * (1 - 1e-9));
    const best = restartFirst ? null : top;
    const pack = (o) => ({
      action: o.act.action, name: R.actionName(o.act.action, item), cost: o.act.cost, total: o.total,
      pHit: o.act.trans.filter((t) => t.hit != null && t.lose == null).reduce((n, t) => n + t.p, 0),
      pLose: o.act.trans.filter((t) => t.lose != null).reduce((n, t) => n + t.p, 0),
      outcomes: describe(model, sol, i0, o.act),
    });
    /* 理想路线：每一步都走「出了目标」里最可能的那支。
     * 「换白底」也可能就是最优策略，那种情况从 freshId 再走一遍，给玩家一条换底子之后的路线。 */
    function walk(start, firstAct) {
      const out = [];
      let cur = start;
      const seen = new Set();
      while (cur !== undefined && !G.done[cur] && out.length < 12 && !seen.has(cur)) {
        seen.add(cur);
        let act = null;
        if (cur === start && firstAct) act = firstAct;
        else if (pol[cur] >= 0) {
          const want = policyAction(sol, cur);
          act = actionsFor(model, G.states[cur]).find((a) => a.action === want) || null;
        }
        if (!act) break;
        let pick = -1;
        let bestP = -1;
        act.trans.forEach((t, j) => {
          const id = G.index.get(keyOf(t.s));
          const good = t.hit != null && t.lose == null;
          const score = (good ? 10 : 0) + t.p;
          if (id !== cur && score > bestP) { bestP = score; pick = j; }
        });
        if (pick < 0) break;
        const t = act.trans[pick];
        out.push({ action: act.action, name: R.actionName(act.action, item), cost: act.cost, p: t.p, hit: t.hit != null ? targetName(model, t.hit) : null });
        cur = G.index.get(keyOf(t.s));
      }
      return out;
    }
    const route = walk(i0, best ? best.act : null);
    const freshRoute = restartFirst && G.freshId >= 0 ? walk(G.freshId, null) : null;
    /* 换底子是最优时的对照：这件上最省的做法要多少钱（action 留给界面翻译成文字） */
    const keepBest = restartFirst && top ? { action: top.act.action, name: R.actionName(top.act.action, item), cost: top.act.cost, total: top.total } : null;
    const pAttempt = sol.canRestart ? 1 - sol.X[G.freshId] : null;
    const costObj = costOf(model, sol, opts.runs || 1500, i0, value);
    /* 最后一道防线：期望花费必须是有限正数。
     * 价格层已经有闸（rules.js 的 priceOf / prices.js 的 positive），但求解是线性的，
     * 一旦有价格漏进来，期望值会变成负数或 NaN 直接显示给玩家（实测能到 -3.2e9）。
     * 与其显示一个荒谬的数字，不如明确说「按现有价格算不出来」，并把原因告诉界面。 */
    if (!Number.isFinite(costObj.mean) || costObj.mean < 0) {
      return Object.assign(head, {
        status: 'impossible',
        problems: [{ kind: 'prob', text: '按现在的价格算不出一个可信的花费（价格表里可能有异常值）。去「设置 → 价格」检查一下价格。' }],
      });
    }
    return Object.assign(head, {
      status: 'ok',
      cost: costObj,
      next: restartFirst ? { restart: true, name: '换一个底子重来', cost: model.basePrice, total: sol.exit } : pack(best),
      alternatives: options.filter((o) => o !== best).slice(0, 6).map(pack),
      route,
      freshRoute,
      keepBest,
      perBase: sol.canRestart ? { pSuccess: pAttempt, bases: pAttempt > 0 ? 1 / pAttempt : Infinity, freshCost: G.freshValue } : null,
      states: G.states.length, converged: sol.converged, truncated: G.truncated, cached,
    });
  }

  /* 哪条目标最贵：逐条放宽一档 / 去掉，看期望花费降多少。
   * 这一步要解 n+1 个完整子问题（6 条目标要 6 秒以上），所以：
   *   · 基准解直接复用上一次的缓存（同一组目标刚刚解过）；
   *   · 每开始一条目标就报告一次进度，界面可以显示「第几条」并允许取消。 */
  function sensitivity(item, targets, opts) {
    opts = opts || {};
    const limit = targets.length;
    const report = (i) => { if (typeof opts.progress === 'function') { try { opts.progress(i, limit); } catch (e) { /* 进度而已，别影响计算 */ } } };
    /* 界面手上已经有同一组目标的解了，直接把平均花费传进来，省掉一次完整求解 */
    const base = opts.baseMean > 0 ? { status: 'ok', cost: { mean: opts.baseMean } } : plan(item, targets, Object.assign({}, opts, { runs: 1 }));
    if (base.status !== 'ok') return [];
    const b = R.baseOf(item);
    return targets.map((t, i) => {
      report(i);
      const out = { index: i, mean: base.cost.mean };
      const others = targets.filter((x, j) => j !== i);
      if (others.length) {
        const p = plan(item, others, Object.assign({}, opts, { runs: 1, noCache: true }));
        if (p.status === 'ok' || p.status === 'done') out.without = p.status === 'done' ? 0 : p.cost.mean;
      }
      const tiers = t.row ? 0 : R.ladder(b, t.type, t.pool).length;
      if (t.tier && t.tier < tiers) {
        const relaxed = targets.map((x, j) => (j === i ? Object.assign({}, x, { tier: x.tier + 1 }) : x));
        const p = plan(item, relaxed, Object.assign({}, opts, { runs: 1, noCache: true }));
        if (p.status === 'ok' || p.status === 'done') out.relaxed = p.status === 'done' ? 0 : p.cost.mean;
      }
      return out;
    });
  }

  const api = { plan, sensitivity, buildModel, solve, clearCache, actionAt, pickReveal, stateKey: (model, item) => keyOf(abstractItem(model, item, false).state), _internal: { addOne, removeDist, actionsFor, keyOf, poolStats, revealStats, enumerate } };
  global.CraftSolver = api;
  return api;
  };
  const api = factory(root);
  (root.CraftSource = root.CraftSource || {}).solver = factory;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
