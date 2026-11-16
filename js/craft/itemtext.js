/* 流放 2 做装台 · 解析游戏内复制的物品文本（Ctrl+C / Ctrl+Alt+C）
 *
 * 支持英文、繁体中文（国际服）、简体中文三种客户端文本。
 * 做法：先认出底子和物品等级，再把每一行词缀和「这个底子能出的词缀模板」逐条比对，
 * 数值落在哪一档的区间里就是哪一档。认不出的行保留原文，标成「未识别」，不会丢。
 */
(function (global) {
  'use strict';

  const R = global.CraftRules || (typeof require !== 'undefined' ? require('./rules.js') : null);
  const t2s = () => global.CraftT2S || ((s) => s);

  const RARITY = [
    [/^(?:Rarity|稀有度)\s*[:：]\s*(Normal|普通)/i, 'normal'],
    [/^(?:Rarity|稀有度)\s*[:：]\s*(Magic|魔法)/i, 'magic'],
    [/^(?:Rarity|稀有度)\s*[:：]\s*(Rare|稀有)/i, 'rare'],
    [/^(?:Rarity|稀有度)\s*[:：]\s*(Unique|傳奇|传奇)/i, 'unique'],
  ];
  const ILVL = /^(?:Item Level|物品等級|物品等级)\s*[:：]\s*(\d+)/i;
  const QUALITY = /^(?:Quality|品質|品质)[^:：]*[:：]\s*\+?(\d+)%/i;
  const SOCKETS = /^(?:Sockets|插槽)\s*[:：]\s*(.+)$/i;
  const CORRUPTED = /^(?:Corrupted|已汙染|已污染|已腐化)$/i;
  const SEP = /^-{4,}$/;
  /* 行尾的来源标记 */
  const MARKS = [
    [/\s*[（(](?:implicit|固定|基底)[)）]\s*$/i, 'implicit'],
    [/\s*[（(](?:rune|符文)[)）]\s*$/i, 'rune'],
    [/\s*[（(](?:enchant|附魔)[)）]\s*$/i, 'enchant'],
    [/\s*[（(](?:fractured|破裂|碎裂)[)）]\s*$/i, 'fractured'],
    [/\s*[（(](?:desecrated|褻瀆|亵渎)[)）]\s*$/i, 'desecrated'],
    [/\s*[（(](?:crafted|工藝|工艺)[)）]\s*$/i, 'crafted'],
  ];
  const UNREVEALED = /Unrevealed Desecrated|未揭露/i;
  /* 明显不是词缀的属性行 */
  const PROPERTY = /^(?:Item Class|物品種類|物品类别|物品類別|Requirements?|Requires|需求|Armour|Evasion Rating|Energy Shield|Block chance|Physical Damage|Elemental Damage|Critical Hit Chance|Attacks per Second|Reload Time|Spirit|護甲|护甲|閃避值|闪避值|能量護盾|能量护盾|格擋率|格挡率|物理傷害|物理伤害|元素傷害|元素伤害|暴擊率|暴击率|每秒攻擊次數|每秒攻击次数|Level|等級|等级|Str|Dex|Int|力量|敏捷|智慧|Stack Size|Note|備註|备注)\s*[:：]/i;

  const NUM = '[+-]?\\d+(?:\\.\\d+)?';
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  /* 模板 → 正则：占位符变成数字捕获组；Ctrl+Alt+C 会在数值后面带 (min-max)，一并吃掉 */
  const reCache = new Map();
  function templateRegex(tpl) {
    let re = reCache.get(tpl);
    if (re) return re;
    const order = [];
    const src = esc(tpl).replace(/\\\{(\d+)\\\}/g, (m, i) => { order.push(Number(i)); return '(' + NUM + ')(?:\\(' + NUM + '[-–]' + NUM + '\\))?'; })
      .replace(/^\\\+/, '\\+?').replace(/\s+/g, '\\s*');
    re = { re: new RegExp('^' + src + '$', 'i'), order };
    reCache.set(tpl, re);
    return re;
  }
  const clean = (s) => String(s).replace(/\s+/g, ' ').trim();

  /* 候选行：这个底子的前后缀（含只靠精华 / 合金出现的零权重行）+ 亵渎专属 */
  function candidateRows(base) {
    const pool = base.slot === 'jewel' ? 'j' : 'i';
    const live = new Set(R.eligibleRows(base, pool).concat(R.eligibleRows(base, 'x')));
    const rest = R.data.rows.filter((r) => r.pool === pool && !live.has(r));
    return { live: [...live], rest };
  }
  function matchLine(text, rows) {
    const conv = t2s();
    let best = null;
    for (const row of rows) {
      const zht = R.rowTemplate(row, 'zht');
      for (const tpl of [R.rowTemplate(row, 'en'), zht, conv(zht)]) {
        const { re, order } = templateRegex(clean(tpl.replace(/\n/g, ' ')));
        const m = re.exec(text);
        if (!m) continue;
        const values = row.v.map(() => null);
        order.forEach((idx, k) => { values[idx] = Number(m[k + 1]); });
        const inRange = row.v.every((x, i) => values[i] == null || (values[i] >= Math.min(x[0], x[1]) - 1e-9 && values[i] <= Math.max(x[0], x[1]) + 1e-9));
        if (inRange) return { row, values: values.map((v, i) => (v == null ? row.v[i][0] : v)), exact: true };
        if (!best) best = { row, values: values.map((v, i) => (v == null ? row.v[i][0] : v)), exact: false };
        break;
      }
    }
    return best;
  }

  function findBase(nameLines) {
    const conv = t2s();
    const hay = nameLines.join(' | ');
    let hit = null;
    for (const b of R.data.bases) {
      for (const n of [b.name, b.zh, b.zh ? conv(b.zh) : null]) {
        if (n && hay.indexOf(n) !== -1 && (!hit || n.length > hit.len)) hit = { base: b, len: n.length };
      }
    }
    return hit ? hit.base : null;
  }

  function parse(text) {
    const lines = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.trim());
    const blocks = [[]];
    for (const l of lines) { if (SEP.test(l)) blocks.push([]); else if (l) blocks[blocks.length - 1].push(l); }
    const all = blocks.flat();
    if (!all.length) return { error: '没有内容。在游戏里把鼠标放在装备上按 Ctrl+C，再粘贴到这里。' };

    let rarity = null;
    for (const l of all) for (const [re, r] of RARITY) if (re.test(l)) rarity = r;
    if (rarity === 'unique') return { error: '这是一件传奇物品，传奇不能用通货改词缀。' };
    const head = blocks[0].filter((l) => !/^(?:Item Class|物品種類|物品类别|物品類別|Rarity|稀有度)\s*[:：]/i.test(l));
    const base = findBase(head.length ? head : all.slice(0, 4));
    if (!base) return { error: '没认出这是什么底子。可以改用下面的「从白底开始」手动选。' };

    const item = R.newItem(base.id, {});
    const warnings = [];
    let ilvlSeen = false;
    for (const l of all) {
      let m;
      if ((m = ILVL.exec(l))) { item.ilvl = Number(m[1]); ilvlSeen = true; }
      else if ((m = QUALITY.exec(l))) item.quality = Math.min(20, Number(m[1]));
      else if ((m = SOCKETS.exec(l))) item.sockets = Math.min(4, (m[1].match(/[A-Za-z]/g) || []).length);
      else if (CORRUPTED.test(l)) item.corrupted = true;
    }
    if (!ilvlSeen) warnings.push('文本里没有物品等级，先按 ' + item.ilvl + ' 处理，请核对。');

    /* 词缀在「物品等级」那一块之后 */
    const startAt = blocks.findIndex((b) => b.some((l) => ILVL.test(l)));
    const modLines = [];
    blocks.slice(startAt < 0 ? 1 : startAt + 1).forEach((b) => {
      for (const raw of b) {
        if (CORRUPTED.test(raw) || PROPERTY.test(raw) || /^\{.*\}$/.test(raw)) continue;
        let textLine = raw;
        const marks = {};
        for (const [re, key] of MARKS) if (re.test(textLine)) { marks[key] = true; textLine = textLine.replace(re, ''); }
        modLines.push({ text: clean(textLine), marks });
      }
    });

    const cand = candidateRows(base);
    const explicit = modLines.filter((l) => !l.marks.implicit && !l.marks.rune && !l.marks.enchant);
    const used = new Set();
    const fams = new Set();
    const affixes = [];
    const tryMatch = (textLine) => matchLine(textLine, cand.live) || matchLine(textLine, cand.rest);
    for (let i = 0; i < explicit.length; i++) {
      if (used.has(i)) continue;
      const l = explicit[i];
      if (UNREVEALED.test(l.text)) {
        affixes.push({ row: null, type: null, fam: [], gen: null, lvl: 0, tags: [], values: [], desecrated: true, unrevealed: true, minLvl: 0 });
        continue;
      }
      /* 混合词缀在游戏里占多行：先试三行、两行，再试单行 */
      let hit = null;
      let span = 1;
      for (const n of [3, 2, 1]) {
        if (i + n > explicit.length) continue;
        const joined = explicit.slice(i, i + n).map((x) => x.text).join(' ');
        const m = tryMatch(joined);
        if (m && (m.exact || n === 1) && !m.row.fam.some((f) => fams.has(f))) { hit = m; span = n; break; }
      }
      for (let k = 0; k < span; k++) used.add(i + k);
      if (!hit) { affixes.push({ row: null, type: 'unknown', fam: [], gen: null, lvl: 1, tags: [], values: [], text: l.text, unknown: true }); continue; }
      hit.row.fam.forEach((f) => fams.add(f));
      const marks = explicit.slice(i, i + span).reduce((o, x) => Object.assign(o, x.marks), {});
      affixes.push(Object.assign(R.makeAffix(hit.row, () => 0), { values: hit.values },
        marks.fractured ? { fractured: true } : null, marks.desecrated || hit.row.pool === 'x' ? { desecrated: true } : null));
    }

    /* 没认出前后缀的词缀（未识别 / 未揭露）：放到还有空位的一侧 */
    const count = { p: affixes.filter((a) => a.gen === 'p').length, s: affixes.filter((a) => a.gen === 's').length };
    for (const a of affixes) if (!a.gen) { a.gen = count.p <= count.s ? 'p' : 's'; count[a.gen]++; }
    const unknown = affixes.filter((a) => a.unknown).length;
    if (unknown) warnings.push('有 ' + unknown + ' 条词缀没认出来，已按原文保留；它们算作「没用的词缀」，前后缀是猜的。');

    item.affixes = affixes;
    item.rarity = rarity || (affixes.length > 2 ? 'rare' : affixes.length ? 'magic' : 'normal');
    if (item.rarity === 'normal' && affixes.length) item.rarity = affixes.length > 2 ? 'rare' : 'magic';
    const cap = R.caps(item);
    if (count.p > cap.p || count.s > cap.s) warnings.push('识别出的前后缀数量超过了上限，请对照游戏检查。');
    return { item, base, warnings };
  }

  const api = { parse, matchLine };
  global.CraftItemText = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
