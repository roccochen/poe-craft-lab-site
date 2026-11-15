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
      (D.omens || []).forEach((omen) => list.push({ type: 'omen', omenId: omen.id }));
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
      if (a.type === 'omen') return !E.omenAvailability(item, a.omenId);
      if (a.type === 'essence') {
        const e = (D.essences || []).find((x) => x.id === a.essenceId);
        return !!e && !E.essenceAvailability(item, e);
      }
      return !E.actionAvailability(item, a.type);
    });
  }

  function analyze(item, targets, opts) {
    opts = opts || {};
    const prices = opts.prices || {};
    const samples = Math.max(40, Math.min(400, Number(opts.samples) || 160));
    const targetIds = (targets || []).map((t) => t.modId);
    const baseEval = E.evaluate(item, targets);
    const actions = candidateActions(item, targets);
    const recommendations = [];

    actions.forEach((action, actionIndex) => {
      const cost = E.actionCost(action, prices);
      let improve = 0;
      let complete = 0;
      let regress = 0;
      let valid = 0;
      for (let i = 0; i < samples; i++) {
        const rng = E.makeRng((Number(opts.seed) || 1) + actionIndex * 100003 + i * 7919);
        // 把目标传进引擎：新词缀会优先落在目标还没命中的一侧，和真实做装思路一致。
        const res = E.applyAction(item, action, { prices, rng, targets: targetIds });
        if (res.error) continue;
        valid++;
        const ev = E.evaluate(res.item, targets);
        if (ev.complete) complete++;
        if (ev.matchedCount > baseEval.matchedCount || (ev.complete && !baseEval.complete)) improve++;
        if (ev.matchedCount < baseEval.matchedCount) regress++;
      }
      if (!valid) return;
      const pImprove = improve / valid;
      const pComplete = complete / valid;
      const pRegress = regress / valid;
      const expectedCost = cost / Math.max(0.01, pImprove);
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
        why: [
          '当前目标：' + baseEval.matchedCount + ' / ' + baseEval.targetCount,
          pComplete > 0 ? '这一步有 ' + (pComplete * 100).toFixed(1) + '% 直接完成' : '这一步主要用于提高命中率',
          pRegress > 0 ? '注意：可能会损失已命中词缀' : '不会直接损失目标词缀',
        ],
        steps: [detail],
      });
    });

    recommendations.sort((a, b) => b.score - a.score);
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
    return { eval: ev, recommendations: top, plan, diagnosis };
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
