/* 流放之路 2 做装台 · 规则引擎 */
(function (global) {
  'use strict';

  const D = global.PoE2Data;

  /* ------------------------------------------------------------------ *
   * 随机 / 工具
   * ------------------------------------------------------------------ */
  let uidCounter = 1;
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
  const defaultRng = makeRng(Date.now() & 0xffffffff);
  const rand = (rng) => (rng || defaultRng)();
  function randInt(rng, min, max) {
    return Math.floor(rand(rng) * (max - min + 1)) + min;
  }
  function randFloat(rng, min, max) {
    return rand(rng) * (max - min) + min;
  }
  function roundVal(v) {
    if (Math.abs(v) >= 10) return Math.round(v * 10) / 10;
    return Math.round(v * 100) / 100;
  }
  function fmtNum(v) {
    if (Number.isInteger(v)) return String(v);
    const s = v.toFixed(2).replace(/0+$/, '').replace(/\.$/, '');
    return s;
  }
  function formatText(text, values) {
    // 有繁中模板时用繁中（术语按官方繁中用词，占位符顺序与英文一致）
    const map = D.zhModMap || {};
    const tpl = map[text] || text;
    return String(tpl).replace(/\{(\d+)\}/g, (m, i) => {
      const v = values[Number(i)];
      return v === undefined ? m : fmtNum(v);
    });
  }
  function weightedPick(rng, arr, weightFn) {
    let total = 0;
    const weights = arr.map((x) => {
      const w = Math.max(0, weightFn(x) || 0);
      total += w;
      return w;
    });
    if (total <= 0) return null;
    let r = rand(rng) * total;
    for (let i = 0; i < arr.length; i++) {
      r -= weights[i];
      if (r <= 0) return arr[i];
    }
    return arr[arr.length - 1];
  }
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const baseById = {};
  D.bases.forEach((b) => { baseById[b.id] = b; });
  const modById = {};
  D.mods.forEach((m) => { modById[m.id] = m; });
  const benchById = {};
  D.bench.forEach((b) => { benchById[b.id] = b; });
  const essenceById = {};
  D.essences.forEach((e) => { essenceById[e.id] = e; });
  const fossilById = {};
  D.fossils.forEach((f) => { fossilById[f.id] = f; });
  /* 精华目标（精华保底词缀）也进目标索引：读档时就要能解析，
   * 否则存档里选了精华目标会被当成未知词缀丢掉。 */
  for (const et of (D.essenceTargets || [])) modById[et.id] = et;
  const targetById = Object.assign({}, modById, benchById);

  /* 词缀组：工艺词缀有独立组名，目标匹配与新词缀落位都要用同一张表。 */
  const BENCH_GROUP = {
    bench_life: 'life', bench_life_high: 'life', bench_es: 'es_flat', bench_ar: 'ar_flat',
    bench_ev: 'ev_flat', bench_mana: 'mana_flat', bench_fire_res: 'res_fire',
    bench_cold_res: 'res_cold', bench_light_res: 'res_light', bench_chaos_res: 'res_chaos',
    bench_all_res: 'all_res', bench_attack_speed: 'attack_speed', bench_cast_speed: 'cast_speed',
    bench_crit_multi: 'crit_multi', bench_move_speed: 'move_speed', bench_accuracy: 'accuracy',
  };
  const DEF_GROUP = BENCH_GROUP;
  function groupOf(def) { return (def && (DEF_GROUP[def.id] || def.group || def.id)) || null; }

  /* ------------------------------------------------------------------ *
   * 底子 / 词缀资格
   * ------------------------------------------------------------------ */
  function getBase(baseId) { return baseById[baseId]; }
  function createItem(baseId, opts) {
    opts = opts || {};
    const base = getBase(baseId) || D.bases[0];
    const sockets = opts.sockets != null ? Number(opts.sockets) : defaultSockets(base);
    return {
      baseId: base.id,
      ilvl: Math.max(1, Math.min(100, Number(opts.ilvl) || base.ilvl)),
      influences: (opts.influences || []).slice(0, 2),
      rarity: opts.rarity || 'normal',
      affixes: opts.affixes || [],
      quality: opts.quality || 0,
      corrupted: !!opts.corrupted,
      sockets: Math.max(0, Math.min(2, sockets)),
      runes: (opts.runes || []).slice(0, 2),
      meta: { multimod: false },
    };
  }
  /* 插槽部位：PoE2 只有武器与护甲类（含盾 / 法器）能插符文，首饰和箭袋没有插槽。 */
  const RUNE_SLOTS = ['weapon', 'helmet', 'body', 'gloves', 'boots', 'shield', 'focus'];
  function defaultSockets(base) {
    if (!base) return 0;
    return RUNE_SLOTS.indexOf(base.slot) !== -1 ? 1 : 0;
  }
  function canSocket(base) { return !!base && RUNE_SLOTS.indexOf(base.slot) !== -1; }
  function baseDefenceTags(base) {
    return Object.keys(base.defence || {});
  }
  /* 底子的属性需求（str/dex/int）由防御类型推导：
   * armour→str，evasion→dex，energy shield→int，复合底子同时具备多种。 */
  const DEF_ATTR = { ar: 'str', ev: 'dex', es: 'int' };
  function baseAttrs(base) {
    const out = [];
    Object.keys(base.defence || {}).forEach((k) => { if (DEF_ATTR[k]) out.push(DEF_ATTR[k]); });
    return out;
  }
  /* 武器页面分桶 → 底子的武器类别。wiki 按「单/双手、法术倾向」分页，
   * 底子上的 weapon.class 是武器类别，这里做一次映射。 */
  const WEAPON_BUCKETS = {
    quarterstaff: ['quarterstaff'],
    crossbow: ['crossbow'],
    bow: ['bow'],
    wand: ['wand', 'wand_fire', 'wand_lightning', 'wand_chaos', 'wand_physical'],
    sceptre: ['sceptre'],
    staff: ['staff', 'staff_fire', 'staff_cold', 'staff_lightning'],
    mace: ['mace', 'two_hand_mace'],
    spear: ['spear'],
    talisman: ['talisman'],
    flail: ['mace'],
  };
  function weaponBucketsFor(base) {
    const cls = (base.weapon && base.weapon.class) || [];
    const out = [];
    cls.forEach((c) => {
      const b = WEAPON_BUCKETS[c];
      if (b) out.push(...b);
      else out.push(c);
    });
    return out;
  }

  /* 底子 → 官方 spawn weight tag。
   * wiki 的权重表用的就是这些 tag：槽位（helmet / body_armour / …）、
   * 护甲细分（str_armour / str_dex_armour / …）、武器类别（wand / mace / …）。 */
  const ARMOUR_TAG = {
    ar: 'str_armour', ev: 'dex_armour', es: 'int_armour',
    'ar,ev': 'str_dex_armour', 'ar,es': 'str_int_armour', 'ev,es': 'dex_int_armour',
    'ar,ev,es': 'str_dex_int_armour',
  };
  function baseTags(base) {
    if (!base) return [];
    // 官方 dat 数据自带真实 tag 集合（str_armour / ezomyte_basetype …），
    // 但它不含槽位 tag（helmet / ring …），因此与下面的派生 tag 合并
    const tags = new Set(Array.isArray(base.tags) ? base.tags : []);
    const slotTag = base.slot === 'body' ? 'body_armour' : base.slot;
    tags.add(slotTag);
    // 更宽的分组 tag：护甲槽位算 armour，首饰算 jewellery（权重表里两种写法都有）
    if (['helmet', 'body', 'gloves', 'boots', 'shield', 'focus'].indexOf(base.slot) !== -1) tags.add('armour');
    if (['ring', 'amulet', 'belt'].indexOf(base.slot) !== -1) tags.add('jewellery');
    const defKeys = Object.keys(base.defence || {}).filter((k) => base.defence[k] > 0).sort();
    if (defKeys.length) {
      const k = defKeys.join(',');
      if (ARMOUR_TAG[k]) tags.add(ARMOUR_TAG[k]);
      // 权重表里也有「槽位 + 属性」的合写 tag，例如 int_helmet / str_dex_armour
      const short = { ar: 'str', ev: 'dex', es: 'int' };
      const attrPart = defKeys.map((d) => short[d]).filter(Boolean).join('_');
      if (attrPart) tags.add(attrPart + '_' + slotTag);
    }
    // 珠宝的词缀按属性分池，tag 形如 intjewel / dex_jewel / alljewel
    if (base.slot === 'jewel') {
      ['strjewel', 'dexjewel', 'intjewel', 'alljewel', 'jewel_mod'].forEach((t) => tags.add(t));
    }
    if (base.slot === 'weapon') {
      const cls = (base.weapon && base.weapon.class) || [];
      cls.forEach((c) => {
        (WEAPON_BUCKETS[c] || [c]).forEach((b) => tags.add(b));
      });
    }
    return [...tags];
  }
  /* 该词缀在这个底子上的官方权重：取命中 tag 的最大值；没有官方数据返回 null */
  function weightFor(mod, base) {
    if (!mod.spawnWeights) return null;
    const tags = baseTags(base);
    let best = null;
    for (const t of tags) {
      const w = mod.spawnWeights[t];
      if (typeof w === 'number' && (best === null || w > best)) best = w;
    }
    return best;
  }

  function modEligibleOnBase(mod, base, item) {
    // 官方 spawn weights 是最准确的判据：命中 tag 且权重 > 0 才算能掉。
    // 有官方权重时优先于词缀自带的 slots 元数据——两者偶有冲突（wiki 页面把
    // 同一组词缀的不同部位变体归到同一页），权重才是逐物品类别的事实。
    if (mod.spawnWeights) return !!(weightFor(mod, base) > 0);
    if (!mod.slots || mod.slots.indexOf(base.slot) === -1) return false;
    // 属性版本：同一词缀可能出现在多个属性版本页面上（力量/敏捷/智慧/复合），
    // 只要底子的属性满足其中任意一组就算可用。
    // 武器不走这条：武器底子没有防御类型，无从推导属性，改由武器分桶区分。
    if (base.slot !== 'weapon') {
      const attrSets = mod.attrSets && mod.attrSets.length ? mod.attrSets : (mod.attrs && mod.attrs.length ? [mod.attrs] : []);
      if (attrSets.length) {
        const attrs = baseAttrs(base);
        const ok = attrSets.some((set) => set.every((a) => attrs.indexOf(a) !== -1));
        if (!ok) return false;
      }
    }
    // 武器分桶：限定武器页面的词缀只给对应武器类别
    if (base.slot === 'weapon' && mod.weapons && mod.weapons.length) {
      const buckets = weaponBucketsFor(base);
      if (!mod.weapons.some((w) => buckets.indexOf(w) !== -1)) return false;
    }
    if (mod.def) {
      const defs = baseDefenceTags(base);
      if (!mod.def.some((d) => defs.indexOf(d) !== -1)) return false;
    }
    if (base.slot === 'weapon' && mod.weaponClass && mod.weaponClass !== 'any') {
      const cls = (base.weapon && base.weapon.class) || [];
      if (cls.indexOf(mod.weaponClass) === -1) return false;
    }
    if (mod.influence) {
      const inf = (item && item.influences) || [];
      if (inf.indexOf(mod.influence) === -1) return false;
    }
    return true;
  }
  function tierRank(mod, tier) {
    const idx = mod.tiers.indexOf(tier);
    return mod.tiers.length - idx;
  }
  function tierLabel(rank) { return 'T' + rank; }
  function eligibleTiers(mod, ilvl) {
    return mod.tiers.filter((t) => t.ilvl <= ilvl);
  }

  /* ---------- 逐档权重（官方数据） ----------
   * Mods 表里每一行 = 一个档位，每行自带 SpawnWeight_Tags / SpawnWeight_Values。
   * 导入器把这些标签集合去重成 weightSets，tier.w 就是下标；w = -1 表示该档没有任何正权重。
   * 实测 0.9.x 全表 4,273 个正权重条目全部等于 1，所以档内是等概率的，
   * 档位稀有度只来自 Level（物品等级门槛）。旧的 pow(tierRank, 1.35) 是编出来的分布。 */
  function maxWeightForSet(set, base) {
    if (!set) return 0;
    let best = 0;
    for (const t of baseTags(base)) {
      const w = set[t];
      if (typeof w === 'number' && w > best) best = w;
    }
    return best;
  }
  function tierWeightFor(mod, tier, base) {
    const idx = tier && tier.w;
    const sets = D.weightSets;
    if (typeof idx === 'number' && idx >= 0 && sets && sets[idx]) return maxWeightForSet(sets[idx], base);
    // 没有逐档数据（深渊 / 腐化词缀的部位标签是导入器推断的）→ 退回组级判据
    const gw = weightFor(mod, base);
    return gw == null ? 0 : gw;
  }
  /* 这一组在给定物品等级 + 底子上真正能掉出来的档位。
   * 与 eligibleTiers 的差别：逐档判定部位可用性，不再整组一刀切。 */
  function eligibleTiersFor(mod, ilvl, base) {
    return (mod.tiers || []).filter((t) => t.ilvl <= ilvl && tierWeightFor(mod, t, base) > 0);
  }
  function pickTier(rng, mod, tiers, base) {
    if (!tiers || !tiers.length) return null;
    if (!base) return tiers[Math.min(tiers.length - 1, Math.floor(rand(rng) * tiers.length))];
    return weightedPick(rng, tiers, (t) => tierWeightFor(mod, t, base)) || tiers[tiers.length - 1];
  }

  /* 档位阶梯：同一组词缀在不同底子上能掉的档并不一样。
   * 例：+最大生命的 T1–T4 只掉在胸甲上，头盔最高只有全组的 T5。
   * 玩家在游戏里看到的 "T1" 永远是「这个部位能出的最好一档」，
   * 所以对外展示一律用 rankLocal，内部存储仍用 rankGlobal（保持存档兼容）。 */
  function baseTierLadder(mod, base) {
    if (!mod || !mod.tiers) return [];
    const eligible = mod.tiers.filter((t) => tierWeightFor(mod, t, base) > 0);
    const n = eligible.length;
    return eligible.map((t, i) => ({
      tier: t,
      ilvl: t.ilvl,
      rankGlobal: mod.tiers.length - mod.tiers.indexOf(t),
      rankLocal: n - i,
    }));
  }
  function tierRankForBase(mod, tier, base) {
    if (!mod || !tier) return null;
    const hit = baseTierLadder(mod, base).find((x) => x.tier === tier);
    return hit ? hit.rankLocal : null;
  }
  /* 已生成词缀 → 该底子上的本地档位（展示用）。
   * 工艺 / 精华等没有自然品级的词缀返回 null，交给调用方回退。 */
  function affixTierForBase(affix, base) {
    if (!affix || !base) return null;
    const mod = modById[affix.modId];
    if (!mod || !mod.tiers) return null;
    const idx = mod.tiers.length - Number(affix.tierRank);
    const tier = mod.tiers[idx];
    if (!tier) return null;
    const local = tierRankForBase(mod, tier, base);
    if (local == null) return null;
    return { local, global: Number(affix.tierRank) };
  }
  function existingGroups(item, ignoreUid) {
    const set = {};
    item.affixes.forEach((a) => { if (a.uid !== ignoreUid) set[a.group] = true; });
    return set;
  }
  function sides(item, side) {
    return item.affixes.filter((a) => a.affix === side);
  }
  function craftedCount(item) {
    return item.affixes.filter((a) => a.crafted).length;
  }
  function maxCrafted(item) { return item.meta && item.meta.multimod ? 3 : 1; }
  function sideCap(item, side) {
    if (item.rarity === 'magic') return 1;
    if (item.rarity === 'rare') return 3;
    return 0;
  }
  function canAdd(item, side) {
    if (side !== 'prefix' && side !== 'suffix') return false;
    if (item.rarity !== 'magic' && item.rarity !== 'rare') return false;
    if (sides(item, side).length >= sideCap(item, side)) return false;
    if (item.rarity === 'magic' && item.affixes.length >= 2) return false;
    return true;
  }

  function fossilFactor(mod, fossils) {
    if (!fossils || !fossils.length) return 1;
    let factor = 1;
    for (const f of fossils) {
      const hit = (tags) => tags && tags.some((tag) => mod.tags.indexOf(tag) !== -1);
      if (f.block && hit(f.block)) return 0;
      if (f.fewer && hit(f.fewer)) factor *= 0.15;
      if (f.more && hit(f.more)) factor *= f.mult || 10;
      if (f.sanctified) factor *= 1 + 0.012 * Math.max(0, (mod.tiers[mod.tiers.length - 1].ilvl || 1) - 40);
    }
    return factor;
  }

  function candidatesFor(item, side, opts) {
    opts = opts || {};
    const base = getBase(item.baseId);
    const groups = existingGroups(item);
    const out = [];
    for (const mod of D.mods) {
      if (mod.affix !== side) continue;
      // 只有 standard 词缀进普通随机池；desecrated / corruption 由各自系统单独投放
      if (mod.kind && mod.kind !== 'standard') continue;
      if (groups[mod.group]) continue;
      if (!modEligibleOnBase(mod, base, item)) continue;
      if (opts.onlyTag && mod.tags.indexOf(opts.onlyTag) === -1) continue;
      const tiers = eligibleTiersFor(mod, item.ilvl, base);
      if (!tiers.length) continue;
      // 优先官方权重；没有官方数据才退回估算值
      const official = weightFor(mod, base);
      let w = official != null ? official : mod.weight;
      if (opts.fossils && opts.fossils.length) {
        const f = fossilFactor(mod, opts.fossils);
        if (f <= 0) continue;
        w *= f;
      }
      if (opts.tag && mod.tags.indexOf(opts.tag) !== -1) w *= 8;
      if (w <= 0) continue;
      out.push({ mod, tiers, weight: w });
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 精确概率（解析式，不抽样）
   * ------------------------------------------------------------------ *
   * addRandomAffix 是「抽一次 → 返回一条词缀」，要给出可信的百分比，
   * 需要的是完整分布：这一侧所有可能出现的 (组, 档) 及各自概率。
   *
   * 官方权重表的模型是「把所有可掉的行平铺，按权重抽一行」，
   * 一行 = 一个组的某一个档。所以：
   *     P(组 G, 档 i) = w(G) × w(i) / Σ
   * 当前数据里 w ≡ 1，于是整池等概率平铺——
   * 这也解释了为什么「可掉档位更多」的词缀组会更常见。
   */
  /* 把一侧的可能结果摊平成 (组, 档) 行列表——这才是官方权重表的真实模型：
   * 所有可掉行平铺在一条池子里，按权重抽一行。
   * 随机抽样和精确概率共用这一份枚举，两边永远不会走偏。
   */
  function addPoolRows(item, side, opts) {
    const base = getBase(item.baseId);
    const rows = [];
    let total = 0;
    for (const entry of candidatesFor(item, side, opts || {})) {
      for (const tier of entry.tiers) {
        const tw = tierWeightFor(entry.mod, tier, base);
        if (tw <= 0) continue;
        const w = entry.weight * tw;
        if (w <= 0) continue;
        rows.push({ mod: entry.mod, tier, weight: w });
        total += w;
      }
    }
    return { rows, total, base };
  }
  function pickAddRow(rng, item, side, opts) {
    const { rows, total } = addPoolRows(item, side, opts);
    if (!total) return null;
    let r = rand(rng) * total;
    for (const row of rows) {
      r -= row.weight;
      if (r <= 0) return row;
    }
    return rows[rows.length - 1];
  }

  function exactAddPool(item, side, opts) {
    const { rows: poolRows, total } = addPoolRows(item, side, opts || {});
    const rows = [];
    for (const r of poolRows) {
      rows.push({
        modId: r.mod.id,
        group: r.mod.group || r.mod.id,
        affix: r.mod.affix,
        name: r.mod.name,
        tierRank: tierRank(r.mod, r.tier),
        tierIlvl: r.tier.ilvl,
        weight: r.weight,
      });
    }
    if (!total) return { side, total: 0, rows: [], groups: [] };
    const byGroup = new Map();
    for (const r of rows) {
      r.prob = r.weight / total;
      const g = byGroup.get(r.modId) || {
        modId: r.modId, group: r.group, affix: r.affix, name: r.name,
        prob: 0, tiers: 0, bestTierRank: Infinity, bestTierIlvl: 0,
      };
      g.prob += r.prob;
      g.tiers++;
      if (r.tierRank < g.bestTierRank) { g.bestTierRank = r.tierRank; g.bestTierIlvl = r.tierIlvl; }
      byGroup.set(r.modId, g);
    }
    return {
      side,
      total,
      rows,
      groups: [...byGroup.values()].sort((a, b) => b.prob - a.prob),
    };
  }

  /* 一次「加词缀」动作命中目标的精确概率（不抽样）。
   * targets: [{ modId, tier }]，tier 是档位上限（1 = 最好）。
   *   pImprove  新词缀命中任意一条还没达成的目标
   *   pComplete 加上这条之后目标全部达成
   */
  function exactAddOutcome(item, side, targets, opts) {
    const pool = exactAddPool(item, side, opts);
    const ev = evaluate(item, targets || []);
    const out = { side, pImprove: 0, pComplete: 0, hit: [], complete: ev.complete, total: pool.total };
    if (!pool.total) return out;
    const missing = ev.missing.map((t) => {
      const def = getTargetDef(t.modId);
      return { group: def ? targetGroup(def) : null, tier: t.tier ? Number(t.tier) : null };
    }).filter((m) => m.group);
    for (const g of pool.groups) {
      const want = missing.find((m) => m.group === g.group);
      if (!want) continue;
      // 档位门槛：目标要求 T(n) 或更好 → tierRank ≤ n
      let p = g.prob;
      if (want.tier) {
        p = pool.rows
          .filter((r) => r.group === g.group && r.tierRank <= want.tier)
          .reduce((s, r) => s + r.prob, 0);
      }
      if (p <= 0) continue;
      out.pImprove += p;
      out.hit.push({ modId: g.modId, group: g.group, name: g.name, prob: p });
      if (missing.length === 1) out.pComplete += p;
    }
    if (missing.length === 1) out.pImprove = Math.min(1, out.pImprove);
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 移除 / 替换类动作的精确结果分布
   * ------------------------------------------------------------------ *
   * 剥离 = 在非破裂词缀里等概率选一条删掉；
   * 混沌 = 同样等概率删一条，然后（若还有空位）按落侧策略再加一条。
   * 两者都能解析算清楚：把「最终命中数」当成状态，逐个受害者展开。
   * 返回 pImprove / pRegress / pComplete 以及最终命中数的分布。
   * 带预兆时规则会变（定向删除 / 一次删两条），交给蒙特卡洛。
   */
  function hasArmedOmenFor(item, currency) {
    return armedOmens(item).some((o) => o.appliesTo === currency);
  }
  function withoutAffix(item, affix) {
    const next = clone(item);
    next.affixes = next.affixes.filter((a) => a.uid !== affix.uid);
    return next;
  }
  function exactActionOutcomes(item, action, targets, opts) {
    targets = targets || [];
    const type = action && action.type;
    if (type !== 'annulment' && type !== 'chaos') return null;
    if (type === 'chaos' && item.rarity !== 'rare') return null;
    if (hasArmedOmenFor(item, type)) return null;
    const ev = evaluate(item, targets);
    const K = targets.length;
    const removable = item.affixes.filter((a) => !a.fractured);
    if (!removable.length) return null;
    const dist = new Map();
    const bump = (m, p) => { if (p > 0) dist.set(m, (dist.get(m) || 0) + p); };
    const n = removable.length;
    for (const victim of removable) {
      const post = withoutAffix(item, victim);
      const pe = evaluate(post, targets);
      const pv = 1 / n;
      if (type === 'annulment') { bump(pe.matchedCount, pv); continue; }
      const open = ['prefix', 'suffix'].filter((s) => canAdd(post, s));
      if (!open.length) { bump(pe.matchedCount, pv); continue; }
      const sp = sideProbabilities(post, targets.map((t) => t.modId));
      let pGain = 0;
      for (const side of open) {
        const w = sp[side] || 0;
        if (w <= 0) continue;
        pGain += w * exactAddOutcome(post, side, targets, opts).pImprove;
      }
      bump(pe.matchedCount, pv * (1 - pGain));
      bump(pe.matchedCount + 1, pv * pGain);
    }
    let pImprove = 0;
    let pRegress = 0;
    let pComplete = 0;
    for (const [m, p] of dist) {
      if (m > ev.matchedCount) pImprove += p;
      if (m < ev.matchedCount) pRegress += p;
      if (K > 0 && m === K) pComplete += p;
    }
    return {
      exact: true,
      type,
      pImprove,
      pComplete,
      pRegress,
      baseMatched: ev.matchedCount,
      targetCount: K,
      dist: [...dist].sort((a, b) => a[0] - b[0]).map(([matched, prob]) => ({ matched, prob })),
    };
  }

  /* 加词缀类动作会落在哪一侧：复现 chooseSide 的判定，返回概率而不是抽样。
   * 与 chooseSide 的唯一区别是平局时给 50/50 而不是掷骰。 */
  function sideProbabilities(item, targetIds) {
    const open = ['prefix', 'suffix'].filter((s) => canAdd(item, s));
    const res = { prefix: 0, suffix: 0, determined: true };
    if (!open.length) return res;
    if (open.length === 1) { res[open[0]] = 1; return res; }
    if (sidePolicy === 'real') { res.prefix = 0.5; res.suffix = 0.5; res.determined = false; return res; }
    const fake = Object.assign({}, item, { targets: targetIds || item.targets });
    const pNeed = sideNeeded(fake, 'prefix');
    const sNeed = sideNeeded(fake, 'suffix');
    const pick = (side) => { res[side] = 1; return res; };
    if (pNeed != null && sNeed != null && pNeed !== sNeed) return pick(pNeed > sNeed ? 'prefix' : 'suffix');
    if (pNeed != null && sNeed == null) return pick(pNeed > 0 ? 'prefix' : 'suffix');
    if (sNeed != null && pNeed == null) return pick(sNeed > 0 ? 'suffix' : 'prefix');
    const p = sides(fake, 'prefix').length;
    const s = sides(fake, 'suffix').length;
    if (p < s) return pick('prefix');
    if (s < p) return pick('suffix');
    res.prefix = 0.5;
    res.suffix = 0.5;
    res.determined = false;
    return res;
  }

  /* 「加一条词缀」类动作的精确命中概率，两侧按 sideProbabilities 加权。
   * 用于崇高 / 增幅 / 蜕变 / 富豪这类只加不删的动作。 */
  function exactAddActionOutcome(item, targets, opts) {
    const sp = sideProbabilities(item, (targets || []).map((t) => t.modId));
    const out = { pImprove: 0, pComplete: 0, sides: {}, determinedSide: !!sp.determined };
    for (const side of ['prefix', 'suffix']) {
      const p = sp[side] || 0;
      if (!p) continue;
      const o = exactAddOutcome(item, side, targets || [], opts);
      out.sides[side] = Object.assign({ sideProb: p }, o);
      out.pImprove += p * o.pImprove;
      out.pComplete += p * o.pComplete;
    }
    return out;
  }

  /* 防御性检查：文本占位符数量必须与数值数量匹配，否则会显示 {1} 这类残余占位符 */
  /* 官方繁中模板优先，没��再退回英文模板 */
  function pickTemplate(tierLike) {
    return (tierLike && (tierLike.textZh || tierLike.text)) || '';
  }
  function placeholderMismatch(text, values) {
    const maxPh = [...String(text || '').matchAll(/\{(\d)\}/g)].reduce((n, m) => Math.max(n, Number(m[1])), -1);
    return maxPh >= (values || []).length;
  }
  function makeAffix(mod, tier, rng, opts) {
    // 坏档位（CSD 期望的 stat 比 mod 提供的多）→ 换成同 mod 的可用档，避免坏文本
    if (tier && placeholderMismatch(tier.text, tier.v)) {
      const good = (mod.tiers || []).find((t) => !placeholderMismatch(t.text, t.v));
      if (!good) return null;
      tier = good;
    }
    opts = opts || {};
    const rank = opts.tierRank || tierRank(mod, tier);
    const values = tier.v.map((range) => {
      const raw = randFloat(rng, range[0], range[1]);
      return roundVal(raw);
    });
    return {
      uid: uidCounter++,
      modId: mod.id,
      group: opts.group || mod.group || mod.id,
      affix: mod.affix,
      name: opts.name || mod.name,
      tierRank: rank,
      tierIlvl: tier.ilvl,
      values,
      text: formatText(opts.text || pickTemplate(tier) || mod.text, values),
      tags: (opts.tags || mod.tags || []).slice(),
      crafted: !!opts.crafted,
      fractured: !!opts.fractured,
      essence: !!opts.essence,
      influence: mod.influence || null,
      benchId: opts.benchId || null,
    };
  }

  function makeCustomAffix(desc, rng, opts) {
    opts = opts || {};
    const values = desc.v.map((range) => roundVal(randFloat(rng, range[0], range[1])));
    return {
      uid: uidCounter++,
      modId: opts.modId || desc.group,
      group: desc.group,
      affix: desc.affix,
      name: opts.name || desc.name || desc.group,
      tierRank: opts.tierRank || 1,
      tierIlvl: opts.tierIlvl || 1,
      values,
      text: formatText(desc.text, values),
      tags: (desc.tags || []).slice(),
      crafted: !!opts.crafted,
      fractured: !!opts.fractured,
      essence: !!opts.essence,
      influence: opts.influence || null,
      benchId: opts.benchId || null,
    };
  }

  function addRandomAffix(item, side, rng, opts) {
    if (!canAdd(item, side)) return null;
    // 平铺抽一行（组 × 档），与 exactAddPool 共用同一份枚举
    const row = pickAddRow(rng, item, side, opts || {});
    if (!row) return null;
    const aff = makeAffix(row.mod, row.tier, rng);
    item.affixes.push(aff);
    return aff;
  }

  /* 选择新词缀落在哪一侧。
   * 物品上记录 targets（模组 id 列表）时，优先补「目标还没命中」的那一侧：
   * PoE2 里玩家真正关心的是目标词缀，而不是两侧数量绝对平均。
   * 没有目标信息时退回「数量少的一侧」，两侧相同则随机。 */
  function sideNeeded(item, side) {
    const targets = item && item.targets;
    if (!Array.isArray(targets) || !targets.length) return null;
    let open = 0;
    let closed = 0;
    for (const modId of targets) {
      const def = modById[modId] || benchById[modId];
      if (!def || def.affix !== side) continue;
      const group = groupOf(def);
      const hit = item.affixes.some((a) => a.group === group);
      if (hit) closed++; else open++;
    }
    if (!open && !closed) return null;
    return open > 0 ? 1 - closed / (open + closed) : 0;
  }
  /* ------------------------------------------------------------------ *
   * 落侧策略
   * ------------------------------------------------------------------ *
   * 加词缀类通货要先决定落在前缀还是后缀。
   *   real   ：真实游戏行为——两侧都还有空位时 50/50
   *   assist ：辅助模式——优先补「目标还没命中」的那一侧，避免做出 3前0后
   * real 是默认值。assist 会让单侧目标的命中概率偏高（约 2 倍），
   * 界面上把两种口径都标出来，由玩家自己选。
   */
  let sidePolicy = 'real';
  function setSidePolicy(p) {
    sidePolicy = p === 'assist' ? 'assist' : 'real';
    return sidePolicy;
  }
  function getSidePolicy() { return sidePolicy; }

  function chooseSide(item, rng) {
    const opts = ['prefix', 'suffix'].filter((s) => canAdd(item, s));
    if (!opts.length) return null;
    if (opts.length === 1) return opts[0];
    if (sidePolicy === 'real') return rand(rng) < 0.5 ? opts[0] : opts[1];
    const p = sides(item, 'prefix').length;
    const s = sides(item, 'suffix').length;
    const pNeed = sideNeeded(item, 'prefix');
    const sNeed = sideNeeded(item, 'suffix');
    if (pNeed != null && sNeed != null && pNeed !== sNeed) return pNeed > sNeed ? 'prefix' : 'suffix';
    if (pNeed != null && sNeed == null) return pNeed > 0 ? 'prefix' : 'suffix';
    if (sNeed != null && pNeed == null) return sNeed > 0 ? 'suffix' : 'prefix';
    if (p < s) return 'prefix';
    if (s < p) return 'suffix';
    return rand(rng) < 0.5 ? 'prefix' : 'suffix';
  }

  function fillTo(item, total, rng, opts) {
    opts = opts || {};
    while (item.affixes.length < total) {
      const side = chooseSide(item, rng);
      if (!side) break;
      const aff = addRandomAffix(item, side, rng, opts);
      if (!aff) break;
    }
    if (opts.guaranteeTag && !item.affixes.some((a) => a.tags.indexOf(opts.guaranteeTag) !== -1)) {
      // 至少一条对应标签：把一条非破裂词缀替换为标签词缀
      const replaceable = item.affixes.filter((a) => !a.fractured);
      if (replaceable.length) {
        const victim = replaceable[randInt(rng, 0, replaceable.length - 1)];
        const side = victim.affix;
        item.affixes = item.affixes.filter((a) => a !== victim);
        const poolRows = addPoolRows(item, side, Object.assign({}, opts, { tag: opts.guaranteeTag }));
        if (poolRows.total) {
          const row = pickAddRow(rng, item, side, Object.assign({}, opts, { tag: opts.guaranteeTag }));
          item.affixes.push(makeAffix(row.mod, row.tier, rng));
        } else {
          item.affixes.push(victim);
        }
      }
    }
  }

  function clearForReroll(item, preserve) {
    const keep = item.affixes.filter((a) => {
      if (a.fractured) return true;
      if (preserve && preserve.indexOf(a.affix) !== -1) return true;
      return false;
    });
    item.affixes = keep;
  }

  /* ------------------------------------------------------------------ *
   * 符文 / 灵魂核心
   * ------------------------------------------------------------------ */
  const runeById = {};
  (D.runes || []).forEach((r) => { runeById[r.id] = r; });
  (D.soulCores || []).forEach((r) => { runeById[r.id] = r; });

  function runeDef(id) { return runeById[id] || null; }

  /* 已激活的预兆：作用于下一次对应通货后消耗 */
  function armedOmens(item) { return (item && item.meta && item.meta.omens) || []; }
  function takeArmedOmen(item, currency) {
    const list = armedOmens(item);
    const idx = list.findIndex((o) => o.appliesTo === currency);
    if (idx === -1) return null;
    const [om] = list.splice(idx, 1);
    return om;
  }
  function runeEligibleOnBase(rune, base) {
    if (!rune || !base) return false;
    if (!canSocket(base)) return false;
    const slots = rune.slots || ['armour'];
    if (slots.indexOf('weapon') !== -1 && base.slot === 'weapon') return true;
    if (slots.indexOf('armour') !== -1 && base.slot !== 'weapon') return true;
    return false;
  }
  function runeAvailability(item, runeId) {
    const rune = runeDef(runeId);
    if (!rune) return '未知符文';
    if (item.corrupted) return '物品已腐化，不能再插符文';
    const base = getBase(item.baseId);
    if (!canSocket(base)) return '这个部位没有插槽';
    if (!runeEligibleOnBase(rune, base)) return '这个符文不能插在该部位';
    if (item.affixes.some((a) => a.runeId === runeId)) return '已经插了同名符文';
    if ((item.runes || []).length >= (item.sockets || 0)) return '插槽已满，先清空一个插槽';
    return null;
  }
  /* 符文/灵魂核心按插槽类别取效果：1=武器、3=法杖类、4=护甲（由 Desert Rune 数据验证） */
  const RUNE_CAT = { martial: 1, caster: 3, armour: 4 };
  function runeBaseGroup(base) {
    if (!base) return null;
    if (base.slot === 'weapon') {
      const cls = (base.weapon && base.weapon.class) || [];
      if (cls.some((c) => c === 'wand' || c === 'staff' || c === 'sceptre')) return 'caster';
      return 'martial';
    }
    return 'armour';
  }
  function runeEffectFor(rune, base) {
    if (!rune || !Array.isArray(rune.effects) || !base) return null;
    const cat = RUNE_CAT[runeBaseGroup(base)];
    return rune.effects.find((x) => x.cat === cat) || null;
  }
  /* 属性推导要用英文模板（applyStatText 依赖英文关键词） */
  function runeStatText(rune, base) {
    const eff = runeEffectFor(rune, base);
    if (eff) {
      const vals = (eff.v || []).map((x) => (Array.isArray(x) ? x[0] : x));
      return formatText(eff.text, vals);
    }
    if (!rune) return '';
    const flat = (arr) => (arr || []).map((x) => (Array.isArray(x) ? x[0] : x));
    return formatText(rune.text, flat(rune.v));
  }
  function runeText(rune, base) {
    const eff = runeEffectFor(rune, base);
    if (eff) {
      const vals = (eff.v || []).map((r) => (Array.isArray(r) ? r[0] : r));
      return formatText(eff.textZh || eff.text, vals);
    }
    if (!rune) return '';
    const flat = (arr) => (arr || []).map((x) => (Array.isArray(x) ? x[0] : x));
    if (Array.isArray(rune.v2)) return formatText(rune.text, flat(rune.v).concat([Array.isArray(rune.v2[0]) ? rune.v2[0][0] : rune.v2[0]]));
    return formatText(rune.text, flat(rune.v));
  }
  function clearSocketsAvailability(item) {
    if (item.corrupted) return '物品已腐化，不能取出符文';
    if (!(item.runes || []).length) return '没有已插入的符文';
    return null;
  }

  /* ------------------------------------------------------------------ *
   * 目标评估
   * ------------------------------------------------------------------ */
  function getTargetDef(modId) {
    return targetById[modId] || null;
  }
  function targetGroup(def) {
    return def.group || def.id;
  }
  function isBenchTarget(modId) {
    return !!benchById[modId];
  }
  function targetEligibleOnBase(modId, baseId, influences, ilvl) {
    const base = getBase(baseId);
    const def = getTargetDef(modId);
    if (!base || !def) return false;
    if (benchById[modId]) {
      if (def.slots && def.slots.indexOf(base.slot) === -1) return false;
      if (def.def) {
        const defs = baseDefenceTags(base);
        if (!def.def.some((d) => defs.indexOf(d) !== -1)) return false;
      }
      return true;
    }
    /* 精华目标：没有档位/权重，只看部位（武器再看类别） */
    if (def.isEssence) {
      if (def.slots && def.slots.length && def.slots.indexOf(base.slot) === -1) return false;
      if (base.slot === 'weapon' && def.weapons && def.weapons.length) {
        const buckets = weaponBucketsFor(base);
        if (!def.weapons.some((w) => buckets.indexOf(w) !== -1)) return false;
      }
      return true;
    }
    if (!modEligibleOnBase(def, base, { influences: influences || [] })) return false;
    if (!eligibleTiers(def, ilvl || base.ilvl).length) return false;
    return true;
  }
  function findMatchingAffix(item, target) {
    const def = getTargetDef(target.modId);
    if (!def) return null;
    const group = targetGroup(def);
    for (const a of item.affixes) {
      if (a.group !== group) continue;
      if (target.tier && a.tierRank > target.tier) continue;
      if (benchById[target.modId] && a.benchId !== target.modId) continue;
      // 工艺 / 精华没有自然品级：用数值门槛判断是否真的达到目标品级
      if (target.tier && (a.crafted || a.essence) && def.tiers) {
        const wanted = def.tiers.find((tier) => tierRank(def, tier) === Number(target.tier));
        if (wanted && wanted.v && wanted.v[0] && a.values[0] < wanted.v[0][0]) continue;
      }
      return a;
    }
    return null;
  }
  function evaluate(item, targets) {
    targets = targets || [];
    const matched = [];
    const missing = [];
    targets.forEach((t) => {
      const aff = findMatchingAffix(item, t);
      if (aff) matched.push({ target: t, affix: aff });
      else missing.push(t);
    });
    const targetGroups = {};
    targets.forEach((t) => {
      const def = getTargetDef(t.modId);
      if (def) targetGroups[targetGroup(def)] = true;
    });
    const junk = item.affixes.filter((a) => !targetGroups[a.group]);
    return {
      matched,
      missing,
      junk,
      matchedCount: matched.length,
      targetCount: targets.length,
      complete: targets.length > 0 && missing.length === 0,
      openPrefix: Math.max(0, sideCap(item, 'prefix') - sides(item, 'prefix').length),
      openSuffix: Math.max(0, sideCap(item, 'suffix') - sides(item, 'suffix').length),
      prefixCount: sides(item, 'prefix').length,
      suffixCount: sides(item, 'suffix').length,
      totalCount: item.affixes.length,
      progress: targets.length ? matched.length / targets.length : 0,
      targetsBySide: {
        prefix: targets.filter((t) => { const d = getTargetDef(t.modId); return d && d.affix === 'prefix'; }),
        suffix: targets.filter((t) => { const d = getTargetDef(t.modId); return d && d.affix === 'suffix'; }),
      },
    };
  }

  /* ------------------------------------------------------------------ *
   * 动作 / 成本
   * ------------------------------------------------------------------ */
  function mergePrices(overrides) {
    return Object.assign({}, D.prices, overrides || {});
  }
  function actionCost(action, prices) {
    prices = mergePrices(prices);
    switch (action.type) {
      case 'transmute': return prices.transmute;
      case 'augmentation': return prices.augmentation;
      case 'regal': return prices.regal;
      case 'alchemy': return prices.alchemy;
      case 'chaos': return prices.chaos;
      case 'exalted': return prices.exalted;
      case 'annulment': return prices.annulment;
      case 'divine': return prices.divine;
      case 'vaal': return prices.vaal;
      case 'whetstone': return prices.whetstone;
      case 'scrap': return prices.scrap;
      case 'rune': {
        const r = runeDef(action.runeId);
        return r ? r.cost : 0;
      }
      case 'rune_clear': return 0;
      case 'desecrate': return prices.desecrate;
      case 'desecrate_pick': return 0;
      case 'vaal': return prices.vaal;
      case 'essence': {
        const e = essenceById[action.essenceId];
        return e ? e.cost : 0;
      }
      case 'omen_clear': return 0;
      case 'omen_exec': {
        const om = (D.omens || []).find((x) => x.id === action.omenId);
        const inner = action.currency ? actionCost({ type: action.currency }, prices) : 0;
        return (om ? Number(om.cost) || 0 : 0) + inner;
      }
      case 'omen': {
        const omen = (D.omens || []).find((x) => x.id === action.omenId);
        if (!omen || omen.cost == null) return 0;
        // 语义已改为「激活预兆，作用于下一次通货」：这里只收预兆价格
        return omen.cost;
      }
      default: return 0;
    }
  }

  function validBench(item, craft) {
    const base = getBase(item.baseId);
    if (item.rarity !== 'rare' && item.rarity !== 'magic') return false;
    if (craft.slots && craft.slots.indexOf(base.slot) === -1) return false;
    if (craft.def) {
      const defs = baseDefenceTags(base);
      if (!craft.def.some((d) => defs.indexOf(d) !== -1)) return false;
    }
    if (!canAdd(item, craft.affix)) return false;
    if (craftedCount(item) >= maxCrafted(item)) return false;
    if (existingGroups(item)[craft.group || craft.id]) return false;
    return true;
  }

  function rollRareCount(rng) {
    const r = rand(rng);
    if (r < 0.52) return 4;
    if (r < 0.82) return 5;
    return 6;
  }
  function rollMagicCount(rng) {
    return rand(rng) < 0.5 ? 1 : 2;
  }
  function rerollAffixValues(item, rng) {
    item.affixes.forEach((a) => {
      const def = modById[a.modId];
      if (!def || !def.tiers) return;
      const tier = def.tiers.find((t) => tierRank(def, t) === a.tierRank);
      if (!tier) return;
      a.values = tier.v.map((r) => roundVal(randFloat(rng, r[0], r[1])));
      a.text = formatText(def.text, a.values);
    });
  }

  function applyAction(item, action, ctx) {
    ctx = ctx || {};
    const rng = ctx.rng || defaultRng;
    const prices = mergePrices(ctx.prices);
    const next = clone(item);
    // 目标只用于决定新词缀落在哪一侧，不进物品正文。
    next.targets = (ctx.targets || item.targets || []).slice();
    next.meta = next.meta || { multimod: false };
    const cost = actionCost(action, prices);
    const fail = (msg) => ({ error: msg, item: next, cost: 0, message: '' });
    let message = '';

    // 腐化后普通通货与精华都不能再用；符文与查看类操作另行判断。
    const CORRUPT_BLOCKED = [
      'transmute', 'alteration', 'augmentation', 'regal', 'alchemy', 'chaos',
      'exalted', 'annulment', 'divine', 'essence', 'omen', 'omen_exec', 'whetstone', 'scrap', 'desecrate',
    ];
    if (next.corrupted && CORRUPT_BLOCKED.indexOf(action.type) !== -1) {
      return fail('物品已腐化，不能使用普通通货 / 精华。');
    }

    switch (action.type) {
      case 'transmute': {
        if (next.rarity !== 'normal') return fail('蜕变石只能用于普通物品。');
        next.rarity = 'magic';
        clearForReroll(next, []);
        fillTo(next, 1, rng, {});
        message = '使用蜕变石：普通物品变为魔法物品。';
        break;
      }
      case 'alteration': {
        if (next.rarity !== 'magic') return fail('改造石只能用于魔法物品。');
        clearForReroll(next, []);
        fillTo(next, rollMagicCount(rng), rng, {});
        message = '使用改造石：重铸魔法词缀。';
        break;
      }
      case 'augmentation': {
        if (next.rarity !== 'magic') return fail('增幅石只能用于魔法物品。');
        if (!canAdd(next, 'prefix') && !canAdd(next, 'suffix')) return fail('魔法物品最多 2 条词缀。');
        const side = chooseSide(next, rng);
        if (!addRandomAffix(next, side, rng, {})) return fail('当前底子没有可用的词缀可添加。');
        message = '使用增幅石：魔法物品补到 2 条词缀。';
        break;
      }
      case 'regal': {
        if (next.rarity !== 'magic') return fail('富豪石只能用于魔法物品。');
        next.rarity = 'rare';
        const side = chooseSide(next, rng);
        if (!addRandomAffix(next, side, rng, {})) return fail('当前底子没有可用的词缀可添加。');
        message = '使用富豪石：魔法物品升级为稀有物品。';
        break;
      }
      case 'alchemy': {
        if (next.rarity !== 'normal' && next.rarity !== 'magic') return fail('点金石只能用于普通或魔法物品。');
        const alcOmen = takeArmedOmen(next, 'alchemy');
        next.rarity = 'rare';
        clearForReroll(next, []);
        fillTo(next, 4, rng, {});
        if (alcOmen && (alcOmen.effect === 'alchemy_max_prefix' || alcOmen.effect === 'alchemy_max_suffix')) {
          const side = alcOmen.effect === 'alchemy_max_prefix' ? 'prefix' : 'suffix';
          while (canAdd(next, side)) {
            if (!addRandomAffix(next, side, rng, {})) break;
          }
        }
        message = '使用点金石' + (alcOmen ? '（预兆：' + alcOmen.name + '）' : '') + '：普通 / 魔法物品变为稀有物品。';
        break;
      }
      case 'chaos': {
        if (next.rarity !== 'rare') return fail('混沌石只能用于稀有物品。');
        const removable = next.affixes.filter((a) => !a.fractured);
        if (!removable.length) return fail('没有可移除的词缀。');
        const chaosOmen = takeArmedOmen(next, 'chaos');
        let pool = removable;
        if (chaosOmen && chaosOmen.effect === 'remove_lowest') {
          pool = removable.slice().sort((a, b) => (a.tierIlvl || 1) - (b.tierIlvl || 1)).slice(0, 1);
        } else if (chaosOmen && chaosOmen.effect === 'remove_prefix_only') {
          pool = removable.filter((a) => a.affix === 'prefix');
        } else if (chaosOmen && chaosOmen.effect === 'remove_suffix_only') {
          pool = removable.filter((a) => a.affix === 'suffix');
        }
        if (!pool.length) return fail('预兆要求的词缀不存在。');
        const victim = pool[randInt(rng, 0, pool.length - 1)];
        next.affixes = next.affixes.filter((a) => a !== victim);
        if (canAdd(next, 'prefix') || canAdd(next, 'suffix')) addRandomAffix(next, chooseSide(next, rng), rng, {});
        message = '使用混沌石' + (chaosOmen ? '（预兆：' + chaosOmen.name + '）' : '') + '：移除「' + victim.text.split('\n')[0] + '」并新增 1 条词缀。';
        break;
      }
      case 'exalted': {
        if (next.rarity !== 'rare') return fail('崇高石只能用于稀有物品。');
        if (!canAdd(next, 'prefix') && !canAdd(next, 'suffix')) return fail('词缀已满，无法使用崇高石。');
        const exOmen = takeArmedOmen(next, 'exalted');
        let side = chooseSide(next, rng);
        let addCount = 1;
        if (exOmen && exOmen.effect === 'add_prefix') side = canAdd(next, 'prefix') ? 'prefix' : side;
        if (exOmen && exOmen.effect === 'add_suffix') side = canAdd(next, 'suffix') ? 'suffix' : side;
        if (exOmen && exOmen.effect === 'add_two') addCount = 2;
        if (exOmen && exOmen.effect === 'add_same_group') {
          const groups = [...new Set(next.affixes.map((a) => a.group).filter(Boolean))];
          const group = groups.length ? groups[randInt(rng, 0, groups.length - 1)] : null;
          const mods = group ? (D.mods || []).filter((mm) => mm.group === group && mm.kind === 'standard') : [];
          if (mods.length) {
            const mod = mods[randInt(rng, 0, mods.length - 1)];
            const modBase = getBase(next.baseId);
            const tiers = eligibleTiersFor(mod, next.ilvl, modBase);
            if (tiers.length) {
              const aff = makeAffix(mod, pickTier(rng, mod, tiers, modBase), rng);
              if (aff) {
                next.affixes.push(aff);
                message = '使用崇高石（预兆：' + exOmen.name + '）：新增同组词缀「' + aff.text.split('\n')[0] + '」。';
                break;
              }
            }
          }
          return fail('没有可添加的同组词缀。');
        }
        let added = 0;
        for (let i = 0; i < addCount; i++) {
          const s = addCount > 1 ? chooseSide(next, rng) : side;
          if (!s || !addRandomAffix(next, s, rng, {})) break;
          added++;
        }
        if (!added) return fail('当前底子没有可用的词缀可添加。');
        message = '使用崇高石' + (exOmen ? '（预兆：' + exOmen.name + '）' : '') + '：增加 ' + added + ' 条词缀。';
        break;
      }
      case 'annulment': {
        if (next.rarity !== 'rare' && next.rarity !== 'magic') return fail('剥离石只能用于魔法或稀有物品。');
        const removable = next.affixes.filter((a) => !a.fractured);
        if (!removable.length) return fail('没有可剥离的词缀（破裂词缀无法剥离）。');
        const anOmen = takeArmedOmen(next, 'annulment');
        let anPool = removable;
        if (anOmen && anOmen.effect === 'remove_prefix_only') anPool = removable.filter((a) => a.affix === 'prefix');
        if (anOmen && anOmen.effect === 'remove_suffix_only') anPool = removable.filter((a) => a.affix === 'suffix');
        if (anOmen && anOmen.effect === 'remove_desecrated_only') anPool = removable.filter((a) => a.desecrated);
        if (!anPool.length) return fail('预兆要求的词缀不存在。');
        const anCount = anOmen && anOmen.effect === 'remove_two' ? 2 : 1;
        const removed = [];
        for (let i = 0; i < anCount; i++) {
          const pool = anOmen && anOmen.effect === 'remove_prefix_only' ? next.affixes.filter((a) => !a.fractured && a.affix === 'prefix')
            : anOmen && anOmen.effect === 'remove_suffix_only' ? next.affixes.filter((a) => !a.fractured && a.affix === 'suffix')
            : anOmen && anOmen.effect === 'remove_desecrated_only' ? next.affixes.filter((a) => !a.fractured && a.desecrated)
            : next.affixes.filter((a) => !a.fractured);
          if (!pool.length) break;
          const v = pool[randInt(rng, 0, pool.length - 1)];
          next.affixes = next.affixes.filter((a) => a !== v);
          removed.push(v);
        }
        message = '使用剥离石' + (anOmen ? '（预兆：' + anOmen.name + '）' : '') + '：移除了 ' + removed.length + ' 条词缀。';
        break;
      }
      case 'scour': {
        if (next.rarity !== 'rare' && next.rarity !== 'magic') return fail('重铸石只能用于魔法或稀有物品。');
        next.rarity = 'normal';
        next.affixes = next.affixes.filter((a) => a.fractured);
        message = '使用重铸石：清除词缀。';
        break;
      }
      case 'essence': {
        const e = essenceById[action.essenceId];
        if (!e) return fail('未知精华。');
        const blocked = essenceAvailability(next, e);
        if (blocked) return fail(blocked);
        const eff = essenceDescForItem(next, e);
        if (!eff) return fail('该精华不支持此物品。');
        const removable = next.affixes.filter((a) => !a.fractured);
        let removedNote = '';
        // 完美档：先移除 1 条随机词缀，再加保底
        if (e.perfect || e.tier === 4) {
          if (next.rarity !== 'rare') return fail('完美精华只能用于稀有物品。');
          if (!removable.length) return fail('没有可移除的词缀。');
          {
            const victim = removable[randInt(rng, 0, removable.length - 1)];
            next.affixes = next.affixes.filter((a) => a !== victim);
            removedNote = '移除「' + victim.text.split('\n')[0] + '」并';
          }
        } else {
          if (next.rarity !== 'magic') return fail('该档精华只能用于魔法物品。');
        }
        next.rarity = 'rare';
        const values = (eff.v || []).map((r) => roundVal(randFloat(rng, r[0], r[1])));
        const aff = {
          uid: uidCounter++,
          modId: 'essence_' + e.id,
          group: 'essence_' + e.id,
          affix: eff.affix,
          name: e.tierName + e.name + '精华',
          tierRank: 1,
          tierIlvl: 1,
          values,
          text: formatText(eff.text, values),
          tags: [],
          crafted: false,
          fractured: false,
          essence: true,
          influence: null,
          benchId: null,
        };
        next.affixes.push(aff);
        next.affixes.sort((a, b) => (a.affix === b.affix ? 0 : a.affix === 'prefix' ? -1 : 1));
        message = '使用' + e.tierName + e.name + '精华：' + (removedNote || (e.perfect || e.tier === 4 ? '' : '魔法升稀有并'))
          + '保底「' + aff.text.split('\n')[0] + '」。';
        break;
      }
      case 'fossil': {
        if (next.rarity !== 'normal' && next.rarity !== 'rare') return fail('化石只能用于普通或稀有物品。');
        const fossils = (action.fossilIds || []).map((id) => fossilById[id]).filter(Boolean);
        if (!fossils.length) return fail('请至少选择一枚化石。');
        clearForReroll(next, []);
        next.rarity = 'rare';
        fillTo(next, next.affixes.length ? rollRareCount(rng) : 4, rng, { fossils });
        message = '使用化石（' + fossils.map((f) => f.name).join(' + ') + '）：重铸稀有词缀。';
        break;
      }
      case 'harvest': {
        if (next.rarity !== 'rare') return fail('庄园重铸只能用于稀有物品。');
        if (!action.tag) return fail('请选择庄园标签。');
        clearForReroll(next, []);
        fillTo(next, rollRareCount(rng), rng, { tag: action.tag, guaranteeTag: action.tag });
        message = '使用庄园重铸：保证至少一条「' + action.tag + '」标签词缀。';
        break;
      }
      case 'bench': {
        if (next.rarity !== 'rare' && next.rarity !== 'magic') return fail('工艺台只能用于魔法或稀有物品。');
        const craft = benchById[action.benchId];
        if (!craft) return fail('未知工艺。');
        if (!validBench(next, craft)) return fail('无法添加该工艺：槽位不足、已有同组词缀或工艺上限。');
        const aff = makeCustomAffix(Object.assign({}, craft, { group: BENCH_GROUP[craft.id] || craft.group || craft.id }), rng, {
          crafted: true, benchId: craft.id, tierRank: 1, tierIlvl: 1, name: craft.name,
        });
        next.affixes.push(aff);
        message = '工艺台：添加「' + craft.name + '」。';
        break;
      }
      case 'multimod': {
        if (next.rarity !== 'rare') return fail('多重工艺只能用于稀有物品。');
        if (next.meta.multimod) return fail('已经拥有多重工艺。');
        next.meta.multimod = true;
        message = '工艺台：添加多重工艺，最多可拥有 3 条工艺词缀。';
        break;
      }
      case 'lock_chaos':
      case 'lock_scour': {
        if (next.rarity !== 'rare') return fail('锁定重铸只能用于稀有物品。');
        const preserve = [action.side];
        if (!sides(next, action.side).length) return fail('该侧没有可锁定的词缀。');
        clearForReroll(next, preserve);
        if (action.type === 'lock_scour') {
          message = '锁定' + (action.side === 'prefix' ? '前缀' : '后缀') + '并重铸：清空另一侧。';
        } else {
          const other = action.side === 'prefix' ? 'suffix' : 'prefix';
          const targetTotal = rollRareCount(rng);
          while (next.affixes.length < targetTotal && canAdd(next, other)) {
            const added = addRandomAffix(next, other, rng, {});
            if (!added) break;
          }
          message = '锁定' + (action.side === 'prefix' ? '前缀' : '后缀') + '并使用混沌石：只重铸另一侧。';
        }
        break;
      }
      case 'lock_exalt': {
        if (next.rarity !== 'rare') return fail('锁定崇高只能用于稀有物品。');
        if (!sides(next, action.side).length) return fail('该侧没有可锁定的词缀。');
        if (!canAdd(next, action.side === 'prefix' ? 'suffix' : 'prefix')) return fail('另一侧没有空位。');
        const other = action.side === 'prefix' ? 'suffix' : 'prefix';
        addRandomAffix(next, other, rng, {});
        message = '锁定' + (action.side === 'prefix' ? '前缀' : '后缀') + '并使用崇高石：只增加另一侧词缀。';
        break;
      }
      case 'desecrate': {
        const blocked = desecrateAvailability(next);
        if (blocked) return fail(blocked);
        // 词缀满时先移除 1 条非破裂词缀腾位（游戏里也是先消耗掉一条）
        if (!canAdd(next, 'prefix') && !canAdd(next, 'suffix')) {
          const removable = next.affixes.filter((a) => !a.fractured);
          if (!removable.length) return fail('词缀已满且没有可移除的词缀');
          const victim = removable[randInt(rng, 0, removable.length - 1)];
          next.affixes = next.affixes.filter((a) => a !== victim);
          message = '保存之骨：先移除了「' + victim.text.split('\n')[0] + '」，';
        } else {
          message = '保存之骨：';
        }
        const desOmen = takeArmedOmen(next, 'desecrate');
        let choices = desecrateChoices(next, rng, 3);
        if (desOmen?.effect === 'desecrate_prefix_only') choices = choices.filter((m) => m.affix === 'prefix');
        if (desOmen?.effect === 'desecrate_suffix_only') choices = choices.filter((m) => m.affix === 'suffix');
        if (desOmen?.effect === 'desecrate_guaranteed_kurgal') choices = choices.filter((m) => /kurgal/i.test(m.id));
        if (desOmen?.effect === 'desecrate_guaranteed_ulaman') choices = choices.filter((m) => /ulaman/i.test(m.id));
        if (desOmen?.effect === 'desecrate_guaranteed_amanamu') choices = choices.filter((m) => /amanamu/i.test(m.id));
        if (!choices.length) return fail('预兆要求的深渊词缀不存在');
        message += '揭露 ' + choices.length + ' 条深渊词缀，选 1 条。';
        // 选项交给界面处理，这里把 choices 一并返回
        next.affixes.sort((a, b) => (a.affix === b.affix ? 0 : a.affix === 'prefix' ? -1 : 1));
        return { item: next, cost, message, error: null, choices };
      }
      case 'desecrate_pick': {
        const choice = action.choice;
        if (!choice || !choice.modId) return fail('没有选择深渊词缀');
        // 该侧已满时，先挤掉一条同侧词缀再加入——深渊词缀是可替换的，
        // 直接报错会让「1 前 3 后」这类物品永远用不了亵渎。
        if (!canAdd(next, choice.affix)) {
          const sameSide = next.affixes.filter((a) => !a.fractured && a.affix === choice.affix);
          if (!sameSide.length) return fail('该侧词缀已满');
          const victim = sameSide[randInt(rng, 0, sameSide.length - 1)];
          next.affixes = next.affixes.filter((a) => a !== victim);
        }
        const res = applyDesecratedPick(next, choice);
        if (res.error) return fail(res.error);
        next.affixes = res.item.affixes;
        message = '加入深渊词缀：' + res.affix.text.split('\n')[0] + '。';
        break;
      }
      case 'divine': {
        if (next.rarity !== 'magic' && next.rarity !== 'rare') return fail('神圣石只能用于魔法或稀有物品。');
        if (!next.affixes.length) return fail('没有可重掷的词缀。');
        rerollAffixValues(next, rng);
        message = '使用神圣石：重掷了所有词缀数值。';
        break;
      }
      case 'whetstone':
      case 'scrap': {
        const base = getBase(next.baseId);
        if (next.rarity === 'normal') return fail('普通物品没有词缀，先做成魔法 / 稀有再加品质。');
        if ((next.quality || 0) >= 20) return fail('品质已达上限 20%。');
        if (action.type === 'whetstone' && base.slot !== 'weapon') return fail('磨刀石只能用于武器。');
        if (action.type === 'scrap' && base.slot === 'weapon') return fail('护甲片不能用于武器。');
        if (action.type === 'scrap' && !canSocket(base)) return fail('护甲片只能用于护甲 / 盾 / 法器。');
        const gain = randInt(rng, 1, 2);
        next.quality = Math.min(20, (next.quality || 0) + gain);
        message = (action.type === 'whetstone' ? '磨刀石' : '护甲片') + '：品质提升到 ' + next.quality + '%。';
        break;
      }
      case 'rune': {
        const blocked = runeAvailability(next, action.runeId);
        if (blocked) return fail(blocked);
        const rune = runeDef(action.runeId);
        next.runes = (next.runes || []).concat([action.runeId]);
        message = '插入' + rune.name + '：' + runeText(rune, getBase(next.baseId)) + '。';
        break;
      }
      case 'rune_clear': {
        const blocked = clearSocketsAvailability(next);
        if (blocked) return fail(blocked);
        next.runes = [];
        message = '取出所有符文，插槽已清空。';
        break;
      }
      case 'vaal': {
        if (next.corrupted) return fail('物品已经腐化。');
        next.corrupted = true;
        // PoE2 瓦尔宝珠有四种结果：无变化 / 加腐化基底 / 重掷数值 / 移除词缀。
        // 腐化基底词缀来自正式数据的 corruption 池（79 条），按部位与属性筛选。
        const vaalOmen = takeArmedOmen(next, 'vaal');
        let roll = randInt(rng, 0, 3);
        if (vaalOmen && vaalOmen.effect === 'vaal_always_change' && roll === 0) roll = randInt(rng, 1, 3);
        if (roll === 0) {
          message = '瓦尔宝珠：物品腐化，但没有别的变化。';
        } else if (roll === 1) {
          const pool = corruptionCandidates(next);
          if (pool.length) {
            const pick = pool[randInt(rng, 0, pool.length - 1)];
            const tier = pick.tiers[randInt(rng, 0, pick.tiers.length - 1)];
            const values = tier.v.map((r) => roundVal(randFloat(rng, r[0], r[1])));
            next.implicitMods = [{
              modId: pick.id,
              group: pick.group,
              text: formatText(tier.text, values),
              values,
              corrupted: true,
            }];
            message = '瓦尔宝珠：物品腐化，并获得腐化基底「' + next.implicitMods[0].text.split('\n')[0] + '」。';
          } else {
            message = '瓦尔宝珠：物品腐化，但没有别的变化。';
          }
        } else if (roll === 2 && next.affixes.length) {
          rerollAffixValues(next, rng);
          message = '瓦尔宝珠：物品腐化，并重掷了所有词缀数值。';
        } else {
          const removable = next.affixes.filter((a) => !a.fractured);
          if (removable.length) {
            const victim = removable[randInt(rng, 0, removable.length - 1)];
            next.affixes = next.affixes.filter((a) => a !== victim);
            message = '瓦尔宝珠：物品腐化，并移除了「' + victim.text.split('\n')[0] + '」。';
          } else {
            message = '瓦尔宝珠：物品腐化。';
          }
        }
        break;
      }
      case 'omen_clear': {
        const n = armedOmens(next).length;
        if (!n) return fail('没有已激活的预兆。');
        next.meta.omens = [];
        message = '取消 ' + n + ' 个已激活预兆（不退还费用）。';
        break;
      }
      case 'omen_exec': {
        const om = (D.omens || []).find((x) => x.id === action.omenId);
        if (!om) return fail('未知预兆。');
        if (!action.currency) return fail('缺少要搭配的通货。');
        // 用「激活 + 执行」两步复用现有规则：先把预兆挂上，再递归调用通货本身
        const blocked = omenAvailability(next, om.id);
        if (blocked) return fail(blocked);
        if (CORRUPT_BLOCKED.indexOf(action.currency) !== -1 && next.corrupted) return fail('物品已腐化');
        next.meta = next.meta || { multimod: false };
        next.meta.omens = armedOmens(next).concat([{
          id: om.id, name: om.name, effect: om.effect,
          appliesTo: om.appliesTo || null, cost: om.cost,
        }]);
        const inner = applyAction(next, { type: action.currency }, ctx);
        if (inner.error) return inner;
        inner.cost = Number(inner.cost || 0) + (Number(om.cost) || 0);
        inner.message = '（预兆：' + om.name + '）' + (inner.message || '');
        inner.omenId = om.id;
        return inner;
      }
      case 'omen': {
        const omen = (D.omens || []).find((x) => x.id === action.omenId);
        if (!omen) return fail('未知预兆。');
        const blocked = omenAvailability(next, action.omenId);
        if (blocked) return fail(blocked);
        if (armedOmens(next).some((o) => o.id === omen.id)) return fail('该预兆已激活。');
        next.meta.omens = armedOmens(next).concat([{
          id: omen.id, name: omen.name, effect: omen.effect,
          appliesTo: omen.appliesTo || null, cost: omen.cost,
        }]);
        message = '激活预兆「' + omen.name + '」：作用于下一次' + (omen.appliesTo === 'exalted' ? '崇高石'
          : omen.appliesTo === 'chaos' ? '混沌石' : omen.appliesTo === 'annulment' ? '剥离石'
          : omen.appliesTo === 'regal' ? '富豪石' : omen.appliesTo === 'alchemy' ? '点金石'
          : omen.appliesTo === 'divine' ? '神圣石' : omen.appliesTo === 'chance' ? '机会石'
          : omen.appliesTo === 'vaal' ? '瓦尔宝珠' : '对应操作') + '。';
        break;
      }
      default:
        return fail('未知操作。');
    }

    next.affixes.sort((a, b) => (a.affix === b.affix ? 0 : a.affix === 'prefix' ? -1 : 1));
    return { item: next, cost, message, error: null };
  }

  /* ------------------------------------------------------------------ *
   * 展示 / 统计
   * ------------------------------------------------------------------ */
  function itemName(item) {
    const base = getBase(item.baseId);
    return base ? base.name : '未知底子';
  }
  function rarityName(r) {
    return { normal: '普通', magic: '魔法', rare: '稀有', unique: '传奇' }[r] || r;
  }
  function itemText(item) {
    const base = getBase(item.baseId);
    const lines = [];
    lines.push(rarityName(item.rarity) + '物品');
    lines.push(base.name + ' (' + base.en + ')');
    lines.push('--------');
    lines.push('物品等级: ' + item.ilvl);
    if (item.influences.length) {
      lines.push('影响: ' + item.influences.map((id) => {
        const inf = D.influences.find((x) => x.id === id);
        return inf ? inf.name : id;
      }).join(' / '));
    }
    if (base.implicit) lines.push('--------', base.implicit);
    (item.implicitMods || []).forEach((m) => lines.push('腐化基底：' + m.text));
    if (item.quality) lines.push('品质: +' + item.quality + '%');
    (item.runes || []).forEach((id) => {
      const r = runeDef(id);
      if (r) lines.push(runeText(r) + '  [符文]');
    });
    if (item.affixes.length) {
      lines.push('--------');
      item.affixes.forEach((a) => {
        const tag = a.fractured ? ' [破裂]' : a.crafted ? ' [工艺]' : a.essence ? ' [精华]' : '';
        a.text.split('\n').forEach((l) => lines.push(l + (l === a.text.split('\n')[0] ? '  ' + tierLabel(a.tierRank) + tag : '')));
      });
    }
    if (item.corrupted) lines.push('--------', '已腐化');
    return lines.join('\n');
  }

  function runeValues(rune) {
    if (!rune) return [];
    const vals = (rune.v || []).slice();
    if (Array.isArray(rune.v2)) vals.push(rune.v2[0]);
    return vals;
  }

  /* 按词缀文本解析它给什么属性。
   * 正式版数据有 160+ 词缀组 / 1600+ 档位，按 group id 硬编码映射不可维护；
   * 这里直接解析官方 stat 文本模板（"#% increased Armour" / "+# to maximum Life"），
   * 对单条词缀、复合词缀、符文都能用同一套规则。 */
  const STAT_RULES = [
    { re: /^\+?\{(\d)\}% increased maximum Life$/, apply: (a, v) => { a.lifePct += num(v[0]); } },
    { re: /^\+?\{(\d)\}% increased maximum Mana$/, apply: (a, v) => { a.manaPct += num(v[0]); } },
    { re: /^\+?\{(\d)\}% increased maximum Energy Shield$/, apply: (a, v) => { a.esPct += num(v[0]); } },
    { re: /^\+?\{(\d)\} to maximum Life$/, apply: (a, v) => { a.life += num(v[0]); } },
    { re: /^\+?\{(\d)\} to maximum Mana$/, apply: (a, v) => { a.mana += num(v[0]); } },
    { re: /^\+?\{(\d)\} to maximum Energy Shield$/, apply: (a, v) => { a.esFlat += num(v[0]); } },
    { re: /^\+?\{(\d)\} to Armour$/, apply: (a, v) => { a.arFlat += num(v[0]); } },
    { re: /^\+?\{(\d)\} to Evasion Rating$/, apply: (a, v) => { a.evFlat += num(v[0]); } },
    { re: /^\+?\{(\d)\}% increased Armour and Evasion$/, apply: (a, v) => { a.arPct += num(v[0]); a.evPct += num(v[0]); } },
    { re: /^\+?\{(\d)\}% increased Armour and Energy Shield$/, apply: (a, v) => { a.arPct += num(v[0]); a.esPct += num(v[0]); } },
    { re: /^\+?\{(\d)\}% increased Evasion and Energy Shield$/, apply: (a, v) => { a.evPct += num(v[0]); a.esPct += num(v[0]); } },
    { re: /^\+?\{(\d)\}% increased Armour$/, apply: (a, v) => { a.arPct += num(v[0]); } },
    { re: /^\+?\{(\d)\}% increased Evasion Rating$/, apply: (a, v) => { a.evPct += num(v[0]); } },
    { re: /^\+?\{(\d)\}% increased Energy Shield$/, apply: (a, v) => { a.esPct += num(v[0]); } },
    { re: /^\+?\{(\d)\}% to Fire Resistance$/, apply: (a, v) => { a.res.fire += num(v[0]); } },
    { re: /^\+?\{(\d)\}% to Cold Resistance$/, apply: (a, v) => { a.res.cold += num(v[0]); } },
    { re: /^\+?\{(\d)\}% to Lightning Resistance$/, apply: (a, v) => { a.res.light += num(v[0]); } },
    { re: /^\+?\{(\d)\}% to Chaos Resistance$/, apply: (a, v) => { a.res.chaos += num(v[0]); } },
    { re: /^\+?\{(\d)\}% to all Elemental Resistances$/, apply: (a, v) => { a.res.fire += num(v[0]); a.res.cold += num(v[0]); a.res.light += num(v[0]); } },
    { re: /^\+?\{(\d)\}% to Maximum Fire Resistance$/, apply: (a, v) => { a.maxRes.fire += num(v[0]); } },
    { re: /^\+?\{(\d)\}% to Maximum Cold Resistance$/, apply: (a, v) => { a.maxRes.cold += num(v[0]); } },
    { re: /^\+?\{(\d)\}% to Maximum Lightning Resistance$/, apply: (a, v) => { a.maxRes.light += num(v[0]); } },
    { re: /^\+?\{(\d)\}% to Maximum Chaos Resistance$/, apply: (a, v) => { a.maxRes.chaos += num(v[0]); } },
    { re: /^\+?\{(\d)\}% to all Maximum Elemental Resistances$/, apply: (a, v) => { a.maxRes.fire += num(v[0]); a.maxRes.cold += num(v[0]); a.maxRes.light += num(v[0]); } },
    { re: /^\+?\{(\d)\} to Accuracy Rating$/, apply: (a, v) => { a.accuracy += num(v[0]); } },
    { re: /^\+?\{(\d)\}% increased Attack Speed$/, apply: (a, v) => { a.atkSpeed += num(v[0]); } },
    { re: /^\+?\{(\d)\}% increased Cast Speed$/, apply: (a, v) => { a.castSpeed += num(v[0]); } },
    { re: /^\+?\{(\d)\}% increased Movement Speed$/, apply: (a, v) => { a.moveSpeed += num(v[0]); } },
    { re: /^\+?\{(\d)\}% increased Physical Damage$/, apply: (a, v) => { a.physPct += num(v[0]); } },
    { re: /^\+?\{(\d)\}% increased Critical Hit Chance$/, apply: (a, v) => { a.critChance += num(v[0]); } },
    { re: /^\+?\{(\d)\}% to Critical Hit Chance$/, apply: (a, v) => { a.critChance += num(v[0]); } },
    { re: /^\+?\{(\d)\}% to Critical Damage Bonus$/, apply: (a, v) => { a.critMulti += num(v[0]); } },
    { re: /^\+?\{(\d)\}% increased Critical Damage Bonus$/, apply: (a, v) => { a.critMulti += num(v[0]); } },
    { re: /^\+?\{(\d)\}% increased Spirit$/, apply: (a, v) => { a.spirit += num(v[0]); } },
    { re: /^\+?\{(\d)\} to Spirit$/, apply: (a, v) => { a.spirit += num(v[0]); } },
    { re: /^\+?\{(\d)\} to Stun Threshold$/, apply: (a, v) => { a.stunThreshold += num(v[0]); } },
    { re: /^\+?\{(\d)\}% increased Rarity of Items found$/, apply: (a, v) => { a.rarity += num(v[0]); } },
    { re: /^\+?\{(\d)\}% increased Spell Damage$/, apply: (a, v) => { a.spellPct += num(v[0]); } },
    { re: /^Adds \{(\d)\} to \{(\d)\} Physical Damage/, apply: (a, v) => { a.physFlat += avg(v[0], v[1]); } },
    { re: /^Adds \{(\d)\} to \{(\d)\} Fire Damage/i, apply: (a, v) => { a.fireFlat += avg(v[0], v[1]); } },
    { re: /^Adds \{(\d)\} to \{(\d)\} Cold Damage/i, apply: (a, v) => { a.coldFlat += avg(v[0], v[1]); } },
    { re: /^Adds \{(\d)\} to \{(\d)\} Lightning Damage/i, apply: (a, v) => { a.lightFlat += avg(v[0], v[1]); } },
    { re: /^Gain \{(\d)\}% of Damage as Extra Physical Damage$/, apply: (a, v) => { a.extraPhys += num(v[0]); } },
    { re: /^Gain \{(\d)\}% of Damage as Extra Fire Damage$/, apply: (a, v) => { a.extraFire += num(v[0]); } },
    { re: /^Gain \{(\d)\}% of Damage as Extra Cold Damage$/, apply: (a, v) => { a.extraCold += num(v[0]); } },
    { re: /^Gain \{(\d)\}% of Damage as Extra Lightning Damage$/, apply: (a, v) => { a.extraLight += num(v[0]); } },
    { re: /^\+?\{(\d)\}% increased Flask Life Recovery rate$/, apply: (a, v) => { a.flaskLife += num(v[0]); } },
    { re: /^\+?\{(\d)\}% increased Flask Mana Recovery rate$/, apply: (a, v) => { a.flaskMana += num(v[0]); } },
  ];
  function num(x) { return Number.isFinite(Number(x)) ? Number(x) : 0; }
  function avg(a, b) { return (num(a) + num(b)) / 2; }

  function emptyStats() {
    return {
      life: 0, lifePct: 0, mana: 0, manaPct: 0,
      esFlat: 0, esPct: 0, arFlat: 0, arPct: 0, evFlat: 0, evPct: 0,
      physFlat: 0, physPct: 0, atkSpeed: 0, castSpeed: 0, moveSpeed: 0,
      critChance: 0, critMulti: 0, accuracy: 0, spirit: 0, stunThreshold: 0, rarity: 0,
      spellPct: 0, fireFlat: 0, coldFlat: 0, lightFlat: 0,
      extraPhys: 0, extraFire: 0, extraCold: 0, extraLight: 0,
      flaskLife: 0, flaskMana: 0,
      res: { fire: 0, cold: 0, light: 0, chaos: 0 },
      maxRes: { fire: 0, cold: 0, light: 0, chaos: 0 },
    };
  }

  /* 已建模的旧 group 名（符文 / 灵魂核心用中文固定文本，走这里） */
  function applyLegacyGroup(acc, group, v) {
    switch (group) {
      case 'life': acc.life += num(v[0]); break;
      case 'mana': acc.mana += num(v[0]); break;
      case 'es_flat': acc.esFlat += num(v[0]); break;
      case 'es_pct': acc.esPct += num(v[0]); break;
      case 'ar_flat': acc.arFlat += num(v[0]); break;
      case 'ar_pct': acc.arPct += num(v[0]); break;
      case 'ev_flat': acc.evFlat += num(v[0]); break;
      case 'ev_pct': acc.evPct += num(v[0]); break;
      case 'accuracy': acc.accuracy += num(v[0]); break;
      case 'stun_threshold': acc.stunThreshold += num(v[0]); break;
      case 'life_regen': acc.lifeRegen = (acc.lifeRegen || 0) + num(v[0]); break;
      case 'chaos_damage_pct': acc.chaosPct = (acc.chaosPct || 0) + num(v[0]); break;
      case 'res_fire': acc.res.fire += num(v[0]); break;
      case 'res_cold': acc.res.cold += num(v[0]); break;
      case 'res_light': acc.res.light += num(v[0]); break;
      case 'res_chaos': acc.res.chaos += num(v[0]); break;
      case 'all_res':
        acc.res.fire += num(v[0]); acc.res.cold += num(v[0]); acc.res.light += num(v[0]); break;
      case 'weapon_phys_flat': acc.physFlat += avg(v[0], v[1]); break;
      case 'weapon_phys_pct': acc.physPct += num(v[0]); break;
      case 'attack_speed': acc.atkSpeed += num(v[0]); break;
      case 'cast_speed': acc.castSpeed += num(v[0]); break;
      case 'move_speed': acc.moveSpeed += num(v[0]); break;
      case 'crit_chance_weapon': acc.critChance += num(v[0]); break;
      case 'crit_multi': acc.critMulti += num(v[0]); break;
      case 'weapon_fire_flat': acc.fireFlat += avg(v[0], v[1]); break;
      case 'weapon_cold_flat': acc.coldFlat += avg(v[0], v[1]); break;
      case 'weapon_light_flat': acc.lightFlat += avg(v[0], v[1]); break;
    }
  }

  /* 把一条词缀文本拆成若干行 stat，逐行套规则 */
  /* 腐化基底词缀池：只取 kind==='corruption' 且适配当前底子的词缀。
   * 这批数据在正式数据里共 79 条，瓦尔宝珠「加腐化基底」结果从这里抽。 */
  function corruptionCandidates(item) {
    const base = getBase(item.baseId);
    if (!base) return [];
    const out = [];
    for (const mod of D.mods) {
      if (mod.kind !== 'corruption') continue;
      if (!modEligibleOnBase(mod, base, item)) continue;
      if (!mod.tiers || !mod.tiers.length) continue;
      out.push(mod);
    }
    return out;
  }

  /* ------------------------------------------------------------------ *
   * 深渊 / 亵渎词缀（Abyss Desecrated）
   *
   * 游戏里用「保存之骨」类通货对稀有物品使用：暴露出若干条深渊词缀供三选一。
   * 这里按同一流程建模（流程简化，词缀本身来自正式数据）：
   *   1. 词缀满 6 条时先移除 1 条非破裂词缀腾位；
   *   2. 从 desecrated 池按部位 / 属性抽 3 条；
   *   3. 玩家选定 1 条后加入物品，标记 desecrated。
   * ------------------------------------------------------------------ */
  function desecratedCandidates(item) {
    const base = getBase(item.baseId);
    if (!base) return [];
    const groups = existingGroups(item);
    const out = [];
    for (const mod of D.mods) {
      if (mod.kind !== 'desecrated') continue;
      if (!modEligibleOnBase(mod, base, item)) continue;
      if (!mod.tiers || !mod.tiers.length) continue;
      if (groups[mod.group]) continue;
      out.push(mod);
    }
    return out;
  }
  function desecrateAvailability(item) {
    if (!item) return '没有物品';
    if (item.corrupted) return '物品已腐化，不能亵渎';
    if (item.rarity !== 'rare') return '亵渎只能用于稀有物品';
    if (!desecratedCandidates(item).length) return '该底子没有可用的深渊词缀';
    const space = canAdd(item, 'prefix') || canAdd(item, 'suffix');
    const removable = item.affixes.some((a) => !a.fractured);
    if (!space && !removable) return '词缀已满且没有可移除的词缀';
    return null;
  }
  /* 抽 count 条不同词缀组的候选，数值已掷好，供界面三选一。
   * 优先只抽「该侧还有空位」的词缀，避免玩家选完发现放不进去。 */
  function desecrateChoices(item, rng, count) {
    const n = Math.max(1, Number(count) || 3);
    let pool = desecratedCandidates(item);
    const openSides = ['prefix', 'suffix'].filter((s) => canAdd(item, s));
    const fit = pool.filter((m) => openSides.indexOf(m.affix) !== -1);
    if (fit.length) pool = fit;
    pool = pool.slice();
    const out = [];
    while (out.length < n && pool.length) {
      const idx = randInt(rng, 0, pool.length - 1);
      const mod = pool.splice(idx, 1)[0];
      // 深渊词缀同样受物品等级门槛约束：低等级物品不该翻出满级深渊档
      const desBase = getBase(item.baseId);
      const desTiers = eligibleTiersFor(mod, item.ilvl, desBase);
      const tier = pickTier(rng, mod, desTiers.length ? desTiers : mod.tiers, desBase);
      const values = tier.v.map((r) => roundVal(randFloat(rng, r[0], r[1])));
      out.push({
        modId: mod.id,
        group: mod.group,
        affix: mod.affix,
        name: mod.name,
        text: formatText(tier.text, values),
        values,
        tierRank: tierRank(mod, tier),
        tierIlvl: tier.ilvl,
      });
    }
    return out;
  }
  /* 把玩家选中的深渊词缀真正加到物品上 */
  function applyDesecratedPick(item, choice) {
    const mod = modById[choice.modId];
    if (!mod) return { error: '未知的深渊词缀' };
    const next = clone(item);
    const aff = {
      uid: uidCounter++,
      modId: mod.id,
      group: mod.group,
      affix: mod.affix,
      name: mod.name,
      tierRank: choice.tierRank || 1,
      tierIlvl: choice.tierIlvl || 1,
      values: (choice.values || []).slice(),
      text: choice.text,
      tags: (mod.tags || []).slice(),
      crafted: false,
      fractured: false,
      essence: false,
      desecrated: true,
      influence: null,
      benchId: null,
    };
    next.affixes.push(aff);
    next.affixes.sort((a, b) => (a.affix === b.affix ? 0 : a.affix === 'prefix' ? -1 : 1));
    return { item: next, affix: aff };
  }
  function applyStatText(acc, text, values) {
    const lines = String(text || '').split('\n');
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      const rule = STAT_RULES.find((r) => r.re.test(trimmed));
      if (rule) rule.apply(acc, values);
    }
  }

  function derivedStats(item) {
    const base = getBase(item.baseId);
    const acc = emptyStats();

    item.affixes.forEach((a) => {
      applyStatText(acc, a.text, a.values || []);
      applyLegacyGroup(acc, a.group, a.values || []); // 兼容旧存档里的中文词缀
    });
    // 腐化基底词缀同样计入属性
    (item.implicitMods || []).forEach((m) => applyStatText(acc, m.text, m.values || []));
    (item.runes || []).forEach((id) => {
      const r = runeDef(id);
      if (!r) return;
      // 符文文本是官方写法，走与词缀相同的解析规则；legacy group 保留作兜底
      const eff = runeEffectFor(r, base);
      const vals = (eff ? (eff.v || []) : runeValues(r)).map((x) => (Array.isArray(x) ? x[0] : x));
      // applyStatText 需要模板（含 {n}）+ 数值，不能传渲染后的文本
      applyStatText(acc, eff ? eff.text : r.text, vals);
      applyLegacyGroup(acc, r.group, vals);
    });

    // 品质放大底子的基础防御与武器物理伤害（PoE2 品质的实际作用）
    const q = 1 + (item.quality || 0) / 100;
    const baseDef = base.defence || {};
    const lifePctMult = 1 + acc.lifePct / 100;
    const manaPctMult = 1 + acc.manaPct / 100;
    let dps = null, aps = null, crit = null;
    if (base.weapon && Array.isArray(base.weapon.phys)) {
      const w = base.weapon;
      const physAvg = ((w.phys[0] + w.phys[1]) / 2) * q * (1 + acc.physPct / 100) + acc.physFlat;
      aps = (w.aps || 1) * (1 + acc.atkSpeed / 100);
      crit = (w.crit || 5) * (1 + acc.critChance / 100);
      // 额外伤害按当前物理均值折算进 DPS
      const extraMult = 1 + (acc.extraPhys + acc.extraFire + acc.extraCold + acc.extraLight) / 100;
      dps = physAvg * aps * extraMult;
    }
    return {
      life: acc.life * lifePctMult,
      mana: acc.mana * manaPctMult,
      es: acc.esFlat + (baseDef.es || 0) * q * (1 + acc.esPct / 100),
      ar: acc.arFlat + (baseDef.ar || 0) * q * (1 + acc.arPct / 100),
      ev: acc.evFlat + (baseDef.ev || 0) * q * (1 + acc.evPct / 100),
      res: acc.res, maxRes: acc.maxRes, dps, aps, crit,
      critMulti: acc.critMulti,
      accuracy: acc.accuracy, spirit: acc.spirit, stunThreshold: acc.stunThreshold,
      rarity: acc.rarity, spellPct: acc.spellPct,
      moveSpeed: acc.moveSpeed, atkSpeed: acc.atkSpeed, castSpeed: acc.castSpeed,
      physFlat: acc.physFlat, physPct: acc.physPct,
      quality: item.quality || 0,
    };
  }

  function benchOptions(item) {
    return D.bench.filter((b) => validBench(item, b));
  }

  function syncUid(item) {
    if (!item || !item.affixes) return;
    item.affixes.forEach((a) => {
      if (Number(a.uid) >= uidCounter) uidCounter = Number(a.uid) + 1;
    });
  }

  function removeAffix(item, uid) {
    const aff = item.affixes.find((a) => a.uid === uid);
    if (!aff) return { error: '未找到词缀。' };
    if (aff.fractured) return { error: '破裂词缀无法直接移除。' };
    const next = clone(item);
    next.affixes = next.affixes.filter((a) => a.uid !== uid);
    return { item: next };
  }

  function addManualAffix(item, modId, opts) {
    opts = opts || {};
    const base = getBase(item.baseId);
    const def = modById[modId] || benchById[modId];
    if (!def) return { error: '未知词缀。' };
    if (item.affixes.length >= 6) return { error: '词缀已满（最多 6 条）。' };
    if (item.rarity === 'normal') return { error: '普通物品没有词缀。' };
    const side = def.affix;
    if (!canAdd(item, side)) return { error: '该侧词缀已满。' };
    if (benchById[modId]) {
      if (!validBench(item, def)) return { error: '无法添加工艺词缀。' };
      const next = clone(item);
      const aff = makeCustomAffix(Object.assign({}, def, { group: BENCH_GROUP[def.id] || def.group || def.id }), Math.random, {
        crafted: true, benchId: def.id, tierRank: 1, tierIlvl: 1, name: def.name,
      });
      next.affixes.push(aff);
      return { item: next };
    }
    if (existingGroups(item)[def.group || def.id]) return { error: '已有同组词缀。' };
    const tiers = eligibleTiers(def, item.ilvl);
    if (!tiers.length) return { error: '物品等级不足，无法出现该词缀。' };
    let tier = tiers[tiers.length - 1];
    if (opts.tier) {
      const rank = Number(opts.tier);
      const found = def.tiers.find((t) => tierRank(def, t) === rank && t.ilvl <= item.ilvl);
      if (found) tier = found;
    }
    const next = clone(item);
    const aff = makeAffix(def, tier, Math.random, {
      fractured: !!opts.fractured,
      crafted: !!opts.crafted,
      tierRank: tierRank(def, tier),
    });
    if (opts.values) aff.values = opts.values.slice();
    aff.text = formatText(def.text, aff.values);
    next.affixes.push(aff);
    return { item: next };
  }

  function actionAvailability(item, type) {
    const space = canAdd(item, 'prefix') || canAdd(item, 'suffix');
    const removable = item.affixes.some((a) => !a.fractured);
    // 腐化后普通通货全部不可用，理由统一（与 applyAction 的拦截保持一致）。
    const CORRUPT_BLOCKED = ['transmute', 'augmentation', 'regal', 'alchemy', 'chaos', 'exalted', 'annulment', 'divine', 'whetstone', 'scrap'];
    if (item.corrupted && CORRUPT_BLOCKED.indexOf(type) !== -1) return '物品已腐化，不能用普通通货';
    switch (type) {
      case 'transmute': return item.rarity === 'normal' ? null : '只能用于普通物品';
      case 'augmentation': return item.rarity === 'magic' && space ? null : (item.rarity !== 'magic' ? '只能用于魔法物品' : '魔法物品已有 2 条词缀');
      case 'regal': return item.rarity === 'magic' ? null : '只能用于魔法物品';
      case 'alchemy': return (item.rarity === 'normal' || item.rarity === 'magic') ? null : '只能用于普通 / 魔法物品';
      case 'chaos': return item.rarity === 'rare' && removable ? null : (item.rarity !== 'rare' ? '只能用于稀有物品' : '没有可移除词缀');
      case 'exalted': return item.rarity === 'rare' && space ? null : (item.rarity !== 'rare' ? '只能用于稀有物品' : '词缀已满');
      case 'annulment': return (item.rarity === 'rare' || item.rarity === 'magic') && removable ? null : (removable ? '只能用于魔法 / 稀有物品' : '没有可移除词缀');
      case 'divine': return (item.rarity === 'rare' || item.rarity === 'magic') && item.affixes.length ? null : '没有可重掷的词缀';
      case 'whetstone': {
        if (getBase(item.baseId).slot !== 'weapon') return '磨刀石只能用于武器';
        if (item.rarity === 'normal') return '先做成魔法 / 稀有再加品质';
        return (item.quality || 0) >= 20 ? '品质已达上限 20%。' : null;
      }
      case 'scrap': {
        const base = getBase(item.baseId);
        if (base.slot === 'weapon') return '护甲片不能用于武器';
        if (!canSocket(base)) return '护甲片只能用于护甲 / 盾 / 法器';
        if (item.rarity === 'normal') return '先做成魔法 / 稀有再加品质';
        return (item.quality || 0) >= 20 ? '品质已达上限 20%。' : null;
      }
      case 'vaal': return item.corrupted ? '物品已经腐化' : null;
      case 'desecrate': return desecrateAvailability(item);
    case 'omen_clear': return (armedOmens(item).length) ? null : '没有已激活的预兆';
      case 'desecrate_pick': return null;
      default: return '不可用';
    }
  }
  /* 取该精华对当前物品生效的那条效果：先按槽位匹配，武器再按类别匹配。
   * 正式数据里同一条精华对不同部位给的效果不同（例如躯体精华对护甲给生命、
   * 对首饰给另一档生命），所以必须按物品实际部位挑一条。 */
  function essenceDescForItem(item, essence) {
    const base = getBase(item.baseId);
    if (!base || !essence || !Array.isArray(essence.effects)) return null;
    const weaponClasses = (base.weapon && base.weapon.class) || [];
    const candidates = essence.effects.filter((eff) => (eff.slots || []).indexOf(base.slot) !== -1);
    if (!candidates.length) return null;
    if (base.slot === 'weapon') {
      const byClass = candidates.filter((eff) => !eff.weapons || !eff.weapons.length
        || eff.weapons.some((w) => weaponClasses.indexOf(w) !== -1));
      return byClass[0] || null;
    }
    return candidates[0];
  }
  /* 精华可用性：部位支持 / 稀有度按档位判定。
   * 界面的不可用理由、applyAction 的失败原因、顾问的候选过滤都只走这一处。 */
  function essenceAvailability(item, essence) {
    if (!essence) return '未知精华。';
    const eff = essenceDescForItem(item, essence);
    if (!eff) return '该精华不支持此物品';
    if (essence.perfect || essence.tier === 4) {
      if (item.rarity !== 'rare') return '完美精华只能用于稀有物品';
      if (!item.affixes.some((a) => !a.fractured)) return '没有可移除词缀';
      if (!canAdd(item, eff.affix) && !item.affixes.some((a) => !a.fractured)) return '词缀已满';
    } else {
      if (item.rarity !== 'magic') return '该档精华只能用于魔法物品';
      if (!canAdd(item, eff.affix)) return '该侧词缀已满（' + (eff.affix === 'prefix' ? '前缀' : '后缀') + '）';
    }
    return null;
  }
  function omenAvailability(item, omenId) {
    const def = (D.omens || []).find((o) => o.id === omenId);
    if (!def) return '未知预兆。';
    if (def.implemented === false) return '该预兆的效果尚未建模';
    if (item.corrupted) return '物品已腐化';
    if (armedOmens(item).some((o) => o.id === omenId)) return '该预兆已激活';
    return null;
  }



  /* app.js 的存档 / 导入流程会调用 syncMetaFlags 修正 meta 标记。
   * PoE2 没有 meta 工艺，这里只需要保证 meta 结构存在且是布尔值，
   * 但仍然必须提供这个函数：缺了它，loadState 会抛错并静默丢掉整个存档。 */
  /* 旧存档 / 手写 JSON 可能没有 quality / corrupted / sockets / runes 字段。
   * 统一补齐，避免界面与规则判断读到 undefined。 */
  function normalizeItem(item) {
    if (!item) return item;
    const base = getBase(item.baseId);
    if (typeof item.quality !== 'number' || !Number.isFinite(item.quality)) item.quality = 0;
    item.corrupted = !!item.corrupted;
    item.affixes = item.affixes || [];
    item.influences = item.influences || [];
    if (typeof item.sockets !== 'number' || !Number.isFinite(item.sockets)) item.sockets = defaultSockets(base);
    item.runes = (Array.isArray(item.runes) ? item.runes : []).filter((id) => !!runeDef(id));
    item.implicitMods = (Array.isArray(item.implicitMods) ? item.implicitMods : []);
    if (item.runes.length > item.sockets) item.runes = item.runes.slice(0, item.sockets);
    item.meta = item.meta || { multimod: false };
    item.meta.omens = item.meta.omens || [];
    item.meta.omens = item.meta.omens || [];
    item.meta.multimod = !!item.meta.multimod;
    return item;
  }

  function syncMetaFlags(item) {
    if (!item) return item;
    normalizeItem(item);
    return item;
  }

  const api = {
    makeRng, rand, randInt, randFloat, weightedPick, clone,
    getBase, createItem, modEligibleOnBase, targetEligibleOnBase, tierRank, tierLabel,
    eligibleTiers, eligibleTiersFor, tierWeightFor, baseTierLadder, tierRankForBase, affixTierForBase,
    candidatesFor, addRandomAffix,
    exactAddPool, exactAddOutcome, exactAddActionOutcome, exactActionOutcomes, sideProbabilities,
    setSidePolicy, getSidePolicy, applyAction, actionCost, mergePrices,
    evaluate, getTargetDef, targetGroup, isBenchTarget, findMatchingAffix,
    itemText, itemName, rarityName, derivedStats, benchOptions, validBench,
    removeAffix, addManualAffix, syncUid, sides, canAdd, sideCap, craftedCount, maxCrafted,
    baseDefenceTags, formatText, fmtNum, tierLabel, benchById, modById, essenceById, fossilById,
    actionAvailability, omenAvailability, essenceAvailability, essenceDescForItem, syncMetaFlags,
    corruptionCandidates, desecratedCandidates, baseTags, weightFor, desecrateAvailability, desecrateChoices, runeDef, runeValues, runeText, runeStatText, runeEffectFor, runeEligibleOnBase, runeAvailability, clearSocketsAvailability, canSocket, normalizeItem,
  };

  /* 词缀 / 精华数据在浏览器里是按需注入的（js/data-poe2.js 的 installHeavyData）。
   * 数据到齐后调这个把索引补齐：原地清空再填，外部已经拿到的 modById / targetById
   * 引用继续有效，不用重新取。 */
  function installData() {
    for (const k of Object.keys(modById)) delete modById[k];
    for (const k of Object.keys(essenceById)) delete essenceById[k];
    D.mods.forEach((m) => { modById[m.id] = m; });
    D.essences.forEach((e) => { essenceById[e.id] = e; });
    for (const k of Object.keys(targetById)) delete targetById[k];
    Object.assign(targetById, modById, benchById);
    // 精华保底词缀也能作为目标
    for (const t of (D.essenceTargets || [])) targetById[t.id] = t;
    return { mods: D.mods.length, essences: D.essences.length };
  }
  api.installData = installData;

  global.PoE2Engine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
