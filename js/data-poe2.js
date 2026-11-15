/* 流放之路 2 · 做装数据
 * PoE2 处于持续调整期；这里的底子 / 词缀 / 权重是可运行的整理版近似值，
 * 用于比较策略与教学，不是完整游戏数据库。价格默认按 PoE2 通货量级估算。
 */
(function (global) {
  'use strict';

  const t = (ilvl, ...v) => ({ ilvl, v });
  const mod = (x) => x;
  const ARMOUR = ['helmet', 'body', 'gloves', 'boots', 'shield', 'focus'];
  const JEWELLERY = ['ring', 'amulet', 'belt'];
  const ALL_GEAR = ARMOUR.concat(JEWELLERY);
  const WEAPON = ['weapon'];
  const QUIVER = ['quiver'];

  /* 正式底子数据：poe2wiki.net 抓取产物 js/data-poe2.bases.js。
   * 含真实护甲 / 闪避 / 能量护盾 / 武器伤害 / 攻速 / 暴击与需求等级。
   * 法杖与法杖类武器在 wiki 上没有伤害数值，标 damageMissing，界面显示为「—」。 */
  const GENERATED_BASES = (typeof window !== 'undefined' && window.POE2_BASES) || null;
  /* 护符（Charm）是腰带护符槽上的自动触发消耗品，效果由底子自带、不用词缀改写，
   * 因此不进可做装槽位与底子列表。 */
  const CRAFTABLE = (GENERATED_BASES && GENERATED_BASES.bases) || [];
  const ZH_BASES = (typeof window !== 'undefined' && window.POE2_ZH_BASES && window.POE2_ZH_BASES.names) || {};
  /* 官方来源优先：本地游戏导出的 dat 数据存在时用它替换 wiki 数据 */
  const DAT_BASES = (typeof window !== 'undefined' && window.POE2_DAT_BASES && window.POE2_DAT_BASES.bases) || null;
  const DAT_MODS = (typeof window !== 'undefined' && window.POE2_DAT_MODS && window.POE2_DAT_MODS.mods) || null;
  const baseSource = DAT_BASES || CRAFTABLE;
  const bases = baseSource.filter((b) => b.slot !== 'charm').map((b) => ({
    nameZh: ZH_BASES[b.name] || b.nameZh || null,
    tags: (b.tags || []).slice(),
    id: b.id,
    name: b.name,
    en: b.en || b.name,
    slot: b.slot,
    ilvl: b.ilvl || 1,
    reqLevel: b.reqLevel || 1,
    defence: b.defence || {},
    weapon: b.weapon || undefined,
    implicit: b.implicit || '',
  }));
  const baseDataMeta = GENERATED_BASES ? {
    source: GENERATED_BASES.source,
    license: GENERATED_BASES.license,
    fetchedAt: GENERATED_BASES.fetchedAt,
    builtAt: GENERATED_BASES.builtAt,
    stats: GENERATED_BASES.stats,
  } : { source: 'missing', stats: { total: 0 } };

  /* 正式版词缀数据：来自 poe2wiki.net 抓取产物 js/data-poe2.mods.js。
   * 由 tools/fetch-poe2-data.mjs + tools/build-poe2-data.mjs 生成，
   * 含 400+ 词缀组 / 1600+ 档位，带真实 iLvl 门槛与数值区间。
   * 这里只做引擎所需的形态适配，不改动任何数值。 */
  const GENERATED = (typeof window !== 'undefined' && window.POE2_MODS) || null;
  /* 过滤：护符词缀不做装；官方权重全为 0 的是天赋树词缀，也掉不到物品上 */
  const NON_ITEM_TAG = /(tree|passive|genesis|map|monster|strongbox|league)/;
  function hasItemWeight(m) {
    if (!m.spawnWeights) return true;
    const positive = Object.keys(m.spawnWeights).filter((k) => k !== 'default' && m.spawnWeights[k] > 0);
    if (!positive.length) return false;
    // 只挂在天赋树 / 地图 / 怪物等非物品 tag 上的词缀，掉不到物品上
    return positive.some((k) => !NON_ITEM_TAG.test(k));
  }
  /* 官方 dat 只覆盖普通词缀；深渊 / 腐化词缀暂用 wiki 版补充，
   * 待导入器支持这两类后一并替换 */
  // 0.7.0 起普通 / 深渊 / 腐化词缀全部来自导入器，不再混入 wiki 数据
  const mods = (DAT_MODS || [])
    .filter((m) => (m.slots || []).indexOf('charm') === -1 && hasItemWeight(m))
    .map((m) => ({
    id: m.id,
    name: m.name,
    nameEn: m.nameEn,
    group: m.group,
    affix: m.affix,
    kind: m.kind || 'standard',
    tags: m.tags || [],
    slots: m.slots || [],
    attrs: m.attrs || [],
    attrSets: m.attrSets || [],
    weapons: m.weapons || [],
    spawnWeights: m.spawnWeights || null,
    weight: m.weight == null ? 1000 : m.weight,
    weightSource: m.weightSource || 'approx',
    text: m.text,
    tiers: (m.tiers || []).map((t) => ({ ilvl: t.ilvl, v: t.v, text: t.text, textZh: t.textZh || null, name: t.name })),
  }));
  const modDataMeta = GENERATED ? {
    source: GENERATED.source,
    license: GENERATED.license,
    fetchedAt: GENERATED.fetchedAt,
    builtAt: GENERATED.builtAt,
    stats: GENERATED.stats,
  } : { source: 'missing', stats: { total: 0 } };

  /* 精华：数值为整理版近似，但 group / 文本与正式词缀数据保持一致，
   * 这样冲突判定、目标匹配、派生属性统计都走同一套组名与文本解析。 */
  /* 精华：poe2wiki.net 抓取产物 js/data-poe2.essences.js。
   * 4 档（次级 / 普通 / 强效 / 完美）× 22 种，效果按部位（含武器类别）给，
   * 词缀位置（前缀/后缀）由效果文本推断，见 effect.affixSource。 */
  const GEN_ESSENCES = (typeof window !== 'undefined' && window.POE2_ESSENCES) || null;
  const ESSENCE_ZH = {
    abrasion: '磨损', alacrity: '迅捷', battle: '战斗', command: '统御', electricity: '电流',
    enhancement: '强化', flames: '火焰', grounding: '接地', haste: '急速', horror: '惊惧',
    hysteria: '狂热', ice: '冰霜', insulation: '绝缘', opulence: '富饶', ruin: '毁灭',
    seeking: '追踪', sorcery: '法术', thawing: '消融', the_body: '躯体', the_breach: '裂隙',
    the_infinite: '无限', the_mind: '心灵',
  };
  /* 精华效果文本 → 官方前后缀：同模板词缀的 affix 来自 wiki 的 Prefixes/Suffixes 分节。
   * 有唯一官方结论就用它，覆盖提交数据里按语义推断的结果。 */
  const TEXT_AFFIX = new Map();
  mods.forEach((m) => {
    (m.tiers || []).forEach((t) => {
      if (!t || !t.text) return;
      const cur = TEXT_AFFIX.get(t.text);
      if (!cur) TEXT_AFFIX.set(t.text, m.affix);
      else if (cur !== m.affix) TEXT_AFFIX.set(t.text, 'conflict');
    });
  });
  const DAT_ESSENCES = (typeof window !== 'undefined' && window.POE2_DAT_ESSENCES && window.POE2_DAT_ESSENCES.essences) || null;
  const ESS_SRC = DAT_ESSENCES || (GEN_ESSENCES && GEN_ESSENCES.essences) || [];
  const essences = ESS_SRC.map((e) => ({
    id: e.id,
    name: ESSENCE_ZH[e.typeId] || e.name || e.type,
    fullName: (ESSENCE_ZH[e.typeId] || e.type) + '精华',
    typeId: e.typeId,
    tier: e.tier,
    tierName: e.tierName,
    perfect: !!e.perfect,
    cost: e.cost,
    rule: e.rule,
    effects: (e.effects || []).map((eff) => {
      const official = TEXT_AFFIX.get(eff.text);
      const affix = official && official !== 'conflict' ? official : eff.affix;
      return {
        slots: eff.slots || [],
        weapons: eff.weapons || [],
        text: eff.text,
        v: eff.v,
        affix,
        affixSource: official && official !== 'conflict' ? 'official' : 'inferred',
      };
    }),
    color: ['#8fa3c8', '#9db8e8', '#e6cf9a', '#d8b4e2'][Math.min(3, Math.max(0, (e.tier || 1) - 1))],
  }));
  const essenceDataMeta = GEN_ESSENCES ? {
    source: GEN_ESSENCES.source,
    license: GEN_ESSENCES.license,
    fetchedAt: GEN_ESSENCES.fetchedAt,
    stats: GEN_ESSENCES.stats,
  } : { stats: { total: 0 } };
  /* 四档档位定义（界面按档位分页） */
  const essenceTiers = [
    { tier: 1, name: '次级', suffix: false },
    { tier: 2, name: '普通', suffix: false },
    { tier: 3, name: '强效', suffix: false },
    { tier: 4, name: '完美', suffix: false },
  ];

  const presets = [
    {
      id: 'poe2_life_helmet', name: '生命双抗头盔', desc: '护甲头盔：生命 + 火抗 + 冰抗，练手与实战都常用。',
      baseId: 'rusted_greathelm', ilvl: 82, influences: [],
      targets: [{ modId: 'increasedlife', tier: 3 }, { modId: 'increasedmana', tier: 3 }, { modId: 'fireresist_s', tier: 3 }],
    },
    {
      id: 'poe2_es_helmet', name: 'ES 双抗头盔', desc: '智慧底子：生命 + 火抗 + 电抗，适合法系。',
      baseId: 'beaded_circlet', ilvl: 82, influences: [],
      targets: [{ modId: 'increasedlife', tier: 3 }, { modId: 'increasedmana', tier: 3 }, { modId: 'fireresist_s', tier: 3 }],
    },
    {
      id: 'poe2_move_boots', name: '移速血抗鞋', desc: '移速 + 生命 + 火抗，鞋子最常见的组合。',
      baseId: 'bronze_greaves', ilvl: 82, influences: [],
      targets: [{ modId: 'increasedlife', tier: 3 }, { modId: 'increasedmana', tier: 3 }, { modId: 'fireresist_s', tier: 3 }],
    },
    {
      id: 'poe2_phys_staff', name: '物理长棍', desc: '物理伤害 + 攻速 + 命中，长棍主流路线。',
      baseId: 'aegis_quarterstaff', ilvl: 82, influences: [],
      targets: [{ modId: 'increasedlife', tier: 3 }, { modId: 'increasedmana', tier: 3 }, { modId: 'fireresist_s', tier: 3 }],
    },
    {
      id: 'poe2_caster_wand', name: '法系法杖', desc: '法术伤害 + 施法速度 + 魔力，法系武器通用。',
      baseId: 'attuned_wand', ilvl: 82, influences: [],
      targets: [{ modId: 'increasedmana', tier: 3 }, { modId: 'localincreasedphysicaldamagepercent', tier: 3 }, { modId: 'increasedattackspeed_s', tier: 3 }],
    },
    {
      id: 'poe2_ev_boots', name: '闪避移速鞋', desc: '闪避底子：移速 + 生命 + 抗性。',
      baseId: 'cavalry_boots', ilvl: 82, influences: [],
      targets: [{ modId: 'increasedlife', tier: 3 }, { modId: 'increasedmana', tier: 3 }, { modId: 'fireresist_s', tier: 3 }],
    },
    {
      id: 'poe2_bow', name: '物理弓', desc: '弓：物理伤害 + 攻速 + 命中。',
      baseId: 'adherent_bow', ilvl: 82, influences: [],
      targets: [{ modId: 'localincreasedphysicaldamagepercent', tier: 3 }, { modId: 'localincreasedphysicaldamagepercentandaccuracyrating', tier: 3 }, { modId: 'increasedattackspeed_s', tier: 3 }],
    },
    {
      id: 'poe2_staff', name: '元素长杖', desc: '长杖：法术伤害 + 施法速度 + 魔力。',
      baseId: 'ashen_staff', ilvl: 82, influences: [],
      targets: [{ modId: 'increasedmana', tier: 3 }, { modId: 'localincreasedphysicaldamagepercent', tier: 3 }, { modId: 'increasedattackspeed_s', tier: 3 }],
    },
    {
      id: 'poe2_quiver', name: '血抗箭袋', desc: '箭袋：生命 + 攻速 + 命中。',
      baseId: 'broadhead_quiver', ilvl: 82, influences: [],
      targets: [{ modId: 'increasedaccuracy', tier: 3 }, { modId: 'addedfiredamage', tier: 3 }, { modId: 'increasedattackspeed_s', tier: 3 }],
    },
    {
      id: 'poe2_body', name: '护甲血抗胸', desc: '护甲胸甲：生命 + 护甲% + 双抗。',
      baseId: 'chieftain_cuirass', ilvl: 82, influences: [],
      targets: [{ modId: 'increasedlife', tier: 3 }, { modId: 'increasedmana', tier: 3 }, { modId: 'fireresist_s', tier: 3 }, { modId: 'coldresist_s', tier: 3 }],
    },
  ];

  /* 全量预兆：poe2wiki.net 抓取产物 js/data-poe2.omens.js。
   * 已建模的（6 条）可执行；其余仅展示官方名称与描述，界面上禁用并说明原因，
   * 不用近似行为冒充真实效果。价格只对已建模项维护。 */
  const GENERATED_OMENS = (typeof window !== 'undefined' && window.POE2_OMENS) || null;
  const OMEN_COST = {
    omen_whittling: 30, omen_sinistral_erasure: 18, omen_dextral_erasure: 18,
    omen_sinistral_exalt: 45, omen_dextral_exalt: 45, omen_greater_exalt: 85,
  };
  const OMEN_ZH = {
    omen_whittling: '削切预兆',
    omen_sinistral_erasure: '左旋抹除预兆',
    omen_dextral_erasure: '右旋抹除预兆',
    omen_sinistral_exalt: '左旋崇高预兆',
    omen_dextral_exalt: '右旋崇高预兆',
    omen_greater_exalt: '高阶崇高预兆',
  };
  /* 引擎已支持的预兆效果类型（见 engine-poe2.js 的 omen 分支） */
  const OMEN_SUPPORTED = new Set([
    'remove_lowest', 'remove_prefix_only', 'remove_suffix_only', 'remove_two',
    'add_prefix', 'add_suffix', 'add_two', 'remove_desecrated_only',
    'add_same_group', 'reroll', 'quality',
    'alchemy_max_prefix', 'alchemy_max_suffix', 'desecrate_prefix_only', 'desecrate_suffix_only', 'desecrate_guaranteed_kurgal', 'desecrate_guaranteed_ulaman', 'desecrate_guaranteed_amanamu', 'vaal_always_change', 'add_same_group',
  ]);

  const DAT_OMENS = (typeof window !== 'undefined' && window.POE2_DAT_OMENS && window.POE2_DAT_OMENS.omens) || null;
  const omens = (DAT_OMENS || (GENERATED_OMENS && GENERATED_OMENS.omens) || []).map((o) => ({
    id: o.id,
    name: OMEN_ZH[o.id] || o.name,
    nameEn: o.name,
    desc: o.desc,
    implemented: o.effect ? OMEN_SUPPORTED.has(o.effect) : !!o.implemented,
    effect: o.effect || null,
    appliesTo: o.appliesTo || null,
    cost: (typeof OMEN_COSTS !== 'undefined' && OMEN_COSTS[o.id] != null) ? OMEN_COSTS[o.id] : (OMEN_COST && OMEN_COST[o.id] != null ? OMEN_COST[o.id] : null),
    color: o.implemented ? '#e6cf9a' : '#7a8496',
  }));
  const OMEN_SRC = DAT_OMENS ? (window.POE2_DAT_OMENS) : GENERATED_OMENS;
  const omenDataMeta = OMEN_SRC ? {
    source: OMEN_SRC.source || 'poe2db',
    license: OMEN_SRC.license || 'third-party database (game files)',
    fetchedAt: OMEN_SRC.fetchedAt || null,
    stats: OMEN_SRC.stats,
  } : { stats: { total: 0, implemented: 0 } };


  /* 符文 / 灵魂核心：PoE2 的标志性系统，插进武器 / 护甲的插槽。
   * 同样是整理版近似数值：每条符文给一组固定词缀效果，按 group 参与 derivedStats。
   * slots 限制可插入的部位类别（armour 类 = 头 / 胸 / 手 / 鞋 / 盾 / 法器）。 */
  /* 符文：核心 7 类 × 3 档，按装备类别（武器 / 护甲）拆分，数值取自 poe2wiki.net。
   * 只收录引擎已建模的效果（生命 / 魔力 / 护盾 / 命中 / 晕眩阈值 / 抗性 / 附加伤害）；
   * 吸血、百分比增伤、符文结界等尚未建模的效果不在其中，避免展示无法计算的数据。 */
  // 符文/灵魂核心统一来自 dat（SoulCore 类，280 条，含 121 条符文）
  const runes = [];

  /* 灵魂核心：稀有度更高，同样插槽，效果更偏攻击 / 特殊属性。 */
  /* 灵魂核心：poe2wiki.net 抓取，只收录引擎已建模的效果（生命 / 魔力 / 护盾 /
   * 混沌抗性 / 元素抗性 / 命中 / 晕眩阈值），按装备类别拆条目。 */
  /* 灵魂核心：poe2wiki.net 抓取，只收录引擎已建模的效果（生命 / 魔力 / 护盾 /
   * 混沌抗性 / 元素抗性 / 命中 / 晕眩阈值），按装备类别拆条目。 */
  /* 灵魂核心：poe2wiki.net 抓取，只收录引擎已建模的效果（生命 / 魔力 / 护盾 /
   * 混沌抗性 / 元素抗性 / 命中 / 晕眩阈值），按装备类别拆条目。 */
  const DAT_SOULCORES = (typeof window !== 'undefined' && window.POE2_DAT_SOULCORES && window.POE2_DAT_SOULCORES.soulCores) || null;
  const soulCores = DAT_SOULCORES || [
    { id: 'soul_core_of_citaqualotl', name: 'Soul Core of Citaqualotl', color: '#a8c8e8', cost: 14, group: 'all_res', text: '+{0}% to all Elemental Resistances', v: [6], tags: [], slots: ['armour'] },
    { id: 'soul_core_of_puhuarte', name: 'Soul Core of Puhuarte', color: '#a8c8e8', cost: 14, group: 'maxres_fire', text: '+{0}% to Maximum Fire Resistance', v: [2], tags: [], slots: ['armour'] },
    { id: 'soul_core_of_tacati', name: 'Soul Core of Tacati', color: '#a8c8e8', cost: 14, group: 'res_chaos', text: '+{0}% to Chaos Resistance', v: [13], tags: [], slots: ['armour'] },
    { id: 'soul_core_of_tzamoto', name: 'Soul Core of Tzamoto', color: '#a8c8e8', cost: 14, group: 'maxres_cold', text: '+{0}% to Maximum Cold Resistance', v: [2], tags: [], slots: ['armour'] },
    { id: 'soul_core_of_xopec', name: 'Soul Core of Xopec', color: '#a8c8e8', cost: 14, group: 'maxres_light', text: '+{0}% to Maximum Lightning Resistance', v: [2], tags: [], slots: ['armour'] },
  ];

  const qualItems = [
    { type: 'whetstone', name: '磨刀石', short: '磨', color: '#c0c8d8', desc: '提升武器品质 +1–2%，最高 20%', cost: 'whetstone' },
    { type: 'scrap', name: '护甲片', short: '甲', color: '#b8c0b0', desc: '提升护甲 / 盾 / 法器品质，最高 20%', cost: 'scrap' },
  ];

  const runeTabs = { id: 'rune', name: '符文' };

  const prices = {
    transmute: 0.1, augmentation: 0.2, regal: 0.5, alchemy: 0.35,
    chaos: 1, exalted: 3, divine: 220, annulment: 8, vaal: 1.5,
    whetstone: 0.2, scrap: 0.2, desecrate: 45,
    omen_whittling: 30, omen_sinistral_erasure: 18, omen_dextral_erasure: 18,
    omen_sinistral_exalt: 45, omen_dextral_exalt: 45, omen_greater_exalt: 85,
  };

  const priceFields = [
    ['transmute', '蜕变石'], ['augmentation', '增幅石'], ['regal', '富豪石'],
    ['alchemy', '点金石'], ['chaos', '混沌石'], ['exalted', '崇高石'],
    ['divine', '神圣石'], ['annulment', '剥离石'], ['vaal', '瓦尔宝珠'],
    ['whetstone', '磨刀石'], ['scrap', '护甲片'], ['desecrate', '保存之骨'],
    ['omen_whittling', '削切预兆'], ['omen_sinistral_erasure', '左旋抹除预兆'],
    ['omen_dextral_erasure', '右旋抹除预兆'], ['omen_sinistral_exalt', '左旋崇高预兆'],
    ['omen_dextral_exalt', '右旋崇高预兆'], ['omen_greater_exalt', '高阶崇高预兆'],
  ];

  const basicActions = [
    { type: 'transmute', name: '蜕变石', short: '蜕', color: '#8fa3c8', desc: '普通 → 1 词缀魔法' },
    { type: 'augmentation', name: '增幅石', short: '增', color: '#9db8e8', desc: '魔法补第 2 条' },
    { type: 'regal', name: '富豪石', short: '富', color: '#d8c27a', desc: '魔法 → 稀有' },
    { type: 'alchemy', name: '点金石', short: '点', color: '#c9a76a', desc: '普通 / 魔法 → 4 词缀稀有' },
    { type: 'chaos', name: '混沌石', short: '混', color: '#b98a5a', desc: '移除 1 条并新增 1 条' },
    { type: 'exalted', name: '崇高石', short: '崇', color: '#e6cf9a', desc: '稀有补 1 条' },
    { type: 'annulment', name: '剥离石', short: '剥', color: '#9a8f7a', desc: '随机移除 1 条' },
    { type: 'divine', name: '神圣石', short: '圣', color: '#d8b4e2', desc: '重掷数值' },
    { type: 'whetstone', name: '磨刀石', short: '磨', color: '#c0c8d8', desc: '武器品质 +1–2%' },
    { type: 'scrap', name: '护甲片', short: '甲', color: '#b8c0b0', desc: '护甲品质 +1–2%' },
    { type: 'vaal', name: '瓦尔宝珠', short: '瓦', color: '#d06a6a', desc: '腐化，结果随机' },
    { type: 'desecrate', name: '保存之骨', short: '渎', color: '#a07ad0', desc: '揭露 3 条深渊词缀，选 1 条' },
  ];

  const actionTabs = [
    { id: 'basic', name: '通货' },
    { id: 'essence', name: '精华' },
    { id: 'omen', name: '预兆' },
    { id: 'rune', name: '符文' },
  ];

  global.PoE2Data = {
    game: 'poe2',
    label: '流放之路 2',
    version: '0.9.5',
    configMode: 'static',
    slots: [
      { id: 'helmet', name: '头盔' }, { id: 'body', name: '胸甲' }, { id: 'gloves', name: '手套' },
      { id: 'boots', name: '鞋子' }, { id: 'shield', name: '盾牌' }, { id: 'focus', name: '法器' },
      { id: 'weapon', name: '武器' }, { id: 'quiver', name: '箭袋' },
      { id: 'ring', name: '戒指' }, { id: 'amulet', name: '项链' }, { id: 'belt', name: '腰带' },
      { id: 'jewel', name: '珠宝' },
    ],
    bases,
    baseDataMeta,
    zhModMap: (typeof window !== 'undefined' && window.POE2_ZH_MODS && window.POE2_ZH_MODS.map) || {},
    zhModMeta: (typeof window !== 'undefined' && window.POE2_ZH_MODS) || null,
    zhBaseMeta: (typeof window !== 'undefined' && window.POE2_ZH_BASES) || null,
    mods,
    modDataMeta,
    essences,
    essenceTiers,
    essenceDataMeta,
    runes,
    soulCores,
    qualItems,
    runeTabs,
    fossils: [],
    bench: [],
    influences: [],
    harvestTags: [],
    presets,
    omens,
    omenDataMeta,
    prices,
    priceFields,
    basicActions,
    actionTabs,
    hints: {
      normal: '普通物品：用蜕变石（1 词缀魔法）或点金石（4 词缀稀有）起手。',
      magic: '魔法物品：增幅补到 2 条；强效精华可直接升稀有并保底一条；命中后用富豪升稀有。',
      rare: '稀有物品：崇高补空位，混沌替换，剥离 / 预兆处理废词缀。',
      corrupted: '物品已腐化：普通通货与精华都不能再用，只能继续查看或重新做一件。',
    },
    essenceHint: '强效精华：魔法 → 稀有并保底一条；完美精华：稀有物品移除 1 条并加保底。',
    runeHint: '符文 / 灵魂核心插进武器与护甲的插槽；插槽满了要先清空再换。',
    qualityHint: '磨刀石用于武器，护甲片用于护甲 / 盾 / 法器；品质最高 20%，会放大基础防御与武器物理伤害。',
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.PoE2Data;
})(typeof window !== 'undefined' ? window : globalThis);
