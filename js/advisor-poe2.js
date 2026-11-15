/* 流放之路 2 · 策略顾问
 * PoE2 的通货操作比 PoE1 更线性：蜕变 / 增幅 / 富豪 / 崇高 / 混沌 / 剥离 / 预兆。
 * 这里的建议用蒙特卡洛估算，不追求精确官方概率。
 */
(function (global) {
  'use strict';

  const E = global.PoE2Engine;
  const D = global.PoE2Data;

  const ACTION_TITLE = {
    transmute: '蜕变石', augmentation: '增幅石', regal: '富豪石', alchemy: '点金石',
    chaos: '混沌石', exalted: '崇高石', annulment: '剥离石', divine: '神圣石',
    omen: '预兆', essence: '精华', vaal: '瓦尔宝珠', whetstone: '磨刀石', scrap: '护甲片',
    rune: '符文', rune_clear: '取出符文',
  };
  const ACTION_DETAIL = {
    transmute: '普通 → 1 词缀魔法，低成本起手。',
    augmentation: '魔法物品补到 2 条词缀。',
    regal: '魔法 → 稀有，保留现有词缀并新增 1 条。',
    alchemy: '普通 / 魔法 → 4 词缀稀有，重置现有词缀。',
    chaos: '稀有物品移除 1 条并新增 1 条。',
    exalted: '稀有物品新增 1 条词缀。',
    annulment: '魔法 / 稀有物品随机移除 1 条。',
    divine: '重掷所有词缀数值，不改变词缀组合。',
    vaal: '腐化物品，结果随机；腐化后不能再使用普通通货。',
    whetstone: '提升武器品质，最高 20%。',
    scrap: '提升护甲 / 盾 / 法器品质，最高 20%。',
    rune: '把符文插进插槽。',
    rune_clear: '取出所有符文，恢复空插槽。',
  };

  function fmtCost(n) {
    if (!Number.isFinite(n)) return '—';
    if (n >= 1000) return Math.round(n) + 'c';
    if (n >= 10) return n.toFixed(0) + 'c';
    if (n >= 1) return (Math.round(n * 10) / 10) + 'c';
    if (n >= 0.01) return n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + 'c';
    return n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') + 'c';
  }
  function actionTitle(action) {
    if (!action) return '操作';
    if (action.type === 'omen_exec') {
      const omen = (D.omens || []).find((x) => x.id === action.omenId);
      const cur = ACTION_TITLE[action.currency] || action.currency || '';
      return (omen ? omen.name : '预兆') + ' · ' + cur;
    }
    if (action.type === 'omen') {
      const omen = (D.omens || []).find((x) => x.id === action.omenId);
      return omen ? omen.name : '预兆';
    }
    if (action.type === 'essence') {
      const e = (D.essences || []).find((x) => x.id === action.essenceId);
      return e ? e.tierName + e.name + '精华' : '精华';
    }
    if (action.type === 'rune') {
      const r = (D.runes || []).concat(D.soulCores || []).find((x) => x.id === action.runeId);
      return r ? r.name : '符文';
    }
    return ACTION_TITLE[action.type] || action.type;
  }
  function actionDetail(action) {
    if (action.type === 'omen_exec') {
      const omen = (D.omens || []).find((x) => x.id === action.omenId);
      const cur = ACTION_DETAIL[action.currency] || '';
      return (omen ? omen.desc.replace(/\s+/g, '') : '') + (cur ? '（' + cur + '）' : '');
    }
    if (action.type === 'omen') {
      const omen = (D.omens || []).find((x) => x.id === action.omenId);
      return omen ? omen.desc : '';
    }
    if (action.type === 'essence') {
      const e = (D.essences || []).find((x) => x.id === action.essenceId);
      return e ? e.tierName + e.name + '精华：魔法升稀有并保底一条。' : '';
    }
    if (action.type === 'rune') {
      const r = (D.runes || []).concat(D.soulCores || []).find((x) => x.id === action.runeId);
      return r ? '插入' + r.name + '：' + (E.runeText ? E.runeText(r, E.getBase(item.baseId)) : r.text) + '。' : '';
    }
    return ACTION_DETAIL[action.type] || '';
  }
  function essenceDescFor(e, item) {
    // 正式数据：效果按部位（武器再看类别）给，统一走引擎的选取逻辑
    return E.essenceDescForItem ? E.essenceDescForItem(item, e) : null;
  }
  function targetGroupSet(targets) {
    const set = {};
    (targets || []).forEach((t) => {
      const def = E.getTargetDef(t.modId);
      if (def) set[E.targetGroup(def)] = true;
    });
    return set;
  }
  /* 预兆组合：id 与求解器里的动作 id 一一对应，方便按「走完全程」排序 */
  const OMEN_COMBOS = [
    { omenId: 'omen_sinistral_exalt', currency: 'exalted', solverId: 'exalt_left' },
    { omenId: 'omen_dextral_exalt', currency: 'exalted', solverId: 'exalt_right' },
    { omenId: 'omen_greater_exalt', currency: 'exalted', solverId: 'exalt_two' },
    { omenId: 'omen_sinistral_erasure', currency: 'chaos', solverId: 'chaos_left' },
    { omenId: 'omen_dextral_erasure', currency: 'chaos', solverId: 'chaos_right' },
    { omenId: 'omen_whittling', currency: 'chaos', solverId: 'whittling' },
  ];

  function candidateActions(item, targets) {
    const list = [];
    const space = E.canAdd(item, 'prefix') || E.canAdd(item, 'suffix');
    if (item.rarity === 'normal') {
      list.push({ type: 'transmute' }, { type: 'alchemy' });
    } else if (item.rarity === 'magic') {
      if (space) list.push({ type: 'augmentation' });
      list.push({ type: 'regal' }, { type: 'alchemy' });
      if (item.affixes.length) list.push({ type: 'annulment' });
      // 正式精华的效果没有 group 字段：只要该物品能用，就纳入候选，
      // 交给蒙特卡洛估计比较收益，而不是按组名硬匹配。
      (D.essences || []).forEach((e) => {
        if (!essenceDescFor(e, item)) return;
        if (typeof E.essenceAvailability === 'function' && E.essenceAvailability(item, e)) return;
        list.push({ type: 'essence', essenceId: e.id });
      });
    } else if (item.rarity === 'rare') {
      if (space) list.push({ type: 'exalted' });
      if (item.affixes.length) list.push({ type: 'chaos' }, { type: 'annulment' });
      /* 只建模「有价格 + 规则确定」的预兆组合：以前把所有预兆当候选，
       * 但激活预兆不改变物品，抽样恒为 0 提升，等于 28 个死候选。 */
      for (const combo of OMEN_COMBOS) {
        if (typeof E.omenAvailability === 'function' && E.omenAvailability(item, combo.omenId)) continue;
        // 这里只判断「有没有价格」，用默认价格表即可；真正计价在 analyze 里带上实时价格
        const cost = E.actionCost({ type: 'omen_exec', omenId: combo.omenId, currency: combo.currency });
        if (!(Number(cost) > 0)) continue;
        list.push({ type: 'omen_exec', omenId: combo.omenId, currency: combo.currency, solverId: combo.solverId });
      }
      const groups = targetGroupSet(targets);
      (D.essences || []).forEach((e) => {
        if (!e.perfect) return;
        const desc = essenceDescFor(e, item);
        if (!desc || !groups[desc.group]) return;
        if (E.essenceAvailability(item, e)) return;
        list.push({ type: 'essence', essenceId: e.id });
      });
    }
    return list.filter((a) => {
      if (a.type === 'omen_exec') return !E.omenAvailability(item, a.omenId);
      if (a.type === 'omen') return !E.omenAvailability(item, a.omenId);
      if (a.type === 'essence') {
        const e = (D.essences || []).find((x) => x.id === a.essenceId);
        return !!e && !E.essenceAvailability(item, e);
      }
      return !E.actionAvailability(item, a.type);
    });
  }

  /* 只加不删的加词缀动作：命中概率可以直接算，不必抽样。
   * 返回的是两侧按引擎真实落侧规则加权后的结果。 */
  const EXACT_ADD = { transmute: true, augmentation: true, regal: true, exalted: true };

  /* 精确概率必须在「加这条词缀之前的那一步状态」上算：
   * 蜕变会把普通变成魔法（普通状态下根本不能加词缀，canAdd 为 false），
   * 富豪会把魔法升成稀有。直接拿当前物品算，这两类动作会恒等于 0%。 */
  function preAddState(item, action) {
    if (action.type === 'transmute') {
      const c = E.clone(item);
      c.rarity = 'magic';      // 蜕变结果：1 条词缀的魔法物品
      c.affixes = [];
      return c;
    }
    if (action.type === 'regal') {
      const c = E.clone(item);
      c.rarity = 'rare';       // 富豪结果：保留词缀的稀有物品
      return c;
    }
    return item;
  }

  /* 值函数求解器（可选依赖）：给出「剩余期望成本 / 完成概率 / 每步的后续期望」。
   * 求解器不在或求解失败时，全部退回原来的单步统计，不影响可用性。
   * 界面每次重绘都会叫它，所以按「目标 + 物品词缀 + 价格」缓存；复杂目标（5–6 条）
   * 会把状态数顶到几百，再按状态数压一下迭代预算，避免一次点击卡一秒。 */
  const SOLVER_CACHE = new Map();
  const SOLVER_CACHE_MAX = 40;
  function solverCacheKey(item, targets, prices) {
    const tk = (targets || []).map((t) => t.modId + ':' + (t.tier || '')).join(',');
    const ak = (item.affixes || []).map((a) => (a.group || a.modId) + ':' + (a.tierRank || 0) + ':' + (a.affix || '')[0]).sort().join('|');
    const pk = prices ? ['transmute', 'augmentation', 'regal', 'alchemy', 'chaos', 'exalted', 'annulment']
      .map((k) => Math.round(Number(prices[k] || 0) * 100)).join('/') : '';
    return [item.baseId, item.ilvl, item.rarity, item.corrupted ? 1 : 0, ak, tk, pk].join('#');
  }
  function solverPlan(item, targets, prices, opts) {
    const S = (typeof global !== 'undefined' && global.PoE2Solver) || null;
    if (!S || typeof S.analyze !== 'function') return null;
    const key = solverCacheKey(item, targets, prices);
    if (SOLVER_CACHE.has(key)) return SOLVER_CACHE.get(key);
    try {
      const base = { prices, eps: (opts && opts.eps) || 0.02 };
      // 先小预算试解：状态少再补一次长迭代，状态多就接受未收敛（并标下界）
      let plan = S.analyze(item, targets || [], Object.assign({ iterations: 400 }, base));
      if (plan && !plan.converged && !plan.unreachable && plan.states > 0 && plan.states <= 120) {
        plan = S.analyze(item, targets || [], Object.assign({ iterations: 1500 }, base));
      }
      if (SOLVER_CACHE.size >= SOLVER_CACHE_MAX) SOLVER_CACHE.delete(SOLVER_CACHE.keys().next().value);
      SOLVER_CACHE.set(key, plan);
      return plan;
    } catch (e) {
      return null;
    }
  }

  function analyze(item, targets, opts) {
    opts = opts || {};
    const prices = opts.prices || {};
    const samples = Math.max(40, Math.min(400, Number(opts.samples) || 160));
    const targetIds = (targets || []).map((t) => t.modId);
    const baseEval = E.evaluate(item, targets);
    /* 目标已经全部命中时，任何通货都只会变差：直接给「收手」，不再列动作 */
    if (baseEval.complete) {
      return {
        eval: baseEval,
        recommendations: [],
        plan: { diagnosis: '目标完成', steps: [], finish: '结束制作；数值不满可以用神圣石。' },
        diagnosis: '目标已完成。可以停止，或继续追求更高数值。',
        expected: { etc: 0, pSuccess: 1, best: null, alternatives: [], states: 0, converged: true, unreachable: false, matched: baseEval.matchedCount, targetCount: baseEval.targetCount },
      };
    }
    const actions = candidateActions(item, targets);
    const recommendations = [];

    actions.forEach((action, actionIndex) => {
      const cost = E.actionCost(action, prices);
      let improve = 0;
      let complete = 0;
      let regress = 0;
      let valid = 0;
      let exact = false;
      let pImprove = 0;
      let pComplete = 0;
      let pRegress = 0;

      if (EXACT_ADD[action.type] && typeof E.exactAddActionOutcome === 'function') {
        // 精确路径：解析式概率，无抽样噪声
        const pre = preAddState(item, action);
        const ex = E.exactAddActionOutcome(pre, targets || [], {});
        pImprove = ex.pImprove;
        pComplete = ex.pComplete;
        pRegress = 0;
        exact = true;
      } else if (typeof E.exactActionOutcomes === 'function' &&
        (action.type === 'annulment' || action.type === 'chaos')) {
        // 剥离 / 混沌：等概率删一条再（可能）加一条，可以解析展开
        const exo = E.exactActionOutcomes(item, action, targets || [], {});
        if (exo) {
          pImprove = exo.pImprove;
          pComplete = exo.pComplete;
          pRegress = exo.pRegress;
          exact = true;
        }
      } else if (action.type === 'alchemy' && typeof global !== 'undefined' &&
        global.PoE2Solver && typeof global.PoE2Solver.alchemyOutcome === 'function') {
        // 点金石：清空后连抽 4 条，用求解器的同一套转移做精确展开
        const al = global.PoE2Solver.alchemyOutcome(item, targets || [], { prices });
        if (al) {
          pImprove = al.pImprove;
          pComplete = al.pComplete;
          pRegress = al.pRegress;
          exact = true;
        }
      }
      if (!exact) {
        for (let i = 0; i < samples; i++) {
          const rng = E.makeRng((Number(opts.seed) || 1) + actionIndex * 100003 + i * 7919);
          // 落侧口径由引擎的 sidePolicy 决定（默认 real = 两侧都可加时 50/50）
          const res = E.applyAction(item, action, { prices, rng, targets: targetIds });
          if (res.error) continue;
          valid++;
          const ev = E.evaluate(res.item, targets);
          if (ev.complete) complete++;
          if (ev.matchedCount > baseEval.matchedCount || (ev.complete && !baseEval.complete)) improve++;
          if (ev.matchedCount < baseEval.matchedCount) regress++;
        }
        if (!valid) return;
        pImprove = improve / valid;
        pComplete = complete / valid;
        pRegress = regress / valid;
      }
      if (!exact && !valid) return;
      // 对目标完全没影响的动作不进推荐（否则会出现一堆 0% 的预兆排在真正有用的通货前面）
      if (!(pImprove > 5e-4 || pComplete > 5e-4 || pRegress > 5e-4)) return;

      // 只删不补的动作（例如纯剥离）没有「提升概率」，期望花费不该编一个数出来
      const expectedCost = pImprove > 0 ? cost / pImprove : Infinity;
      const score = pComplete * 120 + pImprove * 45 - pRegress * 35 - expectedCost * 0.015;
      const detail = actionDetail(action);
      recommendations.push({
        action,
        title: actionTitle(action),
        detail,
        cost,
        pImprove,
        pComplete,
        pRegress,
        expectedCost,
        score,
        exact,
        samples: exact ? 0 : valid,
        why: [
          '当前目标：' + baseEval.matchedCount + ' / ' + baseEval.targetCount,
          pComplete > 0 ? '这一步有 ' + (pComplete * 100).toFixed(1) + '% 直接完成' : '这一步主要用于提高命中率',
          pRegress > 0 ? '注意：可能会损失已命中词缀' : '不会直接损失目标词缀',
          exact ? '概率为精确值（按官方权重表解析计算，非抽样）' : '概率为 ' + valid + ' 次模拟估计',
        ],
        steps: [detail],
      });
    });

    recommendations.sort((a, b) => b.score - a.score);

    /* 值函数：给每条建议补上「按最优策略走完的期望总花费」并据此重排。
     * 这一步把顾问从「哪步不亏」升级成「哪条路最便宜」。 */
    const expected = solverPlan(item, targets, prices, opts);
    if (expected && expected.alternatives && expected.alternatives.length) {
      /* 注意：这里要用完整备选列表做匹配，之前只取前 4 条，
       * 导致排在后面的预兆组合拿不到「走完全程」的期望而在排序里掉队。 */
      const allAlts = expected.alternatives;
      const byId = new Map();
      for (const a of allAlts) if (!byId.has(a.id)) byId.set(a.id, a);
      recommendations.forEach((r) => {
        const key = r.action.solverId || r.action.type;
        const a = byId.get(key) || byId.get(r.action.type);
        if (a && a.total != null) {
          r.totalExpected = a.total;
          r.solverId = a.id;
          r.branches = a.branches;
        }
      });
      recommendations.sort((a, b) => {
        const av = a.totalExpected == null ? Infinity : a.totalExpected;
        const bv = b.totalExpected == null ? Infinity : b.totalExpected;
        if (av !== bv) return av - bv;
        return b.score - a.score;
      });
    }

    const top = recommendations.slice(0, 3);
    const ev = baseEval;
    let diagnosis;
    if (ev.complete) diagnosis = '目标已完成。可以停止，或继续追求更高数值。';
    else if (item.rarity === 'normal') diagnosis = '普通底子：先用蜕变 / 点金起手，再根据命中的词缀决定增幅或富豪。';
    else if (item.rarity === 'magic') diagnosis = '魔法阶段：优先补到 2 条；命中的词缀越多，富豪升级越划算。';
    else diagnosis = '稀有阶段：优先崇高补空位；空位不足时用混沌 / 剥离 / 预兆处理废词缀。';

    let plan;
    if (ev.complete) {
      plan = { diagnosis: '目标完成', steps: [], finish: '结束制作。' };
    } else if (item.rarity === 'normal') {
      plan = {
        diagnosis: '从普通底子开始',
        steps: ['蜕变石：做出 1 词缀魔法', '增幅石：补到 2 条', '命中目标后用富豪石升稀有', '稀有后崇高补位'],
        finish: '目标全部命中后停止；数值不满可用神圣石。',
      };
    } else if (item.rarity === 'magic') {
      plan = {
        diagnosis: '魔法阶段',
        steps: ['增幅补到 2 条', '检查是否命中目标', '有目标 / 可接受词缀时用富豪石升稀有'],
        finish: '升稀有后按空位补崇高，废词缀用混沌或预兆处理。',
      };
    } else {
      plan = {
        diagnosis: '稀有阶段',
        steps: ['优先崇高补空位', '空位满时用混沌 / 剥离换掉废词缀', '需要保留一侧时用左旋 / 右旋预兆'],
        finish: '目标齐全后用神圣石调整数值。',
      };
    }
    return {
      eval: ev,
      recommendations: top,
      plan,
      diagnosis,
      expected: expected ? {
        etc: expected.etc,
        pSuccess: expected.pSuccess,
        best: expected.best,
        alternatives: (expected.alternatives || []).slice(0, 4),
        states: expected.states,
        converged: expected.converged,
        lowerBound: expected.lowerBound || false,
        budget: expected.budget || null,
        unreachable: expected.unreachable,
        unreachableReason: expected.unreachableReason || null,
        unreachableTargets: expected.unreachableTargets || [],
        matched: expected.matched,
        targetCount: expected.targetCount,
      } : null,
    };
  }

  function chooseRouteAction(item, ev, rng, budget, spent, targets) {
    const space = E.canAdd(item, 'prefix') || E.canAdd(item, 'suffix');
    if (item.rarity === 'normal') {
      return { type: E.rand(rng) < 0.65 ? 'alchemy' : 'transmute' };
    }
    if (item.rarity === 'magic') {
      if (ev.missing.length && typeof E.essenceAvailability === 'function') {
        const groups = targetGroupSet(targets);
        const e = (D.essences || []).find((x) => {
          const desc = essenceDescFor(x, item);
          return desc && groups[desc.group] && !E.essenceAvailability(item, x);
        });
        if (e) return { type: 'essence', essenceId: e.id };
      }
      if (item.affixes.length < 2) return { type: 'augmentation' };
      if (ev.matchedCount > 0) return { type: 'regal' };
      return { type: E.rand(rng) < 0.7 ? 'alchemy' : 'regal' };
    }
    if (item.rarity === 'rare') {
      if (ev.missing.length && typeof E.essenceAvailability === 'function') {
        const groups = targetGroupSet(targets);
        const e = (D.essences || []).find((x) => {
          if (!x.perfect) return false;
          const desc = essenceDescFor(x, item);
          return desc && groups[desc.group] && !E.essenceAvailability(item, x);
        });
        if (e) return { type: 'essence', essenceId: e.id };
      }
      if (space) return { type: 'exalted' };
      if (ev.junk.length) {
        if (E.rand(rng) < 0.5) return { type: 'omen', omenId: 'omen_whittling' };
        return { type: 'chaos' };
      }
      return { type: 'chaos' };
    }
    return null;
  }

  function simulateRoute(item, targets, opts) {
    opts = opts || {};
    const runs = Math.max(10, Number(opts.runs) || 80);
    const maxSteps = Math.max(10, Number(opts.maxSteps) || 40);
    const budget = Math.max(100, Number(opts.budget) || 2500);
    const prices = opts.prices || {};
    const targetIds = (targets || []).map((t) => t.modId);
    let wins = 0;
    let totalCost = 0;
    let winCost = 0;
    let totalSteps = 0;

    for (let r = 0; r < runs; r++) {
      const rng = E.makeRng((Number(opts.seed) || 424242) + r * 31337);
      let cur = E.clone(item);
      let spent = 0;
      let steps = 0;
      let success = false;
      while (steps < maxSteps && spent < budget) {
        const ev = E.evaluate(cur, targets);
        if (ev.complete) { success = true; break; }
        const action = chooseRouteAction(cur, ev, rng, budget, spent, targets);
        if (!action) break;
        const res = E.applyAction(cur, action, { prices, rng, targets: targetIds });
        if (res.error) break;
        cur = res.item;
        spent += res.cost || 0;
        steps++;
      }
      if (!success) {
        const ev = E.evaluate(cur, targets);
        success = ev.complete;
      }
      totalCost += spent;
      totalSteps += steps;
      if (success) { wins++; winCost += spent; }
    }
    return {
      runs,
      successRate: wins / runs,
      avgCost: totalCost / runs,
      avgWinCost: wins ? winCost / wins : 0,
      avgSteps: totalSteps / runs,
    };
  }

  global.PoE2Advisor = { analyze, simulateRoute, actionTitle, fmtCost, candidateActions, essenceDescFor };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.PoE2Advisor;
})(typeof window !== 'undefined' ? window : globalThis);
