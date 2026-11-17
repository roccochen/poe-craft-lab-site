/* 流放之路 2 做装台 · 底子估值
 *
 * 回答玩家拿到一件掉落之后最常问的两件事：
 *   1. 这个底子有没有前途？            → profile()：天花板画像
 *   2. 同级别里它算便宜还是贵？        → compare()：拿同一组目标去比各个底子的期望花费
 *
 * 为什么「比较成本」而不是「比较市场价」：
 *   底子的市场价主要由「是不是当前版本的热门底子」决定，那是市场 / 社交事实，游戏数据里没有。
 *   但「在这上面做同样的事要花多少崇高石」是可以算准的——它就是换底子的机会成本，
 *   玩家真正关心的是这个：我的崇高石该砸在这个底子上，还是砸在旁边那个上。
 *
 * 整个模块包在 factory 里：页面直接调用；离线双击打开（file://）时浏览器不许从文件建后台线程，
 * 界面就把 factory 的源码拼成一段脚本塞进后台线程，所以这里面不能引用 factory 之外的变量。
 */
(function (root) {
  const factory = function (global) {
  'use strict';

  const R = global.CraftRules || (typeof require !== 'undefined' ? require('./rules.js') : null);
  const S = global.CraftSolver || (typeof require !== 'undefined' ? require('./solver.js') : null);

  const SIDE_NAME = { p: '前缀', s: '后缀' };
  /* 深渊专属（亵渎才拿得到）：0.5 版本里这是硬通货，值得单独说 */
  const ABYSS_POOL = 'x';

  /* ------------------------------------------------------------------ 底子画像 */

  /* 一个类型在这个底子上的最好档位（1 = T1）。
   * bestTier 是按「这个底子的阶梯」算的：阶梯最上面那行能roll到，就是 T1。 */
  function typeInfo(base, t, ilvl) {
    const rows = t.rows || [];
    const best = t.best || rows.find((r) => r.lvl <= ilvl) || null;
    const tier = best ? R.tierOf(base, best) : null;
    return {
      type: t.type,
      pool: t.pool,
      gen: t.gen,
      fam: t.fam,
      bestRow: best ? best.id : null,
      bestTier: tier,
      bestLvl: best ? best.lvl : null,
      depth: rows.length,          // 这个类型在这个底子上一共有几档
      reachable: rows.filter((r) => r.lvl <= ilvl).length,
    };
  }

  /* 天花板画像：这个底子最多能做出什么东西来 */
  function profile(base, opts) {
    const o = opts || {};
    const ilvl = o.ilvl || 100;
    if (!base) return null;
    const pool = base.slot === 'jewel' ? 'j' : 'i';

    const all = R.typesFor(base, { ilvl, pools: [pool] }).map((t) => typeInfo(base, t, ilvl));
    const abyss = R.typesFor(base, { ilvl, pools: [ABYSS_POOL] }).map((t) => typeInfo(base, t, ilvl));

    const sides = { p: [], s: [] };
    for (const t of all) {
      if (t.gen === 'p') sides.p.push(t); else if (t.gen === 's') sides.s.push(t);
    }
    /* 前后缀两侧都能出的类型：组合自由度更高，这类的底子更值钱 */
    const both = [];
    const byType = new Map();
    for (const t of all) {
      if (!byType.has(t.type)) byType.set(t.type, []);
      byType.get(t.type).push(t.gen);
    }
    for (const [type, gens] of byType) if (gens.length > 1) both.push(type);

    /* T1 覆盖：这个底子能 roll 到顶档的词缀类型 */
    const t1 = all.filter((t) => t.bestTier === 1);
    const t2 = all.filter((t) => t.bestTier === 2);
    const abyssSides = Array.from(new Set(abyss.map((t) => t.gen)));

    /* 词缀上限按「做好的黄色装备」算：白底是 0/0，没法用 */
    const probe = R.newItem(base.id, { ilvl });
    probe.rarity = 'rare';
    const cap = R.caps(probe, 'rare');
    const notes = [];
    if (t1.length === 0) notes.push('这个底子没有能出 T1 的词缀类型，做出来的东西档次有限。');
    if (both.length === 0) notes.push('每个词缀类型都只出现在一侧，能凑出来的组合比较死板。');
    if (abyss.length && abyssSides.length === 1) {
      notes.push('深渊专属词缀只出现在' + SIDE_NAME[abyssSides[0]] + '侧，亵渎落在另一侧时揭露不出专属。');
    }
    if (!abyss.length) notes.push('这个底子出不了深渊专属词缀。');
    if (base.capMod && (base.capMod.p || base.capMod.s)) {
      notes.push('固有词缀改变了词缀上限（' + (base.capMod.p ? '前缀' + (base.capMod.p > 0 ? '+' : '') + base.capMod.p : '')
        + (base.capMod.p && base.capMod.s ? '，' : '') + (base.capMod.s ? '后缀' + (base.capMod.s > 0 ? '+' : '') + base.capMod.s : '') + '），比同部位别的底子多一条位置。');
    }
    if (base.fixedSockets) notes.push('自带 ' + base.fixedSockets + ' 个插槽。');

    return {
      base: base.id,
      slot: base.slot,
      cls: base.cls,
      drop: base.drop,
      req: base.req,
      def: base.def || null,
      wpn: base.wpn || null,
      imp: base.imp || null,
      capMod: base.capMod || null,
      sockets: base.fixedSockets || 0,
      ilvl,
      types: all,
      sides: {
        p: { n: sides.p.length, t1: sides.p.filter((t) => t.bestTier === 1).length, list: sides.p },
        s: { n: sides.s.length, t1: sides.s.filter((t) => t.bestTier === 1).length, list: sides.s },
      },
      both: both,
      breadth: all.length,
      ceiling: {
        t1: t1.map((t) => t.type),
        t2: t2.map((t) => t.type),
        t1Count: t1.length,
        t1Prefix: sides.p.filter((t) => t.bestTier === 1).length,
        t1Suffix: sides.s.filter((t) => t.bestTier === 1).length,
        bothCount: both.length,
      },
      abyss: { n: abyss.length, sides: abyssSides, list: abyss },
      cap,
      notes,
    };
  }

  /* ------------------------------------------------------------------ 对照集 */

  /* 同部位（武器还要同小类）、掉落等级接近的底子，就是最有可比性的对照组。
   * 先按掉落等级找够 4 个，不够再放宽，最后不够就取全部。
   * 被评估的这个底子一定要在里面——不然就没法说它排第几。 */
  function candidates(base, opts) {
    const o = opts || {};
    const want = o.count || 6;
    const sameSlot = R.data.bases.filter((b) => b.slot === base.slot
      && (base.slot !== 'weapon' || b.wcls === base.wcls)
      && !/Verisium/.test(b.id));
    const near = sameSlot.filter((b) => b.id === base.id || Math.abs(b.drop - base.drop) <= 4);
    const pool = near.length >= 4 ? near : sameSlot.filter((b) => b.id === base.id || Math.abs(b.drop - base.drop) <= 10);
    const list = pool.length >= 3 ? pool : sameSlot.slice();
    /* 掉落等级最近的先占位，同级的按名字排，保证结果稳定 */
    const picked = list.slice().sort((a, b) => {
      const d = Math.abs(a.drop - base.drop) - Math.abs(b.drop - base.drop);
      return d || (a.name < b.name ? -1 : 1);
    }).slice(0, Math.max(want, 3));
    /* 保证被评估的底子在列：不在就把最后一个位置让给它 */
    if (!picked.some((b) => b.id === base.id)) {
      const self = sameSlot.find((b) => b.id === base.id);
      if (self) picked[picked.length - 1] = self;
    }
    return picked;
  }

  /* 自动挑一组「参考目标」。
   *
   * 难点：目标必须是同一组，否则花费没法比。但若只按被评估底子自己的天花板挑，
   * 会出现「这个底子能出能量护盾 → 别的护甲底子全都做不出」的情况，
   * 排名就退化成一个能做、三个不能比，没有意义。
   *
   * 所以目标要挑「对照组里大多数底子都能出」的类型：
   * 先看覆盖率（几个对照底子能出这个类型），再看被评估底子自己能到几档。
   * 这样比出来的是花费高低，而不是「谁家能做这类型」。
   * 玩家自己在第 2 步选了目标的话，就用玩家的那组——那才是他真正想要的。
   */
  function referenceTargets(base, prof, opts) {
    const o = opts || {};
    const want = o.refCount || 3;
    const cands = candidates(base, o);
    /* 每个对照底子能出的类型 */
    const cover = new Map();
    for (const b of cands) {
      for (const t of R.typesFor(b, { ilvl: prof.ilvl, pools: [b.slot === 'jewel' ? 'j' : 'i'] })) {
        cover.set(t.type, (cover.get(t.type) || 0) + 1);
      }
    }
    const cap = prof.cap;
    const picked = [];
    let usedP = 0, usedS = 0;
    /* 只有「大多数对照底子都能出」的类型才配当参考目标——
     * 否则会出现「这个底子能出能量护盾 → 别的护甲底子全都做不出」的退化局面。 */
    const minCover = Math.max(1, Math.ceil(cands.length / 3));
    const cands2 = prof.types.slice().sort((a, b) => {
      const ca = cover.get(a.type) || 0, cb = cover.get(b.type) || 0;
      const oka = ca >= minCover, okb = cb >= minCover;
      if (oka !== okb) return oka ? -1 : 1;        // 先要覆盖得住的
      if (a.bestTier !== b.bestTier) return a.bestTier - b.bestTier;   // 再要档位高的
      return cb - ca;
    });
    for (const side of ['p', 's']) {
      for (const t of cands2) {
        if (picked.length >= want) break;
        if (t.gen !== side) continue;
        const room = side === 'p' ? cap.p - usedP : cap.s - usedS;
        if (room <= 0) continue;
        picked.push({ type: t.type, pool: t.pool, gen: t.gen, tier: t.bestTier || 1, row: t.bestRow, name: '' });
        if (side === 'p') usedP++; else usedS++;
      }
      if (picked.length >= want) break;
    }
    return picked;
  }

  /* ------------------------------------------------------------------ 成本对照 */

  /**
   * 拿同一组目标去各个底子上试一次，比期望花费。
   * 目标是同一组，所以花费低的就是「在这上面做更省」——也就是底子本身更值钱。
   *
   * @param {object} item    当前物品（用它的底子和物品等级）
   * @param {array}  targets 目标；不给就按底子的天花板自动挑一组
   * @param {object} opts    { count, prices, allow, basePrice, runs, progress, noCache }
   */
  function compare(item, targets, opts) {
    const o = opts || {};
    if (!S || !S.plan) return null;
    const base = R.baseOf(item);
    if (!base) return null;
    const ilvl = item.ilvl || 82;

    const prof = profile(base, { ilvl });
    const refs = (targets && targets.length) ? targets : referenceTargets(base, prof, o);
    if (!refs.length) return { base: base.id, refs: [], rows: [], note: '这个底子挑不出可比较的目标' };

    const cands = candidates(base, o);
    const rows = [];
    const report = (i) => { if (typeof o.progress === 'function') { try { o.progress(i, cands.length); } catch (e) { /* 进度而已 */ } } };

    for (let i = 0; i < cands.length; i++) {
      const b = cands[i];
      report(i);
      const probe = R.newItem(b.id, { ilvl });
      probe.rarity = 'rare';
      const sub = Object.assign({}, o, { runs: o.runs || 250, noCache: false });
      delete sub.progress;
      const plan = S.plan(probe, refs, sub);
      const row = {
        base: b.id,
        name: b.name,
        drop: b.drop,
        self: b.id === base.id,
        status: plan ? plan.status : 'error',
      };
      if (plan && plan.status === 'ok' && plan.cost) {
        row.mean = plan.cost.mean;
        row.p50 = plan.cost.p50;
        row.p90 = plan.cost.p90;
        row.approx = !!plan.cost.approx;
      } else if (plan && plan.status === 'impossible') {
        row.problems = (plan.problems || []).map((p) => p.text);
      } else if (plan && plan.status === 'done') {
        row.mean = 0;    // 白底本身就满足？不太可能，留个 0 不让它排到最后
      }
      /* 这个底子自己的天花板，顺手算一下，方便排序时参考 */
      const p2 = profile(b, { ilvl });
      row.t1 = p2.ceiling.t1Count;
      row.breadth = p2.breadth;
      rows.push(row);
    }
    report(cands.length);

    /* 排序：能做得出来的按期望花费从低到高；做不出来的排在后面 */
    const ok = rows.filter((r) => r.status === 'ok' && typeof r.mean === 'number');
    const bad = rows.filter((r) => !(r.status === 'ok' && typeof r.mean === 'number'));
    ok.sort((a, b) => a.mean - b.mean);
    const ranked = ok.concat(bad);

    /* 相邻两个底子的花费如果差在求解器的估算误差以内，其实分不出高低。
     * 求解器本身是近似的（对拍偏差 1–6%），差个几个百分点就报「第 1 名」是假精确，
     * 这里按 8% 分档，同一档就说「差不多」。 */
    const SAME = 1.08;
    let group = 0;
    for (let i = 0; i < ok.length; i++) {
      if (i > 0 && ok[i].mean > ok[i - 1].mean * SAME) group++;
      ok[i].group = group + 1;
    }
    for (const r of bad) r.group = null;

    const self = rows.find((r) => r.self);
    let rank = -1;
    ranked.forEach((r, i) => { if (r.self) rank = i + 1; });

    return {
      base: base.id,
      ilvl,
      refs: refs.map((t) => ({ type: t.type, pool: t.pool, gen: t.gen, tier: t.tier, row: t.row })),
      rows: ranked,
      rank,
      group: self ? self.group : null,
      groups: group + 1,
      count: ranked.length,
      profile: prof,
    };
  }

  const api = { profile, compare, candidates, referenceTargets };
  global.CraftValuation = api;
  return api;
  };
  const api = factory(root);
  (root.CraftSource = root.CraftSource || {}).valuation = factory;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
