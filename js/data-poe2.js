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

  const bases = [
    /* 头盔 */
    { id: 'iron_helm', name: '铁盔', en: 'Iron Helm', slot: 'helmet', ilvl: 1, defence: { ar: 42 }, implicit: '+20 护甲' },
    { id: 'plate_helm', name: '板甲盔', en: 'Plated Helm', slot: 'helmet', ilvl: 1, defence: { ar: 58 }, implicit: '+25 护甲' },
    { id: 'scout_hood', name: '斥候兜帽', en: 'Scout Hood', slot: 'helmet', ilvl: 1, defence: { ev: 34 }, implicit: '+15 闪避' },
    { id: 'arcane_hood', name: '秘法兜帽', en: 'Arcane Hood', slot: 'helmet', ilvl: 1, defence: { es: 24 }, implicit: '+15 最大能量护盾' },
    /* 胸甲 */
    { id: 'smithing_plate', name: '锻铁胸甲', en: 'Smithing Plate', slot: 'body', ilvl: 1, defence: { ar: 120 }, implicit: '+30 护甲' },
    { id: 'keth_raiment', name: '凯斯长袍', en: 'Keth Raiment', slot: 'body', ilvl: 1, defence: { es: 78 }, implicit: '+25 最大能量护盾' },
    { id: 'scout_vest', name: '斥候背心', en: 'Scout Vest', slot: 'body', ilvl: 1, defence: { ev: 96 }, implicit: '+20 闪避' },
    { id: 'zealot_vestments', name: '狂信者法衣', en: 'Zealot Vestments', slot: 'body', ilvl: 1, defence: { ar: 70, es: 30 }, implicit: '+15 护甲 / +10 最大能量护盾' },
    { id: 'wanderer_tunic', name: '流浪者外套', en: 'Wanderer Tunic', slot: 'body', ilvl: 1, defence: { ev: 60, es: 28 }, implicit: '+15 闪避 / +10 最大能量护盾' },
    /* 手套 */
    { id: 'iron_gauntlets', name: '铁护手', en: 'Iron Gauntlets', slot: 'gloves', ilvl: 1, defence: { ar: 28 }, implicit: '+10 护甲' },
    { id: 'plate_gauntlets', name: '板甲护手', en: 'Plated Gauntlets', slot: 'gloves', ilvl: 1, defence: { ar: 40 }, implicit: '+15 护甲' },
    { id: 'scout_mitts', name: '斥候手套', en: 'Scout Mitts', slot: 'gloves', ilvl: 1, defence: { ev: 24 }, implicit: '+10 闪避' },
    { id: 'silk_gloves', name: '丝绸手套', en: 'Silk Gloves', slot: 'gloves', ilvl: 1, defence: { es: 18 }, implicit: '+10 最大能量护盾' },
    { id: 'keth_gloves', name: '凯斯手套', en: 'Keth Gloves', slot: 'gloves', ilvl: 1, defence: { es: 26 }, implicit: '+12 最大能量护盾' },
    /* 鞋子 */
    { id: 'iron_greaves', name: '铁胫甲', en: 'Iron Greaves', slot: 'boots', ilvl: 1, defence: { ar: 26 }, implicit: '+10 护甲' },
    { id: 'plate_greaves', name: '板甲胫甲', en: 'Plated Greaves', slot: 'boots', ilvl: 1, defence: { ar: 38 }, implicit: '+15 护甲' },
    { id: 'scout_boots', name: '斥候长靴', en: 'Scout Boots', slot: 'boots', ilvl: 1, defence: { ev: 28 }, implicit: '+10 闪避' },
    { id: 'silk_slippers', name: '丝绸便鞋', en: 'Silk Slippers', slot: 'boots', ilvl: 1, defence: { es: 18 }, implicit: '+10 最大能量护盾' },
    { id: 'keth_boots', name: '凯斯便鞋', en: 'Keth Boots', slot: 'boots', ilvl: 1, defence: { es: 26 }, implicit: '+12 最大能量护盾' },
    /* 盾牌 */
    { id: 'iron_shield', name: '铁盾', en: 'Iron Shield', slot: 'shield', ilvl: 1, defence: { ar: 62 }, implicit: '+15 护甲' },
    { id: 'tower_shield', name: '塔盾', en: 'Tower Shield', slot: 'shield', ilvl: 1, defence: { ar: 90 }, implicit: '+25 护甲' },
    { id: 'buckler', name: '轻盾', en: 'Buckler', slot: 'shield', ilvl: 1, defence: { ev: 52 }, implicit: '+15 闪避' },
    { id: 'spirit_shield', name: '灵能盾', en: 'Spirit Shield', slot: 'shield', ilvl: 1, defence: { es: 46 }, implicit: '+20 最大能量护盾' },
    { id: 'crystal_shield', name: '水晶盾', en: 'Crystal Shield', slot: 'shield', ilvl: 1, defence: { es: 60 }, implicit: '+25 最大能量护盾' },
    /* 法器 */
    { id: 'focus', name: '法器', en: 'Focus', slot: 'focus', ilvl: 1, defence: { es: 32 }, implicit: '+10 最大能量护盾' },
    { id: 'crystal_focus', name: '水晶法器', en: 'Crystal Focus', slot: 'focus', ilvl: 1, defence: { es: 50 }, implicit: '+18 最大能量护盾' },
    { id: 'bone_focus', name: '骨制法器', en: 'Bone Focus', slot: 'focus', ilvl: 1, defence: { es: 40 }, implicit: '+15 最大能量护盾' },
    /* 武器 */
    { id: 'quarterstaff', name: '长棍', en: 'Quarterstaff', slot: 'weapon', ilvl: 1, weapon: { phys: [18, 32], aps: 1.4, crit: 5, class: ['quarterstaff'] }, implicit: '+10% 攻击速度' },
    { id: 'crossbow', name: '十字弩', en: 'Crossbow', slot: 'weapon', ilvl: 1, weapon: { phys: [16, 28], aps: 1.2, crit: 5, class: ['crossbow'] }, implicit: '+15% 投射物伤害' },
    { id: 'bow', name: '弓', en: 'Bow', slot: 'weapon', ilvl: 1, weapon: { phys: [14, 26], aps: 1.2, crit: 6, class: ['bow'] }, implicit: '+15% 投射物伤害' },
    { id: 'wand', name: '法杖', en: 'Wand', slot: 'weapon', ilvl: 1, weapon: { phys: [7, 13], aps: 1.5, crit: 7, class: ['wand'] }, implicit: '+15% 法术伤害' },
    { id: 'sceptre', name: '权杖', en: 'Sceptre', slot: 'weapon', ilvl: 1, weapon: { phys: [9, 16], aps: 1.3, crit: 5, class: ['sceptre'] }, implicit: '+20 最大魔力' },
    { id: 'staff', name: '长杖', en: 'Staff', slot: 'weapon', ilvl: 1, weapon: { phys: [12, 22], aps: 1.2, crit: 5, class: ['staff'] }, implicit: '+25% 法术伤害' },
    { id: 'mace', name: '钉锤', en: 'Mace', slot: 'weapon', ilvl: 1, weapon: { phys: [24, 40], aps: 1.1, crit: 5, class: ['mace'] }, implicit: '+20 眩晕累积' },
    { id: 'spear', name: '长矛', en: 'Spear', slot: 'weapon', ilvl: 1, weapon: { phys: [16, 28], aps: 1.35, crit: 5, class: ['spear'] }, implicit: '+10% 近战伤害' },
    { id: 'flail', name: '连枷', en: 'Flail', slot: 'weapon', ilvl: 1, weapon: { phys: [20, 34], aps: 1.15, crit: 5, class: ['flail'] }, implicit: '+10% 眩晕累积' },
    /* 首饰 */
    { id: 'iron_ring', name: '铁戒指', en: 'Iron Ring', slot: 'ring', ilvl: 1, implicit: '+10 最大生命' },
    { id: 'ruby_ring', name: '红玉戒指', en: 'Ruby Ring', slot: 'ring', ilvl: 1, implicit: '+15% 火焰抗性' },
    { id: 'sapphire_ring', name: '蓝玉戒指', en: 'Sapphire Ring', slot: 'ring', ilvl: 1, implicit: '+15% 冰霜抗性' },
    { id: 'topaz_ring', name: '黄玉戒指', en: 'Topaz Ring', slot: 'ring', ilvl: 1, implicit: '+15% 闪电抗性' },
    { id: 'lapis_amulet', name: '青金石项链', en: 'Lapis Amulet', slot: 'amulet', ilvl: 1, implicit: '+15 最大魔力' },
    { id: 'amber_amulet', name: '琥珀项链', en: 'Amber Amulet', slot: 'amulet', ilvl: 1, implicit: '+10 力量' },
    { id: 'jade_amulet', name: '翡翠项链', en: 'Jade Amulet', slot: 'amulet', ilvl: 1, implicit: '+10 敏捷' },
    { id: 'gold_amulet', name: '金项链', en: 'Gold Amulet', slot: 'amulet', ilvl: 1, implicit: '+10% 物品稀有度' },
    { id: 'rawhide_belt', name: '生皮腰带', en: 'Rawhide Belt', slot: 'belt', ilvl: 1, implicit: '+20 最大生命' },
    { id: 'plate_belt', name: '板甲腰带', en: 'Plated Belt', slot: 'belt', ilvl: 1, defence: { ar: 24 }, implicit: '+15 护甲' },
    { id: 'linen_belt', name: '亚麻腰带', en: 'Linen Belt', slot: 'belt', ilvl: 1, implicit: '+20 最大魔力' },
    /* 箭袋 */
    { id: 'broadhead_quiver', name: '宽头箭袋', en: 'Broadhead Quiver', slot: 'quiver', ilvl: 1, implicit: '攻击附加 1-3 物理伤害' },
    { id: 'fire_quiver', name: '火焰箭袋', en: 'Fire Quiver', slot: 'quiver', ilvl: 1, implicit: '攻击附加 3-5 火焰伤害' },
    { id: 'two_point_quiver', name: '双点箭袋', en: 'Two-Point Quiver', slot: 'quiver', ilvl: 1, implicit: '+25% 命中值' },
    { id: 'primed_quiver', name: '引弦箭袋', en: 'Primed Quiver', slot: 'quiver', ilvl: 1, implicit: '+8% 攻击速度' },
    { id: 'visceral_quiver', name: '内脏箭袋', en: 'Visceral Quiver', slot: 'quiver', ilvl: 1, implicit: '+25% 攻击暴击率' },
  ];

  const mods = [
    mod({ id: 'life_flat', name: '最大生命', affix: 'prefix', tags: ['life'], weight: 1600, group: 'life', slots: ALL_GEAR.concat(QUIVER), text: '+{0} 最大生命', tiers: [
      t(1, [10, 19]), t(20, [20, 29]), t(40, [30, 39]), t(60, [40, 49]), t(75, [50, 59]),
    ] }),
    mod({ id: 'es_flat', name: '最大能量护盾', affix: 'prefix', tags: ['defence', 'es'], weight: 1000, group: 'es_flat', slots: ARMOUR, def: ['es'], text: '+{0} 最大能量护盾', tiers: [
      t(1, [8, 14]), t(25, [15, 24]), t(45, [25, 39]), t(65, [40, 59]),
    ] }),
    mod({ id: 'ar_flat', name: '护甲', affix: 'prefix', tags: ['defence', 'armour'], weight: 1000, group: 'ar_flat', slots: ARMOUR, def: ['ar'], text: '+{0} 护甲', tiers: [
      t(1, [15, 29]), t(25, [30, 54]), t(45, [55, 89]), t(65, [90, 139]),
    ] }),
    mod({ id: 'ev_flat', name: '闪避', affix: 'prefix', tags: ['defence', 'evasion'], weight: 1000, group: 'ev_flat', slots: ARMOUR, def: ['ev'], text: '+{0} 闪避', tiers: [
      t(1, [15, 29]), t(25, [30, 54]), t(45, [55, 89]), t(65, [90, 139]),
    ] }),
    mod({ id: 'mana_flat', name: '最大魔力', affix: 'prefix', tags: ['mana'], weight: 900, group: 'mana', slots: ALL_GEAR.concat(QUIVER), text: '+{0} 最大魔力', tiers: [
      t(1, [10, 19]), t(25, [20, 34]), t(50, [35, 54]), t(70, [55, 79]),
    ] }),
    mod({ id: 'weapon_phys_flat', name: '附加物理伤害', affix: 'prefix', tags: ['physical', 'attack'], weight: 1200, group: 'weapon_phys_flat', slots: WEAPON.concat(QUIVER), text: '附加 {0} - {1} 物理伤害', tiers: [
      t(1, [2, 4], [5, 7]), t(25, [5, 8], [9, 12]), t(50, [9, 14], [15, 20]), t(70, [15, 22], [23, 30]),
    ] }),
    mod({ id: 'weapon_fire_flat', name: '附加火焰伤害', affix: 'prefix', tags: ['fire', 'elemental', 'attack'], weight: 700, group: 'weapon_fire_flat', slots: WEAPON.concat(QUIVER), text: '附加 {0} - {1} 火焰伤害', tiers: [
      t(1, [2, 4], [5, 7]), t(25, [5, 9], [10, 14]), t(50, [10, 16], [17, 24]), t(70, [17, 25], [26, 36]),
    ] }),
    mod({ id: 'weapon_cold_flat', name: '附加冰霜伤害', affix: 'prefix', tags: ['cold', 'elemental', 'attack'], weight: 700, group: 'weapon_cold_flat', slots: WEAPON.concat(QUIVER), text: '附加 {0} - {1} 冰霜伤害', tiers: [
      t(1, [2, 4], [5, 7]), t(25, [5, 9], [10, 14]), t(50, [10, 16], [17, 24]), t(70, [17, 25], [26, 36]),
    ] }),
    mod({ id: 'weapon_light_flat', name: '附加闪电伤害', affix: 'prefix', tags: ['lightning', 'elemental', 'attack'], weight: 700, group: 'weapon_light_flat', slots: WEAPON.concat(QUIVER), text: '附加 {0} - {1} 闪电伤害', tiers: [
      t(1, [1, 6], [2, 9]), t(25, [2, 12], [4, 18]), t(50, [4, 22], [8, 32]), t(70, [8, 34], [13, 48]),
    ] }),
    mod({ id: 'spell_damage', name: '法术伤害', affix: 'prefix', tags: ['caster', 'damage'], weight: 650, group: 'spell_damage', slots: ['weapon', 'focus'], text: '+{0}% 法术伤害', tiers: [
      t(1, [10, 19]), t(30, [20, 34]), t(55, [35, 54]), t(75, [55, 79]),
    ] }),
    mod({ id: 'res_fire', name: '火焰抗性', affix: 'suffix', tags: ['resistance', 'fire'], weight: 1000, group: 'res_fire', slots: ALL_GEAR.concat(QUIVER), text: '+{0}% 火焰抗性', tiers: [
      t(1, [8, 14]), t(25, [15, 23]), t(45, [24, 34]), t(65, [35, 45]),
    ] }),
    mod({ id: 'res_cold', name: '冰霜抗性', affix: 'suffix', tags: ['resistance', 'cold'], weight: 1000, group: 'res_cold', slots: ALL_GEAR.concat(QUIVER), text: '+{0}% 冰霜抗性', tiers: [
      t(1, [8, 14]), t(25, [15, 23]), t(45, [24, 34]), t(65, [35, 45]),
    ] }),
    mod({ id: 'res_light', name: '闪电抗性', affix: 'suffix', tags: ['resistance', 'lightning'], weight: 1000, group: 'res_light', slots: ALL_GEAR.concat(QUIVER), text: '+{0}% 闪电抗性', tiers: [
      t(1, [8, 14]), t(25, [15, 23]), t(45, [24, 34]), t(65, [35, 45]),
    ] }),
    mod({ id: 'res_chaos', name: '混沌抗性', affix: 'suffix', tags: ['resistance', 'chaos'], weight: 450, group: 'res_chaos', slots: ALL_GEAR.concat(QUIVER), text: '+{0}% 混沌抗性', tiers: [
      t(1, [5, 9]), t(30, [10, 16]), t(55, [17, 25]), t(75, [26, 35]),
    ] }),
    mod({ id: 'attack_speed', name: '攻击速度', affix: 'suffix', tags: ['speed', 'attack'], weight: 700, group: 'attack_speed', slots: ['weapon', 'gloves', 'quiver'], text: '+{0}% 攻击速度', tiers: [
      t(1, [4, 6]), t(25, [7, 9]), t(45, [10, 12]), t(65, [13, 16]),
    ] }),
    mod({ id: 'cast_speed', name: '施法速度', affix: 'suffix', tags: ['speed', 'caster'], weight: 700, group: 'cast_speed', slots: ['weapon', 'focus', 'amulet'], text: '+{0}% 施法速度', tiers: [
      t(1, [4, 6]), t(25, [7, 9]), t(45, [10, 12]), t(65, [13, 16]),
    ] }),
    mod({ id: 'move_speed', name: '移动速度', affix: 'suffix', tags: ['speed'], weight: 900, group: 'move_speed', slots: ['boots'], text: '+{0}% 移动速度', tiers: [
      t(1, [5, 9]), t(25, [10, 14]), t(45, [15, 19]), t(65, [20, 25]),
    ] }),
    mod({ id: 'attributes', name: '全属性', affix: 'suffix', tags: ['attribute'], weight: 700, group: 'attributes', slots: ALL_GEAR.concat(QUIVER), text: '+{0} 全属性', tiers: [
      t(1, [3, 5]), t(25, [6, 9]), t(50, [10, 14]), t(70, [15, 20]),
    ] }),
    mod({ id: 'crit_chance_weapon', name: '暴击率', affix: 'suffix', tags: ['critical', 'attack'], weight: 550, group: 'crit_chance_weapon', slots: WEAPON.concat(QUIVER), text: '+{0}% 暴击率', tiers: [
      t(1, [8, 14]), t(25, [15, 22]), t(50, [23, 32]), t(70, [33, 45]),
    ] }),
    mod({ id: 'crit_multi', name: '暴击伤害', affix: 'suffix', tags: ['critical', 'damage'], weight: 500, group: 'crit_multi', slots: ['weapon', 'amulet'], text: '+{0}% 暴击伤害', tiers: [
      t(1, [10, 16]), t(30, [17, 24]), t(55, [25, 34]), t(75, [35, 45]),
    ] }),
    mod({ id: 'accuracy', name: '命中值', affix: 'suffix', tags: ['attack', 'accuracy'], weight: 650, group: 'accuracy', slots: ['weapon', 'gloves', 'quiver'], text: '+{0} 命中值', tiers: [
      t(1, [50, 99]), t(25, [100, 179]), t(50, [180, 279]), t(70, [280, 399]),
    ] }),
    mod({ id: 'stun_threshold', name: '晕眩阈值', affix: 'suffix', tags: ['defence'], weight: 450, group: 'stun_threshold', slots: [...ARMOUR, 'belt'], text: '+{0} 晕眩阈值', tiers: [
      t(1, [30, 59]), t(30, [60, 109]), t(55, [110, 179]), t(75, [180, 269]),
    ] }),
    mod({ id: 'mana_regen', name: '魔力回复', affix: 'suffix', tags: ['mana'], weight: 500, group: 'mana_regen', slots: ALL_GEAR.concat(QUIVER), text: '+{0}% 魔力回复速度', tiers: [
      t(1, [10, 19]), t(30, [20, 34]), t(55, [35, 54]), t(75, [55, 79]),
    ] }),
    mod({ id: 'life_regen', name: '生命回复', affix: 'suffix', tags: ['life'], weight: 450, group: 'life_regen', slots: ALL_GEAR.concat(QUIVER), text: '+{0} 每秒生命回复', tiers: [
      t(1, [2, 4]), t(30, [5, 9]), t(55, [10, 16]), t(75, [17, 25]),
    ] }),
    mod({ id: 'spirit', name: '精神', affix: 'prefix', tags: ['spirit', 'defence'], weight: 380, group: 'spirit', slots: ALL_GEAR.concat(QUIVER), text: '+{0} 精神', tiers: [
      t(1, [5, 9]), t(30, [10, 19]), t(55, [20, 29]), t(75, [30, 39]),
    ] }),
    mod({ id: 'item_rarity', name: '物品稀有度', affix: 'suffix', tags: ['rarity'], weight: 500, group: 'item_rarity', slots: ALL_GEAR.concat(QUIVER), text: '+{0}% 物品稀有度', tiers: [
      t(1, [5, 9]), t(30, [10, 19]), t(55, [20, 29]), t(75, [30, 39]),
    ] }),
    mod({ id: 'es_pct', name: '能量护盾提高', affix: 'prefix', tags: ['defence', 'es'], weight: 520, group: 'es_pct', slots: ARMOUR, def: ['es'], text: '+{0}% 最大能量护盾', tiers: [
      t(1, [5, 9]), t(30, [10, 19]), t(55, [20, 29]), t(75, [30, 39]),
    ] }),
    mod({ id: 'ar_pct', name: '护甲提高', affix: 'prefix', tags: ['defence', 'armour'], weight: 520, group: 'ar_pct', slots: ARMOUR, def: ['ar'], text: '+{0}% 护甲', tiers: [
      t(1, [10, 19]), t(30, [20, 29]), t(55, [30, 39]), t(75, [40, 49]),
    ] }),
    mod({ id: 'ev_pct', name: '闪避提高', affix: 'prefix', tags: ['defence', 'evasion'], weight: 520, group: 'ev_pct', slots: ARMOUR, def: ['ev'], text: '+{0}% 闪避', tiers: [
      t(1, [10, 19]), t(30, [20, 29]), t(55, [30, 39]), t(75, [40, 49]),
    ] }),
    mod({ id: 'all_res', name: '全元素抗性', affix: 'suffix', tags: ['resistance', 'elemental'], weight: 420, group: 'all_res', slots: ALL_GEAR.concat(QUIVER), text: '+{0}% 全元素抗性', tiers: [
      t(1, [3, 5]), t(30, [6, 8]), t(55, [9, 11]), t(75, [12, 15]),
    ] }),
    mod({ id: 'ailment_threshold', name: '异常状态阈值', affix: 'suffix', tags: ['defence'], weight: 400, group: 'ailment_threshold', slots: [...ARMOUR, 'belt'], text: '+{0} 异常状态阈值', tiers: [
      t(1, [20, 39]), t(30, [40, 79]), t(55, [80, 139]), t(75, [140, 219]),
    ] }),
    mod({ id: 'block', name: '格挡率', affix: 'suffix', tags: ['defence', 'block'], weight: 420, group: 'block', slots: ['shield'], text: '+{0}% 格挡率', tiers: [
      t(1, [5, 7]), t(30, [8, 11]), t(55, [12, 15]), t(75, [16, 20]),
    ] }),
    mod({ id: 'projectile_damage', name: '投射物伤害', affix: 'prefix', tags: ['attack', 'projectile', 'damage'], weight: 520, group: 'projectile_damage', slots: QUIVER, text: '+{0}% 投射物伤害', tiers: [
      t(1, [10, 19]), t(30, [20, 29]), t(55, [30, 39]), t(75, [40, 49]),
    ] }),
    mod({ id: 'projectile_speed', name: '投射物速度', affix: 'suffix', tags: ['attack', 'projectile', 'speed'], weight: 450, group: 'projectile_speed', slots: QUIVER, text: '+{0}% 投射物速度', tiers: [
      t(1, [10, 15]), t(30, [16, 22]), t(55, [23, 29]), t(75, [30, 38]),
    ] }),
    mod({ id: 'stun_buildup', name: '眩晕累积', affix: 'suffix', tags: ['attack', 'stun'], weight: 420, group: 'stun_buildup', slots: QUIVER, text: '+{0}% 眩晕累积', tiers: [
      t(1, [15, 24]), t(30, [25, 34]), t(55, [35, 44]), t(75, [45, 59]),
    ] }),
    mod({ id: 'elemental_damage', name: '元素伤害', affix: 'prefix', tags: ['elemental', 'damage'], weight: 500, group: 'elemental_damage', slots: ['weapon', 'focus'], text: '+{0}% 元素伤害', tiers: [
      t(1, [10, 19]), t(30, [20, 29]), t(55, [30, 39]), t(75, [40, 49]),
    ] }),
    mod({ id: 'weapon_chaos_flat', name: '附加混沌伤害', affix: 'prefix', tags: ['chaos', 'attack'], weight: 350, group: 'weapon_chaos_flat', slots: WEAPON, text: '附加 {0} - {1} 混沌伤害', tiers: [
      t(1, [1, 3], [4, 7]), t(25, [3, 6], [8, 12]), t(50, [6, 10], [13, 19]), t(70, [10, 16], [20, 29]),
    ] }),
    /* 完美精华专属：weight 0，只用于目标 / 精华，不进入自然词缀池 */
    mod({ id: 'life_pct', name: '最大生命提高', affix: 'prefix', tags: ['life'], weight: 0, group: 'life_pct', slots: ['body'], text: '+{0}% 最大生命', tiers: [
      t(1, [8, 8]), t(30, [9, 9]), t(60, [10, 10]),
    ] }),
    mod({ id: 'mana_pct', name: '最大魔力提高', affix: 'prefix', tags: ['mana'], weight: 0, group: 'mana_pct', slots: ['ring'], text: '+{0}% 最大魔力', tiers: [
      t(1, [4, 4]), t(30, [5, 5]), t(60, [6, 6]),
    ] }),
    mod({ id: 'onslaught', name: '击杀获得猛攻', affix: 'suffix', tags: ['speed', 'attack'], weight: 0, group: 'onslaught', slots: WEAPON, text: '{0}% 几率在击杀时获得猛攻', tiers: [
      t(1, [20, 20]), t(30, [22, 22]), t(60, [25, 25]),
    ] }),
    mod({ id: 'spell_level', name: '法术技能等级', affix: 'prefix', tags: ['caster', 'gem'], weight: 0, group: 'spell_level', slots: ['weapon'], text: '+{0} 法术技能等级', tiers: [
      t(1, [1, 1]), t(40, [2, 2]), t(70, [3, 3]),
    ] }),
    mod({ id: 'extra_phys', name: '额外物理伤害', affix: 'prefix', tags: ['physical', 'damage'], weight: 0, group: 'extra_phys', slots: WEAPON, text: '获得 {0}% 物理伤害作为额外物理伤害', tiers: [
      t(1, [15, 15]), t(40, [18, 18]), t(70, [20, 20]),
    ] }),
    mod({ id: 'extra_fire', name: '额外火焰伤害', affix: 'prefix', tags: ['fire', 'elemental', 'damage'], weight: 0, group: 'extra_fire', slots: WEAPON, text: '获得 {0}% 伤害作为额外火焰伤害', tiers: [
      t(1, [15, 15]), t(40, [18, 18]), t(70, [20, 20]),
    ] }),
    mod({ id: 'extra_cold', name: '额外冰霜伤害', affix: 'prefix', tags: ['cold', 'elemental', 'damage'], weight: 0, group: 'extra_cold', slots: WEAPON, text: '获得 {0}% 伤害作为额外冰霜伤害', tiers: [
      t(1, [15, 15]), t(40, [18, 18]), t(70, [20, 20]),
    ] }),
    mod({ id: 'mana_efficiency', name: '魔力消耗效率', affix: 'suffix', tags: ['mana', 'caster'], weight: 0, group: 'mana_efficiency', slots: ['focus', 'weapon'], text: '+{0}% 魔力消耗效率', tiers: [
      t(1, [18, 18]), t(40, [19, 19]), t(70, [20, 20]),
    ] }),
    mod({ id: 'fire_recoup', name: '火焰伤害回复', affix: 'suffix', tags: ['fire', 'life', 'defence'], weight: 0, group: 'fire_recoup', slots: ['belt'], text: '{0}% 承受的火焰伤害回复为生命', tiers: [
      t(1, [26, 26]), t(40, [28, 28]), t(70, [30, 30]),
    ] }),
  ];

  const essences = [
    {
      id: 'greater_body', name: '躯体', tierName: '强效', color: '#d98b8b', cost: 9,
      byCat: {
        armour: { group: 'life', affix: 'prefix', text: '+{0} 最大生命', v: [[100, 119]], tags: ['life'] },
        jewellery: { group: 'life', affix: 'prefix', text: '+{0} 最大生命', v: [[85, 99]], tags: ['life'] },
      },
    },
    {
      id: 'greater_mind', name: '心灵', tierName: '强效', color: '#8fb6e8', cost: 5,
      byCat: {
        armour: { group: 'mana', affix: 'prefix', text: '+{0} 最大魔力', v: [[80, 89]], tags: ['mana'] },
        jewellery: { group: 'mana', affix: 'prefix', text: '+{0} 最大魔力', v: [[90, 104]], tags: ['mana'] },
      },
    },
    {
      id: 'greater_insulation', name: '绝缘', tierName: '强效', color: '#d9a06a', cost: 6,
      byCat: {
        armour: { group: 'res_fire', affix: 'suffix', text: '+{0}% 火焰抗性', v: [[31, 35]], tags: ['resistance', 'fire'] },
        jewellery: { group: 'res_fire', affix: 'suffix', text: '+{0}% 火焰抗性', v: [[31, 35]], tags: ['resistance', 'fire'] },
      },
    },
    {
      id: 'greater_haste', name: '急速', tierName: '强效', color: '#b8d98f', cost: 12,
      bySlot: {
        weapon: { group: 'attack_speed', affix: 'suffix', text: '+{0}% 攻击速度', v: [[23, 25]], tags: ['speed', 'attack'] },
      },
    },
    {
      id: 'greater_alacrity', name: '迅捷', tierName: '强效', color: '#9db8e8', cost: 10,
      bySlot: {
        focus: { group: 'cast_speed', affix: 'suffix', text: '+{0}% 施法速度', v: [[25, 28]], tags: ['speed', 'caster'] },
        weapon: { group: 'cast_speed', affix: 'suffix', text: '+{0}% 施法速度', v: [[25, 28]], tags: ['speed', 'caster'] },
      },
    },
    {
      id: 'greater_sorcery', name: '法术', tierName: '强效', color: '#c8a6e8', cost: 14,
      bySlot: {
        focus: { group: 'spell_damage', affix: 'prefix', text: '+{0}% 法术伤害', v: [[75, 89]], tags: ['caster', 'damage'] },
        weapon: { group: 'spell_damage', affix: 'prefix', text: '+{0}% 法术伤害', v: [[75, 89]], tags: ['caster', 'damage'] },
      },
    },
    {
      id: 'greater_abrasion', name: '磨损', tierName: '强效', color: '#c9a76a', cost: 11,
      bySlot: {
        weapon: { group: 'weapon_phys_flat', affix: 'prefix', text: '附加 {0} - {1} 物理伤害', v: [[23, 35], [39, 59]], tags: ['physical', 'attack'] },
      },
    },
    {
      id: 'greater_flames', name: '火焰', tierName: '强效', color: '#e08a5a', cost: 11,
      bySlot: {
        weapon: { group: 'weapon_fire_flat', affix: 'prefix', text: '附加 {0} - {1} 火焰伤害', v: [[56, 70], [84, 107]], tags: ['fire', 'elemental', 'attack'] },
      },
    },
    {
      id: 'greater_ice', name: '冰霜', tierName: '强效', color: '#7fb6d9', cost: 11,
      bySlot: {
        weapon: { group: 'weapon_cold_flat', affix: 'prefix', text: '附加 {0} - {1} 冰霜伤害', v: [[45, 55], [70, 90]], tags: ['cold', 'elemental', 'attack'] },
      },
    },
    /* Perfect 精华：移除 1 条随机词缀，再加 1 条保底 */
    {
      id: 'perfect_body', name: '躯体', tierName: '完美', color: '#e6a0a0', cost: 28, perfect: true,
      bySlot: {
        body: { group: 'life_pct', affix: 'prefix', text: '+{0}% 最大生命', v: [[8, 10]], tags: ['life'] },
      },
    },
    {
      id: 'perfect_mind', name: '心灵', tierName: '完美', color: '#a0c8e6', cost: 20, perfect: true,
      bySlot: {
        ring: { group: 'mana_pct', affix: 'prefix', text: '+{0}% 最大魔力', v: [[4, 6]], tags: ['mana'] },
      },
    },
    {
      id: 'perfect_insulation', name: '绝缘', tierName: '完美', color: '#e6b07a', cost: 22, perfect: true,
      bySlot: {
        belt: { group: 'fire_recoup', affix: 'suffix', text: '{0}% 承受的火焰伤害回复为生命', v: [[26, 30]], tags: ['fire', 'life'] },
      },
    },
    {
      id: 'perfect_haste', name: '急速', tierName: '完美', color: '#c8e69a', cost: 35, perfect: true,
      bySlot: {
        weapon: { group: 'onslaught', affix: 'suffix', text: '{0}% 几率在击杀时获得猛攻', v: [[20, 25]], tags: ['speed', 'attack'] },
      },
    },
    {
      id: 'perfect_alacrity', name: '迅捷', tierName: '完美', color: '#a0b8e6', cost: 25, perfect: true,
      bySlot: {
        focus: { group: 'mana_efficiency', affix: 'suffix', text: '+{0}% 魔力消耗效率', v: [[18, 20]], tags: ['mana', 'caster'] },
        weapon: { group: 'mana_efficiency', affix: 'suffix', text: '+{0}% 魔力消耗效率', v: [[18, 20]], tags: ['mana', 'caster'] },
      },
    },
    {
      id: 'perfect_sorcery', name: '法术', tierName: '完美', color: '#d0b0e6', cost: 55, perfect: true,
      bySlot: {
        weapon: { group: 'spell_level', affix: 'prefix', text: '+{0} 法术技能等级', v: [[3, 3]], tags: ['caster', 'gem'] },
      },
    },
    {
      id: 'perfect_abrasion', name: '磨损', tierName: '完美', color: '#e6c88a', cost: 30, perfect: true,
      bySlot: {
        weapon: { group: 'extra_phys', affix: 'prefix', text: '获得 {0}% 物理伤害作为额外物理伤害', v: [[15, 20]], tags: ['physical', 'damage'] },
      },
    },
    {
      id: 'perfect_flames', name: '火焰', tierName: '完美', color: '#e69a6a', cost: 30, perfect: true,
      bySlot: {
        weapon: { group: 'extra_fire', affix: 'prefix', text: '获得 {0}% 伤害作为额外火焰伤害', v: [[15, 20]], tags: ['fire', 'damage'] },
      },
    },
    {
      id: 'perfect_ice', name: '冰霜', tierName: '完美', color: '#8ac8e6', cost: 30, perfect: true,
      bySlot: {
        weapon: { group: 'extra_cold', affix: 'prefix', text: '获得 {0}% 伤害作为额外冰霜伤害', v: [[15, 20]], tags: ['cold', 'damage'] },
      },
    },
  ];

  const presets = [
    {
      id: 'poe2_life_helmet', name: '生命双抗头盔', desc: 'PoE2 起手模板：T2 生命 + 火 / 冰抗，适合护甲底子。',
      baseId: 'iron_helm', ilvl: 82, influences: [],
      targets: [{ modId: 'life_flat', tier: 2 }, { modId: 'res_fire', tier: 2 }, { modId: 'res_cold', tier: 2 }],
    },
    {
      id: 'poe2_es_helmet', name: 'ES 双抗头盔', desc: '能量护盾底子：ES + 双抗，适合法系。',
      baseId: 'arcane_hood', ilvl: 82, influences: [],
      targets: [{ modId: 'es_flat', tier: 2 }, { modId: 'res_fire', tier: 2 }, { modId: 'res_light', tier: 2 }],
    },
    {
      id: 'poe2_move_boots', name: '移速血抗鞋', desc: 'T2 移速 + T2 生命 + 火抗。',
      baseId: 'iron_greaves', ilvl: 82, influences: [],
      targets: [{ modId: 'move_speed', tier: 2 }, { modId: 'life_flat', tier: 2 }, { modId: 'res_fire', tier: 2 }],
    },
    {
      id: 'poe2_phys_staff', name: '物理长棍', desc: '物理点伤 + 攻速 + 暴击，适合武僧 / 长棍。',
      baseId: 'quarterstaff', ilvl: 82, influences: [],
      targets: [{ modId: 'weapon_phys_flat', tier: 2 }, { modId: 'attack_speed', tier: 2 }, { modId: 'crit_chance_weapon', tier: 2 }],
    },
    {
      id: 'poe2_caster_wand', name: '法系法杖', desc: '法术伤害 + 施法速度 + 火焰点伤。',
      baseId: 'wand', ilvl: 82, influences: [],
      targets: [{ modId: 'spell_damage', tier: 2 }, { modId: 'cast_speed', tier: 2 }, { modId: 'weapon_fire_flat', tier: 2 }],
    },
    {
      id: 'poe2_ev_boots', name: '闪避移速鞋', desc: '闪避底子：T2 移速 + 生命 + 抗性。',
      baseId: 'scout_boots', ilvl: 82, influences: [],
      targets: [{ modId: 'move_speed', tier: 2 }, { modId: 'life_flat', tier: 2 }, { modId: 'res_fire', tier: 2 }],
    },
    {
      id: 'poe2_bow', name: '物理弓', desc: '弓：物理点伤 + 攻速 + 暴击。',
      baseId: 'bow', ilvl: 82, influences: [],
      targets: [{ modId: 'weapon_phys_flat', tier: 2 }, { modId: 'attack_speed', tier: 2 }, { modId: 'crit_chance_weapon', tier: 2 }],
    },
    {
      id: 'poe2_staff', name: '元素长杖', desc: '长杖：法术伤害 + 元素伤害 + 施法速度。',
      baseId: 'staff', ilvl: 82, influences: [],
      targets: [{ modId: 'spell_damage', tier: 2 }, { modId: 'elemental_damage', tier: 2 }, { modId: 'cast_speed', tier: 2 }],
    },
    {
      id: 'poe2_quiver', name: '血抗箭袋', desc: '箭袋：T2 生命 + 攻速 + 投射物伤害。',
      baseId: 'broadhead_quiver', ilvl: 82, influences: [],
      targets: [{ modId: 'life_flat', tier: 2 }, { modId: 'attack_speed', tier: 2 }, { modId: 'projectile_damage', tier: 2 }],
    },
    {
      id: 'poe2_body', name: '护甲血抗胸', desc: '护甲胸甲：生命 + 护甲 + 双抗。',
      baseId: 'smithing_plate', ilvl: 82, influences: [],
      targets: [{ modId: 'life_flat', tier: 2 }, { modId: 'ar_pct', tier: 2 }, { modId: 'res_fire', tier: 2 }, { modId: 'res_cold', tier: 2 }],
    },
  ];

  const omens = [
    { id: 'omen_whittling', name: '削切预兆', desc: '移除稀有物品上最低等级的一条词缀。', cost: 30, color: '#9d8ad6' },
    { id: 'omen_sinistral_erasure', name: '左旋抹除预兆', desc: '移除一条随机前缀。', cost: 18, color: '#8fa3c8' },
    { id: 'omen_dextral_erasure', name: '右旋抹除预兆', desc: '移除一条随机后缀。', cost: 18, color: '#8fa3c8' },
    { id: 'omen_sinistral_exalt', name: '左旋崇高预兆', desc: '下一次崇高只增加前缀（这里直接组合执行）。', cost: 45, color: '#e6cf9a' },
    { id: 'omen_dextral_exalt', name: '右旋崇高预兆', desc: '下一次崇高只增加后缀（这里直接组合执行）。', cost: 45, color: '#e6cf9a' },
    { id: 'omen_greater_exalt', name: '高阶崇高预兆', desc: '崇高石一次增加两条词缀（有空位时）。', cost: 85, color: '#e6cf9a' },
  ];

  const prices = {
    transmute: 0.1, augmentation: 0.2, regal: 0.5, alchemy: 0.35,
    chaos: 1, exalted: 3, divine: 220, annulment: 8, vaal: 1.5,
    omen_whittling: 30, omen_sinistral_erasure: 18, omen_dextral_erasure: 18,
    omen_sinistral_exalt: 45, omen_dextral_exalt: 45, omen_greater_exalt: 85,
  };

  const priceFields = [
    ['transmute', '蜕变石'], ['augmentation', '增幅石'], ['regal', '富豪石'],
    ['alchemy', '点金石'], ['chaos', '混沌石'], ['exalted', '崇高石'],
    ['divine', '神圣石'], ['annulment', '剥离石'], ['vaal', '瓦尔宝珠'],
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
  ];

  const actionTabs = [
    { id: 'basic', name: '通货' },
    { id: 'essence', name: '精华' },
    { id: 'omen', name: '预兆' },
  ];

  global.PoE2Data = {
    game: 'poe2',
    label: '流放之路 2',
    version: '0.3.0',
    configMode: 'static',
    slots: [
      { id: 'helmet', name: '头盔' }, { id: 'body', name: '胸甲' }, { id: 'gloves', name: '手套' },
      { id: 'boots', name: '鞋子' }, { id: 'shield', name: '盾牌' }, { id: 'focus', name: '法器' },
      { id: 'weapon', name: '武器' }, { id: 'quiver', name: '箭袋' },
      { id: 'ring', name: '戒指' }, { id: 'amulet', name: '项链' }, { id: 'belt', name: '腰带' },
    ],
    bases,
    mods,
    essences,
    fossils: [],
    bench: [],
    influences: [],
    harvestTags: [],
    presets,
    omens,
    prices,
    priceFields,
    basicActions,
    actionTabs,
    hints: {
      normal: '普通物品：用蜕变石（1 词缀魔法）或点金石（4 词缀稀有）起手。',
      magic: '魔法物品：增幅补到 2 条；强效精华可直接升稀有并保底一条；命中后用富豪升稀有。',
      rare: '稀有物品：崇高补空位，混沌替换，剥离 / 预兆处理废词缀。',
    },
    essenceHint: '强效精华：魔法 → 稀有并保底一条；完美精华：稀有物品移除 1 条并加保底。',
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = global.PoE2Data;
})(typeof window !== 'undefined' ? window : globalThis);
