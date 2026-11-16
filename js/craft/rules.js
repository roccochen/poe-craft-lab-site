/* 流放 2 做装台 · 规则引擎（游戏版本 0.5.5）
 *
 * 只描述「游戏里这一步会发生什么」。每条规则的出处写在 docs/history/ 的设计文档里；
 * 游戏没有公开数字的地方用 ESTIMATES 标出来，界面据此显示「估算」。
 *
 * 词缀模型：
 *   行（row）   = 游戏 Mods 表的一行，带等级门槛和数值区间
 *   类型（type）= 玩家说的「一条词缀」；它在某底子上能出的行按等级从高到低就是 T1、T2…
 *   家族（fam） = 互斥组；物品上已有同家族词缀时，这个家族不会再出现
 */
(function (root) {
  /* 整个模块包在 factory 里：页面直接调用它；离线双击打开（file://）时浏览器不许从文件建后台线程，
   * 界面就把 factory 的源码拼成一段脚本塞进后台线程，所以这里面不能引用 factory 之外的变量。 */
  const factory = function (global) {
  'use strict';

  const req = (name, file) => global[name] || (typeof require !== 'undefined' ? require(file) : null);
  const DB = req('CRAFT_BASES', './data.bases.js');
  const DM = req('CRAFT_MODS', './data.mods.js');
  const DX = req('CRAFT_MISC', './data.misc.js');
  const DZ = req('CRAFT_ZH', './data.zh.js') || { templates: [] };

  /* 游戏未公开、只能假设的部分。界面读这张表给对应数字打「估算」标。 */
  const ESTIMATES = {
    weights: '词缀权重：客户端只有 0/1，真实权重未公开，这里按每档等权计算',
    sideModel: '加词缀时前后缀合并成一个池按权重抽；游戏未公开是否先选侧',
    vaal: '瓦尔宝珠四种结果按等概率计算',
    quality: '品质单次增量随物品等级递减，具体数值为估计',
    reveal: '亵渎揭露的三个选项按「常规池 + 深渊专属池」等权抽取',
    desecrateSide: '亵渎词缀落在哪一侧按两侧可用词缀数量加权',
  };

  /* ------------------------------------------------------------------ 索引 */
  const baseById = new Map(DB.bases.map((b) => [b.id, b]));
  const rowById = new Map(DM.rows.map((r) => [r.id, r]));
  const essenceById = new Map(DX.essences.map((e) => [e.id, e]));
  const augmentById = new Map(DX.augments.map((a) => [a.id, a]));
  const tagSetCache = new Map();
  function tagSet(base) {
    let s = tagSetCache.get(base.id);
    if (!s) { s = new Set(base.tags); tagSetCache.set(base.id, s); }
    return s;
  }
  let weightOverride = null;        // { rowId | 'type:<type>': number }
  function setWeights(map) { weightOverride = map || null; ladderCache.clear(); eligibleCache.clear(); }

  /* 部位权重：按顺序取第一个物品拥有的标签（不是取最大值） */
  function weight(row, base) {
    const tags = tagSet(base);
    let w = 0;
    for (const pair of DM.tagsets[row.sw]) {
      if (tags.has(pair[0])) { w = pair[1]; break; }
    }
    if (w > 0 && weightOverride) {
      const o = weightOverride[row.id] != null ? weightOverride[row.id] : weightOverride['type:' + row.type];
      if (o != null) return Number(o) || 0;
    }
    return w;
  }

  const isJewel = (base) => base.slot === 'jewel';
  const explicitPool = (base) => (isJewel(base) ? 'j' : 'i');

  /* 这个底子上能随机掉的所有行（不看物品等级），按池分开 */
  const eligibleCache = new Map();
  function eligibleRows(base, pool) {
    const key = base.id + '|' + pool;
    let list = eligibleCache.get(key);
    if (!list) {
      list = DM.rows.filter((r) => r.pool === pool && weight(r, base) > 0);
      eligibleCache.set(key, list);
    }
    return list;
  }
  /* 档位阶梯：同一类型在这个底子上的行，等级从高到低，下标 + 1 就是 T 几 */
  const ladderCache = new Map();
  function ladder(base, type, pool) {
    const p = pool || explicitPool(base);
    const key = base.id + '|' + p + '|' + type;
    let list = ladderCache.get(key);
    if (!list) {
      list = eligibleRows(base, p).filter((r) => r.type === type).sort((a, b) => b.lvl - a.lvl || (a.id < b.id ? -1 : 1));
      ladderCache.set(key, list);
    }
    return list;
  }
  function tierOf(base, row) {
    if (!row) return null;
    const i = ladder(base, row.type, row.pool).indexOf(row);
    return i < 0 ? null : i + 1;
  }
  /* 目标选择用：这个底子能出的词缀类型清单 */
  function typesFor(base, opts) {
    opts = opts || {};
    const pools = opts.pools || [explicitPool(base)];
    const seen = new Map();
    for (const pool of pools) {
      for (const r of eligibleRows(base, pool)) {
        const key = pool + '|' + r.type;
        if (!seen.has(key)) seen.set(key, { type: r.type, pool, gen: r.gen, fam: r.fam, tags: r.tags, rows: ladder(base, r.type, pool) });
      }
    }
    const ilvl = opts.ilvl || 100;
    return [...seen.values()].map((t) => Object.assign(t, {
      best: t.rows.find((r) => r.lvl <= ilvl) || null,   // 该物品等级下能出的最高档
    }));
  }

  /* ------------------------------------------------------------------ 物品 */
  function socketCap(base) {
    if (base.fixedSockets) return base.fixedSockets;
    if (['ring', 'amulet', 'belt', 'quiver', 'jewel'].indexOf(base.slot) !== -1) return 0;
    if (base.slot === 'body') return 2;
    if (base.slot === 'weapon' && tagSet(base).has('twohand')) return 2;
    return 1;
  }
  function newItem(baseId, opts) {
    opts = opts || {};
    const base = baseById.get(baseId);
    if (!base) throw new Error('未知底子：' + baseId);
    return {
      base: base.id,
      ilvl: Math.max(1, Math.min(100, Number(opts.ilvl) || 82)),
      rarity: 'normal',
      affixes: [],
      quality: 0,
      sockets: Math.min(socketCap(base), Number(opts.sockets) || 0),
      augments: [],
      corrupted: false,
      enchant: null,
    };
  }
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const baseOf = (item) => baseById.get(item.base);
  function caps(item, rarity) {
    const r = rarity || item.rarity;
    if (r === 'magic') return { p: 1, s: 1 };
    if (r === 'rare') {
      const base = baseOf(item);
      const n = isJewel(base) ? 2 : 3;
      const m = base.capMod || { p: 0, s: 0 };   // 个别底子的固有词缀会增减前后缀上限
      return { p: Math.max(0, n + m.p), s: Math.max(0, n + m.s) };
    }
    return { p: 0, s: 0 };
  }
  const count = (item, gen) => item.affixes.filter((a) => a.gen === gen).length;
  function openSides(item, rarity) {
    const c = caps(item, rarity);
    return ['p', 's'].filter((g) => count(item, g) < c[g]);
  }
  function families(item, except) {
    const set = new Set();
    for (const a of item.affixes) if (a !== except) for (const f of a.fam || []) set.add(f);
    return set;
  }
  const removable = (item) => item.affixes.filter((a) => !a.fractured);

  /* ------------------------------------------------------------------ 随机 */
  function makeRng(seed) {
    let s = (seed >>> 0) || 0x9e3779b9;
    return function () {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s;
      t = Math.imul(t ^ (t >>> 15), t | 1);
      t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const pickIndex = (rng, n) => Math.min(n - 1, Math.floor(rng() * n));
  function pickWeighted(rng, list) {
    let total = 0;
    for (const x of list) total += x.p;
    let r = rng() * total;
    for (const x of list) { r -= x.p; if (r <= 0) return x; }
    return list[list.length - 1];
  }
  /* 数值按文本的小数位取：整数词缀永远掷出整数 */
  function rollValues(row, rng) {
    return row.v.map(([lo, hi, dec]) => {
      const k = Math.pow(10, dec || 0);
      const a = Math.round(lo * k);
      const b = Math.round(hi * k);
      const mn = Math.min(a, b);
      const mx = Math.max(a, b);
      return (mn + Math.floor(rng() * (mx - mn + 1))) / k;
    });
  }
  function makeAffix(row, rng, extra) {
    return Object.assign({
      row: row.id, type: row.type, fam: row.fam.slice(), gen: row.gen, lvl: row.lvl,
      tags: row.tags.slice(), values: rollValues(row, rng),
    }, extra || {});
  }

  /* ------------------------------------------------------------------ 加词缀的池子
   * opts.gen     只加某一侧（左右旋预兆）
   * opts.minLvl  高阶 / 完美通货的最低词缀等级。规则原文：某个类型若因此一档都不剩，
   *              仍保留它在该物品等级下的最高档。
   * opts.rarity  加完之后的稀有度（富豪、精华会先升稀有）
   * opts.tagAny  只要带这些标签之一的行（同质预兆） */
  function addPool(item, opts) {
    opts = opts || {};
    const base = baseOf(item);
    const fams = families(item);
    const open = openSides(item, opts.rarity).filter((g) => !opts.gen || g === opts.gen);
    if (!open.length) return [];
    const byType = new Map();
    for (const r of eligibleRows(base, opts.pool || explicitPool(base))) {
      if (r.lvl > item.ilvl) continue;
      if (open.indexOf(r.gen) === -1) continue;
      if (r.fam.some((f) => fams.has(f))) continue;
      if (opts.tagAny && !r.tags.some((t) => opts.tagAny.has(t))) continue;
      let list = byType.get(r.type);
      if (!list) { list = []; byType.set(r.type, list); }
      list.push(r);
    }
    const out = [];
    const min = Number(opts.minLvl) || 0;
    for (const list of byType.values()) {
      let keep = min ? list.filter((r) => r.lvl >= min) : list;
      if (!keep.length) {
        let top = list[0];
        for (const r of list) if (r.lvl > top.lvl) top = r;
        keep = [top];
      }
      for (const r of keep) out.push({ row: r, w: weight(r, base) });
    }
    return out;
  }
  let sideModel = 'pooled';   // 'pooled' 合并池 | 'sideFirst' 先 50/50 选侧
  function setSideModel(m) { sideModel = m === 'sideFirst' ? 'sideFirst' : 'pooled'; }
  /* 一次「加一条」的完整分布：[{ row, p }] */
  function addDist(item, opts) {
    const pool = addPool(item, opts);
    if (!pool.length) return [];
    if (sideModel === 'sideFirst' && !(opts && opts.gen)) {
      const bySide = { p: [], s: [] };
      for (const x of pool) bySide[x.row.gen].push(x);
      const sides = ['p', 's'].filter((g) => bySide[g].length);
      const out = [];
      for (const g of sides) {
        const tot = bySide[g].reduce((n, x) => n + x.w, 0);
        for (const x of bySide[g]) out.push({ row: x.row, p: x.w / tot / sides.length });
      }
      return out;
    }
    const total = pool.reduce((n, x) => n + x.w, 0);
    return pool.map((x) => ({ row: x.row, p: x.w / total }));
  }
  function addRandom(item, rng, opts, extra) {
    const dist = addDist(item, opts);
    if (!dist.length) return null;
    const aff = makeAffix(pickWeighted(rng, dist).row, rng, extra);
    item.affixes.push(aff);
    return aff;
  }

  /* ------------------------------------------------------------------ 通货定义 */
  const CUR = {
    transmute: { zh: '蜕变石', kind: 'transmute', min: 0 },
    transmute_greater: { zh: '高阶蜕变石', kind: 'transmute', min: 44 },
    transmute_perfect: { zh: '完美蜕变石', kind: 'transmute', min: 70 },
    augment: { zh: '增幅石', kind: 'augment', min: 0 },
    augment_greater: { zh: '高阶增幅石', kind: 'augment', min: 44 },
    augment_perfect: { zh: '完美增幅石', kind: 'augment', min: 70 },
    regal: { zh: '富豪石', kind: 'regal', min: 0 },
    regal_greater: { zh: '高阶富豪石', kind: 'regal', min: 35 },
    regal_perfect: { zh: '完美富豪石', kind: 'regal', min: 50 },
    exalt: { zh: '崇高石', kind: 'exalt', min: 0 },
    exalt_greater: { zh: '高阶崇高石', kind: 'exalt', min: 35 },
    exalt_perfect: { zh: '完美崇高石', kind: 'exalt', min: 50 },
    chaos: { zh: '混沌石', kind: 'chaos', min: 0 },
    chaos_greater: { zh: '高阶混沌石', kind: 'chaos', min: 35 },
    chaos_perfect: { zh: '完美混沌石', kind: 'chaos', min: 50 },
    alchemy: { zh: '点金石', kind: 'alchemy' },
    annul: { zh: '剥离石', kind: 'annul' },
    divine: { zh: '神圣石', kind: 'divine' },
    vaal: { zh: '瓦尔宝珠', kind: 'vaal' },
    fracture: { zh: '破裂石', kind: 'fracture' },
    artificer: { zh: '工匠石', kind: 'artificer' },
    whetstone: { zh: '磨刀石', kind: 'quality' },
    scrap: { zh: '护甲片', kind: 'quality' },
    etcher: { zh: '奥术蚀刻器', kind: 'quality' },
    bone_gnawed: { zh: '啃噬之骨', kind: 'desecrate', maxIlvl: 64 },
    bone_preserved: { zh: '保存之骨', kind: 'desecrate' },
    bone_ancient: { zh: '远古之骨', kind: 'desecrate', min: 40 },
    reveal: { zh: '灵魂之井揭露', kind: 'reveal' },
  };
  /* 骨头按部位分四种，名字随物品变；规则相同 */
  function boneName(base, cur) {
    const part = base.slot === 'weapon' || base.slot === 'quiver' ? '颚骨'
      : base.slot === 'jewel' ? '颅骨'
        : ['ring', 'amulet', 'belt'].indexOf(base.slot) !== -1 ? '锁骨' : '肋骨';
    return ({ bone_gnawed: '啃噬', bone_preserved: '保存', bone_ancient: '远古' })[cur] + part;
  }

  /* 预兆：on = 作用于哪类操作；legacy = 已停止掉落，只有存量 */
  const OMEN = {
    omen_sinistral_exalt: { on: 'exalt', side: 'p' },
    omen_dextral_exalt: { on: 'exalt', side: 's' },
    omen_greater_exalt: { on: 'exalt', two: true },
    omen_homogenising_exalt: { on: 'exalt', homog: true, legacy: true },
    omen_sinistral_coronation: { on: 'regal', side: 'p', legacy: true },
    omen_dextral_coronation: { on: 'regal', side: 's', legacy: true },
    omen_homogenising_coronation: { on: 'regal', homog: true, legacy: true },
    omen_whittling: { on: 'chaos', lowest: true },
    omen_sinistral_erasure: { on: 'chaos', side: 'p' },
    omen_dextral_erasure: { on: 'chaos', side: 's' },
    omen_sinistral_annulment: { on: 'annul', side: 'p' },
    omen_dextral_annulment: { on: 'annul', side: 's' },
    omen_greater_annulment: { on: 'annul', two: true, legacy: true },
    omen_light: { on: 'annul', desecratedOnly: true },
    omen_sinistral_alchemy: { on: 'alchemy', side: 'p', legacy: true },
    omen_dextral_alchemy: { on: 'alchemy', side: 's', legacy: true },
    omen_sinistral_crystallisation: { on: 'essence', side: 'p' },
    omen_dextral_crystallisation: { on: 'essence', side: 's' },
    omen_sinistral_necromancy: { on: 'desecrate', side: 'p' },
    omen_dextral_necromancy: { on: 'desecrate', side: 's' },
    omen_the_sovereign: { on: 'desecrate', lord: 'Ulaman' },
    omen_the_liege: { on: 'desecrate', lord: 'Amanamu' },
    omen_the_blackblooded: { on: 'desecrate', lord: 'Kurgal' },
    omen_abyssal_echoes: { on: 'reveal', reroll: true },
    omen_corruption: { on: 'vaal', alwaysChange: true, legacy: true },
  };
  const omenZh = new Map(DX.omens.map((o) => [o.id, o.zh]));
  function actionKind(action) {
    if (action.essence) return 'essence';
    if (action.rune) return 'rune';
    return CUR[action.cur] ? CUR[action.cur].kind : null;
  }
  /* 同一次操作上的预兆是否能叠在一起：必须都作用于这类操作，且不互相矛盾 */
  function omenConflict(action) {
    const kind = actionKind(action);
    const list = (action.omens || []).map((id) => [id, OMEN[id]]);
    for (const [id, o] of list) {
      if (!o) return '预兆「' + (omenZh.get(id) || id) + '」尚未建模';
      if (o.on !== kind) return '预兆「' + (omenZh.get(id) || id) + '」不作用于这种通货';
    }
    const sides = list.filter(([, o]) => o.side).length;
    if (sides > 1) return '左旋和右旋预兆不能同时生效';
    if (new Set(list.map(([id]) => id)).size !== list.length) return '同一个预兆不能叠两次';
    if (list.some(([, o]) => o.lowest) && sides) return '削切预兆不能和抹除预兆一起用';
    return null;
  }
  function omenFlags(action) {
    const f = {};
    for (const id of action.omens || []) Object.assign(f, OMEN[id] || {});
    delete f.on; delete f.legacy;
    return f;
  }

  /* ------------------------------------------------------------------ 精华 */
  function essenceEffect(item, ess) {
    const base = baseOf(item);
    const fits = ess.effects.filter((e) => e.slots.indexOf(base.slot) !== -1);
    if (base.slot !== 'weapon') return fits[0] || null;
    const legacyCls = LEGACY_WCLS[base.wcls] || base.wcls;
    return fits.find((e) => !e.weapons.length || e.weapons.indexOf(legacyCls) !== -1) || null;
  }
  /* 旧精华数据里的武器类别写法 */
  const LEGACY_WCLS = {
    sword1: 'sword', sword2: 'two_hand_sword', axe1: 'axe', axe2: 'two_hand_axe',
    mace1: 'mace', mace2: 'two_hand_mace',
  };
  function essenceAffix(ess, eff, rng) {
    const row = eff.row ? rowById.get(eff.row) : null;
    if (row) return makeAffix(row, rng, { essence: ess.id });
    const fake = { v: eff.v };
    return {
      row: null, type: 'essence:' + ess.id, fam: ['essence:' + ess.id], gen: eff.gen, lvl: 1, tags: [],
      values: rollValues(fake, rng), essence: ess.id, tpl: eff.tpl, zh: eff.zh,
    };
  }
  const isRemovingEssence = (ess) => ess.perfect || ess.tier >= 4;
  /* 完美 / 腐化精华「随机移除一条」的候选：保底那一侧已满时只能从同侧删 */
  function essenceVictims(item, eff, side) {
    let pool = removable(item);
    if (side) pool = pool.filter((a) => a.gen === side);
    if (count(item, eff.gen) >= caps(item, 'rare')[eff.gen]) pool = pool.filter((a) => a.gen === eff.gen);
    return pool;
  }

  /* ------------------------------------------------------------------ 亵渎 */
  const lordOf = (row) => (/Ulaman|Amanamu|Kurgal/.exec(row.name) || [null])[0];
  const hasDesecrated = (item) => item.affixes.some((a) => a.desecrated);
  function desecratedRows(item, gen, minLvl) {
    const base = baseOf(item);
    const fams = families(item, item.affixes.find((a) => a.unrevealed));
    return eligibleRows(base, 'x').filter((r) => r.gen === gen && r.lvl <= item.ilvl
      && (!minLvl || r.lvl >= minLvl) && !r.fam.some((f) => fams.has(f)));
  }
  /* 揭露时的候选池：深渊专属 + 这一侧的常规词缀 */
  function revealPool(item) {
    const slot = item.affixes.find((a) => a.unrevealed);
    if (!slot) return null;
    const exclusive = desecratedRows(item, slot.gen, slot.minLvl);
    const without = Object.assign({}, item, { affixes: item.affixes.filter((a) => a !== slot) });
    const regular = addPool(without, { gen: slot.gen, minLvl: slot.minLvl }).map((x) => x.row);
    return { slot, exclusive, regular };
  }
  function revealOptions(item, rng) {
    const pool = revealPool(item);
    if (!pool) return [];
    const picked = [];
    const take = (list) => {
      const left = list.filter((r) => picked.indexOf(r) === -1 && !picked.some((p) => p.type === r.type));
      if (left.length) picked.push(left[pickIndex(rng, left.length)]);
    };
    if (pool.slot.lord) take(pool.exclusive.filter((r) => lordOf(r) === pool.slot.lord));
    else if (item.ilvl >= 65) take(pool.exclusive);     // 物品等级 65+ 至少一条深渊专属
    const all = pool.exclusive.concat(pool.regular);
    let guard = 0;
    while (picked.length < 3 && guard++ < 20) take(all);
    return picked;
  }

  /* ------------------------------------------------------------------ 可用性 */
  const WEAPON_MARTIAL = (base) => base.slot === 'weapon' && ['wand', 'staff', 'sceptre'].indexOf(base.wcls) === -1;
  const WEAPON_CASTER = (base) => base.slot === 'weapon' && ['wand', 'staff', 'sceptre'].indexOf(base.wcls) !== -1;
  const IS_ARMOUR = (base) => ['helmet', 'body', 'gloves', 'boots', 'shield', 'focus'].indexOf(base.slot) !== -1;

  function available(item, action) {
    const base = baseOf(item);
    const kind = actionKind(action);
    if (!kind) return '未知操作';
    const oc = omenConflict(action);
    if (oc) return oc;
    const flags = omenFlags(action);
    if (kind === 'rune') {
      const aug = augmentById.get(action.rune);
      if (!aug) return '未知符文';
      if (!item.sockets) return '这件装备没有插槽';
      if (!augmentText(aug, base)) return '这个符文不能插在这个部位';
      const idx = action.slot == null ? item.augments.length : action.slot;
      if (idx >= item.sockets) return '没有空插槽；可以指定一个插槽覆盖（旧符文会被销毁）';
      return null;
    }
    if (item.corrupted) return '物品已腐化，不能再用通货修改';
    const cur = CUR[action.cur];
    const hasUnrevealed = item.affixes.some((a) => a.unrevealed);
    switch (kind) {
      case 'transmute': return item.rarity === 'normal' ? null : '只能用于普通（白色）物品';
      case 'augment': {
        if (item.rarity !== 'magic') return '只能用于魔法物品';
        if (item.affixes.length >= 2) return '魔法物品最多 2 条词缀';
        return addPool(item, {}).length ? null : '没有可以添加的词缀';
      }
      case 'regal': {
        if (item.rarity !== 'magic') return '只能用于魔法（蓝色）物品';
        if (flags.side && openSides(item, 'rare').indexOf(flags.side) === -1) return '预兆指定的一侧已满';
        return addPool(item, { rarity: 'rare', gen: flags.side }).length ? null : '没有可以添加的词缀';
      }
      case 'alchemy': return item.rarity === 'normal' || item.rarity === 'magic' ? null : '只能用于普通或魔法物品';
      case 'exalt': {
        if (item.rarity !== 'rare') return '只能用于稀有（黄色）物品';
        if (!openSides(item).length) return '词缀已满';
        if (flags.side && openSides(item).indexOf(flags.side) === -1) return '预兆指定的一侧已满';
        return addPool(item, { gen: flags.side }).length ? null : '没有可以添加的词缀';
      }
      case 'chaos': {
        if (item.rarity !== 'rare') return '只能用于稀有物品';
        const v = removable(item).filter((a) => !flags.side || a.gen === flags.side);
        return v.length ? null : '没有可以移除的词缀';
      }
      case 'annul': {
        if (item.rarity === 'normal') return '只能用于魔法或稀有物品';
        let v = removable(item);
        if (flags.side) v = v.filter((a) => a.gen === flags.side);
        if (flags.desecratedOnly) v = v.filter((a) => a.desecrated);
        return v.length ? null : '没有可以移除的词缀';
      }
      case 'divine': return item.affixes.some((a) => !a.fractured && !a.unrevealed) ? null : '没有可以重掷数值的词缀';
      case 'vaal': return null;
      case 'fracture': {
        if (item.rarity !== 'rare') return '只能用于稀有物品';
        if (item.affixes.some((a) => a.fractured)) return '已经有破裂词缀';
        if (item.affixes.length < 4) return '至少需要 4 条词缀';
        return item.affixes.some((a) => !a.desecrated) ? null : '没有可以破裂的词缀';
      }
      case 'artificer': {
        const cap = socketCap(base);
        if (!cap) return '这个部位不能打孔';
        return item.sockets < cap ? null : '插槽已达上限';
      }
      case 'quality': {
        const ok = action.cur === 'whetstone' ? WEAPON_MARTIAL(base)
          : action.cur === 'etcher' ? WEAPON_CASTER(base) : IS_ARMOUR(base);
        if (!ok) return ({ whetstone: '磨刀石只能用于近战 / 远程武器', etcher: '奥术蚀刻器只能用于法杖、长杖、权杖', scrap: '护甲片只能用于护甲' })[action.cur];
        return item.quality < 20 ? null : '品质已达 20% 上限';
      }
      case 'desecrate': {
        if (item.rarity !== 'rare') return '只能用于稀有物品';
        if (hasDesecrated(item)) return '已经有亵渎词缀，每件物品只能有一条';
        if (cur.maxIlvl && item.ilvl > cur.maxIlvl) return '啃噬之骨只能用于物品等级 ' + cur.maxIlvl + ' 及以下';
        if (flags.lord && ['weapon', 'ring', 'amulet', 'belt', 'quiver'].indexOf(base.slot) === -1) return '这个预兆只对武器和首饰有效';
        const sides = desecrateSides(item, flags, cur.min);
        return sides.length ? null : '没有可以亵渎的位置';
      }
      case 'reveal': return hasUnrevealed ? null : '没有待揭露的亵渎词缀';
      case 'essence': {
        const ess = essenceById.get(action.essence);
        if (!ess) return '未知精华';
        const eff = essenceEffect(item, ess);
        if (!eff) return '这种精华不能用于这个部位';
        const row = eff.row ? rowById.get(eff.row) : null;
        const clash = row && row.fam.some((f) => families(item).has(f));
        if (isRemovingEssence(ess)) {
          if (item.rarity !== 'rare') return '完美 / 腐化精华只能用于稀有物品';
          if (clash) return '物品上已有同类词缀';
          return essenceVictims(item, eff, flags.side).length ? null : '没有可以移除的词缀';
        }
        if (item.rarity !== 'magic') return '这一档精华只能用于魔法物品';
        if (clash) return '物品上已有同类词缀';
        return openSides(item, 'rare').indexOf(eff.gen) !== -1 ? null : '对应一侧已满';
      }
      default: return '未知操作';
    }
  }
  /* 亵渎可以落在哪些侧：有空位的侧；全满时任何能顶掉一条的侧 */
  function desecrateSides(item, flags, minLvl) {
    const open = openSides(item);
    const full = !open.length;
    return ['p', 's'].filter((g) => {
      if (flags.side && flags.side !== g) return false;
      if (!full && open.indexOf(g) === -1) return false;
      if (full && !removable(item).some((a) => a.gen === g)) return false;
      const rows = desecratedRows(item, g, minLvl);
      return flags.lord ? rows.some((r) => lordOf(r) === flags.lord) : true;
    });
  }

  /* ------------------------------------------------------------------ 执行 */
  function qualityGain(ilvl) {
    return ilvl <= 20 ? 5 : ilvl <= 40 ? 4 : ilvl <= 60 ? 3 : ilvl <= 74 ? 2 : 1;
  }
  function apply(item, action, rng) {
    rng = rng || Math.random;
    const kind = actionKind(action);
    const why = available(item, action);
    if (why) return { error: why, item, events: [] };
    const next = clone(item);
    const base = baseOf(next);
    const cur = CUR[action.cur] || {};
    const flags = omenFlags(action);
    const events = [];
    const removed = (a) => { next.affixes = next.affixes.filter((x) => x !== a); events.push({ t: 'remove', affix: a }); };
    const added = (a) => { if (a) events.push({ t: 'add', affix: a }); return a; };
    const homogTags = () => new Set(next.affixes.flatMap((a) => a.tags || []));

    if (action.rune) {
      const idx = action.slot == null ? next.augments.length : action.slot;
      if (next.augments[idx]) events.push({ t: 'destroy', augment: next.augments[idx] });
      next.augments[idx] = action.rune;
      return { item: next, events };
    }
    switch (kind) {
      case 'transmute':
        next.rarity = 'magic';
        added(addRandom(next, rng, { minLvl: cur.min }));
        break;
      case 'augment':
        added(addRandom(next, rng, { minLvl: cur.min }));
        break;
      case 'regal':
        next.rarity = 'rare';
        added(addRandom(next, rng, { minLvl: cur.min, gen: flags.side, tagAny: flags.homog ? homogTags() : null }));
        break;
      case 'alchemy': {
        next.rarity = 'rare';
        next.affixes.slice().forEach((a) => { if (!a.fractured) removed(a); });
        const want = 4;
        // 左右炼金预兆：先把指定一侧加满，总数仍是 4 条
        while (flags.side && next.affixes.length < want && openSides(next).indexOf(flags.side) !== -1) {
          if (!added(addRandom(next, rng, { gen: flags.side }))) break;
        }
        while (next.affixes.length < want) { if (!added(addRandom(next, rng, {}))) break; }
        break;
      }
      case 'exalt': {
        const n = flags.two ? 2 : 1;
        for (let i = 0; i < n; i++) {
          const gen = flags.side && openSides(next).indexOf(flags.side) !== -1 ? flags.side : (flags.side ? '-' : null);
          if (gen === '-') break;
          if (!added(addRandom(next, rng, { minLvl: cur.min, gen, tagAny: flags.homog ? homogTags() : null }))) break;
        }
        break;
      }
      case 'chaos': {
        let v = removable(next).filter((a) => !flags.side || a.gen === flags.side);
        if (flags.lowest) {
          const min = Math.min.apply(null, v.map((a) => a.lvl));
          v = v.filter((a) => a.lvl === min);
        }
        removed(v[pickIndex(rng, v.length)]);
        added(addRandom(next, rng, { minLvl: cur.min }));
        break;
      }
      case 'annul': {
        const n = flags.two ? 2 : 1;
        for (let i = 0; i < n; i++) {
          let v = removable(next);
          if (flags.side) v = v.filter((a) => a.gen === flags.side);
          if (flags.desecratedOnly) v = v.filter((a) => a.desecrated);
          if (!v.length) break;
          removed(v[pickIndex(rng, v.length)]);
        }
        if (!next.affixes.length) next.rarity = 'normal';
        break;
      }
      case 'divine':
        next.affixes.forEach((a) => {
          const row = a.row && rowById.get(a.row);
          if (row && !a.fractured && !a.unrevealed) a.values = rollValues(row, rng);
        });
        events.push({ t: 'reroll' });
        break;
      case 'fracture': {
        const v = next.affixes.filter((a) => !a.desecrated);
        const a = v[pickIndex(rng, v.length)];
        a.fractured = true;
        events.push({ t: 'fracture', affix: a });
        break;
      }
      case 'artificer': next.sockets += 1; events.push({ t: 'socket' }); break;
      case 'quality': next.quality = Math.min(20, next.quality + qualityGain(next.ilvl)); events.push({ t: 'quality' }); break;
      case 'vaal': {
        next.corrupted = true;
        const outcomes = ['none', 'reroll', 'enchant', 'socket'];
        let o = outcomes[pickIndex(rng, 4)];
        const canSocket = socketCap(base) > 0;
        if (flags.alwaysChange && canSocket) while (o === 'none') o = outcomes[pickIndex(rng, 4)];
        if (o === 'socket' && !canSocket) o = 'none';
        if (o === 'reroll') {
          const v = removable(next);
          const n = Math.min(v.length, 1 + pickIndex(rng, 3));
          for (let i = 0; i < n; i++) { const list = removable(next); removed(list[pickIndex(rng, list.length)]); }
          for (let i = 0; i < n; i++) if (!added(addRandom(next, rng, {}))) break;
          if (!n) o = 'none';
        } else if (o === 'enchant') {
          const rows = eligibleRows(base, 'c').filter((r) => r.lvl <= next.ilvl);
          if (rows.length) {
            const row = rows[pickIndex(rng, rows.length)];
            next.enchant = { row: row.id, values: rollValues(row, rng) };
          } else o = 'none';
        } else if (o === 'socket') next.sockets += 1;   // 腐化加孔无视上限
        events.push({ t: 'vaal', outcome: o });
        break;
      }
      case 'desecrate': {
        const sides = desecrateSides(next, flags, cur.min);
        const wts = sides.map((g) => ({ g, p: Math.max(1, desecratedRows(next, g, cur.min).length) }));
        const gen = pickWeighted(rng, wts).g;
        if (openSides(next).indexOf(gen) === -1) {
          const v = removable(next).filter((a) => a.gen === gen);
          removed(v[pickIndex(rng, v.length)]);
        }
        const slot = { row: null, type: null, fam: [], gen, lvl: 0, tags: [], values: [], desecrated: true, unrevealed: true, minLvl: cur.min || 0, lord: flags.lord || null };
        next.affixes.push(slot);
        added(slot);
        break;
      }
      case 'reveal': {
        const slot = next.affixes.find((a) => a.unrevealed);
        const row = rowById.get(action.pick);
        if (!row || row.gen !== slot.gen) return { error: '请选择一条揭露出来的词缀', item, events: [] };
        Object.assign(slot, makeAffix(row, rng, { desecrated: true }), { unrevealed: false });
        if (action.values) slot.values = action.values.slice();
        delete slot.minLvl; delete slot.lord;
        events.push({ t: 'reveal', affix: slot });
        break;
      }
      case 'essence': {
        const ess = essenceById.get(action.essence);
        const eff = essenceEffect(next, ess);
        if (isRemovingEssence(ess)) {
          const v = essenceVictims(next, eff, flags.side);
          removed(v[pickIndex(rng, v.length)]);
        }
        next.rarity = 'rare';
        const aff = essenceAffix(ess, eff, rng);
        next.affixes.push(aff);
        added(aff);
        break;
      }
      default: return { error: '未知操作', item, events: [] };
    }
    return { item: next, events };
  }

  /* ------------------------------------------------------------------ 目标
   * target = { type, tier? }　tier 是这个底子上可接受的最低档（T 数字，1 最好）
   *          或 { row } 指定某一行（精华保底、亵渎专属词缀） */
  function targetAccepts(base, target, affix) {
    if (!affix || affix.unrevealed) return false;
    if (target.row) return affix.row === target.row;
    if (affix.type !== target.type) return false;
    if (!target.tier) return true;
    const rows = ladder(base, target.type, target.pool);
    const floor = rows[Math.min(rows.length, target.tier) - 1];
    return floor ? affix.lvl >= floor.lvl : true;
  }
  function evaluate(item, targets) {
    const base = baseOf(item);
    const hits = (targets || []).map((t) => item.affixes.find((a) => targetAccepts(base, t, a)) || null);
    return { hits, matched: hits.filter(Boolean).length, total: hits.length, done: hits.length > 0 && hits.every(Boolean) };
  }

  /* ------------------------------------------------------------------ 文本 */
  function fill(tpl, values) {
    return String(tpl).replace(/\{(\d+)\}/g, (m, i) => (values && values[i] != null ? String(values[i]) : m));
  }
  function rowTemplate(row, lang) {
    if (lang !== 'en' && DZ.templates[row.t]) return lang === 'zhs' && global.CraftT2S ? global.CraftT2S(DZ.templates[row.t]) : DZ.templates[row.t];
    return DM.templates[row.t];
  }
  /* 档位的数值范围文本，如 "+(150–174) 最大生命" */
  function rowText(row, lang) {
    return fill(rowTemplate(row, lang), row.v.map((x) => (x[0] === x[1] ? String(x[0]) : '(' + x[0] + '–' + x[1] + ')')));
  }
  function affixText(affix, lang) {
    if (affix.unrevealed) return lang === 'en' ? 'Unrevealed Desecrated Modifier' : '未揭露的亵渎词缀';
    const row = affix.row && rowById.get(affix.row);
    if (row) return fill(rowTemplate(row, lang), affix.values);
    if (affix.tpl) return fill(lang !== 'en' && affix.zh ? affix.zh : affix.tpl, affix.values);
    return affix.text || '';
  }
  function augmentText(aug, base) {
    const cls = base.cls;
    const order = [cls];
    if (base.slot === 'shield') order.push('Shield or Buckler');
    if (IS_ARMOUR(base)) order.push('Armour');
    if (base.wcls === 'mace1' || base.wcls === 'quarterstaff') order.push('One Hand Mace or Quarterstaff');
    if (base.wcls === 'mace1' || base.wcls === 'mace2' || base.wcls === 'talisman') order.push('Maces or Talisman');
    if (base.wcls === 'quarterstaff') order.push('Quarterstaff', 'Quarterstaff or Spear');
    if (base.wcls === 'spear') order.push('Quarterstaff or Spear', 'Crossbow Bow or Spear');
    if (base.wcls === 'bow' || base.wcls === 'crossbow') order.push('Crossbow Bow or Spear');
    if (base.wcls === 'wand' || base.wcls === 'staff') order.push('Wand or Staff', 'Caster Weapon', 'Martial Weapon Wand or Staff', 'Martial Or Caster Weapon');
    if (base.wcls === 'sceptre') order.push('Caster Weapon', 'Martial Or Caster Weapon');
    if (WEAPON_MARTIAL(base)) order.push('Martial Weapon', 'Martial Weapon Wand or Staff', 'Martial Or Caster Weapon');
    if (socketCap(base)) order.push('All');
    for (const name of order) {
      const hit = aug.cats.find((c) => c.cat === name);
      if (hit) return hit;
    }
    return null;
  }

  /* ------------------------------------------------------------------ 价格（单位：崇高石；默认值是大概行情，只影响「哪条路更省」，界面里可以改） */
  const DEFAULT_PRICES = {
    transmute: 0.05, transmute_greater: 0.3, transmute_perfect: 2,
    augment: 0.05, augment_greater: 0.3, augment_perfect: 2,
    regal: 0.3, regal_greater: 2, regal_perfect: 12,
    exalt: 1, exalt_greater: 6, exalt_perfect: 40,
    chaos: 3, chaos_greater: 12, chaos_perfect: 60,
    alchemy: 0.3, annul: 25, divine: 120, vaal: 2, fracture: 400, artificer: 0.5,
    whetstone: 0.1, scrap: 0.1, etcher: 0.2,
    bone_gnawed: 2, bone_preserved: 10, bone_ancient: 60, reveal: 0,
    omen_sinistral_exalt: 60, omen_dextral_exalt: 60, omen_greater_exalt: 90, omen_homogenising_exalt: 400,
    omen_sinistral_coronation: 60, omen_dextral_coronation: 60, omen_homogenising_coronation: 300,
    omen_whittling: 250, omen_sinistral_erasure: 120, omen_dextral_erasure: 120,
    omen_sinistral_annulment: 150, omen_dextral_annulment: 150, omen_greater_annulment: 200, omen_light: 300,
    omen_sinistral_alchemy: 10, omen_dextral_alchemy: 10,
    omen_sinistral_crystallisation: 80, omen_dextral_crystallisation: 80,
    omen_sinistral_necromancy: 60, omen_dextral_necromancy: 60,
    omen_the_sovereign: 40, omen_the_liege: 40, omen_the_blackblooded: 40,
    omen_abyssal_echoes: 300, omen_corruption: 30,
    essenceTier: [0.5, 1.5, 6, 40, 60],   // 次级 / 普通 / 高阶 / 完美 / 腐化
    base: 0,
  };
  function cost(action, prices) {
    const p = Object.assign({}, DEFAULT_PRICES, prices || {});
    let c = 0;
    if (action.essence) {
      const ess = essenceById.get(action.essence);
      c += p[action.essence] != null ? p[action.essence] : p.essenceTier[Math.min(4, (ess ? ess.tier : 1) - 1)];
    } else if (action.rune) c += p[action.rune] || 0;
    else c += p[action.cur] || 0;
    for (const id of action.omens || []) c += p[id] || 0;
    return c;
  }
  function actionName(action, item) {
    const omens = (action.omens || []).map((id) => omenZh.get(id) || id);
    let name;
    if (action.essence) name = (essenceById.get(action.essence) || {}).zh || action.essence;
    else if (action.rune) name = action.rune;
    else if (CUR[action.cur] && CUR[action.cur].kind === 'desecrate' && item) name = boneName(baseOf(item), action.cur);
    else name = (CUR[action.cur] || {}).zh || action.cur;
    return omens.length ? omens.join(' + ') + ' + ' + name : name;
  }

  const api = {
    ESTIMATES, CUR, OMEN, DEFAULT_PRICES,
    data: { bases: DB.bases, rows: DM.rows, essences: DX.essences, augments: DX.augments, omens: DX.omens, meta: DX.meta },
    base: (id) => baseById.get(id), row: (id) => rowById.get(id), essence: (id) => essenceById.get(id), augment: (id) => augmentById.get(id),
    weight, setWeights, eligibleRows, ladder, tierOf, typesFor, socketCap,
    newItem, clone, baseOf, caps, count, openSides, families, removable,
    makeRng, rollValues, makeAffix,
    addPool, addDist, setSideModel, sideModel: () => sideModel,
    actionKind, omenFlags, omenConflict, available, apply, cost, actionName, boneName,
    essenceEffect, essenceVictims, isRemovingEssence,
    essenceAffixFor: (item, essId, rng) => { const ess = essenceById.get(essId); return essenceAffix(ess, essenceEffect(item, ess), rng || Math.random); },
    desecratedRows, desecrateSides, revealPool, revealOptions, lordOf, hasDesecrated,
    targetAccepts, evaluate, rowText, affixText, augmentText, rowTemplate, fill, qualityGain,
  };
  global.CraftRules = api;
  return api;
  };
  const api = factory(root);
  (root.CraftSource = root.CraftSource || {}).rules = factory;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
