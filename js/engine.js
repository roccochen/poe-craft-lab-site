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
    const pool = candidatesFor(item, side, opts || {});
    if (!pool.length) return null;
    const choice = weightedPick(rng, pool, (x) => x.weight);
    if (!choice) return null;
    const tier = pickTier(rng, choice.mod, choice.tiers);
    const aff = makeAffix(choice.mod, tier, rng);
    item.affixes.push(aff);
    return aff;
  }

  function chooseSide(item, rng) {
    const opts = ['prefix', 'suffix'].filter((s) => canAdd(item, s));
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
      case 'alteration': return prices.alteration;
      case 'augmentation': return prices.augmentation;
      case 'regal': return prices.regal;
      case 'alchemy': return prices.alchemy;
      case 'chaos': return prices.chaos;
      case 'exalted': return prices.exalted;
      case 'annulment': return prices.annulment;
      case 'scour': return prices.scour;
      case 'essence': {
        const e = essenceById[action.essenceId];
        return e ? e.cost * (prices.essenceMult || 1) : 0;
      }
      case 'fossil': {
        const ids = action.fossilIds || [];
        const sum = ids.reduce((n, id) => n + (fossilById[id] ? fossilById[id].cost : 0), 0);
        return (sum + prices.resonator) * (prices.fossilMult || 1);
      }
      case 'harvest': return prices.harvest;
      case 'bench': {
        const b = benchById[action.benchId];
        return b ? b.cost : 0;
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

  function applyAction(item, action, ctx) {
    ctx = ctx || {};
    const rng = ctx.rng || defaultRng;
    const prices = mergePrices(ctx.prices);
    const next = clone(item);
    next.meta = next.meta || { multimod: false };
    const cost = actionCost(action, prices);
    const fail = (msg) => ({ error: msg, item: next, cost: 0, message: '' });
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
        if (next.rarity !== 'magic' && next.rarity !== 'rare') return fail('增幅石只能用于魔法或稀有物品。');
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
        clearForReroll(next, []);
        fillTo(next, rollRareCount(rng), rng, {});
        message = '使用混沌石：重铸稀有词缀。';
        break;
      }
      case 'exalted': {
        if (next.rarity !== 'rare') return fail('崇高石只能用于稀有物品。');
        if (!canAdd(next, 'prefix') && !canAdd(next, 'suffix')) return fail('词缀已满，无法使用崇高石。');
        const side = chooseSide(next, rng);
        addRandomAffix(next, side, rng, {});
        message = '使用崇高石：增加一条随机' + (side === 'prefix' ? '前缀' : '后缀') + '。';
        break;
      }
      case 'annulment': {
        if (next.rarity !== 'rare' && next.rarity !== 'magic') return fail('剥离石只能用于魔法或稀有物品。');
        const removable = next.affixes.filter((a) => !a.fractured);
        if (!removable.length) return fail('没有可剥离的词缀（破裂词缀无法剥离）。');
        const victim = removable[randInt(rng, 0, removable.length - 1)];
        next.affixes = next.affixes.filter((a) => a !== victim);
        message = '使用剥离石：移除了「' + victim.text.split('\n')[0] + '」。';
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
        if (next.rarity === 'magic' || next.rarity === 'normal') {
          const e = essenceById[action.essenceId];
          if (!e) return fail('未知精华。');
          const slot = getBase(next.baseId).slot;
          const cat = (slot === 'weapon' || slot === 'quiver') ? 'weapon'
            : (slot === 'ring' || slot === 'amulet' || slot === 'belt') ? 'jewellery' : 'armour';
          const desc = (e.bySlot && e.bySlot[slot]) || e.byCat[cat];
          if (!desc) return fail('该精华不支持此物品。');
          next.rarity = 'rare';
          clearForReroll(next, []);
          const aff = makeCustomAffix(desc, rng, { essence: true, modId: 'essence_' + e.id, name: e.name + '精华' });
          next.affixes.push(aff);
          fillTo(next, next.affixes.length > 4 ? next.affixes.length : 4, rng, {});
          message = '使用' + e.tierName + e.name + '精华：保底「' + aff.text.split('\n')[0] + '」。';
        } else if (next.rarity === 'rare') {
          const e = essenceById[action.essenceId];
          if (!e) return fail('未知精华。');
          const slot = getBase(next.baseId).slot;
          const cat = (slot === 'weapon' || slot === 'quiver') ? 'weapon'
            : (slot === 'ring' || slot === 'amulet' || slot === 'belt') ? 'jewellery' : 'armour';
          const desc = (e.bySlot && e.bySlot[slot]) || e.byCat[cat];
          if (!desc) return fail('该精华不支持此物品。');
          clearForReroll(next, []);
          const aff = makeCustomAffix(desc, rng, { essence: true, modId: 'essence_' + e.id, name: e.name + '精华' });
          next.affixes.push(aff);
          fillTo(next, rollRareCount(rng), rng, {});
          message = '使用' + e.tierName + e.name + '精华重铸：保底「' + aff.text.split('\n')[0] + '」。';
        } else {
          return fail('精华只能用于普通或稀有物品。');
        }
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
    if (item.affixes.length) {
      lines.push('--------');
      item.affixes.forEach((a) => {
        const tag = a.fractured ? ' [破裂]' : a.crafted ? ' [工艺]' : a.essence ? ' [精华]' : '';
        a.text.split('\n').forEach((l) => lines.push(l + (l === a.text.split('\n')[0] ? '  ' + tierLabel(a.tierRank) + tag : '')));
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
    eligibleTiers, candidatesFor, addRandomAffix, applyAction, actionCost, mergePrices,
    evaluate, getTargetDef, targetGroup, isBenchTarget, findMatchingAffix,
    itemText, itemName, rarityName, derivedStats, benchOptions, validBench,
    removeAffix, addManualAffix, syncUid, sides, canAdd, sideCap, craftedCount, maxCrafted,
    baseDefenceTags, formatText, fmtNum, tierLabel, benchById, modById, essenceById, fossilById,
  };

  global.PoEEngine = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
