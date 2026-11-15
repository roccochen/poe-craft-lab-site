/* 流放之路 2 · 做装求解器（抽象状态 MDP）
 *
 * 为什么需要它：顾问以前是「单步贪心 + 期望花费」——只能回答「这一步哪个不亏」，
 * 回答不了「从现在开始做完还要多少钱」「我该不该继续」。后者需要值函数。
 *
 * 做法：把物品压成有限状态，在这个状态空间上解随机最短路（SSP）：
 *
 *   V(s) = min over 动作 [ 动作成本 + Σ P(s'|s,动作) · V(s') ]
 *   V(终态) = 0
 *
 * 状态 = (稀有度, 已命中目标位图, 前缀废词数, 后缀废词数)
 *   - 已命中目标：位图，最多 6 位
 *   - 废词只数数量：够算「删除时丢到目标/废词各占几分之几」
 *   - 两侧数量由 命中 + 废词 推出，不需要单独存
 * 这样状态数在几千量级，值迭代几百轮就收敛，浏览器里毫秒级。
 *
 * 已知近似（都写在 docs 里，界面也会说明）：
 *   1) 每次加词缀的命中概率按「空底子的池子」算；物品上已有同类组会缩小池子，
 *      所以对「同组已在物品上但档位不够」的目标会略微乐观。
 *   2) 废词不区分具体组，删除概率按数量均分（与引擎的等概率删除一致）。
 *   3) 破裂词缀没有单独建模（会在数量上计入）。
 */
