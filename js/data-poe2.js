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
  /* 词缀 / 逐档权重 / 灵魂核心三份 dat 数据（约 640 KiB 源码）目前仍由 index.html
   * 的 <script> 同步加载，到齐后由文件末尾的 installHeavyData() 装配一次。
   * 装配被写成可重入的函数，是为了以后能改成按需注入：把 index.html 里那两个
   * <script> 摘掉、在需要时注入并再调一次 installHeavyData() 即可，其余代码不用动。 */
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
  const baseDataMeta = (DAT_BASES) ? {
    source: 'local-game-files',
    license: '游戏数据 (c) Grinding Gear Games；本地导出，不再分发',
    stats: DAT_BASES.stats || { total: (DAT_BASES || []).length },
  } : GENERATED_BASES ? {
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
  /* 装配结果：数据未到齐时是空数组，installHeavyData() 到了再填。 */
  let mods = [];
  let modDataMeta = { source: 'missing', stats: { total: 0 } };
  function buildMods() {
    /* 两种来源：
     *  · 整表 window.POE2_DAT_MODS（data-poe2.dat-mods.js，Node 测试用，页面不加载）；
     *  · 浏览器里是「共享核心 + 已加载的槽位切片」：核心给 weightSets/stats，
     *    每个槽位文件挂进 window.POE2_DAT_MODS_SLOTS[slot]，切一个装一个（见 app.js）。
     *    多个槽位同时加载时按 id 去重合并，结果只会是整表的子集。 */
    const MASTER = (typeof window !== 'undefined' && window.POE2_DAT_MODS) || null;
    const CORE = (typeof window !== 'undefined' && window.POE2_DAT_MODS_CORE) || null;
    const SLOTMAP = (typeof window !== 'undefined' && window.POE2_DAT_MODS_SLOTS) || null;
    let DAT_MODS = (MASTER && MASTER.mods) || null;
    if (!DAT_MODS && SLOTMAP) {
      const merged = new Map();
      for (const key of Object.keys(SLOTMAP)) {
        for (const m of SLOTMAP[key] || []) merged.set(m.id, m);
      }
      DAT_MODS = [...merged.values()];
    }
    const DAT_TIER_WEIGHT_SETS = (MASTER && MASTER.weightSets) || (CORE && CORE.weightSets) || null;
    const DAT_TIER_META = (MASTER && MASTER.stats) || (CORE && CORE.stats) || null;
    if (!DAT_MODS) return { weightSets: null, meta: null };
    mods = DAT_MODS
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
        tiers: (m.tiers || []).map((t) => ({ ilvl: t.ilvl, v: t.v, text: t.text, textZh: t.textZh || null, name: t.name, w: t.w == null ? null : t.w })),
      }));
    /* 运行时实际用的数据源要如实上报：本地游戏文件导出时，modDataMeta 不再指向 wiki。
     * 面板上的「来源 / 许可」「权重可信度」都读这里，别再写死 CC BY-NC-SA。 */
    modDataMeta = (DAT_MODS && DAT_TIER_META) ? {
      source: 'local-game-files',
      license: '游戏数据 (c) Grinding Gear Games；本地导出，不再分发',
      gameVersion: DAT_TIER_META.gameVersion || null,
      stats: DAT_TIER_META,
    } : GENERATED ? {
      source: GENERATED.source,
      license: GENERATED.license,
      fetchedAt: GENERATED.fetchedAt,
      builtAt: GENERATED.builtAt,
      stats: GENERATED.stats,
    } : { source: 'missing', stats: { total: 0 } };
    return { weightSets: DAT_TIER_WEIGHT_SETS || null, meta: DAT_TIER_META || null };
  }

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
   * 有唯一官方结论就用它，覆盖提交数据里按语义推断的结果。
   * 这张表依赖词缀数据，所以跟精华一起在 installHeavyData() 里重建。 */
  const TEXT_AFFIX = new Map();
  const DAT_ESSENCES = (typeof window !== 'undefined' && window.POE2_DAT_ESSENCES && window.POE2_DAT_ESSENCES.essences) || null;
  const ESS_SRC = DAT_ESSENCES || (GEN_ESSENCES && GEN_ESSENCES.essences) || [];
  let essences = [];
  function buildEssences() {
    TEXT_AFFIX.clear();
    mods.forEach((m) => {
      (m.tiers || []).forEach((t) => {
        if (!t || !t.text) return;
        const cur = TEXT_AFFIX.get(t.text);
        if (!cur) TEXT_AFFIX.set(t.text, m.affix);
        else if (cur !== m.affix) TEXT_AFFIX.set(t.text, 'conflict');
      });
    });
    essences = ESS_SRC.map((e) => ({
      id: e.id,
      name: ESSENCE_ZH[e.typeId] || e.name || e.type,
      fullName: (ESSENCE_ZH[e.typeId] || e.name || e.type || '未知') + '精华',
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
  }
  /* 精华目标：把「精华保底的那条词缀」变成可以选择的目标。
   * 引擎加上的词缀 group 是 essence_<essenceId>，所以 target 的 group 必须照这个写；
   * 一条精华在不同部位可能给不同效果，按 (essenceId, 部位组, 文案) 拆成多条目标。 */
  let essenceTargets = [];
  function buildEssenceTargets() {
    const out = [];
    for (const e of essences || []) {
      (e.effects || []).forEach((eff, i) => {
        if (!eff || !eff.text) return;
        out.push({
          id: 'essence:' + e.id + ':' + i,
          isEssence: true,
          essenceId: e.id,
          group: 'essence_' + e.id,
          affix: eff.affix,
          name: e.tierName + (e.name || ESSENCE_ZH[e.typeId] || e.typeId) + '精华',
          text: eff.text,
          v: eff.v || [],
          slots: eff.slots || [],
          weapons: eff.weapons || [],
          tierName: e.tierName,
          tier: e.tier,
          perfect: !!e.perfect,
          cost: e.cost,
        });
      });
    }
    essenceTargets = out;
  }
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



  /* 全量预兆：poe2wiki.net 抓取产物 js/data-poe2.omens.js。
   * 已建模的（6 条）可执行；其余仅展示官方名称与描述，界面上禁用并说明原因，
   * 不用近似行为冒充真实效果。价格只对已建模项维护。 */
  const GENERATED_OMENS = (typeof window !== 'undefined' && window.POE2_OMENS) || null;
  const OMEN_COST = {
    omen_whittling: 30, omen_sinistral_erasure: 18, omen_dextral_erasure: 18,
    omen_sinistral_exalt: 45, omen_dextral_exalt: 45, omen_greater_exalt: 85,
    omen_greater_annulment: 30, omen_sinistral_coronation: 6, omen_dextral_coronation: 6,
    omen_sinistral_necromancy: 4, omen_dextral_necromancy: 4,
    omen_sinistral_crystallisation: 3, omen_dextral_crystallisation: 3,
    omen_sinistral_alchemy: 5, omen_dextral_alchemy: 5,
    omen_sinistral_annulment: 10, omen_dextral_annulment: 10,
    omen_light: 2, omen_corruption: 8,
    omen_the_blackblooded: 6, omen_the_sovereign: 6, omen_the_liege: 6,
  };
  const OMEN_ZH = {
    omen_whittling: '削切预兆',
    omen_sinistral_erasure: '左旋抹除预兆',
    omen_dextral_erasure: '右旋抹除预兆',
    omen_sinistral_exalt: '左旋崇高预兆',
    omen_dextral_exalt: '右旋崇高预兆',
    omen_greater_exalt: '高阶崇高预兆',
  };
  /* 引擎真正支持的预兆效果类型（见 engine-poe2.js 的 applyAction）。
   * implemented 由这份清单派生：不在清单里的效果一律禁用并标「尚未建模」，
   * 不要再用「看起来像实现了」的手写集合冒充可执行。 */
  const OMEN_SUPPORTED = new Set([
    'remove_lowest', 'remove_prefix_only', 'remove_suffix_only', 'remove_two',
    'add_prefix', 'add_suffix', 'add_two', 'remove_desecrated_only',
    'alchemy_max_prefix', 'alchemy_max_suffix',
    'desecrate_prefix_only', 'desecrate_suffix_only',
    'desecrate_guaranteed_kurgal', 'desecrate_guaranteed_ulaman', 'desecrate_guaranteed_amanamu',
    'vaal_always_change',
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
  /* 灵魂核心：dat 里 280 条（约 105 KiB 源码），同样由 installHeavyData() 到时再装；
   * 数据没到就用下面这 5 条兜底，界面上照样能插，只是选项少。 */
  const SOULCORE_FALLBACK = [
    { id: 'soul_core_of_citaqualotl', name: 'Soul Core of Citaqualotl', color: '#a8c8e8', cost: 14, group: 'all_res', text: '+{0}% to all Elemental Resistances', v: [6], tags: [], slots: ['armour'] },
    { id: 'soul_core_of_puhuarte', name: 'Soul Core of Puhuarte', color: '#a8c8e8', cost: 14, group: 'maxres_fire', text: '+{0}% to Maximum Fire Resistance', v: [2], tags: [], slots: ['armour'] },
    { id: 'soul_core_of_tacati', name: 'Soul Core of Tacati', color: '#a8c8e8', cost: 14, group: 'res_chaos', text: '+{0}% to Chaos Resistance', v: [13], tags: [], slots: ['armour'] },
    { id: 'soul_core_of_tzamoto', name: 'Soul Core of Tzamoto', color: '#a8c8e8', cost: 14, group: 'maxres_cold', text: '+{0}% to Maximum Cold Resistance', v: [2], tags: [], slots: ['armour'] },
    { id: 'soul_core_of_xopec', name: 'Soul Core of Xopec', color: '#a8c8e8', cost: 14, group: 'maxres_light', text: '+{0}% to Maximum Lightning Resistance', v: [2], tags: [], slots: ['armour'] },
  ];
  let soulCores = SOULCORE_FALLBACK.slice();

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
    omen_greater_annulment: 30, omen_sinistral_coronation: 6, omen_dextral_coronation: 6,
    omen_sinistral_necromancy: 4, omen_dextral_necromancy: 4,
    omen_sinistral_crystallisation: 3, omen_dextral_crystallisation: 3,
    omen_sinistral_alchemy: 5, omen_dextral_alchemy: 5,
    omen_sinistral_annulment: 10, omen_dextral_annulment: 10,
    omen_light: 2, omen_corruption: 8,
    omen_the_blackblooded: 6, omen_the_sovereign: 6, omen_the_liege: 6,
  };

  const priceFields = [
    ['transmute', '蜕变石'], ['augmentation', '增幅石'], ['regal', '富豪石'],
    ['alchemy', '点金石'], ['chaos', '混沌石'], ['exalted', '崇高石'],
    ['divine', '神圣石'], ['annulment', '剥离石'], ['vaal', '瓦尔宝珠'],
    ['whetstone', '磨刀石'], ['scrap', '护甲片'], ['desecrate', '保存之骨'],
    ['omen_whittling', '削切预兆'], ['omen_sinistral_erasure', '左旋抹除预兆'],
    ['omen_dextral_erasure', '右旋抹除预兆'], ['omen_sinistral_exalt', '左旋崇高预兆'],
    ['omen_dextral_exalt', '右旋崇高预兆'], ['omen_greater_exalt', '高阶崇高预兆'],
    ['omen_greater_annulment', '高阶废除预兆'],
    ['omen_sinistral_coronation', '左旋加冕预兆'], ['omen_dextral_coronation', '右旋加冕预兆'],
    ['omen_sinistral_necromancy', '左旋死灵术预兆'], ['omen_dextral_necromancy', '右旋死灵术预兆'],
    ['omen_sinistral_crystallisation', '左旋结晶预兆'], ['omen_dextral_crystallisation', '右旋结晶预兆'],
    ['omen_sinistral_alchemy', '左旋炼金预兆'], ['omen_dextral_alchemy', '右旋炼金预兆'],
    ['omen_sinistral_annulment', '左旋废除预兆'], ['omen_dextral_annulment', '右旋废除预兆'],
    ['omen_light', '光明预兆'], ['omen_corruption', '腐化预兆'],
    ['omen_the_blackblooded', '黑血预兆'], ['omen_the_sovereign', '君主预兆'], ['omen_the_liege', '领主预兆'],
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

  /* ------------------------------------------------------------------ 重数据装配
   * 把词缀 / 逐档权重 / 灵魂核心三份 dat 数据装进 mods / essences / soulCores，
   * 并同步 PoE2Data 上的引用。可重入、幂等：重复调用只会重算，不会累加。
   * 现在由文件末尾调一次（数据已同步加载）；改成按需注入时，注完脚本再调一次即可。 */
  function installHeavyData() {
    const built = buildMods();
    buildEssences();
    buildEssenceTargets();
    const datSoul = (typeof window !== 'undefined' && window.POE2_DAT_SOULCORES && window.POE2_DAT_SOULCORES.soulCores) || null;
    if (datSoul && datSoul.length) soulCores = datSoul;
    const D = global.PoE2Data;
    if (D) {
      D.mods = mods;
      D.modDataMeta = modDataMeta;
      D.essences = essences;
      D.essenceTargets = essenceTargets;
      D.soulCores = soulCores;
      if (built.weightSets) { D.tierWeightSets = built.weightSets; D.weightSets = built.weightSets; }
      if (built.meta) D.tierWeightMeta = built.meta;
    }
    return { mods: mods.length, essences: essences.length, soulCores: soulCores.length };
  }

  global.PoE2Data = {
    game: 'poe2',
    label: '流放之路 2',
    version: '0.10.0',
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
    tierWeightSets: null,
    weightSets: null,
    tierWeightMeta: null,
    essences,
    essenceTargets,
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
  global.PoE2Data.installHeavyData = installHeavyData;
  /* 数据已经在页面上就立刻装配（站点同步加载、Node 测试先 require 了 dat 脚本两种情况都是）。 */
  installHeavyData();
  if (typeof module !== 'undefined' && module.exports) module.exports = global.PoE2Data;
})(typeof window !== 'undefined' ? window : globalThis);
