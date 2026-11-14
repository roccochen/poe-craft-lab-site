/* 流放之路 1 做装台 · 策略顾问
 * 基于当前物品状态，枚举可行操作，用小规模蒙特卡洛估计收益，输出下一步与收尾路线。
 */
(function (global) {
  'use strict';

  const E = global.PoEEngine;
  const D = global.PoEData;

  const SIDE_NAME = { prefix: '前缀', suffix: '后缀' };
  const TAG_NAME = {};
  D.harvestTags.forEach((t) => { TAG_NAME[t.id] = t.name; });
  const FOSSIL_BY_ID = {};
  D.fossils.forEach((f) => { FOSSIL_BY_ID[f.id] = f; });
  const ESSENCE_BY_ID = {};
  D.essences.forEach((e) => { ESSENCE_BY_ID[e.id] = e; });
  const BENCH_BY_ID = {};
  D.bench.forEach((b) => { BENCH_BY_ID[b.id] = b; });
  const META_BY_ID = {};
  D.metaCrafts.forEach((m) => { META_BY_ID[m.id] = m; });

  function targetTags(targets) {
    const set = {};
    targets.forEach((t) => {
      const def = E.getTargetDef(t.modId);
      if (!def) return;
      (def.tags || []).forEach((tag) => { set[tag] = true; });
    });
    return Object.keys(set);
  }
  function targetGroups(targets) {
    const set = {};
    targets.forEach((t) => {
      const def = E.getTargetDef(t.modId);
      if (def) set[E.targetGroup(def)] = true;
    });
    return set;
  }
  function isSideMatched(item, targets, side) {
    const sideTargets = targets.filter((t) => {
      const def = E.getTargetDef(t.modId);
      return def && def.affix === side;
    });
    if (!sideTargets.length) return false;
    return sideTargets.every((t) => !!E.findMatchingAffix(item, t));
  }
  function countSideTargets(targets, side) {
    return targets.filter((t) => {
      const def = E.getTargetDef(t.modId);
      return def && def.affix === side;
    }).length;
  }

  function essenceDesc(essence, item) {
    const slot = E.getBase(item.baseId).slot;
    const cat = (slot === 'weapon' || slot === 'quiver') ? 'weapon'
      : (slot === 'ring' || slot === 'amulet' || slot === 'belt') ? 'jewellery' : 'armour';
    return (essence.bySlot && essence.bySlot[slot]) || essence.byCat[cat] || null;
  }
  function essenceFit(essence, item, targets) {
    const desc = essenceDesc(essence, item);
    if (!desc) return -99;
    const groups = targetGroups(targets);
    const tags = targetTags(targets);
    let fit = 0;
    if (groups[desc.group]) {
      fit += 10;
      // 目标顺序代表优先级：第一条目标额外加权，避免所有保底精华同分
      const first = targets[0] && E.getTargetDef(targets[0].modId);
      if (first && E.targetGroup(first) === desc.group) fit += 8;
    }
    (desc.tags || []).forEach((tag) => { if (tags.indexOf(tag) !== -1) fit += 2; });
    if (item.affixes.some((a) => a.group === desc.group)) fit -= 4;
    return fit;
  }
  function fossilFit(fossil, item, targets) {
    const tags = targetTags(targets);
    let fit = 0;
    (fossil.more || []).forEach((tag) => { if (tags.indexOf(tag) !== -1) fit += 3; });
    (fossil.block || []).forEach((tag) => { if (tags.indexOf(tag) !== -1) fit -= 8; });
    (fossil.fewer || []).forEach((tag) => { if (tags.indexOf(tag) !== -1) fit -= 1; });
    if (fossil.sanctified) fit += 1;
    return fit;
  }
  function harvestFit(tag, targets) {
    const tags = targetTags(targets);
    let fit = 0;
    if (tags.indexOf(tag) !== -1) fit += 4;
    return fit;
  }

  function actionTitle(action) {
    switch (action.type) {
      case 'transmute': return '蜕变起手';
      case 'alteration': return '改造石洗练';
      case 'augmentation': return '增幅补词缀';
      case 'regal': return '富豪升稀有';
      case 'alchemy': return '点金开局';
      case 'chaos': return '混沌重铸';
      case 'exalted': return '崇高加词缀';
      case 'annulment': return '剥离废词缀';
      case 'scour': return '重铸重来';
      case 'divine': return '神圣石调数值';
      case 'vaal': return '瓦尔腐化';
      case 'scrap': return '护甲片提品质';
      case 'whetstone': return '磨刀石提品质';
      case 'awakener': return '觉醒者之石 · 双势力';
      case 'aisling': return '爱斯琳 · 隐秘词缀';
      case 'eldritch': return 'Eldritch · ' + (action.kind === 'exarch' ? '灼热' : '吞噬');
      case 'orb_conflict': return 'Orb of Conflict';
      case 'influence_exalt': return '势力崇高石';
      case 'tainted_chaos': return '腐化混沌石';
      case 'tainted_exalted': return '腐化崇高石';
      case 'tainted_divine': return '腐化神圣石';
      case 'tainted_annul': return '腐化剥离石';
      case 'bench_remove': return '移除工艺词缀';
      case 'veiled_chaos': return '隐秘混沌石';
      case 'jeweller': return '珠宝匠的宝珠';
      case 'fusing': return '链结石';
      case 'chromatic': return '幻色石';
      case 'recombine': return '重组器';
      case 'unveil': return '揭露隐秘词缀';
      case 'essence': {
        const e = ESSENCE_BY_ID[action.essenceId];
        return e ? (e.tierName + e.name + '精华') : '精华';
      }
      case 'fossil': {
        const names = (action.fossilIds || []).map((id) => FOSSIL_BY_ID[id] && FOSSIL_BY_ID[id].name).filter(Boolean);
        return names.length ? names.join(' + ') : '化石重铸';
      }
      case 'harvest': return '庄园 · ' + (TAG_NAME[action.tag] || action.tag);
      case 'harvest_remove': return '庄园移除 · ' + (TAG_NAME[action.tag] || action.tag);
      case 'harvest_add': return '庄园添加 · ' + (TAG_NAME[action.tag] || action.tag);
      case 'harvest_augment': return '庄园增幅 · ' + (TAG_NAME[action.tag] || action.tag);
      case 'bench': {
        const b = BENCH_BY_ID[action.benchId];
        return b ? '工艺 · ' + b.name : '工艺台';
      }
      case 'lock_chaos': return '锁' + SIDE_NAME[action.side] + ' + 混沌';
      case 'lock_scour': return '锁' + SIDE_NAME[action.side] + ' + 重铸';
      case 'lock_exalt': return '锁' + SIDE_NAME[action.side] + ' + 崇高';
      case 'meta': {
        const m = META_BY_ID[action.metaId];
        return m ? m.name : 'meta 工艺';
      }
      case 'multimod': return '多重工艺';
      default: return '未知操作';
    }
  }
  function actionDetail(action, item) {
    switch (action.type) {
      case 'transmute': return '把普通物品变成 1 条词缀的魔法物品。';
      case 'alteration': return '重铸魔法词缀，是洗单条 / 双条目标最便宜的方式。';
      case 'augmentation': return '给魔法或稀有物品补一条随机词缀。';
      case 'regal': return '魔法升稀有，保留现有词缀再添一条。';
      case 'alchemy': return '普通直接变 4 词缀稀有，适合多条目标一起赌。';
      case 'chaos': return '重铸稀有词缀，适合目标较多、愿意反复赌的情况。';
      case 'exalted': return '给稀有物品增加一条随机词缀，占用空位。';
      case 'annulment': return '随机移除一条非破裂词缀，可能移除目标词缀。';
      case 'scour': return '清空词缀回到普通，通常用于彻底重来。';
      case 'divine': return '重掷数值，不改词缀和品级。';
      case 'vaal': return '腐化物品；可能获得腐化基底、变成 6 词缀稀有，或没有额外变化。';
      case 'scrap': return '提升护甲 / 盾的品质，最高 20%。';
      case 'whetstone': return '提升武器品质，最高 20%。';
      case 'awakener': return '双势力合成：保留目标与祭品各一条影响词缀，其余重铸。';
      case 'aisling': return '给稀有物品添加一条待揭露的隐秘词缀。';
      case 'eldritch': return '添加 / 替换 ' + (action.kind === 'exarch' ? '灼热' : '吞噬') + ' Eldritch 基底。';
      case 'orb_conflict': return '随机提升一种 Eldritch 基底，并降低另一种；降低到 0 会移除。';
      case 'influence_exalt': return '给稀有物品添加 1 个势力影响，并随机获得 1 条该势力词缀。';
      case 'tainted_chaos': return '重铸腐化稀有物品的随机词缀。';
      case 'tainted_exalted': return '给腐化稀有物品增加一条词缀。';
      case 'tainted_divine': return '重掷腐化物品的词缀数值。';
      case 'tainted_annul': return '随机移除腐化物品的一条非破裂词缀。';
      case 'bench_remove': return '移除物品上所有工艺 / meta 词缀。';
      case 'veiled_chaos': return '重铸稀有物品，并保证 1 条待揭露隐秘词缀。';
      case 'jeweller': return '增加 1 个插槽。';
      case 'fusing': return '重掷插槽连接。';
      case 'chromatic': return '重掷所有非白孔颜色。';
      case 'recombine': return '从目标与祭品的词缀池随机组合。';
      case 'unveil': return '从 3 个隐秘选项中选择 1 条，替换待揭露词缀。';
      case 'essence': {
        const e = ESSENCE_BY_ID[action.essenceId];
        const desc = e && essenceDesc(e, item);
        if (!e || !desc) return '精华重铸。';
        return '保底「' + E.formatText(desc.text, desc.v.map((r) => (r[0] + r[1]) / 2)) + '」，其余随机。';
      }
      case 'fossil': {
        const fossils = (action.fossilIds || []).map((id) => FOSSIL_BY_ID[id]).filter(Boolean);
        return fossils.map((f) => f.desc).join('；') + '。';
      }
      case 'harvest': return '重铸并保证至少一条「' + (TAG_NAME[action.tag] || action.tag) + '」标签词缀。';
      case 'harvest_remove': return '定向移除一条「' + (TAG_NAME[action.tag] || action.tag) + '」标签词缀。';
      case 'harvest_add': return '移除一条随机词缀，并添加一条「' + (TAG_NAME[action.tag] || action.tag) + '」标签词缀。';
      case 'harvest_augment': return '在空位添加一条「' + (TAG_NAME[action.tag] || action.tag) + '」标签词缀。';
      case 'bench': {
        const b = BENCH_BY_ID[action.benchId];
        if (!b) return '工艺台固定词缀。';
        return '固定获得「' + E.formatText(b.text, b.v.map((r) => (r[0] + r[1]) / 2)) + '」，占用一个' + SIDE_NAME[b.affix] + '位。';
      }
      case 'lock_chaos': return '锁住' + SIDE_NAME[action.side] + '，只重铸另一侧，保护已完成的一侧。';
      case 'lock_scour': return '锁住' + SIDE_NAME[action.side] + '并清空另一侧，为工艺 / 崇高腾位置。';
      case 'lock_exalt': return '锁住' + SIDE_NAME[action.side] + '，只在另一侧增加词缀。';
      case 'meta': {
        const m = META_BY_ID[action.metaId];
        return m ? m.desc : 'meta 工艺。';
      }
      case 'multimod': return '允许最多 3 条工艺词缀。';
      default: return '';
    }
  }

  function sideStateText(ev) {
    const parts = [];
    parts.push('已命中 ' + ev.matchedCount + '/' + ev.targetCount);
    if (ev.openPrefix || ev.openSuffix) {
      const open = [];
      if (ev.openPrefix) open.push('前缀 ' + ev.openPrefix);
      if (ev.openSuffix) open.push('后缀 ' + ev.openSuffix);
      parts.push('空位：' + open.join(' / '));
    } else if (ev.totalCount) {
      parts.push('词缀已满');
    }
    if (ev.junk.length) parts.push('废词缀 ' + ev.junk.length + ' 条');
    return parts.join('，') + '。';
  }

  function matchedGroupSet(ev) {
    const set = {};
    ev.matched.forEach((m) => { set[m.affix.group] = true; });
    return set;
  }
  function sampleAction(item, action, targets, samples, seed, prices) {
    const baseEval = E.evaluate(item, targets);
    const baseGroups = matchedGroupSet(baseEval);
    let complete = 0, improve = 0, regress = 0, valid = 0;
    const n = action.type === 'bench' || action.type === 'multimod' || action.type === 'meta' || action.type === 'awakener' || action.type === 'aisling' || action.type === 'unveil' ? 1 : samples;
    for (let i = 0; i < n; i++) {
      const rng = E.makeRng((seed + i * 7919) >>> 0);
      const res = E.applyAction(item, action, { rng, prices });
      if (res.error) continue;
      valid++;
      const ev = E.evaluate(res.item, targets);
      const groups = matchedGroupSet(ev);
      let gained = 0, lost = 0;
      Object.keys(groups).forEach((g) => { if (!baseGroups[g]) gained++; });
      Object.keys(baseGroups).forEach((g) => { if (!groups[g]) lost++; });
      if (ev.complete) complete++;
      const better = gained > 0
        || (lost === 0 && ev.junk.length < baseEval.junk.length);
      if (better) improve++;
      if (lost > 0) regress++;
    }
    return {
      samples: Math.max(1, valid),
      pComplete: valid ? complete / valid : 0,
      pImprove: valid ? improve / valid : 0,
      pRegress: valid ? regress / valid : 0,
    };
  }

  function makeCandidate(item, action, targets, prices, samples, seed, extra) {
    extra = extra || {};
    const baseEval = E.evaluate(item, targets);
    const sample = sampleAction(item, action, targets, samples, seed, prices);
    const cost = E.actionCost(action, prices);
    const expected = sample.pImprove > 0 ? cost / sample.pImprove : Infinity;
    let score = sample.pComplete * 170 + sample.pImprove * 65 - sample.pRegress * 80;
    if (Number.isFinite(expected)) score -= Math.log10(expected + 1) * 7;
    else score -= 80;
    score += extra.bonus || 0;

    const why = [];
    why.push(sideStateText(baseEval));
    if (extra.fitText) why.push(extra.fitText);
    if (sample.pComplete > 0) why.push('单次直接完成目标的概率约 ' + pct(sample.pComplete) + '。');
    if (sample.pImprove > 0) why.push('单次让进度前进的概率约 ' + pct(sample.pImprove) + '，期望约 ' + fmtCost(expected) + ' 换一次有效提升。');
    else why.push('单次很难直接改善目标命中，更多是过渡或重置。');
    if (sample.pRegress > 0) why.push('有 ' + pct(sample.pRegress) + ' 的概率损失已命中的目标词缀。');

    const steps = extra.steps || defaultSteps(action, baseEval, targets);
    return {
      key: actionKey(action),
      action,
      title: actionTitle(action),
      detail: actionDetail(action, item),
      cost,
      pComplete: sample.pComplete,
      pImprove: sample.pImprove,
      pRegress: sample.pRegress,
      expectedCost: expected,
      score,
      why,
      warning: extra.warning || '',
      steps,
      kind: extra.kind || action.type,
      fit: extra.fit || 0,
    };
  }

  function actionKey(action) {
    return [action.type, action.essenceId || '', (action.fossilIds || []).join('+'), action.tag || '',
      action.benchId || '', action.side || ''].join('|');
  }
  function pct(x) { return (x * 100).toFixed(x >= 0.1 ? 0 : 1) + '%'; }
  function fmtCost(x) {
    if (!Number.isFinite(x)) return '—';
    if (x >= 10000) return '>1 万 c';
    if (x >= 100) return Math.round(x) + 'c';
    if (x >= 10) return x.toFixed(0) + 'c';
    return x.toFixed(1) + 'c';
  }

  function defaultSteps(action, ev, targets) {
    const steps = [];
    if (action.type === 'alteration') {
      steps.push('反复改造，直到出现 1–2 条关键目标（通常先追前缀或后缀中最难的一条）。');
      steps.push('命中后立刻停手，改用富豪石升稀有，避免继续改造把词缀洗掉。');
    } else if (action.type === 'regal') {
      steps.push('保留当前魔法词缀，用富豪石升稀有。');
      steps.push('升稀有后根据空位选择崇高石 / 工艺台 / 锁侧重铸。');
    } else if (action.type === 'essence') {
      steps.push('用精华把普通物品直接做成稀有，利用保底词缀锁定一个目标。');
      steps.push('检查另一侧是否已有目标；没有就继续精华 / 改造，有就转工艺或锁侧。');
    } else if (action.type === 'fossil') {
      steps.push('用化石权重抬高目标标签，反复重铸直到命中关键组合。');
      steps.push('命中后转工艺台补最后一条，或用锁侧重铸修另一侧。');
    } else if (action.type === 'harvest') {
      steps.push('用庄园标签重铸，保证至少一条目标标签词缀。');
      steps.push('保留命中词缀，通过锁侧 / 工艺台补齐其余目标。');
    } else if (action.type === 'bench') {
      steps.push('直接添加工艺词缀。');
      steps.push('如果这是最后一条目标，做装完成；否则继续处理空位。');
    } else if (action.type === 'lock_chaos') {
      steps.push('工艺台锁住' + SIDE_NAME[action.side] + '，再用混沌石只重铸另一侧。');
      steps.push('另一侧出现目标后停手，用工艺台补最后一条。');
    } else if (action.type === 'lock_scour') {
      steps.push('锁住' + SIDE_NAME[action.side] + '并清空另一侧。');
      steps.push('用崇高石 / 工艺台在空侧补齐目标。');
    } else if (action.type === 'chaos') {
      steps.push('反复混沌，直到一次出现足够多的目标词缀。');
      steps.push('出现 2 条以上目标后，改用锁侧 / 工艺台收尾。');
    } else if (action.type === 'exalted') {
      steps.push('直接崇高，赌空位命中缺失目标。');
      steps.push('如果歪了，评估剥离 / 锁侧重铸是否值得。');
    } else if (action.type === 'annulment') {
      steps.push('剥离废词缀，为下一次崇高 / 工艺腾位置。');
      steps.push('若剥掉目标词缀，考虑锁侧重铸或重来。');
    } else {
      steps.push('执行操作，观察词缀变化后再决定下一步。');
    }
    return steps;
  }

  function diagnose(ev, targets) {
    if (ev.complete) return '目标词缀已经全部命中。检查空位，决定工艺收尾或直接收手。';
    if (!ev.targetCount) return '还没有设置目标词缀。先在左侧选择你想要的词缀与最低品级。';
    if (ev.matchedCount === 0) return '当前还没有命中任何目标词缀，优先用低成本方式起手。';
    const missingSides = [];
    if (ev.targetsBySide.prefix.some((t) => !E.findMatchingAffix({ affixes: ev.matched.map((m) => m.affix) }, t))) missingSides.push('前缀');
    if (ev.targetsBySide.suffix.some((t) => !E.findMatchingAffix({ affixes: ev.matched.map((m) => m.affix) }, t))) missingSides.push('后缀');
    return '已命中 ' + ev.matchedCount + '/' + ev.targetCount + ' 条目标，还缺' + (missingSides.join('与') || '部分') +
      '；当前有 ' + (ev.openPrefix + ev.openSuffix) + ' 个空位、' + ev.junk.length + ' 条废词缀。';
  }

  function benchCanMeet(craft, target) {
    if (!craft) return false;
    if (E.isBenchTarget(target.modId)) return craft.id === target.modId;
    const def = E.getTargetDef(target.modId);
    if (!def || !def.tiers) return true;
    const wanted = target.tier && def.tiers.find((tier) => E.tierRank(def, tier) === Number(target.tier));
    if (!wanted || !wanted.v || !wanted.v[0]) return true;
    return !!(craft.v && craft.v[0] && craft.v[0][1] >= wanted.v[0][0]);
  }
  function chooseBench(item, targets, ev) {
    const options = E.benchOptions(item);
    if (!options.length) return null;
    const targetBench = options.find((b) => ev.missing.some((t) => {
      const def = E.getTargetDef(t.modId);
      if (!def) return false;
      if (benchCanMeet(b, t)) {
        return (b.group || b.id) === E.targetGroup(def) || b.id === t.modId;
      }
      return false;
    }));
    if (targetBench) return targetBench;
    if (ev.matchedCount > 0 && (ev.openPrefix + ev.openSuffix) === 1) {
      const useful = options.find((b) => ['life', 'res_fire', 'res_cold', 'res_light', 'res_chaos', 'all_res', 'es_flat', 'ar_flat', 'ev_flat'].indexOf(b.group || b.id) !== -1);
      if (useful) return useful;
    }
    return null;
  }

  function buildCandidates(item, targets, prices, samples, seed) {
    const ev = E.evaluate(item, targets);
    const out = [];
    const push = (action, extra) => {
      const c = makeCandidate(item, action, targets, prices, samples, seed + out.length * 131, extra);
      if (c.pImprove <= 0 && c.pComplete <= 0 && c.kind !== 'annulment' && c.kind !== 'scour') {
        // 仍然保留会有意义的操作，但降低排序
        c.score -= 25;
      }
      out.push(c);
    };

    if (item.rarity === 'normal') {
      push({ type: 'transmute' }, { bonus: 4 });
      push({ type: 'alchemy' }, { bonus: 2 });
    }

    if (item.rarity === 'magic') {
      push({ type: 'alteration' }, { bonus: ev.matchedCount === 0 ? 7 : 2 });
      if (E.canAdd(item, 'prefix') || E.canAdd(item, 'suffix')) push({ type: 'augmentation' }, { bonus: ev.matchedCount === 1 ? 5 : 1 });
      push({ type: 'regal' }, { bonus: ev.matchedCount >= 1 ? 12 : 0 });
    }

    if (item.rarity === 'rare') {
      push({ type: 'chaos' }, { bonus: ev.matchedCount === 0 ? 5 : 1 });
      if (ev.openPrefix || ev.openSuffix) push({ type: 'exalted' }, { bonus: ev.matchedCount >= 2 ? 7 : 2 });
      if (ev.junk.length) push({ type: 'annulment' }, { bonus: ev.matchedCount > 0 ? 8 : 2 });
      if (ev.matchedCount > 0) push({ type: 'scour' }, { bonus: -6 });
    }

    // 精华：普通 / 稀有；化石：仅稀有
    if (item.rarity === 'normal' || item.rarity === 'rare') {
    const essences = D.essences
      .map((e) => ({ e, fit: essenceFit(e, item, targets) }))
      .filter((x) => x.fit > 0)
      .sort((a, b) => b.fit - a.fit)
      .slice(0, 3);
    essences.forEach(({ e, fit }) => {
      const desc = essenceDesc(e, item);
      const firstDef = targets[0] && E.getTargetDef(targets[0].modId);
      const firstBonus = desc && firstDef && E.targetGroup(firstDef) === desc.group ? 15 : 0;
      push({ type: 'essence', essenceId: e.id }, {
        bonus: 6 + fit + firstBonus, fit,
        fitText: '精华保底词缀与目标匹配（' + E.formatText(desc.text, desc.v.map((r) => (r[0] + r[1]) / 2)) + '）。' +
          (firstBonus ? ' 它对应你的第一条目标，优先级更高。' : ''),
        warning: item.rarity === 'rare' ? '会重铸所有非破裂词缀，只保留精华保底。' : '',
      });
    });

    // 化石
    const fossils = item.rarity === 'rare' ? (D.fossils
      .map((f) => ({ f, fit: fossilFit(f, item, targets) }))
      .filter((x) => x.fit > 0)
      .sort((a, b) => b.fit - a.fit)
      .slice(0, 3)) : [];
    fossils.forEach(({ f, fit }) => {
      push({ type: 'fossil', fossilIds: [f.id] }, {
        bonus: 4 + fit, fit,
        fitText: f.desc + '。',
        warning: '会重铸所有非破裂词缀，并保留破裂词缀。',
      });
    });
    if (item.rarity === 'rare') {
      const comboIds = fossilComboForTargets(targets);
      if (comboIds && comboIds.length > 1) {
        const comboFossils = comboIds.map((id) => FOSSIL_BY_ID[id]).filter(Boolean);
        if (comboFossils.length > 1) {
          push({ type: 'fossil', fossilIds: comboIds }, {
            bonus: 8, fit: comboFossils.length,
            fitText: '组合化石：' + comboFossils.map((f) => f.name + '（' + f.desc + '）').join(' + ') + '。',
            warning: '组合化石成本更高，但能同时抬高多条目标标签的权重。',
          });
        }
      }
    }
    }

    // 庄园
    if (item.rarity === 'rare') {
      const harvests = D.harvestTags
        .map((t) => ({ t, fit: harvestFit(t.id, targets) }))
        .filter((x) => x.fit > 0)
        .sort((a, b) => b.fit - a.fit)
        .slice(0, 3);
      harvests.forEach(({ t, fit }) => {
        push({ type: 'harvest', tag: t.id }, {
          bonus: 3 + fit, fit,
          fitText: '庄园可以保证至少一条「' + t.name + '」词缀，适合补指定标签。',
          warning: '会重铸当前稀有词缀。',
        });
      });
    }

    // 工艺台
    if (item.rarity === 'rare') {
      const benchPick = chooseBench(item, targets, ev);
      if (benchPick) {
        push({ type: 'bench', benchId: benchPick.id }, {
          bonus: 26, kind: 'bench',
          fitText: '工艺台可以固定补上「' + benchPick.name + '」，不需要赌随机。',
        });
      }
    }

    // 锁侧重铸
    if (item.rarity === 'rare') {
      const prefixDone = isSideMatched(item, targets, 'prefix');
      const suffixDone = isSideMatched(item, targets, 'suffix');
      const prefixMissing = countSideTargets(targets, 'prefix') > 0 && !prefixDone;
      const suffixMissing = countSideTargets(targets, 'suffix') > 0 && !suffixDone;
      let matchedPrefix = 0, matchedSuffix = 0;
      ev.matched.forEach((m) => { if (m.affix.affix === 'prefix') matchedPrefix++; else matchedSuffix++; });
      if (prefixDone && matchedSuffix === 0 && (suffixMissing || ev.openSuffix)) {
        if (ev.suffixCount > 0) {
          push({ type: 'lock_chaos', side: 'prefix' }, {
            bonus: 28, kind: 'lock',
            fitText: '前缀目标已经完成，锁前缀重铸后缀不会破坏现有前缀。',
            warning: '会消耗 2 崇高 meta 工艺 + 混沌石，并重铸后缀。',
          });
        } else {
          push({ type: 'lock_scour', side: 'prefix' }, {
            bonus: 10, kind: 'lock',
            fitText: '前缀已完成且后缀为空，可以锁前缀清空并准备崇高 / 工艺。',
            warning: '会消耗 meta 工艺；如果后缀本来为空，直接用崇高更便宜。',
          });
        }
      }
      if (suffixDone && matchedPrefix === 0 && (prefixMissing || ev.openPrefix)) {
        if (ev.prefixCount > 0) {
          push({ type: 'lock_chaos', side: 'suffix' }, {
            bonus: 28, kind: 'lock',
            fitText: '后缀目标已经完成，锁后缀重铸前缀不会破坏现有后缀。',
            warning: '会消耗 2 崇高 meta 工艺 + 混沌石，并重铸前缀。',
          });
        } else {
          push({ type: 'lock_scour', side: 'suffix' }, {
            bonus: 10, kind: 'lock',
            fitText: '后缀已完成且前缀为空，可以锁后缀清空并准备崇高 / 工艺。',
            warning: '会消耗 meta 工艺；如果前缀本来为空，直接用崇高更便宜。',
          });
        }
      }
    }

    if (item.rarity === 'rare' && !item.meta.multimod && targets.filter((t) => E.isBenchTarget(t.modId)).length >= 2) {
      push({ type: 'multimod' }, { bonus: 8, kind: 'multimod', fitText: '目标里有多条工艺词缀，多重工艺可以一次收尾。' });
    }

    // 去重 + 排序
    const seen = {};
    const unique = [];
    out.forEach((c) => {
      if (seen[c.key]) {
        if (c.score > seen[c.key].score) {
          const idx = unique.indexOf(seen[c.key]);
          unique[idx] = c;
          seen[c.key] = c;
        }
        return;
      }
      seen[c.key] = c;
      unique.push(c);
    });
    unique.sort((a, b) => b.score - a.score);
    return { eval: ev, candidates: unique };
  }

  function analyze(item, targets, opts) {
    opts = opts || {};
    const prices = E.mergePrices(opts.prices);
    const samples = Math.max(60, Math.min(400, opts.samples || 180));
    const seed = opts.seed || 20260413;
    const built = buildCandidates(item, targets, prices, samples, seed);
    const ev = built.eval;
    // 每种操作类型最多保留一条，避免“三个精华”占满建议列表
    const seenKind = {};
    const diverse = [];
    built.candidates.forEach((c) => {
      const limit = c.kind === 'essence' ? 2 : 1;
      if ((seenKind[c.kind] || 0) >= limit) return;
      seenKind[c.kind] = (seenKind[c.kind] || 0) + 1;
      diverse.push(c);
    });
    const recs = diverse.slice(0, 5);
    const top = recs[0] || null;
    const plan = {
      title: ev.complete ? '可以收尾了' : '推荐路线',
      diagnosis: diagnose(ev, targets),
      steps: top ? top.steps.slice() : [],
      next: top ? top.title : '先设置目标词缀',
      finish: finishAdvice(item, targets, ev),
    };
    return {
      eval: ev,
      recommendations: recs,
      plan,
      diagnosis: plan.diagnosis,
      complete: ev.complete,
      samples,
    };
  }

  function finishAdvice(item, targets, ev) {
    if (ev.complete) {
      if (ev.openPrefix || ev.openSuffix) return '目标已达成，但还有空位：可以用工艺台补一条生命 / 抗性，或崇高赌额外词缀。';
      return '六条词缀已满且目标全部命中，可以停手或继续追求更高品级。';
    }
    const benchPick = chooseBench(item, targets, ev);
    if (benchPick) return '收尾时优先考虑工艺台「' + benchPick.name + '」，固定补一条目标，避免随机歪词缀。';
    if (ev.openPrefix || ev.openSuffix) return '最后 1–2 个空位建议用工艺台补齐，再考虑崇高赌上限。';
    return '词缀已满但没有全中：需要剥离 / 锁侧重铸，或直接用混沌重来。';
  }

  /* ------------------------------------------------------------------ *
   * 路线模拟：用固定策略跑完整流程，估算成功率与平均花费
   * ------------------------------------------------------------------ */
  function fossilComboForTargets(targets) {
    const tags = targetTags(targets);
    const elems = ['fire', 'cold', 'lightning'].filter((t) => tags.indexOf(t) !== -1).length;
    if (tags.indexOf('minion') !== -1 || tags.indexOf('gem') !== -1) return ['bound', 'faceted'];
    if (tags.indexOf('life') !== -1 && elems >= 1) return ['pristine', 'prismatic'];
    if (tags.indexOf('aura') !== -1) return ['bound'];
    if (tags.indexOf('caster') !== -1) return ['aetheric'];
    if (elems >= 2) return ['prismatic'];
    if (tags.indexOf('life') !== -1) return ['pristine'];
    if (tags.indexOf('physical') !== -1) return ['jagged'];
    if (tags.indexOf('chaos') !== -1) return ['aberrant'];
    if (tags.indexOf('critical') !== -1) return ['deft'];
    if (tags.indexOf('speed') !== -1) return ['shuddering'];
    return null;
  }
  function canFitOnMagic(targets) {
    let p = 0, s = 0;
    targets.forEach((t) => {
      const def = E.getTargetDef(t.modId);
      if (!def) return;
      if (def.affix === 'prefix') p++; else s++;
    });
    return p <= 1 && s <= 1;
  }
  function anchorEssenceForMatched(item, targets, ev) {
    const groups = matchedGroupSet(ev);
    let best = null, bestFit = -1;
    D.essences.forEach((e) => {
      const desc = essenceDesc(e, item);
      if (!desc || !groups[desc.group]) return;
      const fit = essenceFit(e, item, targets);
      if (fit > bestFit) { best = e; bestFit = fit; }
    });
    return best;
  }
  function bestEssenceForTargetGroup(item, targets) {
    let best = null, bestFit = 0;
    const groups = targetGroups(targets);
    D.essences.forEach((e) => {
      const desc = essenceDesc(e, item);
      if (!desc || !groups[desc.group]) return;
      const fit = essenceFit(e, item, targets);
      if (fit > bestFit) { best = e; bestFit = fit; }
    });
    return best ? { essence: best, fit: bestFit } : null;
  }
  function benchSolves(ev, benchPick) {
    if (!benchPick) return false;
    return ev.missing.some((t) => {
      const def = E.getTargetDef(t.modId);
      return def && (benchPick.group || benchPick.id) === E.targetGroup(def) && benchCanMeet(benchPick, t);
    });
  }

  function policyAction(item, targets, ev) {
    if (ev.complete) return null;
    const benchPick = chooseBench(item, targets, ev);
    if (benchSolves(ev, benchPick)) return { type: 'bench', benchId: benchPick.id };

    const essenceChoice = bestEssenceForTargetGroup(item, targets);
    const anchorEssence = ev.matchedCount >= 1 ? anchorEssenceForMatched(item, targets, ev) : null;

    if (item.rarity === 'normal') {
      if (targets.length <= 2 && canFitOnMagic(targets) && !(essenceChoice && essenceChoice.fit >= 10)) {
        return { type: 'transmute' };
      }
      if (essenceChoice && essenceChoice.fit >= 8) return { type: 'essence', essenceId: essenceChoice.essence.id };
      const combo = fossilComboForTargets(targets);
      if (combo && targets.length >= 2) return { type: 'fossil', fossilIds: combo };
      if (targets.length >= 3) return { type: 'alchemy' };
      return { type: 'transmute' };
    }

    if (item.rarity === 'magic') {
      if (ev.matchedCount >= 1) return { type: 'regal' };
      return { type: 'alteration' };
    }

    if (item.rarity === 'rare') {
      // 已经命中 1 条时，用同一条保底精华反复重铸：这条会一直被保留，其余靠随机补
      if (ev.matchedCount === 1 && targets.length >= 2 && anchorEssence) {
        return { type: 'essence', essenceId: anchorEssence.id };
      }
      // 1–2 条目标：先保底一条，再用崇高 / 剥离 / 工艺补齐，避免把已命中词缀洗掉
      if (targets.length <= 2) {
        if (ev.matchedCount === 0 && essenceChoice && essenceChoice.fit >= 10) {
          return { type: 'essence', essenceId: essenceChoice.essence.id };
        }
        if (ev.openPrefix || ev.openSuffix) return { type: 'exalted' };
        if (ev.junk.length) return { type: 'annulment' };
        return { type: 'chaos' };
      }

      const prefixDone = isSideMatched(item, targets, 'prefix');
      const suffixDone = isSideMatched(item, targets, 'suffix');
      const prefixTargets = countSideTargets(targets, 'prefix');
      const suffixTargets = countSideTargets(targets, 'suffix');
      const prefixMissing = prefixTargets > 0 && !prefixDone;
      const suffixMissing = suffixTargets > 0 && !suffixDone;
      let matchedPrefix = 0, matchedSuffix = 0;
      ev.matched.forEach((m) => { if (m.affix.affix === 'prefix') matchedPrefix++; else matchedSuffix++; });

      if (ev.matchedCount === 0) {
        if (essenceChoice && essenceChoice.fit >= 8) return { type: 'essence', essenceId: essenceChoice.essence.id };
        const combo = fossilComboForTargets(targets);
        if (combo) return { type: 'fossil', fossilIds: combo };
        return { type: 'chaos' };
      }

      if (ev.openPrefix || ev.openSuffix) return { type: 'exalted' };

      // 只有“已命中的目标全在锁住的一侧”时，锁侧重铸才不会丢掉其他进度
      if (prefixDone && suffixMissing && matchedSuffix === 0 && suffixTargets >= 2 && ev.suffixCount > 0) {
        return { type: 'lock_chaos', side: 'prefix' };
      }
      if (suffixDone && prefixMissing && matchedPrefix === 0 && prefixTargets >= 2 && ev.prefixCount > 0) {
        return { type: 'lock_chaos', side: 'suffix' };
      }
      if (ev.junk.length) return { type: 'annulment' };
      return { type: 'chaos' };
    }
    return null;
  }

  function simulateRoute(item, targets, opts) {
    opts = opts || {};
    const runs = Math.max(40, Math.min(400, opts.runs || 120));
    const maxSteps = Math.max(8, Math.min(80, opts.maxSteps || 40));
    const budget = opts.budget || 2500;
    const prices = E.mergePrices(opts.prices);
    let wins = 0, totalCost = 0, totalSteps = 0, winsCost = 0;
    const failures = {};
    for (let run = 0; run < runs; run++) {
      const rng = E.makeRng((opts.seed || 424242) + run * 7717);
      let cur = E.clone(item);
      let cost = 0, steps = 0, ok = false;
      for (let s = 0; s < maxSteps; s++) {
        const ev = E.evaluate(cur, targets);
        if (ev.complete) { ok = true; break; }
        const action = policyAction(cur, targets, ev);
        if (!action) break;
        const res = E.applyAction(cur, action, { rng, prices });
        if (res.error) { failures[res.error] = (failures[res.error] || 0) + 1; break; }
        cur = res.item;
        cost += res.cost;
        steps++;
        if (cost > budget) break;
      }
      const finalEv = E.evaluate(cur, targets);
      if (finalEv.complete) ok = true;
      if (ok) { wins++; winsCost += cost; }
      totalCost += cost;
      totalSteps += steps;
    }
    return {
      runs,
      wins,
      successRate: wins / runs,
      avgCost: totalCost / runs,
      avgWinCost: wins ? winsCost / wins : Infinity,
      avgSteps: totalSteps / runs,
      budget,
      failures,
    };
  }

  const api = {
    analyze, simulateRoute, policyAction, essenceFit, fossilFit,
    actionTitle, actionDetail, pct, fmtCost, targetTags, targetGroups,
  };

  global.PoEAdvisor = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