(function (global) {
  'use strict';

  const E = global.PoE2Engine;
  const D = global.PoE2Data;

  const SIDES = ['prefix', 'suffix'];
  const OTHER = { prefix: 'suffix', suffix: 'prefix' };

  /* ------------------------------------------------------------------ *
   * 上下文：目标表、价格、每次抽卡的命中概率
   * ------------------------------------------------------------------ */
  function targetTable(targets) {
    /* 同一组的词缀只能出现一次，所以「同组的两条目标」在引擎里是靠同一条词缀
     * 同时命中的（findMatchingAffix 按组匹配）。这里按组去重，保留更严格的档位要求，
     * 否则位图里会有一个永远点不亮的位，导致「目标不可达」的误报。 */
    const seen = new Map();
    (targets || []).forEach((tg) => {
      const def = E.getTargetDef(tg.modId);
      if (!def) return;
      const group = E.targetGroup(def);
      const cap = tg.tier ? Number(tg.tier) : null;
      const prev = seen.get(group);
      if (prev) {
        if (cap != null && (prev.tierCap == null || cap < prev.tierCap)) prev.tierCap = cap;
        prev.duplicates += 1;
        return;
      }
      seen.set(group, {
        modId: tg.modId, group, side: def.affix, tierCap: cap, bit: 0, duplicates: 1,
        essenceId: def.isEssence ? def.essenceId : null,
        perfect: !!def.perfect,
      });
    });
    const list = [...seen.values()];
    list.forEach((t, i) => { t.bit = 1 << i; });
    return list;
  }

  /* 每一侧「抽一次」命中各目标的概率 + 出废词的概率。
   * 用空底子（rare）算池子：组概率 = 该组可掉档数 / 全池档数（官方平铺模型）。 */
  function buildAddProbs(baseId, ilvl, list) {
    const synth = E.createItem(baseId, { ilvl });
    synth.rarity = 'rare';
    const out = {};
    for (const side of SIDES) {
      const pool = E.exactAddPool(synth, side, {});
      const total = pool.total || 0;
      const hits = [];
      let used = 0;
      for (const t of list) {
        if (t.side !== side) continue;
        let w = 0;
        for (const r of pool.rows) {
          if (r.group !== t.group) continue;
          if (t.tierCap && r.tierRank > t.tierCap) continue;
          w += r.weight;
        }
        if (w > 0 && total > 0) {
          const p = w / total;
          hits.push({ bit: t.bit, p });
          used += p;
        }
      }
      out[side] = { hits, junk: Math.max(0, 1 - used), poolSize: pool.rows.length, groups: new Set(pool.rows.map((r) => r.group)).size };
    }
    return out;
  }

  function buildContext(item, targets, opts) {
    opts = opts || {};
    const list = targetTable(targets);
    const fullMask = list.reduce((m, t) => m | t.bit, 0);
    const base = E.getBase(item.baseId);
    const ctx = {
      item,
      base,
      list,
      fullMask,
      prices: opts.prices || {},
      addProbs: buildAddProbs(item.baseId, item.ilvl, list),
      caps: { magic: 1, rare: 3 },
      tierCaps: opts.tierCaps || {},
    };
    /* 破裂词缀在整个求解过程中都不会消失（通货移不掉），所以它们不是状态，
     * 而是常量：按侧计数 + 哪些目标位是破裂的（那一位永远不会丢）。 */
    ctx.frac = fracturedInfo(item, list);
    ctx.init = abstractState(item, list);
    return ctx;
  }

  function matchTarget(group, tierRank, list) {
    for (const tg of list || []) {
      if (tg.group !== group) continue;
      if (tg.tierCap && tierRank > tg.tierCap) continue;
      return tg;
    }
    return null;
  }
  function fracturedInfo(item, list) {
    const info = { prefix: 0, suffix: 0, mask: 0 };
    for (const a of item.affixes || []) {
      if (!a.fractured) continue;
      const hit = matchTarget(a.group, a.tierRank, list);
      if (hit) info.mask |= hit.bit;
      else if (a.affix === 'prefix') info.prefix += 1;
      else info.suffix += 1;
    }
    return info;
  }

  /* 里品 → 抽象状态 */
  function abstractState(item, list) {
    const t = list || [];
    let mask = 0;
    let junkP = 0;
    let junkS = 0;
    // 命中判定沿用引擎：同组 + 档位门槛
    for (const a of item.affixes || []) {
      let hit = null;
      for (const tg of t) {
        if (tg.group !== a.group) continue;
        if (tg.tierCap && a.tierRank > tg.tierCap) continue;
        hit = tg;
        break;
      }
      if (hit) mask |= hit.bit;
      else if (a.fractured) continue;          // 破裂废词移不掉，记在 ctx.frac 里
      else if (a.affix === 'prefix') junkP++;
      else junkS++;
    }
    return { rarity: item.rarity === 'normal' ? 'normal' : item.rarity, mask, junkP, junkS, corrupted: !!item.corrupted };
  }

  function key(s) { return s.rarity + '|' + s.mask + '|' + s.junkP + '|' + s.junkS; }
  function isTerminal(s, ctx) { return (s.mask & ctx.fullMask) === ctx.fullMask; }
  /* 侧上限取决于「加完之后」的稀有度：魔法 1，稀有 3。
   * 富豪石从魔法升稀有再加一条，所以检查空位要用 rare 的上限，否则两侧各 1 条时会误判为满。 */
  function capFor(s, ctx, side, capRarity) {
    const rarity = capRarity || s.rarity;
    if (rarity === 'magic') return 1;
    if (rarity === 'rare') return 3;
    return 3;
  }
  function counts(s, ctx) {
    let mp = 0;
    let ms = 0;
    for (const t of ctx.list) {
      if (s.mask & t.bit) { if (t.side === 'prefix') mp++; else ms++; }
    }
    const frac = ctx.frac || { prefix: 0, suffix: 0, mask: 0 };
    const matchedRemovable = popcount((s.mask & ~frac.mask) & ctx.fullMask);
    return {
      p: mp + s.junkP + frac.prefix,
      s: ms + s.junkS + frac.suffix,
      matched: mp + ms,
      junk: s.junkP + s.junkS,
      fracP: frac.prefix,
      fracS: frac.suffix,
      removable: matchedRemovable + s.junkP + s.junkS,
    };
  }
  function removableOnSide(s, ctx, side) {
    const fracMask = (ctx.frac && ctx.frac.mask) || 0;
    let k = 0;
    for (const t of ctx.list) {
      if (!(s.mask & t.bit)) continue;
      if (fracMask & t.bit) continue;
      if (side && t.side !== side) continue;
      k++;
    }
    if (side !== 'suffix') k += s.junkP;
    if (side !== 'prefix') k += s.junkS;
    return k;
  }
  function openSlots(s, ctx, capRarity) {
    const c = counts(s, ctx);
    let total = 0;
    for (const side of SIDES) {
      const used = side === 'prefix' ? c.p : c.s;
      total += Math.max(0, capFor(s, ctx, side, capRarity) - used);
    }
    return total;
  }
  function openSides(s, ctx, capRarity) {
    const c = counts(s, ctx);
    return SIDES.filter((side) => (side === 'prefix' ? c.p : c.s) < capFor(s, ctx, side, capRarity));
  }

  /* ------------------------------------------------------------------ *
   * 转移
   * ------------------------------------------------------------------ */
  function addDist(s, side, ctx, rarityAfter) {
    const open = openSides(s, ctx, rarityAfter).indexOf(side) !== -1;
    if (!open) return [];
    const probs = ctx.addProbs[side];
    /* 池子收缩修正：物品上已有的组不会再掉，池子因此变小，
     * 剩下的组占比相应变大。头盔前缀池实测只有 10 个组，
     * 每多一条废词就缩掉约 1/10 —— 不修正会明显高估期望花费。 */
    let excluded = 0;
    let matchedOnSide = 0;
    for (const h of probs.hits) {
      if (!(s.mask & h.bit)) continue;
      excluded += h.p;
      matchedOnSide += h.p;
    }
    const junkOnSide = side === 'prefix' ? s.junkP : s.junkS;
    if (probs.groups > 0) excluded += junkOnSide / probs.groups;
    const denom = Math.max(0.25, 1 - excluded);
    const out = [];
    let hitSum = 0;
    for (const h of probs.hits) {
      if (s.mask & h.bit) continue;         // 已命中：这一组不会再出现，概率并入废词
      const p = h.p / denom;
      hitSum += p;
      out.push({
        prob: p,
        next: { rarity: rarityAfter, mask: s.mask | h.bit, junkP: s.junkP, junkS: s.junkS, corrupted: s.corrupted },
        hit: h.bit,
      });
    }
    const junkP = s.junkP + (side === 'prefix' ? 1 : 0);
    const junkS = s.junkS + (side === 'suffix' ? 1 : 0);
    const junkProb = Math.max(0, 1 - hitSum);
    if (junkProb > 1e-12) {
      out.push({
        prob: junkProb,
        next: { rarity: rarityAfter, mask: s.mask, junkP, junkS, corrupted: s.corrupted },
        hit: 0,
      });
    }
    if (matchedOnSide === 0 && hitSum === 0 && junkProb === 0) return [];
    return out;
  }

  function addActionDist(s, ctx, rarityAfter) {
    const open = openSides(s, ctx, rarityAfter);
    if (!open.length) return [];
    const share = 1 / open.length;
    const out = [];
    for (const side of open) {
      for (const tr of addDist(s, side, ctx, rarityAfter)) {
        out.push({ prob: tr.prob * share, next: tr.next, hit: tr.hit, side });
      }
    }
    return out;
  }

  /* 可移除词缀的分布，可限定某一侧（抹除类预兆）。破碎词缀永远不在池子里。 */
  function removeDistOnSide(s, ctx, side) {
    const fracMask = (ctx.frac && ctx.frac.mask) || 0;
    const matched = [];
    for (const t of ctx.list) {
      if (!(s.mask & t.bit)) continue;
      if (fracMask & t.bit) continue;
      if (side && t.side !== side) continue;
      matched.push(t);
    }
    const jp = side === 'suffix' ? 0 : s.junkP;
    const js = side === 'prefix' ? 0 : s.junkS;
    const n = matched.length + jp + js;
    if (!n) return [];
    const each = 1 / n;
    const out = [];
    for (const t of matched) {
      out.push({
        prob: each,
        next: { rarity: s.rarity, mask: s.mask & ~t.bit, junkP: s.junkP, junkS: s.junkS, corrupted: s.corrupted },
        lost: t.bit,
      });
    }
    if (jp) out.push({ prob: each * jp, next: { rarity: s.rarity, mask: s.mask, junkP: s.junkP - 1, junkS: s.junkS, corrupted: s.corrupted } });
    if (js) out.push({ prob: each * js, next: { rarity: s.rarity, mask: s.mask, junkP: s.junkP, junkS: s.junkS - 1, corrupted: s.corrupted } });
    return out;
  }
  function removeDist(s, ctx) { return removeDistOnSide(s, ctx, null); }

  /* 删一条（可限侧）+ 若还有空位按落侧 50/50 再加一条：混沌石 / 定向抹除共用 */
  function chaosDist(s, ctx, side) {
    const out = [];
    for (const rm of removeDistOnSide(s, ctx, side)) {
      const open = openSides(rm.next, ctx, rm.next.rarity);
      if (!open.length) { out.push({ prob: rm.prob, next: rm.next }); continue; }
      const share = 1 / open.length;
      for (const addSide of open) {
        for (const add of addDist(rm.next, addSide, ctx, rm.next.rarity)) {
          out.push({ prob: rm.prob * add.prob * share, next: add.next, hit: add.hit, lost: rm.lost, side: addSide });
        }
      }
    }
    return out;
  }

  /* 削切：真实规则是删「最低等级」的词缀。抽象状态没有等级信息，
   * 近似为「优先删废词，没有废词再按均匀删」——废词通常就是低档词。 */
  function whittlingDist(s, ctx) {
    let removal;
    const junkTotal = s.junkP + s.junkS;
    if (junkTotal > 0) {
      removal = [];
      if (s.junkP) removal.push({ prob: s.junkP / junkTotal, next: Object.assign({}, s, { junkP: s.junkP - 1 }) });
      if (s.junkS) removal.push({ prob: s.junkS / junkTotal, next: Object.assign({}, s, { junkS: s.junkS - 1 }) });
    } else {
      removal = removeDistOnSide(s, ctx, null);
    }
    const out = [];
    for (const rm of removal) {
      const open = openSides(rm.next, ctx, rm.next.rarity);
      if (!open.length) { out.push({ prob: rm.prob, next: rm.next }); continue; }
      const share = 1 / open.length;
      for (const addSide of open) {
        for (const add of addDist(rm.next, addSide, ctx, rm.next.rarity)) {
          out.push({ prob: rm.prob * add.prob * share, next: add.next, hit: add.hit, lost: rm.lost, side: addSide });
        }
      }
    }
    return out;
  }

  /* 高阶崇高：一次加两条（每次独立落侧） */
  function twoAddDist(s, ctx, rarityAfter) {
    const out = [];
    for (const first of addActionDist(s, ctx, rarityAfter)) {
      for (const second of addActionDist(first.next, ctx, rarityAfter)) {
        out.push({
          prob: first.prob * second.prob,
          next: second.next,
          hit: second.hit || first.hit,
          side: second.side,
        });
      }
    }
    return out;
  }

  /* 点金石：清空 → 稀有 → 连加 4 条。状态无关，可以缓存。 */
  function alchemyDist(ctx) {
    if (ctx._alchemy) return ctx._alchemy;
    let frontier = new Map();
    const start = { rarity: 'rare', mask: (ctx.frac && ctx.frac.mask) || 0, junkP: 0, junkS: 0, corrupted: false };
    frontier.set(key(start), { state: start, prob: 1 });
    for (let i = 0; i < 4; i++) {
      const next = new Map();
      for (const { state, prob } of frontier.values()) {
        for (const tr of addActionDist(state, ctx, 'rare')) {
          const k = key(tr.next);
          const cur = next.get(k);
          if (cur) cur.prob += prob * tr.prob;
          else next.set(k, { state: tr.next, prob: prob * tr.prob });
        }
      }
      frontier = next;
    }
    ctx._alchemy = [...frontier.values()].map((x) => ({ prob: x.prob, next: x.state }));
    return ctx._alchemy;
  }

  /* ------------------------------------------------------------------ *
   * 动作
   * ------------------------------------------------------------------ */
  function costOf(type, ctx) {
    return Number(E.actionCost({ type }, ctx.prices)) || 0;
  }

  /* 可执行的预兆组合：只建模「有明确价格 + 规则能压进抽象状态」的几种。
   * 没有配置价格的一律不进决策，避免出现「免费动作」把方案带偏。 */
  const OMEN_ACTIONS = [
    { id: 'exalt_left', currency: 'exalted', omenId: 'omen_sinistral_exalt', kind: 'add', side: 'prefix' },
    { id: 'exalt_right', currency: 'exalted', omenId: 'omen_dextral_exalt', kind: 'add', side: 'suffix' },
    { id: 'exalt_two', currency: 'exalted', omenId: 'omen_greater_exalt', kind: 'add2' },
    { id: 'chaos_left', currency: 'chaos', omenId: 'omen_sinistral_erasure', kind: 'chaos', side: 'prefix' },
    { id: 'chaos_right', currency: 'chaos', omenId: 'omen_dextral_erasure', kind: 'chaos', side: 'suffix' },
    { id: 'whittling', currency: 'chaos', omenId: 'omen_whittling', kind: 'whittling' },
  ];
  function omenCost(def, ctx) {
    const cost = Number(E.actionCost({ type: 'omen_exec', omenId: def.omenId, currency: def.currency }, ctx.prices));
    return Number.isFinite(cost) && cost > 0 ? cost : 0;
  }
  /* 精华：把「保底词缀」变成确定性的加词缀动作。
   * 非完美档要把魔法升稀有（1 档）、完美档要先随机删一条再加。 */
  function essenceActionsFor(s, ctx) {
    if (s.rarity !== 'magic' && s.rarity !== 'rare') return [];
    const out = [];
    for (const tg of ctx.list) {
      if (!tg.essenceId) continue;
      if (s.mask & tg.bit) continue;                    // 这一条已经命中
      if (tg.perfect && s.rarity !== 'rare') continue;   // 完美精华只能用于稀有
      if (!tg.perfect && s.rarity !== 'magic') continue; // 低阶精华只能用于魔法
      if (openSides(s, ctx, 'rare').indexOf(tg.side) === -1) continue;
      const cost = Number(E.actionCost({ type: 'essence', essenceId: tg.essenceId }, ctx.prices)) || 0;
      if (!(cost > 0)) continue;
      out.push({ id: 'essence', type: 'essence', essenceId: tg.essenceId, cost });
    }
    return out;
  }
  function omenActionsFor(s, ctx, c) {
    if (s.rarity !== 'rare') return [];
    const out = [];
    for (const def of OMEN_ACTIONS) {
      const cost = omenCost(def, ctx);
      if (!cost) continue;                       // 没配价格 → 不建模
      if (def.kind === 'chaos' || def.kind === 'whittling') {
        if (c.removable <= 0) continue;
        if (def.side && removableOnSide(s, ctx, def.side) <= 0) continue;
      } else {
        const openNow = openSides(s, ctx, s.rarity);
        if (!openNow.length) continue;
        if (def.side && openNow.indexOf(def.side) === -1) continue;
        if (def.kind === 'add2' && openSlots(s, ctx, s.rarity) < 2) continue;
      }
      out.push({
        id: def.id,
        type: 'omen_exec',
        omenId: def.omenId,
        currency: def.currency,
        cost,
      });
    }
    return out;
  }

  function actionsFor(s, ctx) {
    if (s.corrupted) return [];
    const c = counts(s, ctx);
    const out = [];
    if (s.rarity === 'normal') {
      out.push({ id: 'transmute', type: 'transmute', cost: costOf('transmute', ctx) });
      out.push({ id: 'alchemy', type: 'alchemy', cost: costOf('alchemy', ctx) });
    } else if (s.rarity === 'magic') {
      for (const ea of essenceActionsFor(s, ctx)) out.push(ea);
      if (c.p + c.s < 2) out.push({ id: 'augmentation', type: 'augmentation', cost: costOf('augmentation', ctx) });
      out.push({ id: 'regal', type: 'regal', cost: costOf('regal', ctx) });
      out.push({ id: 'alchemy', type: 'alchemy', cost: costOf('alchemy', ctx) });
      // 可移除数为 0（比如全破裂）时，引擎会直接拒绝，求解器不能再推荐
      if (c.removable > 0) out.push({ id: 'annulment', type: 'annulment', cost: costOf('annulment', ctx) });
    } else if (s.rarity === 'rare') {
      const open = openSides(s, ctx);
      if (open.length) out.push({ id: 'exalted', type: 'exalted', cost: costOf('exalted', ctx) });
      if (c.removable > 0) {
        out.push({ id: 'chaos', type: 'chaos', cost: costOf('chaos', ctx) });
        out.push({ id: 'annulment', type: 'annulment', cost: costOf('annulment', ctx) });
      }
      for (const ea of essenceActionsFor(s, ctx)) out.push(ea);
      for (const om of omenActionsFor(s, ctx, c)) out.push(om);
    }
    return out;
  }

  function transitionsForAction(s, action, ctx) {
    switch (action.id) {
      case 'transmute': return addActionDist(s, ctx, 'magic');
      case 'augmentation': return addActionDist(s, ctx, s.rarity);
      case 'regal': return addActionDist(s, ctx, 'rare');
      case 'exalted': return addActionDist(s, ctx, s.rarity);
      case 'alchemy': return alchemyDist(ctx);
      case 'annulment': return removeDist(s, ctx);
      case 'chaos': return chaosDist(s, ctx, null);
      case 'exalt_left': return addDist(s, 'prefix', ctx, s.rarity);
      case 'exalt_right': return addDist(s, 'suffix', ctx, s.rarity);
      case 'exalt_two': return twoAddDist(s, ctx, s.rarity);
      case 'chaos_left': return chaosDist(s, ctx, 'prefix');
      case 'chaos_right': return chaosDist(s, ctx, 'suffix');
      case 'whittling': return whittlingDist(s, ctx);
      case 'essence': {
        const tg = ctx.list.find((x) => x.essenceId === action.essenceId);
        if (!tg) return [];
        const applyAdd = (st) => {
          if (openSides(st, ctx, 'rare').indexOf(tg.side) === -1) return null;
          return Object.assign({}, st, { rarity: 'rare', mask: st.mask | tg.bit });
        };
        if (!tg.perfect) {
          const nx = applyAdd(s);
          return nx ? [{ prob: 1, next: nx, hit: tg.bit }] : [];
        }
        const removals = removeDistOnSide(s, ctx, null);
        if (!removals.length) return [];
        const out = [];
        for (const rm of removals) {
          const nx = applyAdd(rm.next);
          out.push({ prob: rm.prob, next: nx || rm.next, hit: nx ? tg.bit : 0, lost: rm.lost });
        }
        return out;
      }
      default: return [];
    }
  }

  /* ------------------------------------------------------------------ *
   * 求解：值迭代 + 策略提取 + 完成概率
   * ------------------------------------------------------------------ */
  function solve(ctx, opts) {
    opts = opts || {};
    if ((ctx.fullMask === 0)) return { etc: 0, pSuccess: 1, states: 0, converged: true, unreachable: false };
    /* 腐化物品不能再用任何通货：这是「已经做不动了」，不是「目标不可达」 */
    if (ctx.init.corrupted) {
      return {
        etc: null, pSuccess: 0, states: 0, iterations: 0, converged: true,
        unreachable: true, unreachableReason: 'corrupted', unreachableTargets: [],
      };
    }
    /* 先做一次结构性可达性检查：某个目标在该侧的池子里根本没有可掉的行，
     * 那不管怎么点都做不出来，直接给 null，别让值迭代跑出一个假的有限值。 */
    /* 精华目标不在自然池里，但它们有确定的来源，不能判成不可达：
     * 完美精华随时可用（稀有可达）；低阶精华只能从普通/魔法起手（稀有降不回魔法）。 */
    const essenceReachable = (t) => {
      if (!t.essenceId) return false;
      if (t.perfect) return true;
      return ctx.init.rarity === 'normal' || ctx.init.rarity === 'magic';
    };
    const unreachableTargets = ctx.list.filter((t) => {
      if (essenceReachable(t)) return false;
      const probs = ctx.addProbs[t.side];
      return !probs || !probs.hits.some((h) => h.bit === t.bit);
    });
    /* 6 个词缀位装不下：同一侧最多 3 条 */
    const perSide = { prefix: 0, suffix: 0 };
    for (const t of ctx.list) perSide[t.side]++;
    const slotsOverflow = perSide.prefix > 3 || perSide.suffix > 3;
    if (unreachableTargets.length || slotsOverflow) {
      return {
        etc: null, pSuccess: 0, states: 0, iterations: 0, converged: true, unreachable: true,
        unreachableReason: slotsOverflow ? 'slots' : 'pool',
        unreachableTargets: unreachableTargets.map((t) => t.modId),
      };
    }
    const init = ctx.init;
    const states = new Map();
    const queue = [init];
    states.set(key(init), init);
    const limit = opts.maxStates || 20000;
    while (queue.length && states.size < limit) {
      const s = queue.shift();
      if (isTerminal(s, ctx)) continue;
      for (const a of actionsFor(s, ctx)) {
        for (const tr of transitionsForAction(s, a, ctx)) {
          const k = key(tr.next);
          if (!states.has(k)) { states.set(k, tr.next); queue.push(tr.next); }
        }
      }
    }

    /* 预计算每个状态的动作转移，并把「原地打转」的概率单独拿出来。
     * 混沌石经常「删掉一条废词、又加回同侧一条废词」，抽象状态原地不动（自环）。
     * 直接代入值迭代会让 V 每轮涨一点、永远不收敛，策略也会退化成死循环。
     * 解析消掉自环：  V = c + self·V + Σ_other p·V'  →  V = (c + Σ_other p·V') / (1 - self) */
    const entries = new Map();
    for (const [k, s] of states) {
      if (isTerminal(s, ctx)) { entries.set(k, []); continue; }
      const list = [];
      for (const a of actionsFor(s, ctx)) {
        const trs = transitionsForAction(s, a, ctx);
        if (!trs.length) continue;
        let self = 0;
        for (const tr of trs) if (key(tr.next) === k) self += tr.prob;
        const rest = 1 - self;
        if (rest <= 1e-9) continue;          // 纯自环，永远不会推进
        list.push({ action: a, trs, self, rest });
      }
      entries.set(k, list);
    }
    /* 反向可达性：只有「能到终态」的状态才参与值迭代。
     * 否则像「低阶精华目标但物品已经是稀有」这类永远做不完的状态，
     * 混沌/剥离会在里面无限循环，值每轮涨一点，整个求解被判成不收敛。 */
    const preds = new Map();
    for (const [k, list] of entries) {
      for (const entry of list) {
        for (const tr of entry.trs) {
          const nk = key(tr.next);
          if (!preds.has(nk)) preds.set(nk, new Set());
          preds.get(nk).add(k);
        }
      }
    }
    const canFinish = new Set();
    for (const [k, s] of states) if (isTerminal(s, ctx)) canFinish.add(k);
    const queue2 = [...canFinish];
    while (queue2.length) {
      const k = queue2.pop();
      for (const p of preds.get(k) || []) {
        if (canFinish.has(p)) continue;
        canFinish.add(p);
        queue2.push(p);
      }
    }

    const INF = Number.POSITIVE_INFINITY;
    const qOf = (k, entry, table) => {
      let sum = 0;
      for (const tr of entry.trs) {
        const nk = key(tr.next);
        if (nk === k) continue;              // 自环已解析消除
        const nv = isTerminal(tr.next, ctx) ? 0 : table.get(nk);
        if (!Number.isFinite(nv)) return INF;
        sum += tr.prob * nv;
      }
      return (entry.action.cost + sum) / entry.rest;
    };

    const V = new Map();
    for (const k of states.keys()) V.set(k, 0);
    let iter = 0;
    let delta = INF;
    const maxIter = opts.iterations || 1500;
    const eps = opts.eps == null ? 0.01 : opts.eps;
    while (iter < maxIter && delta > eps) {
      delta = 0;
      iter++;
      for (const [k, s] of states) {
        if (isTerminal(s, ctx)) { V.set(k, 0); continue; }
        if (!canFinish.has(k)) { V.set(k, INF); continue; }
        let best = INF;
        for (const entry of entries.get(k) || []) {
          const q = qOf(k, entry, V);
          if (q < best) best = q;
        }
        const prev = V.get(k);
        if (Number.isFinite(best)) {
          const d = Math.abs(best - prev);
          if (d > delta) delta = d;
          V.set(k, best);
        } else {
          if (Number.isFinite(prev)) delta = Math.max(delta, 1);
          V.set(k, INF);
        }
      }
      if (delta === 0) break;
    }

    // 策略 + 完成概率（同样用「消自环」的形式）
    const P = new Map();
    for (const k of states.keys()) P.set(k, 0);
    const policy = new Map();
    for (const [k, s] of states) {
      if (isTerminal(s, ctx)) { P.set(k, 1); continue; }
      if (!canFinish.has(k)) { policy.set(k, null); P.set(k, 0); continue; }
      let best = null;
      let bestQ = INF;
      for (const entry of entries.get(k) || []) {
        const q = qOf(k, entry, V);
        if (q < bestQ) { bestQ = q; best = entry.action; }
      }
      policy.set(k, best);
    }
    let pDelta = INF;
    let pIter = 0;
    while (pIter++ < 300 && pDelta > 1e-9) {
      pDelta = 0;
      for (const [k, s] of states) {
        if (isTerminal(s, ctx)) { P.set(k, 1); continue; }
        const a = policy.get(k);
        const entry = a ? (entries.get(k) || []).find((e) => e.action === a) : null;
        if (!entry) { P.set(k, 0); continue; }
        if (!canFinish.has(k)) { P.set(k, 0); continue; }
        let sum = 0;
        for (const tr of entry.trs) {
          const nk = key(tr.next);
          if (nk === k) continue;
          sum += tr.prob * (isTerminal(tr.next, ctx) ? 1 : (P.get(nk) || 0));
        }
        const v = Math.min(1, sum / entry.rest);
        const d = Math.abs(v - P.get(k));
        if (d > pDelta) pDelta = d;
        P.set(k, v);
      }
      if (pDelta === 0) break;
    }

    const initKey = key(init);
    const noAction = !isTerminal(init, ctx) && !(entries.get(initKey) || []).length;
    let etc = isTerminal(init, ctx) ? 0 : V.get(initKey);
    let pSuccess = P.get(initKey) || 0;
    const converged = delta <= eps;
    /* 值迭代从 0 出发：目标档位过严时真实期望是天文数字，迭代在预算内不会收敛，
     * 这时给出来的是「下界」，不能当确定值用。完成概率为 0 才是真的做不出来。 */
    const unreachable = !Number.isFinite(etc) || (converged && pSuccess <= 1e-9);
    if (unreachable) etc = null;
    return {
      etc,
      pSuccess: unreachable ? 0 : pSuccess,
      lowerBound: !converged && Number.isFinite(etc),
      states: states.size,
      stateMap: states,
      terminalKeys: new Set([...states.keys()].filter((k) => isTerminal(states.get(k), ctx))),
      iterations: iter,
      converged,
      unreachable,
      unreachableReason: unreachable
        ? (solvedUnreachable(ctx).length ? 'pool' : (noAction ? 'stuck' : 'probability'))
        : null,
      unreachableTargets: unreachable ? solvedUnreachable(ctx) : [],
      V,
      P,
      policy,
      entries,
      qOf: (k, entry) => qOf(k, entry, V),
      ctx,
    };
  }

  /* ------------------------------------------------------------------ *
   * 预算模式：给定预算能做完的概率 / 想要某个把握至少需要多少钱
   * ------------------------------------------------------------------ *
   * 把「剩余预算」当成额外一维，问题变成
   *   P(s, b) = max_动作 Σ P(s'|s,动作) · P(s', b - 成本)
   *   P(终态, ·) = 1，b 不够付任何动作 = 0
   * 因为每次动作都让 b 变小，这一维天然无环，按预算从小到大一遍扫完即可，
   * 不需要值迭代。扫完就同时得到「预算 ↔ 成功率」曲线（Pareto 前沿）。
   */
  function budgetFromSolved(solved, ctx, opts) {
    opts = opts || {};
    if (!solved || solved.unreachable || !solved.stateMap) return null;
    const stateCount = Math.max(1, solved.stateMap.size);
    /* 预算的最大值按 ETC 估：8 倍 ETC 已经覆盖到 95% 分位以上；
     * 格子宽度尽量细（不超过 0.5c），但把总格子数压在 ~150 万以内，
     * 免得 6 目标那种 400 状态的实例吃几十兆内存。 */
    const maxBudget = Math.max(200, Math.min(6000, Math.ceil((solved.etc || 60) * 8)));
    const maxCells = 1500000;
    const unit = Math.max(0.5, Math.ceil((maxBudget / Math.floor(maxCells / stateCount)) * 10) / 10);
    const N = Math.max(20, Math.floor(maxBudget / unit));
    const states = solved.stateMap;
    const terminals = solved.terminalKeys || new Set();
    const bucketOf = (cost) => Math.max(1, Math.round((Number(cost) || 0) / unit));
    const actionList = new Map();
    for (const [k] of states) {
      if (terminals.has(k)) continue;
      const list = [];
      for (const entry of solved.entries.get(k) || []) list.push({ entry, bc: bucketOf(entry.action.cost) });
      actionList.set(k, list);
    }
    const P = new Map();
    for (const [k] of states) {
      const arr = new Float32Array(N + 1);
      if (terminals.has(k)) arr.fill(1);
      P.set(k, arr);
    }
    for (let i = 0; i <= N; i++) {
      for (const [k, arr] of P) {
        if (terminals.has(k)) continue;
        let best = 0;
        for (const { entry, bc } of actionList.get(k) || []) {
          if (bc > i) continue;
          let sum = 0;
          for (const tr of entry.trs) {
            const nk = key(tr.next);
            if (terminals.has(nk)) { sum += tr.prob; continue; }
            const nArr = P.get(nk);
            if (nArr) sum += tr.prob * nArr[i - bc];
          }
          if (sum > best) best = sum;
        }
        arr[i] = best > 1 ? 1 : best;
      }
    }
    const initArr = P.get(key(ctx.init));
    if (!initArr) return null;
    const frontier = [];
    let bestSoFar = -1;
    for (let i = 0; i <= N; i++) {
      const v = initArr[i];
      if (v > bestSoFar + 1e-6) {
        frontier.push({ budget: Math.round(i * unit * 10) / 10, pSuccess: Math.min(1, v) });
        bestSoFar = v;
      }
    }
    const minBudget = (target) => {
      for (let i = 0; i <= N; i++) if (initArr[i] >= target - 1e-9) return Math.round(i * unit * 10) / 10;
      return null;
    };
    return {
      unit,
      buckets: N,
      maxBudget,
      frontier,
      pAt: (b) => initArr[Math.max(0, Math.min(N, Math.round((Number(b) || 0) / unit)))],
      minBudget,
      minBudget50: minBudget(0.5),
      minBudget90: minBudget(0.9),
      etc: solved.etc,
    };
  }

  /* 目标是「结构上不可达」还是「可达但概率极低」——给界面区分用 */
  function solvedUnreachable(ctx) {
    const essenceReachable = (t) => {
      if (!t.essenceId) return false;
      if (t.perfect) return true;
      return ctx.init.rarity === 'normal' || ctx.init.rarity === 'magic';
    };
    return ctx.list
      .filter((t) => {
        if (essenceReachable(t)) return false;
        const probs = ctx.addProbs[t.side];
        return !probs || !probs.hits.some((h) => h.bit === t.bit);
      })
      .map((t) => t.modId);
  }

  /* ------------------------------------------------------------------ *
   * 对外：给顾问用的高层结果
   * ------------------------------------------------------------------ */
  function analyze(item, targets, opts) {
    opts = opts || {};
    const ctx = buildContext(item, targets, opts);
    if (!ctx.list.length) return { etc: null, pSuccess: 0, reason: '没有可识别的目标词缀' };
    const solved = solve(ctx, opts);
    const init = ctx.init;
    const initKey = key(init);
    if (solved.unreachable || !solved.V) {
      return {
        etc: null,
        pSuccess: 0,
        matched: popcount(init.mask & ctx.fullMask),
        targetCount: ctx.list.length,
        states: 0,
        iterations: 0,
        converged: true,
        unreachable: true,
        unreachableReason: solved.unreachableReason || 'pool',
        unreachableTargets: solved.unreachableTargets || [],
        alternatives: [],
        best: null,
        targets: ctx.list,
      };
    }
    const alternatives = [];
    if (!isTerminal(init, ctx)) {
      for (const entry of (solved.entries.get(initKey) || [])) {
        const a = entry.action;
        const total = solved.qOf(initKey, entry);
        const branches = entry.trs.map((tr) => ({
          prob: tr.prob,
          etc: isTerminal(tr.next, ctx) ? 0 : solved.V.get(key(tr.next)),
          matched: popcount(tr.next.mask & ctx.fullMask),
          targetCount: ctx.list.length,
          side: tr.side || null,
          hitTarget: tr.hit ? bitOwner(tr.hit, ctx) : null,
          lostTarget: tr.lost ? bitOwner(tr.lost, ctx) : null,
          junk: tr.next.junkP + tr.next.junkS,
        })).sort((a2, b2) => b2.prob - a2.prob);
        alternatives.push({
          id: a.id,
          type: a.type,
          cost: a.cost,
          /* 动作参数要带出去：调用方（顾问 / 界面 / 脚本）需要它才能真的执行这一步 */
          omenId: a.omenId || null,
          currency: a.currency || null,
          essenceId: a.essenceId || null,
          total: Number.isFinite(total) ? total : null,
          continuable: Number.isFinite(total),
          selfProb: entry.self,
          branches,
        });
      }
      alternatives.sort((a2, b2) => (a2.total == null ? Infinity : a2.total) - (b2.total == null ? Infinity : b2.total));
    }
    return {
      etc: solved.etc,
      pSuccess: solved.pSuccess,
      matched: popcount(init.mask & ctx.fullMask),
      targetCount: ctx.list.length,
      states: solved.states,
      iterations: solved.iterations,
      converged: solved.converged,
      lowerBound: solved.lowerBound || false,
      unreachable: solved.unreachable,
      unreachableReason: solved.unreachableReason || null,
      unreachableTargets: solved.unreachableTargets || [],
      alternatives,
      best: alternatives[0] || null,
      budget: budgetFromSolved(solved, ctx, opts),
      targets: ctx.list,
    };
  }

  function popcount(n) {
    let c = 0;
    while (n) { c += n & 1; n >>>= 1; }
    return c;
  }
  function bitOwner(bit, ctx) {
    const t = ctx.list.find((x) => x.bit === bit);
    return t ? { modId: t.modId, group: t.group, side: t.side } : null;
  }

  /* 点金石 4 连抽的精确目标结果（给顾问标注「精确」用） */
  function alchemyOutcome(item, targets, opts) {
    const ctx = buildContext(item, targets, opts || {});
    if (!ctx.list.length) return null;
    const dist = alchemyDist(ctx);
    const init = ctx.init;
    const baseMatched = popcount(init.mask & ctx.fullMask);
    let pImprove = 0;
    let pComplete = 0;
    let pRegress = 0;
    for (const d of dist) {
      const m = popcount(d.next.mask & ctx.fullMask);
      if (m > baseMatched) pImprove += d.prob;
      if (m < baseMatched) pRegress += d.prob;
      if (m === ctx.list.length) pComplete += d.prob;
    }
    return { pImprove, pComplete, pRegress, exact: true, branches: dist.length };
  }

  const api = {
    analyze,
    solve,
    budgetFromSolved,
    buildContext,
    abstractState,
    alchemyOutcome,
    keyFor: key,
    _internal: { addDist, removeDist, addActionDist, alchemyDist, actionsFor, transitionsForAction, counts, openSides },
  };
  global.PoE2Solver = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
