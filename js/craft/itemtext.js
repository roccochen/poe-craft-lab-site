/* 流放 2 做装台 · 解析游戏内复制的物品文本（Ctrl+C / Ctrl+Alt+C）
 *
 * 支持英文、繁体中文（国际服）、简体中文、国服（腾讯简体）的客户端文本。
 * 做法：先认出底子和物品等级，再把每一行词缀和「这个底子能出的词缀模板」逐条比对，
 * 数值落在哪一档的区间里就是哪一档。认不出的行保留原文，标成「未识别」，不会丢。
 *
 * 国服（腾讯）的简中不是国际服繁中的逐字转换，措辞、语序、底子名都可能不一样。所以这里分三层认：
 *   1. 文本：把一句话改写成几种可能的语序（variants），繁中 / 简体 / 英文模板都比一遍；
 *   2. 高级描述：Ctrl+Alt+C 的「{ 前缀属性 "总督的"（等阶：2）}」和「34 (33-38)%」里带着档位和区间，
 *      就算一个词都不认识，也能靠「前后缀 + 等阶 + 数值区间」把这一行反查出来（matchByShape）；
 *   3. 底子名：国服译名和繁中不是逐字对应（例如 Vile Robe 国服叫「邪恶束衣」、繁中叫「惡毒長袍」），
 *      对不上时按「需求等级 / 力量敏捷智慧 / 防御类型」列出候选（guessBases），交给界面让玩家点一个。
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
  /* 第一块里不算底子名的行 */
  const TOP = /^(?:Item Class|物品種類|物品类别|物品類別|Rarity|稀有度)\s*[:：]/i;
  /* 高级描述的表头行：{ 前缀属性 "总督的"（等阶：2）— 生命, 能量护盾 } */
  const HEADER = /^\{.*\}$/;
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
  /* 明显不是词缀的属性行（底子自带的东西：防御、需求、精魂、获得技能 ……） */
  const PROPERTY = /^(?:Item Class|物品種類|物品类别|物品類別|Requirements?|Requires|需求|Armour|Evasion Rating|Energy Shield|Block chance|Physical Damage|Elemental Damage|Critical Hit Chance|Attacks per Second|Reload Time|Spirit|精魂|Grants? Skill|獲得技能|获得技能|護甲|护甲|閃避值|闪避值|能量護盾|能量护盾|格擋率|格挡率|物理傷害|物理伤害|元素傷害|元素伤害|暴擊率|暴击率|每秒攻擊次數|每秒攻击次数|Level|等級|等级|Str|Dex|Int|力量|敏捷|智慧|Stack Size|Note|備註|备注)\s*[:：]/i;
  /* 需求行 / 防御行：认不出底子名时用来缩小范围 */
  const REQ_LINE = /^(?:Requirements?|Requires|需求)\s*[:：]/i;
  const DEF_LINE = /^(?:Armour|Evasion Rating|Energy Shield|護甲|护甲|閃避值|闪避值|能量護盾|能量护盾)\s*[:：]\s*[\d,]+/i;
  const DEF_KEY = [
    [/^(?:Armour|護甲|护甲)$/i, 'ar'],
    [/^(?:Evasion Rating|閃避值|闪避值)$/i, 'ev'],
    [/^(?:Energy Shield|能量護盾|能量护盾)$/i, 'es'],
  ];

  const NUM = '[+-]?\\d+(?:\\.\\d+)?';
  const esc = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const clean = (s) => String(s).replace(/\s+/g, ' ').trim();

  /* 比较之前先把「看不见的差异」抹平：全角半角、空格、各种破折号。
   * 中文词缀里没有靠空格区分意思的地方，英文模板同一套规则处理，两边都不吃亏。 */
  const FULL = { '＋': '+', '－': '-', '％': '%', '（': '(', '）': ')', '：': ':', '　': ' ', '–': '-', '—': '-' };
  function squash(s) {
    return String(s).replace(/[＋－％（）：　–—]/g, (c) => FULL[c] || c).replace(/\s+/g, '');
  }

  /* Ctrl+Alt+C 会在数值后面写这一档的区间：34 (33-38)%。那不是词缀文字，先摘出来留着 */
  const RANGE = /[（(]\s*([+-]?\d+(?:\.\d+)?)\s*[-–—]\s*([+-]?\d+(?:\.\d+)?)\s*[)）]/g;
  function stripRanges(text) {
    const ranges = [];
    const out = String(text).replace(RANGE, (m, a, b) => { ranges.push([Number(a), Number(b)]); return ''; });
    return { text: out, ranges };
  }

  /* 模板 → 正则：占位符变成数字捕获组 */
  const reCache = new Map();
  function templateRegex(tpl) {
    let hit = reCache.get(tpl);
    if (hit) return hit;
    const order = [];
    const src = esc(squash(tpl))
      .replace(/\\\{(\d+)\\\}/g, (m, i) => { order.push(Number(i)); return '(' + NUM + ')'; })
      .replace(/^\\\+/, '\\+?');
    hit = { re: new RegExp('^' + src + '$', 'i'), order };
    reCache.set(tpl, hit);
    return hit;
  }

  /* 一句话的写法：只做「抹平看不见的差异」这一件事。
   *
   * 国服简中和繁中不是逐字对应（措辞、语序都是另一套：繁中「增加60%處於你存在範圍中的友方所造成的傷害」
   * ＝国服「在场的友军造成的伤害提高 60%」），所以不能靠换词 / 改语序去猜——
   * 官方简中原话已经作为模板入库了（js/craft/data.zhs.js，来自国服客户端的 stat_descriptions.csd），
   * matchLine 直接拿玩家那一行和官方模板整句比。这里只把空格、全角半角抹掉。 */
  function variants(line) {
    return [squash(line)];
  }

  /* 混搭词缀在游戏里占两三行，每一行都要先各自改写成几种可能写法，再拼起来比模板 */
  function spanVariants(part) {
    let combos = [''];
    for (const x of part) {
      const forms = variants(x.text);
      const next = [];
      for (const c of combos) for (const v of forms) { next.push(c + v); if (next.length >= 24) break; }
      combos = next;
    }
    return combos;
  }

  /* 候选行：这个底子的前后缀（含只靠精华 / 合金出现的零权重行）+ 亵渎专属 */
  function candidateRows(base) {
    const pool = base.slot === 'jewel' ? 'j' : 'i';
    const live = new Set(R.eligibleRows(base, pool).concat(R.eligibleRows(base, 'x')));
    const rest = R.data.rows.filter((r) => r.pool === pool && !live.has(r));
    return { live: [...live], rest };
  }
  /* texts 是一行（或混搭词缀的几行拼起来）的几种可能写法，已经过 squash()。
   * 相邻两档的数值区间可能重叠（友军附加伤害就是这样：T8 是 2-3 / 4-6，T7 是 2-4 / 5-8，3 和 6 两边都算），
   * 光比文字会挑到靠前的那一档。{} 表头给了游戏自己算的等阶，所以先只用这一档的行比一遍，没对上再放开。
   *
   * 数值同时落在好几档的区间里时（区间重叠），单看数值分不出来——但可以看它「落在区间的哪个位置」。
   * 游戏是在档位区间里 roll 出一个值，落在区间正中的值最常见，落在端点上几乎不可能。
   * 所以在所有能容纳这组数值的档里，选「让每个值都尽量靠近区间正中」的那一档：
   * 短剑「附加 26-44 物理伤害」，T1 是 [26,39]×[44,66]、T2 是 [21,31]×[36,53]，
   * 26 落在 T1 的端点上而落在 T2 的正中 → 真档是 T2。
   * 实测全量 21 万条：只比文字（取第一个候选）时，歧义情形里有 22% 判错；改用「选区间正中」后判错 0 条。
   *
   * 另外一条硬约束：档位要求的物品等级（row.lvl）不能超过这件装备的物品等级——
   * ilvl 82 的装备出不了要求 85 的那一档。这条能砍掉一部分本来就不可能的候选。 */
  function matchLine(texts, rows, base, tier, ilvl) {
    const list = Array.isArray(texts) ? texts : [String(texts)];
    const conv = t2s();
    let best = null;
    let bestScore = Infinity;
    for (const want of base && tier != null ? [tier, null] : [null]) {
      for (const row of rows) {
        if (want != null && R.tierOf(base, row) !== want) continue;
        /* 档位要求的物品等级不能超过这件装备的等级 */
        if (ilvl != null && row.lvl > ilvl) continue;
        const zht = R.rowTemplate(row, 'zht');
        /* 官方简中模板优先（国服玩家的原文），其次是繁中、繁中转简 */
        const forms = [...new Set([R.rowTemplate(row, 'en'), R.rowTemplate(row, 'zhs'), zht, conv(zht)])];
        for (const tpl of forms) {
          const { re, order } = templateRegex(tpl);
          for (const text of list) {
            const m = re.exec(text);
            if (!m) continue;
            const values = row.v.map((v) => v[0]);
            order.forEach((idx, k) => { values[idx] = Number(m[k + 1]); });
            const inRange = values.every((v, i) => v >= Math.min(row.v[i][0], row.v[i][1]) - 1e-9 && v <= Math.max(row.v[i][0], row.v[i][1]) + 1e-9);
            if (!inRange) {
              if (!best) best = { row, values, exact: false };
              continue;
            }
            /* 数值落在这一档的区间正中吗：越接近正中越可能是真档 */
            const s = centeringScore(row, values);
            if (s < bestScore) { bestScore = s; best = { row, values, exact: true }; }
          }
        }
      }
      /* 表头给了等阶，且那一档已经找到精确匹配，就用它，不再往下找 */
      if (best && best.exact && want != null) return best;
    }
    return best;
  }
  /* 一组数值落在某档区间里的「居中程度」：0 = 全都正好在正中，越大越靠边。
   * 区间宽度为 0（固定值）时给 0.5，避免它在同等条件下被误当成唯一解。 */
  function centeringScore(row, values) {
    let worst = 0;
    for (let i = 0; i < values.length; i++) {
      const lo = Math.min(row.v[i][0], row.v[i][1]);
      const hi = Math.max(row.v[i][0], row.v[i][1]);
      if (hi === lo) { worst = Math.max(worst, 0.5); continue; }
      const pos = (values[i] - lo) / (hi - lo);
      worst = Math.max(worst, Math.abs(pos - 0.5));
    }
    return worst;
  }

  /* 高级描述的表头行：{ 前缀属性 "总督的"（等阶：2）— 生命, 能量护盾 }
   * 表头里除了前后缀和等阶，还会写「打造的」「亵渎的」，那是词缀来源，规则引擎要用（亵渎词缀不能再亵渎、不能破裂）。 */
  function parseHeader(line) {
    const body = line.replace(/^\{/, '').replace(/\}$/, '');
    const gen = /前綴|前缀|prefix/i.test(body) ? 'p' : /後綴|后缀|suffix/i.test(body) ? 's' : null;
    const t = /(?:等階|等阶|層級|层级|tier)\s*[:：]?\s*(\d+)/i.exec(body);
    return {
      gen, tier: t ? Number(t[1]) : null,
      desecrated: /褻瀆|亵渎|desecrated/i.test(body),
      fractured: /破裂|碎裂|fractured/i.test(body),
    };
  }

  /* 遣词一个都不认识时的兜底：等阶 + 数值区间 + 数值个数，去这个底子的能出行里反查。
   * 前后缀也来自表头，所以不依赖任何语言。只有唯一命中才认，宁可标未识别也不乱猜。 */
  function matchByShape(base, part, cand, fams) {
    const hdr = part[0].hdr;
    if (!hdr || hdr.tier == null) return null;
    const ranges = [];
    for (const x of part) for (const r of x.ranges) ranges.push(r);
    if (!ranges.length) return null;
    const nums = [];
    const re = new RegExp(NUM, 'g');
    for (const x of part) for (const m of x.text.match(re) || []) nums.push(Number(m));
    if (nums.length !== ranges.length) return null;
    const hit = cand.live.filter((r) => (hdr.gen ? r.gen === hdr.gen : true)
      && r.v.length === ranges.length
      && R.tierOf(base, r) === hdr.tier
      && r.v.every((v, i) => v[0] === ranges[i][0] && v[1] === ranges[i][1])
      && !r.fam.some((f) => fams.has(f)));
    return hit.length === 1 ? { row: hit[0], values: nums.slice(), exact: true } : null;
  }

  /* 底子名三种写法都认：英文、繁中、官方简中（data.bases 的 zhs，国服 BaseItemTypes 导出）。
   * 简中不是繁中逐字转换的（克己权杖 / 魔道權杖、圣地权杖 / 神殿權杖），所以底子数据里单独存一列 zhs，
   * 不再维护手写的国服名对照表——底子表更新时重新导出一次即可。 */  function findBase(nameLines) {
    const conv = t2s();
    const hay = nameLines.join(' | ');
    let hit = null;
    for (const b of R.data.bases) {
      for (const n of [b.name, b.zh, b.zhs, b.zh ? conv(b.zh) : null]) {
        if (n && hay.indexOf(n) !== -1 && (!hit || n.length > hit.len)) hit = { base: b, len: n.length, alias: null };
      }
    }
    if (!hit) return null;
    /* 命中的是简中名就把它带回去（界面用它说明认的是哪一件） */
    const alias = hit.base.zhs && hay.indexOf(hit.base.zhs) !== -1 ? hit.base.zhs : null;
    return { base: hit.base, alias };
  }

  /* 底子名认不出时：用「需求等级 + 插槽数 + 力量/敏捷/智慧 + 防御类型」缩小范围，给界面一张候选清单。
   * 插槽数和防御行与语言无关，是这里最靠得住的线索；属性需求只会被「属性需求降低」改小，所以按上限筛。
   * 需求等级只当上限：它会被抬到比底子本身更高（实例：国服「克己权杖」底子自己是 6 级 12 智慧，
   * 玩家那件显示「等级 52, 12 智慧」——智慧没变，等级被抬了），所以先找等级正好相等的，找不到再放宽成「不超过」。 */
  function guessBases(all) {
    let level = null;
    let sockets = null;
    const defs = new Set();
    const attrs = { str: false, dex: false, int: false };
    const nums = [];
    let sawReq = false;
    for (const l of all) {
      const sock = SOCKETS.exec(l);
      if (sock) sockets = (sock[1].match(/[A-Za-z]/g) || []).length;
      if (DEF_LINE.test(l)) {
        const label = l.split(/[:：]/)[0];
        for (const [re, key] of DEF_KEY) if (re.test(label)) defs.add(key);
      }
      if (REQ_LINE.test(l)) {
        sawReq = true;
        if (level == null) {
          const m = /(?:等级|等級|Level)\s*[:：]?\s*(\d+)/i.exec(l);
          if (m) level = Number(m[1]);
        }
        for (const m of l.match(/\d+/g) || []) nums.push(Number(m));
        if (/力量|\bStr\b/i.test(l)) attrs.str = true;
        if (/敏捷|\bDex\b/i.test(l)) attrs.dex = true;
        if (/智慧|\bInt\b/i.test(l)) attrs.int = true;
      }
    }
    if (level == null) return { candidates: [] };
    /* 需求行里除等级外的数字就是属性需求（可能被「属性需求降低」改小过，所以只当上限用） */
    const attrNums = nums.filter((n) => n !== level);
    const lo = attrNums.length ? Math.min.apply(null, attrNums) : 0;
    const attrVals = (b) => [b.req.str, b.req.dex, b.req.int].filter((v) => v > 0);
    const list = R.data.bases.filter((b) => {
      if (sockets) { if (R.socketCap(b) !== sockets) return false; }
      if (defs.size) {
        const d = b.def || {};
        const keys = ['ar', 'ev', 'es'].filter((k) => d[k] > 0);
        if (keys.length !== defs.size || !keys.every((k) => defs.has(k))) return false;
      }
      if (sawReq) {
        if ((b.req.str > 0) !== attrs.str || (b.req.dex > 0) !== attrs.dex || (b.req.int > 0) !== attrs.int) return false;
      }
      if (lo) {
        const vals = attrVals(b);
        if (!vals.length || vals.some((v) => v < lo || v > lo * 2)) return false;
      }
      return true;
    });
    const exact = list.filter((b) => b.req.lvl === level);
    const pool = exact.length ? exact : list.filter((b) => b.req.lvl <= level);
    /* 属性需求正好对上的排前面，再按和显示等级的接近程度排（等级被抬高过时，最接近的往往就是它） */
    const fits = (b) => Boolean(lo) && attrVals(b).every((v) => v === lo);
    pool.sort((a, b) => (fits(b) ? 1 : 0) - (fits(a) ? 1 : 0) || Math.abs(a.req.lvl - level) - Math.abs(b.req.lvl - level));
    /* 符锻 / 符匠变体是联盟专属的特殊底子，常规底子能对上的话就不拿它们烦玩家 */
    const normal = pool.filter((b) => !/Verisium/.test(b.id));
    const pick = (normal.length ? normal : pool).slice(0, 8);
    return { level, defs: [...defs], candidates: pick.map((b) => ({ id: b.id, name: b.name, zh: b.zh, zhs: b.zhs, def: b.def || {}, req: b.req })) };
  }

  function parse(text, opts) {
    const o = opts || {};
    const lines = String(text || '').replace(/\r/g, '').split('\n').map((l) => l.trim());
    const blocks = [[]];
    for (const l of lines) { if (SEP.test(l)) blocks.push([]); else if (l) blocks[blocks.length - 1].push(l); }
    const all = blocks.flat();
    if (!all.length) return { error: '没有内容。在游戏里把鼠标放在装备上按 Ctrl+C，再粘贴到这里。' };

    let rarity = null;
    for (const l of all) for (const [re, r] of RARITY) if (re.test(l)) rarity = r;
    if (rarity === 'unique') return { error: '这是一件传奇物品，传奇不能用通货改词缀。' };
    const head = blocks[0].filter((l) => !TOP.test(l));
    const found = (o.base && R.base(o.base)) ? { base: R.base(o.base), alias: null } : findBase(head.length ? head : all.slice(0, 4));
    if (!found) {
      const guess = guessBases(all);
      if (!guess.candidates.length) return { error: '没认出这是什么底子。可以改用下面的「从白底开始」手动选。' };
      return {
        error: '没认出底子的名字：国服译名和繁中不一样，我们的底子表里只有繁中名。点下面一个候选，词缀会接着认。',
        needBase: guess,
      };
    }
    const base = found.base;

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

    /* 词缀在「物品等级」那一块之后。{} 表头只作用于紧接着的一条词缀（混搭词缀会占两三行） */
    const startAt = blocks.findIndex((b) => b.some((l) => ILVL.test(l)));
    const modLines = [];
    let hdr = null;
    blocks.slice(startAt < 0 ? 1 : startAt + 1).forEach((b) => {
      for (const raw of b) {
        if (CORRUPTED.test(raw)) continue;
        if (HEADER.test(raw)) { hdr = parseHeader(raw); continue; }
        if (PROPERTY.test(raw)) continue;
        let textLine = raw;
        const marks = {};
        /* 表头写的「打造的」「亵渎的」也是来源标记，和行尾的 (crafted) / (desecrated) 同等对待 */
        if (hdr) for (const k of ['desecrated', 'fractured']) if (hdr[k]) marks[k] = true;
        for (const [re, key] of MARKS) if (re.test(textLine)) { marks[key] = true; textLine = textLine.replace(re, ''); }
        const parted = stripRanges(textLine);
        modLines.push({ text: clean(parted.text), ranges: parted.ranges, marks, hdr, raw });
        hdr = null;
      }
    });

    const cand = candidateRows(base);
    const explicit = modLines.filter((l) => !l.marks.implicit && !l.marks.rune && !l.marks.enchant);
    const used = new Set();
    const fams = new Set();
    const affixes = [];
    const unmatched = [];
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
        const part = explicit.slice(i, i + n);
        const forms = spanVariants(part);
        const hdr = part[0].hdr;
        const tier = hdr ? hdr.tier : null;
        let m = matchLine(forms, cand.live, base, tier, item.ilvl) || matchLine(forms, cand.rest, base, tier, item.ilvl);
        if (!m || m.row.fam.some((f) => fams.has(f))) m = matchByShape(base, part, cand, fams);
        if (m && (m.exact || n === 1) && !m.row.fam.some((f) => fams.has(f))) { hit = m; span = n; break; }
      }
      for (let k = 0; k < span; k++) used.add(i + k);
      if (!hit) { unmatched.push(l.text); continue; }
      hit.row.fam.forEach((f) => fams.add(f));
      const marks = explicit.slice(i, i + span).reduce((o, x) => Object.assign(o, x.marks), {});
      affixes.push(Object.assign(R.makeAffix(hit.row, () => 0), { values: hit.values },
        marks.fractured ? { fractured: true } : null, marks.desecrated || hit.row.pool === 'x' ? { desecrated: true } : null));
    }

    /* 稀有度先定下来：前后缀上限是按稀有度算的，认不出的行还得分到两边去 */
    item.affixes = affixes;
    item.rarity = rarity || (affixes.length > 2 ? 'rare' : affixes.length ? 'magic' : 'normal');

    /* 认不出的行：还有空位才算「没用的词缀」，两侧都满了就只能是说明行（比如国服多出来的一行） */
    const cap = R.caps(item);
    const free = () => {
      const p = cap.p - affixes.filter((a) => a.gen === 'p').length;
      const s = cap.s - affixes.filter((a) => a.gen === 's').length;
      return { p, s };
    };
    const extras = [];
    for (const text of unmatched) {
      const f = free();
      const gen = f.p >= f.s ? 'p' : 's';
      if (f[gen] <= 0) { extras.push(text); continue; }
      affixes.push({ row: null, type: 'unknown', fam: [], gen, lvl: 1, tags: [], values: [], text, unknown: true });
    }
    const unknown = affixes.filter((a) => a.unknown).length;
    if (unknown) warnings.push('有 ' + unknown + ' 条词缀没认出来，已按原文保留；它们算作「没用的词缀」，前后缀是猜的。');
    if (extras.length) warnings.push('有 ' + extras.length + ' 行不是词缀，已忽略：' + extras.join('、'));

    if (!rarity) item.rarity = affixes.length > 2 ? 'rare' : affixes.length ? 'magic' : 'normal';
    const f = free();
    if (f.p < 0 || f.s < 0) warnings.push('识别出的前后缀数量超过了上限，请对照游戏检查。');
    return { item, base, alias: found.alias || null, warnings, extras };
  }

  const api = { parse, matchLine, variants, squash };
  global.CraftItemText = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
