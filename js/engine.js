/* 流放之路 1 做装台 · 规则引擎 */
(function (global) {
  'use strict';

  const D = global.PoEData;

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
    return String(text).replace(/\{(\d+)\}/g, (m, i) => {
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
  const metaById = {};
  D.metaCrafts.forEach((m) => { metaById[m.id] = m; });
  const veilById = {};
  D.veiledMods.forEach((m) => { veilById[m.id] = m; });
  const AWAKENER_ORDER = ['shaper', 'elder', 'crusader', 'redeemer', 'hunter', 'warlord'];
  const fossilById = {};
  D.fossils.forEach((f) => { fossilById[f.id] = f; });
  const targetById = Object.assign({}, modById, benchById);

  /* ------------------------------------------------------------------ *
   * 底子 / 词缀资格
   * ------------------------------------------------------------------ */
  function getBase(baseId) { return baseById[baseId]; }
  function createItem(baseId, opts) {
    opts = opts || {};
    const base = getBase(baseId) || D.bases[0];
    return {
      baseId: base.id,
      ilvl: Math.max(1, Math.min(100, Number(opts.ilvl) || base.ilvl)),
      influences: (opts.influences || []).slice(0, 2),
      rarity: opts.rarity || 'normal',
      affixes: opts.affixes || [],
      quality: opts.quality || 0,
      corrupted: !!opts.corrupted,
      meta: { multimod: false },
    };
  }
  function baseDefenceTags(base) {
    return Object.keys(base.defence || {});
  }
  function modEligibleOnBase(mod, base, item) {
    if (!mod.slots || mod.slots.indexOf(base.slot) === -1) return false;
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
  function pickTier(rng, mod, tiers) {
    return weightedPick(rng, tiers, (t) => Math.pow(tierRank(mod, t), 1.35));
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
  function isMetaAffix(a) {
    return !!(a && (a.meta || (a.group || '').indexOf('meta_') === 0));
  }
  function syncMetaFlags(item) {
    item.meta = item.meta || {};
    item.meta.multimod = item.affixes.some((a) => a.group === 'meta_multimod');
    item.meta.lockPrefix = item.affixes.some((a) => a.group === 'meta_lock_prefix');
    item.meta.lockSuffix = item.affixes.some((a) => a.group === 'meta_lock_suffix');
  }
  function metaAffix(def) {
    return {
      uid: uidCounter++, id: 'meta_' + def.id, modId: 'meta_' + def.id, name: def.name,
      affix: def.affix, group: def.group, text: def.text, values: [], tiers: [],
      tierRank: 1, tierIlvl: 1, tierName: '工艺', tags: ['crafted', 'meta'],
      crafted: true, meta: true, metaType: def.id,
    };
  }
  function metaAvailability(item, metaId) {
    const def = metaById[metaId];
    if (!def) return '未知工艺。';
    if (item.corrupted) return '物品已腐化，不能使用工艺台。';
    if (item.rarity !== 'rare') return 'meta 工艺只能用于稀有物品。';
    if (existingGroups(item)[def.group]) return '已经有这个 meta 工艺。';
    if (craftedCount(item) >= maxCrafted(item)) return '工艺词缀已满；先移除一条或使用多重工艺。';
    if (!canAdd(item, def.affix)) return '对应的一侧已经没有空位。';
    if (def.id === 'lock_prefix' && !sides(item, 'prefix').length) return '没有可保护的前缀。';
    if (def.id === 'lock_suffix' && !sides(item, 'suffix').length) return '没有可保护的后缀。';
    return null;
  }
  function lockedSides(item) {
    return {
      prefix: !!(item.meta && item.meta.lockPrefix) || item.affixes.some((a) => a.group === 'meta_lock_prefix'),
      suffix: !!(item.meta && item.meta.lockSuffix) || item.affixes.some((a) => a.group === 'meta_lock_suffix'),
    };
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
      if (groups[mod.group]) continue;
      if (!modEligibleOnBase(mod, base, item)) continue;
      if (opts.onlyTag && mod.tags.indexOf(opts.onlyTag) === -1) continue;
      const tiers = eligibleTiers(mod, item.ilvl);
      if (!tiers.length) continue;
      let w = mod.weight;
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

  function makeAffix(mod, tier, rng, opts) {
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
      text: formatText(opts.text || mod.text, values),
      template: opts.text || mod.text,
      ranges: tier.v.map((r) => r.slice()),
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
      template: desc.text,
      ranges: desc.v.map((r) => r.slice()),
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
    const pool = candidatesFor(item, side, opts || {});
    if (!pool.length) return null;
    const choice = weightedPick(rng, pool, (x) => x.weight);
    if (!choice) return null;
    const tier = pickTier(rng, choice.mod, choice.tiers);
    const aff = makeAffix(choice.mod, tier, rng);
    item.affixes.push(aff);
    return aff;
  }

  function chooseSide(item, rng, preserveSides) {
    const keep = preserveSides || [];
    const opts = ['prefix', 'suffix'].filter((s) => canAdd(item, s) && keep.indexOf(s) === -1);
    if (!opts.length) return null;
    if (opts.length === 1) return opts[0];
    const p = sides(item, 'prefix').length;
    const s = sides(item, 'suffix').length;
    if (p < s) return 'prefix';
    if (s < p) return 'suffix';
    return rand(rng) < 0.5 ? 'prefix' : 'suffix';
  }

  function fillTo(item, total, rng, opts) {
    opts = opts || {};
    while (item.affixes.length < total) {
      const side = chooseSide(item, rng, opts.preserveSides);
      if (!side) break;
      const aff = addRandomAffix(item, side, rng, opts);
      if (!aff) break;
    }
    if (opts.guaranteeTag && !item.affixes.some((a) => a.tags.indexOf(opts.guaranteeTag) !== -1)) {
      // 至少一条对应标签：把一条非破裂词缀替换为标签词缀
      const keepSides = opts.preserveSides || [];
      const replaceable = item.affixes.filter((a) => !a.fractured && keepSides.indexOf(a.affix) === -1);
      if (replaceable.length) {
        const victim = replaceable[randInt(rng, 0, replaceable.length - 1)];
        const side = victim.affix;
        item.affixes = item.affixes.filter((a) => a !== victim);
        const pool = candidatesFor(item, side, Object.assign({}, opts, { tag: opts.guaranteeTag }));
        if (pool.length) {
          const choice = weightedPick(rng, pool, (x) => x.weight);
          const tier = pickTier(rng, choice.mod, choice.tiers);
          item.affixes.push(makeAffix(choice.mod, tier, rng));
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
    const junk = item.affixes.filter((a) => !targetGroups[a.group] && !isMetaAffix(a));
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
      case 'alteration': return prices.alteration;
      case 'augmentation': return prices.augmentation;
      case 'regal': return prices.regal;
      case 'alchemy': return prices.alchemy;
      case 'chaos': return prices.chaos;
      case 'exalted': return prices.exalted;
      case 'annulment': return prices.annulment;
      case 'scour': return prices.scour;
      case 'divine': return prices.divine;
      case 'vaal': return prices.vaal;
      case 'aisling': return prices.aisling || 160;
      case 'eldritch': return prices['eldritch' + (['', 'Lesser', 'Greater', 'Grand', 'Exceptional'][action.tier] || 'Lesser')] || 1;
      case 'unveil': return 0;
      case 'awakener': return prices.awakener || 120;
      case 'essence': {
        const e = essenceById[action.essenceId];
        return e ? e.cost * (prices.essenceMult || 1) : 0;
      }
      case 'fossil': {
        const ids = action.fossilIds || [];
        const sum = ids.reduce((n, id) => n + (fossilById[id] ? fossilById[id].cost : 0), 0);
        return (sum + prices.resonator) * (prices.fossilMult || 1);
      }
      case 'harvest':
      case 'harvest_remove':
      case 'harvest_add':
      case 'harvest_augment': return prices.harvest;
      case 'bench': {
        const b = benchById[action.benchId];
        return b ? b.cost : 0;
      }
      case 'meta': {
        const def = metaById[action.metaId];
        return def && def.id === 'multimod' ? (prices.multimod || 400) : (prices.lock || 400);
      }
      case 'multimod': return prices.multimod || 400;
      case 'lock_chaos': return (prices.lock || 400) + prices.chaos;
      case 'lock_scour': return (prices.lock || 400) + prices.scour;
      case 'lock_exalt': return (prices.lock || 400) + prices.exalted;
      default: return 0;
    }
  }

  function validBench(item, craft) {
    const base = getBase(item.baseId);
    if (item.corrupted) return false;
    if (item.rarity !== 'rare') return false;
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

  const BENCH_GROUP = {
    bench_life: 'life', bench_life_high: 'life', bench_es: 'es_flat', bench_ar: 'ar_flat',
    bench_ev: 'ev_flat', bench_mana: 'mana_flat', bench_fire_res: 'res_fire',
    bench_cold_res: 'res_cold', bench_light_res: 'res_light', bench_chaos_res: 'res_chaos',
    bench_all_res: 'all_res', bench_attack_speed: 'attack_speed', bench_cast_speed: 'cast_speed',
    bench_crit_multi: 'crit_multi', bench_move_speed: 'move_speed', bench_accuracy: 'accuracy',
  };

  function rollRareCount(rng) {
    const r = rand(rng);
    if (r < 0.52) return 4;
    if (r < 0.82) return 5;
    return 6;
  }
  function rollMagicCount(rng) {
    return rand(rng) < 0.5 ? 1 : 2;
  }

  function normalizeRarity(item) {
    if (!item.affixes || !item.affixes.length) {
      item.rarity = 'normal';
      return;
    }
    if (item.rarity === 'normal') {
      item.rarity = item.affixes.length <= 2 ? 'magic' : 'rare';
    } else if (item.rarity === 'magic' && item.affixes.length > 2) {
      item.rarity = 'rare';
    }
  }
  function rerollAffixValues(affix, rng) {
    if (!affix || affix.crafted || affix.benchId) return false;
    let ranges = affix.ranges;
    let template = affix.template;
    if (!ranges) {
      const mod = modById[affix.modId];
      if (mod) {
        const tier = (mod.tiers || []).find((t) => tierRank(mod, t) === affix.tierRank)
          || (mod.tiers || []).find((t) => t.ilvl === affix.tierIlvl);
        if (tier) {
          ranges = tier.v;
          template = template || mod.text;
        }
      }
    }
    if (!ranges || !ranges.length) return false;
    affix.values = ranges.map((range) => roundVal(randFloat(rng, range[0], range[1])));
    if (template) affix.text = formatText(template, affix.values);
    return true;
  }
  function canUseOn(item, type) {
    if (item.corrupted && type !== 'vaal') return '物品已腐化，不能使用普通通货。';
    return null;
  }
  function actionAvailability(item, type) {
    const blocked = canUseOn(item, type);
    if (blocked) return blocked;
    const space = canAdd(item, 'prefix') || canAdd(item, 'suffix');
    const removable = item.affixes.some((a) => !a.fractured);
    switch (type) {
      case 'transmute': return item.rarity === 'normal' ? null : '蜕变石只能用于普通物品';
      case 'alteration': return item.rarity === 'magic' ? null : '改造石只能用于魔法物品';
      case 'augmentation':
        if (item.rarity !== 'magic') return '增幅石只能用于魔法物品';
        return space ? null : '魔法词缀已满（最多 1 前缀 + 1 后缀）';
      case 'regal': return item.rarity === 'magic' ? null : '富豪石只能用于魔法物品';
      case 'alchemy': return item.rarity === 'normal' ? null : '点金石只能用于普通物品';
      case 'chaos': return item.rarity === 'rare' ? null : '混沌石只能重铸稀有物品';
      case 'exalted':
        if (item.rarity !== 'rare') return '崇高石只能用于稀有物品';
        return space ? null : '词缀已满，没有空余前缀或后缀';
      case 'annulment':
        if (item.rarity !== 'magic' && item.rarity !== 'rare') return '剥离石只能用于魔法或稀有物品';
        return removable ? null : '没有可剥离的非破裂词缀';
      case 'scour':
        if (item.rarity !== 'magic' && item.rarity !== 'rare') return '重铸石只能用于魔法或稀有物品';
        return removable ? null : '只有破裂词缀，无法重铸';
      case 'divine':
        if (item.rarity !== 'magic' && item.rarity !== 'rare') return '神圣石只能用于魔法或稀有物品';
        return item.affixes.length ? null : '没有可重掷数值的词缀';
      case 'vaal': return item.corrupted ? '物品已经腐化' : null;
      case 'aisling': return item.rarity === 'rare' ? null : '爱斯琳只能用于稀有物品';
      case 'eldritch': return item.corrupted ? '物品已经腐化' : null;
      case 'unveil': return item.affixes.some((a) => a.veiled) ? null : '没有待揭露的隐秘词缀';
      case 'awakener': return item.rarity === 'rare' ? null : '觉醒者之石只能用于稀有物品';
      case 'bench': return item.rarity === 'rare' ? null : '工艺台只能用于稀有物品';
      case 'meta': return item.rarity === 'rare' ? null : 'meta 工艺只能用于稀有物品';
      case 'multimod': return item.rarity === 'rare' ? null : '多重工艺只能用于稀有物品';
      case 'lock_chaos':
      case 'lock_scour':
      case 'lock_exalt': return item.rarity === 'rare' ? null : '该 meta 组合只能用于稀有物品';
      case 'essence': return (item.rarity === 'normal' || item.rarity === 'rare') ? null : '精华只能用于普通或稀有物品';
      case 'fossil': return item.rarity === 'rare' ? null : '化石只能用于稀有物品';
      case 'harvest':
      case 'harvest_remove':
      case 'harvest_add':
      case 'harvest_augment': return item.rarity === 'rare' ? null : '庄园只能用于稀有物品';
      default: return '未知操作';
    }
  }
  function eldritchAvailability(item, kind, tier) {
    if (item.corrupted) return '物品已腐化，不能使用 Eldritch 通货。';
    if (['helmet', 'body', 'gloves', 'boots'].indexOf(getBase(item.baseId).slot) === -1) return 'Eldritch 只能用于头盔 / 胸甲 / 手套 / 鞋子。';
    if (item.influences && item.influences.length) return '有势力的物品不能获得 Eldritch 基底。';
    if (!D.eldritchImplicits[kind]) return '未知 Eldritch 类型。';
    if (!tier || tier < 1 || tier > 4) return '未知 Eldritch 阶级。';
    return null;
  }
  function veiledAffix(item) {
    return item.affixes.find((a) => a.veiled);
  }
  function aislingAvailability(item) {
    if (item.corrupted) return '物品已腐化，不能使用爱斯琳。';
    if (item.rarity !== 'rare') return '爱斯琳只能用于稀有物品。';
    if (veiledAffix(item)) return '物品已经有一条待揭露的隐秘词缀。';
    if (!canAdd(item, 'prefix') && !canAdd(item, 'suffix')) return '词缀已满，没有位置添加隐秘词缀。';
    return null;
  }
  function unveilAvailability(item) {
    if (item.corrupted) return '物品已腐化，不能揭露隐秘词缀。';
    if (!veiledAffix(item)) return '物品没有待揭露的隐秘词缀。';
    return null;
  }
  function veiledChoices(item, rng) {
    if (unveilAvailability(item)) return [];
    if (item.veiledOptions && item.veiledOptions.length) {
      return item.veiledOptions.map((id) => veilById[id]).filter(Boolean);
    }
    const base = getBase(item.baseId);
    const stripped = clone(item);
    stripped.affixes = stripped.affixes.filter((a) => !a.veiled);
    const pool = D.veiledMods.filter((mod) => {
      if (!modEligibleOnBase(mod, base, stripped)) return false;
      return canAdd(stripped, mod.affix) && !existingGroups(stripped)[mod.group];
    });
    const picks = [];
    const used = {};
    let guard = 0;
    while (picks.length < 3 && pool.length && guard++ < 80) {
      const mod = pool[randInt(rng, 0, pool.length - 1)];
      if (used[mod.group]) continue;
      used[mod.group] = true;
      picks.push(mod);
    }
    return picks;
  }
  function addVeiledAffix(item, side) {
    const aff = {
      uid: uidCounter++, id: 'veiled_pending', modId: 'veiled_pending', name: '隐秘词缀',
      affix: side, group: 'veiled_pending', text: '隐秘词缀', values: [], tiers: [],
      tierRank: 0, tierIlvl: 1, tierName: '隐秘', tags: ['veiled'],
      crafted: false, fractured: false, essence: false, influence: null, veiled: true,
    };
    item.affixes.push(aff);
    return aff;
  }
  function essenceAvailability(item, essence) {
    if (!essence) return '未知精华。';
    if (item.corrupted) return '物品已腐化，不能使用精华。';
    if (item.rarity !== 'normal' && item.rarity !== 'rare') return '精华只能用于普通或稀有物品。';
    if (item.rarity === 'rare' && essence.canReforgeRare === false) return '该精华不能重铸稀有物品。';
    const locks = lockedSides(item);
    if (locks.prefix || locks.suffix) return '物品有锁前 / 锁后 meta 工艺，不能使用精华。';
    if (item.ilvl < (essence.minIlvl || 1)) return '物品等级不足，需要 ' + essence.minIlvl + ' 级。';
    const slot = getBase(item.baseId).slot;
    const cat = (slot === 'weapon' || slot === 'quiver') ? 'weapon'
      : (slot === 'ring' || slot === 'amulet' || slot === 'belt') ? 'jewellery' : 'armour';
    const desc = (essence.bySlot && essence.bySlot[slot]) || (essence.byCat && essence.byCat[cat]);
    return desc ? null : '该精华不支持此物品。';
  }
  function awakenerDonorMods(item) {
    if (!item || item.corrupted || item.rarity !== 'rare' || !item.influences || item.influences.length !== 1) return [];
    const base = getBase(item.baseId);
    const targetInf = item.influences[0];
    return D.mods.filter((mod) => {
      if (!mod.influence || mod.influence === targetInf) return false;
      const donorItem = Object.assign({}, item, { influences: [mod.influence] });
      if (!modEligibleOnBase(mod, base, donorItem)) return false;
      return eligibleTiers(mod, item.ilvl).length > 0;
    });
  }
  function awakenerAvailability(item, donorInfluence, donorModId) {
    if (item.corrupted) return '物品已腐化，不能使用觉醒者之石。';
    if (item.rarity !== 'rare') return '觉醒者之石只能用于稀有物品。';
    if (!item.influences || item.influences.length !== 1) return '目标物品必须恰好有 1 个势力影响。';
    if (!donorInfluence || donorInfluence === item.influences[0]) return '祭品势力必须与目标不同。';
    if (AWAKENER_ORDER.indexOf(donorInfluence) === -1) return '未知的祭品势力。';
    const mod = modById[donorModId];
    if (!mod || mod.influence !== donorInfluence) return '请选择祭品上的一条影响词缀。';
    const donorItem = Object.assign({}, item, { influences: [donorInfluence] });
    if (!modEligibleOnBase(mod, getBase(item.baseId), donorItem)) return '这条影响词缀不能出现在当前底子上。';
    if (!eligibleTiers(mod, item.ilvl).length) return '物品等级不足，祭品词缀没有可用品级。';
    return null;
  }
  function fossilAvailability(item, ids) {
    if (item.corrupted) return '物品已腐化，不能使用化石。';
    const locks = lockedSides(item);
    if (locks.prefix || locks.suffix) return '物品有锁前 / 锁后 meta 工艺，不能使用化石。';
    if (item.rarity !== 'rare') return '化石只能用于稀有物品。';
    if (!ids || !ids.length) return '请至少选择一枚化石。';
    return null;
  }
  function harvestAvailability(item, tag) {
    if (item.corrupted) return '物品已腐化，不能使用庄园。';
    if (item.rarity !== 'rare') return '庄园重铸只能用于稀有物品。';
    if (!tag) return '请选择庄园标签。';
    return null;
  }
  function harvestModeAvailability(item, tag, mode) {
    if (item.corrupted) return '物品已腐化，不能使用庄园。';
    if (item.rarity !== 'rare') return '庄园只能用于稀有物品。';
    if (!tag) return '请选择庄园标签。';
    const locks = lockedSides(item);
    if (mode === 'harvest_remove') {
      const removable = item.affixes.filter((a) => !a.fractured && !locks[a.affix] && (a.tags || []).indexOf(tag) !== -1);
      return removable.length ? null : '没有可移除的「' + tag + '」标签词缀。';
    }
    if (mode === 'harvest_add') {
      const removable = item.affixes.filter((a) => !a.fractured && !locks[a.affix]);
      return removable.length ? null : '没有可移除的词缀。';
    }
    if (mode === 'harvest_augment') {
      if (!canAdd(item, 'prefix') && !canAdd(item, 'suffix')) return '词缀已满，无法定向增幅。';
      return null;
    }
    return null;
  }
  function applyAction(item, action, ctx) {
    ctx = ctx || {};
    const rng = ctx.rng || defaultRng;
    const prices = mergePrices(ctx.prices);
    const next = clone(item);
    next.meta = next.meta || { multimod: false };
    const cost = actionCost(action, prices);
    const fail = (msg) => ({ error: msg, item: next, cost: 0, message: '' });
    if (next.corrupted && action.type !== 'vaal') return fail('物品已腐化，不能使用普通通货。');
    let message = '';

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
        if (!canAdd(next, 'prefix') && !canAdd(next, 'suffix')) return fail('词缀已满，无法使用增幅石。');
        const side = chooseSide(next, rng);
        addRandomAffix(next, side, rng, {});
        message = '使用增幅石：增加一条随机' + (side === 'prefix' ? '前缀' : '后缀') + '。';
        break;
      }
      case 'regal': {
        if (next.rarity !== 'magic') return fail('富豪石只能用于魔法物品。');
        next.rarity = 'rare';
        const side = chooseSide(next, rng);
        addRandomAffix(next, side, rng, {});
        message = '使用富豪石：魔法物品升级为稀有物品。';
        break;
      }
      case 'alchemy': {
        if (next.rarity !== 'normal') return fail('点金石只能用于普通物品。');
        next.rarity = 'rare';
        clearForReroll(next, []);
        fillTo(next, 4, rng, {});
        message = '使用点金石：普通物品变为 4 词缀稀有物品。';
        break;
      }
      case 'chaos': {
        if (next.rarity !== 'rare') return fail('混沌石只能重铸稀有物品。');
        const locks = lockedSides(next);
        if (locks.prefix && locks.suffix) return fail('前缀和后缀都被锁住，混沌石无法改变任何词缀。');
        const preserve = locks.prefix ? ['prefix'] : (locks.suffix ? ['suffix'] : []);
        clearForReroll(next, preserve);
        fillTo(next, rollRareCount(rng), rng, { preserveSides: preserve });
        message = preserve.length
          ? '使用混沌石：保留' + (preserve[0] === 'prefix' ? '前缀' : '后缀') + '，重铸另一侧词缀。'
          : '使用混沌石：重铸稀有词缀。';
        break;
      }
      case 'exalted': {
        if (next.rarity !== 'rare') return fail('崇高石只能用于稀有物品。');
        if (!canAdd(next, 'prefix') && !canAdd(next, 'suffix')) return fail('词缀已满，无法使用崇高石。');
        const locks = lockedSides(next);
        if (locks.prefix && locks.suffix) return fail('前缀和后缀都被锁住，无法使用崇高石。');
        let side;
        if (locks.prefix) side = 'suffix';
        else if (locks.suffix) side = 'prefix';
        else side = chooseSide(next, rng);
        if (!side || !canAdd(next, side)) return fail('可增加词缀的一侧已满，无法使用崇高石。');
        addRandomAffix(next, side, rng, {});
        message = '使用崇高石：增加一条随机' + (side === 'prefix' ? '前缀' : '后缀') + '。';
        break;
      }
      case 'annulment': {
        if (next.rarity !== 'rare' && next.rarity !== 'magic') return fail('剥离石只能用于魔法或稀有物品。');
        const locks = lockedSides(next);
        const removable = next.affixes.filter((a) => !a.fractured && !(locks[a.affix]));
        if (!removable.length) return fail('没有可剥离的词缀（破裂词缀无法剥离）。');
        const victim = removable[randInt(rng, 0, removable.length - 1)];
        next.affixes = next.affixes.filter((a) => a !== victim);
        normalizeRarity(next);
        message = '使用剥离石：移除了「' + victim.text.split('\n')[0] + '」。';
        break;
      }
      case 'scour': {
        if (next.rarity !== 'rare' && next.rarity !== 'magic') return fail('重铸石只能用于魔法或稀有物品。');
        const locks = lockedSides(next);
        const preserve = [];
        if (locks.prefix) preserve.push('prefix');
        if (locks.suffix) preserve.push('suffix');
        clearForReroll(next, preserve);
        normalizeRarity(next);
        if (next.rarity !== 'normal') next.rarity = 'rare';
        message = preserve.length
          ? '使用重铸石：保留' + (preserve.length === 2 ? '两侧' : (preserve[0] === 'prefix' ? '前缀' : '后缀')) + '，清除其余词缀。'
          : '使用重铸石：清除词缀。';
        break;
      }
      case 'divine': {
        if (next.rarity !== 'magic' && next.rarity !== 'rare') return fail('神圣石只能用于魔法或稀有物品。');
        if (!next.affixes.length) return fail('没有可重掷数值的词缀。');
        let changed = 0;
        next.affixes.forEach((a) => { if (rerollAffixValues(a, rng)) changed++; });
        if (!changed) return fail('没有可重掷数值的词缀（工艺词缀数值固定）。');
        message = '使用神圣石：重掷了 ' + changed + ' 条词缀的数值，词缀和品级不变。';
        break;
      }
      case 'vaal': {
        if (next.corrupted) return fail('物品已经腐化。');
        next.corrupted = true;
        const slot = getBase(next.baseId).slot;
        const pool = (D.vaalImplicits && D.vaalImplicits[slot]) || [];
        const roll = rand(rng);
        if (roll < 0.25 && pool.length) {
          next.corruptedImplicit = pool[randInt(rng, 0, pool.length - 1)];
          message = '瓦尔宝珠：获得腐化基底「' + next.corruptedImplicit + '」。';
        } else if (roll < 0.5) {
          message = '瓦尔宝珠：白孔结果（本模拟器未建模插槽，物品只获得腐化状态）。';
        } else if (roll < 0.75) {
          const locks = lockedSides(next);
          const preserve = [];
          if (locks.prefix) preserve.push('prefix');
          if (locks.suffix) preserve.push('suffix');
          next.rarity = 'rare';
          clearForReroll(next, preserve);
          fillTo(next, 6, rng, { preserveSides: preserve });
          message = '瓦尔宝珠：物品变为 6 词缀稀有物品。';
        } else {
          message = '瓦尔宝珠：没有发生额外变化，物品被腐化。';
        }
        break;
      }
      case 'awakener': {
        const reason = awakenerAvailability(next, action.donorInfluence, action.donorModId);
        if (reason) return fail(reason);
        const targetInf = next.influences[0];
        const donorInf = action.donorInfluence;
        const donorMod = modById[action.donorModId];
        const donorTiers = eligibleTiers(donorMod, next.ilvl);
        const donorTier = (action.donorTierIlvl && donorTiers.find((t) => t.ilvl === action.donorTierIlvl)) || pickTier(rng, donorMod, donorTiers);
        const targetInfluenced = next.affixes.filter((a) => a.influence === targetInf);
        let keptTarget = targetInfluenced.length ? clone(targetInfluenced[randInt(rng, 0, targetInfluenced.length - 1)]) : null;
        if (keptTarget) rerollAffixValues(keptTarget, rng);
        const donorAff = makeAffix(donorMod, donorTier, rng);
        let addDonor = true;
        if (keptTarget && keptTarget.group === donorAff.group) {
          if (rand(rng) < 0.5) keptTarget = null;
          else addDonor = false;
        }
        next.affixes = [];
        next.influences = AWAKENER_ORDER.filter((id) => id === targetInf || id === donorInf);
        next.rarity = 'rare';
        next.meta = { multimod: false, lockPrefix: false, lockSuffix: false };
        if (keptTarget && keptTarget.group !== donorAff.group) next.affixes.push(keptTarget);
        if (addDonor && canAdd(next, donorAff.affix) && !existingGroups(next)[donorAff.group]) next.affixes.push(donorAff);
        fillTo(next, 6, rng, {});
        message = '觉醒者之石：保留目标「' + (keptTarget ? keptTarget.text.split('\n')[0] : '无影响词缀') + '」' +
          (addDonor ? '与祭品「' + donorAff.text.split('\n')[0] + '」' : '（祭品词缀与目标同组，未保留）') + '，重铸为双势力稀有物品。';
        break;
      }
      case 'aisling': {
        const reason = aislingAvailability(next);
        if (reason) return fail(reason);
        const sides = ['prefix', 'suffix'].filter((side) => canAdd(next, side));
        if (!sides.length) return fail('没有空位添加隐秘词缀。');
        const side = sides[randInt(rng, 0, sides.length - 1)];
        addVeiledAffix(next, side);
        next.veiledOptions = veiledChoices(next, rng).map((m) => m.id);
        message = '爱斯琳：添加一条待揭露的隐秘词缀，占用 1 条' + (side === 'prefix' ? '前缀' : '后缀') + '。';
        break;
      }
      case 'unveil': {
        const reason = unveilAvailability(next);
        if (reason) return fail(reason);
        const def = veilById[action.veiledModId];
        if (!def) return fail('未知隐秘词缀。');
        const choices = veiledChoices(next, rng);
        if (!choices.some((m) => m.id === def.id)) return fail('这条隐秘词缀不在本次揭露选项中。');
        next.affixes = next.affixes.filter((a) => !a.veiled);
        delete next.veiledOptions;
        const aff = makeCustomAffix(def, rng, { tierRank: 1, tierIlvl: 1, name: def.name });
        next.affixes.push(aff);
        message = '揭露隐秘词缀：获得「' + aff.text.split('\n')[0] + '」。';
        break;
      }
      case 'eldritch': {
        const reason = eldritchAvailability(next, action.kind, action.tier);
        if (reason) return fail(reason);
        const slot = getBase(next.baseId).slot;
        const def = D.eldritchImplicits[action.kind] && D.eldritchImplicits[action.kind][slot];
        if (!def) return fail('该部位没有对应的 Eldritch 词缀。');
        const tierDef = def.tiers.find((t) => t.tier === action.tier);
        if (!tierDef) return fail('未知阶级。');
        const value = roundVal(randFloat(rng, tierDef.v[0], tierDef.v[1]));
        next.eldritch = next.eldritch || {};
        next.eldritch[action.kind] = {
          id: def.id, name: def.name, text: formatText(def.text, [value]), value,
          tier: tierDef.tier, tierName: tierDef.name,
        };
        message = 'Eldritch：获得' + (action.kind === 'exarch' ? '灼热' : '吞噬') + tierDef.name + '基底「' + next.eldritch[action.kind].text + '」。';
        break;
      }
      case 'harvest_remove': {
        const reason = harvestModeAvailability(next, action.tag, 'harvest_remove');
        if (reason) return fail(reason);
        const locks = lockedSides(next);
        const removable = next.affixes.filter((a) => !a.fractured && !locks[a.affix] && (a.tags || []).indexOf(action.tag) !== -1);
        const victim = removable[randInt(rng, 0, removable.length - 1)];
        next.affixes = next.affixes.filter((a) => a !== victim);
        normalizeRarity(next);
        message = '庄园定向移除：移除了「' + victim.text.split('\n')[0] + '」。';
        break;
      }
      case 'harvest_add': {
        const reason = harvestModeAvailability(next, action.tag, 'harvest_add');
        if (reason) return fail(reason);
        const locks = lockedSides(next);
        const removable = next.affixes.filter((a) => !a.fractured && !locks[a.affix]);
        const victim = removable[randInt(rng, 0, removable.length - 1)];
        next.affixes = next.affixes.filter((a) => a !== victim);
        next.rarity = 'rare';
        const sides = ['prefix', 'suffix'].filter((side) => !locks[side] && canAdd(next, side) && candidatesFor(next, side, { onlyTag: action.tag }).length);
        if (!sides.length) return fail('移除后没有可添加的「' + action.tag + '」标签词缀。');
        const side = sides[randInt(rng, 0, sides.length - 1)];
        const aff = addRandomAffix(next, side, rng, { onlyTag: action.tag });
        if (!aff) return fail('移除后没有可添加的「' + action.tag + '」标签词缀。');
        message = '庄园定向添加：移除「' + victim.text.split('\n')[0] + '」，添加「' + aff.text.split('\n')[0] + '」。';
        break;
      }
      case 'harvest_augment': {
        const reason = harvestModeAvailability(next, action.tag, 'harvest_augment');
        if (reason) return fail(reason);
        const locks = lockedSides(next);
        const sides = ['prefix', 'suffix'].filter((side) => !locks[side] && canAdd(next, side) && candidatesFor(next, side, { onlyTag: action.tag }).length);
        if (!sides.length) return fail('没有可添加的「' + action.tag + '」标签词缀或空位。');
        const side = sides[randInt(rng, 0, sides.length - 1)];
        const aff = addRandomAffix(next, side, rng, { onlyTag: action.tag });
        if (!aff) return fail('没有可添加的「' + action.tag + '」标签词缀。');
        message = '庄园定向增幅：添加「' + aff.text.split('\n')[0] + '」。';
        break;
      }
      case 'essence': {
        const e = essenceById[action.essenceId];
        if (!e) return fail('未知精华。');
        const blockReason = essenceAvailability(next, e);
        if (blockReason) return fail(blockReason);
        const slot = getBase(next.baseId).slot;
        const cat = (slot === 'weapon' || slot === 'quiver') ? 'weapon'
          : (slot === 'ring' || slot === 'amulet' || slot === 'belt') ? 'jewellery' : 'armour';
        const desc = (e.bySlot && e.bySlot[slot]) || (e.byCat && e.byCat[cat]);
        const wasRare = next.rarity === 'rare';
        next.rarity = 'rare';
        clearForReroll(next, []);
        if (!canAdd(next, desc.affix)) return fail('精华保底词缀所在的一侧已满。');
        if (existingGroups(next)[desc.group]) return fail('已有同组词缀，无法加入精华保底。');
        const aff = makeCustomAffix(desc, rng, { essence: true, modId: 'essence_' + e.id, name: e.name + '精华' });
        next.affixes.push(aff);
        fillTo(next, wasRare ? rollRareCount(rng) : 4, rng, {});
        message = '使用' + e.tierName + e.name + '精华：' + (wasRare ? '重铸稀有词缀，' : '升级为稀有物品，') + '保底「' + aff.text.split('\n')[0] + '」。';
        break;
      }
      case 'fossil': {
        if (next.rarity !== 'rare') return fail('化石只能用于稀有物品。');
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
        const locks = lockedSides(next);
        const preserve = [];
        if (locks.prefix) preserve.push('prefix');
        if (locks.suffix) preserve.push('suffix');
        clearForReroll(next, preserve);
        fillTo(next, rollRareCount(rng), rng, { tag: action.tag, guaranteeTag: action.tag, preserveSides: preserve });
        message = '使用庄园重铸：保证至少一条「' + action.tag + '」标签词缀。';
        break;
      }
      case 'bench': {
        if (next.rarity !== 'rare') return fail('工艺台只能用于稀有物品。');
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
      case 'meta': {
        const def = metaById[action.metaId];
        if (!def) return fail('未知 meta 工艺。');
        const reason = metaAvailability(next, def.id);
        if (reason) return fail(reason);
        next.affixes.push(metaAffix(def));
        syncMetaFlags(next);
        message = '工艺台：添加「' + def.name + '」，占用 1 条' + (def.affix === 'prefix' ? '前缀' : '后缀') + '。';
        break;
      }
      case 'multimod': {
        const def = metaById.multimod;
        const reason = metaAvailability(next, 'multimod');
        if (reason) return fail(reason);
        next.affixes.push(metaAffix(def));
        syncMetaFlags(next);
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
      default:
        return fail('未知操作。');
    }

    syncMetaFlags(next);
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
    if (item.corrupted) lines.push('已腐化');
    lines.push(base.name + ' (' + base.en + ')');
    lines.push('--------');
    lines.push('物品等级: ' + item.ilvl);
    if (item.influences.length) {
      lines.push('影响: ' + item.influences.map((id) => {
        const inf = D.influences.find((x) => x.id === id);
        return inf ? inf.name : id;
      }).join(' / '));
    }
    if (item.corruptedImplicit) lines.push('--------', '腐化基底: ' + item.corruptedImplicit);
    else if (item.eldritch && (item.eldritch.exarch || item.eldritch.eater)) {
      if (item.eldritch.exarch) lines.push('灼热基底: ' + item.eldritch.exarch.text);
      if (item.eldritch.eater) lines.push('吞噬基底: ' + item.eldritch.eater.text);
    } else if (base.implicit) lines.push('--------', base.implicit);
    if (item.affixes.length) {
      lines.push('--------');
      item.affixes.forEach((a) => {
        const tag = a.fractured ? ' [破裂]' : a.crafted ? ' [工艺]' : a.essence ? ' [精华]' : a.veiled ? ' [隐秘]' : '';
        a.text.split('\n').forEach((l) => lines.push(l + (l === a.text.split('\n')[0] ? (a.meta ? '' : '  ' + tierLabel(a.tierRank)) + tag : '')));
      });
    }
    return lines.join('\n');
  }

  function derivedStats(item) {
    const base = getBase(item.baseId);
    const res = { fire: 0, cold: 0, light: 0, chaos: 0 };
    let life = 0, esFlat = 0, esPct = 0, arFlat = 0, arPct = 0, evFlat = 0, evPct = 0;
    let physFlat = 0, physPct = 0, atkSpeed = 0, critChance = 0, critMulti = 0;
    let fireFlat = 0, coldFlat = 0, lightFlat = 0;
    item.affixes.forEach((a) => {
      const v = a.values || [];
      switch (a.group) {
        case 'life': life += v[0] || 0; break;
        case 'life_hybrid_es': life += v[0] || 0; esFlat += v[1] || 0; break;
        case 'life_hybrid_ar': life += v[0] || 0; arFlat += v[1] || 0; break;
        case 'life_hybrid_ev': life += v[0] || 0; evFlat += v[1] || 0; break;
        case 'es_flat': esFlat += v[0] || 0; break;
        case 'es_pct': esPct += v[0] || 0; break;
        case 'ar_flat': arFlat += v[0] || 0; break;
        case 'ar_pct': arPct += v[0] || 0; break;
        case 'ev_flat': evFlat += v[0] || 0; break;
        case 'ev_pct': evPct += v[0] || 0; break;
        case 'res_fire': res.fire += v[0] || 0; break;
        case 'res_cold': res.cold += v[0] || 0; break;
        case 'res_light': res.light += v[0] || 0; break;
        case 'res_chaos': res.chaos += v[0] || 0; break;
        case 'all_res':
          res.fire += v[0] || 0; res.cold += v[0] || 0; res.light += v[0] || 0; break;
        case 'weapon_phys_flat': physFlat += ((v[0] || 0) + (v[1] || 0)) / 2; break;
        case 'weapon_phys_pct': physPct += v[0] || 0; break;
        case 'attack_speed': atkSpeed += v[0] || 0; break;
        case 'crit_chance_weapon': critChance += v[0] || 0; break;
        case 'crit_multi': critMulti += v[0] || 0; break;
        case 'weapon_fire_flat': fireFlat += ((v[0] || 0) + (v[1] || 0)) / 2; break;
        case 'weapon_cold_flat': coldFlat += ((v[0] || 0) + (v[1] || 0)) / 2; break;
        case 'weapon_light_flat': lightFlat += ((v[0] || 0) + (v[1] || 0)) / 2; break;
      }
    });
    let dps = null, aps = null, crit = null;
    if (base.weapon) {
      const w = base.weapon;
      const avg = ((w.phys[0] + w.phys[1]) / 2) * (1 + physPct / 100) + physFlat;
      aps = w.aps * (1 + atkSpeed / 100);
      crit = w.crit * (1 + critChance / 100);
      dps = avg * aps;
    }
    return {
      life, es: esFlat + ((base.defence && base.defence.es) || 0) * (1 + esPct / 100),
      ar: arFlat + ((base.defence && base.defence.ar) || 0) * (1 + arPct / 100),
      ev: evFlat + ((base.defence && base.defence.ev) || 0) * (1 + evPct / 100),
      res, dps, aps, crit, critMulti,
      physFlat, physPct, atkSpeed,
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

  const api = {
    makeRng, rand, randInt, randFloat, weightedPick, clone,
    getBase, createItem, modEligibleOnBase, targetEligibleOnBase, tierRank, tierLabel,
    eligibleTiers, candidatesFor, addRandomAffix, applyAction, actionCost, actionAvailability, mergePrices,
    essenceAvailability, fossilAvailability, harvestAvailability, harvestModeAvailability, awakenerAvailability, awakenerDonorMods, aislingAvailability, unveilAvailability, veiledChoices, veilById, eldritchAvailability, metaAvailability, lockedSides, metaById, syncMetaFlags,
    evaluate, getTargetDef, targetGroup, isBenchTarget, findMatchingAffix,
    itemText, itemName, rarityName, derivedStats, benchOptions, validBench,
    removeAffix, addManualAffix, syncUid, sides, canAdd, sideCap, craftedCount, maxCrafted,
    baseDefenceTags, formatText, fmtNum, tierLabel, benchById, modById, essenceById, fossilById,
  };

  global.PoEEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
