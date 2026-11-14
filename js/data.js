/* 流放之路 1 做装台 · 数据层
 * 数据为常用底子 / 词缀 / 精华 / 化石 / 工艺的整理版，用于推演与教学。
 * 实际游戏数值请以官方版本为准；价格可在界面右上角设置中调整。
 */
(function (global) {
  'use strict';

  const ARMOUR = ['helmet', 'body', 'gloves', 'boots', 'shield'];
  const JEWEL = ['ring', 'amulet', 'belt'];
  const GEAR = ARMOUR.concat(JEWEL, ['quiver']);

  const t = (ilvl, ...v) => ({ ilvl, v });
  const mod = (o) => Object.assign({
    group: o.id,
    weight: 500,
    tags: [],
    slots: GEAR,
  }, o);

  /* ------------------------------------------------------------------ *
   * 底子
   * ------------------------------------------------------------------ */
  const bases = [
    // 头盔
    { id: 'hubris_circlet', name: '灵主之冠', en: 'Hubris Circlet', slot: 'helmet', ilvl: 69, defence: { es: 177 }, tags: ['armour', 'es'] },
    { id: 'royal_burgonet', name: '皇家勃艮第盔', en: 'Royal Burgonet', slot: 'helmet', ilvl: 65, defence: { ar: 644 }, tags: ['armour', 'ar'] },
    { id: 'assassin_hood', name: '刺客兜帽', en: "Assassin's Hood", slot: 'helmet', ilvl: 63, defence: { ev: 290 }, tags: ['armour', 'ev'] },

    // 胸甲
    { id: 'vaal_regalia', name: '瓦尔法衣', en: 'Vaal Regalia', slot: 'body', ilvl: 68, defence: { es: 175 }, tags: ['armour', 'es'] },
    { id: 'astral_plate', name: '星界板甲', en: 'Astral Plate', slot: 'body', ilvl: 62, defence: { ar: 703 }, tags: ['armour', 'ar'], implicit: '+12% 全部元素抗性' },
    { id: 'assassin_garb', name: '刺客之服', en: "Assassin's Garb", slot: 'body', ilvl: 63, defence: { ev: 703 }, tags: ['armour', 'ev'] },
    { id: 'saintly_chainmail', name: '圣洁锁甲', en: 'Saintly Chainmail', slot: 'body', ilvl: 60, defence: { ar: 350, es: 100 }, tags: ['armour', 'ar', 'es'] },
    { id: 'zodiac_leather', name: '十二宫皮甲', en: 'Zodiac Leather', slot: 'body', ilvl: 65, defence: { ev: 600 }, tags: ['armour', 'ev'] },

    // 手套
    { id: 'fingerless_silk', name: '无指丝绸手套', en: 'Fingerless Silk Gloves', slot: 'gloves', ilvl: 69, defence: { es: 70 }, tags: ['armour', 'es'], implicit: '法术伤害提高 20%' },
    { id: 'spiked_gloves', name: '尖刺手套', en: 'Spiked Gloves', slot: 'gloves', ilvl: 65, defence: { ar: 160 }, tags: ['armour', 'ar'], implicit: '攻击伤害提高 20%' },
    { id: 'gripped_gloves', name: '紧握手套', en: 'Gripped Gloves', slot: 'gloves', ilvl: 65, defence: { ev: 130 }, tags: ['armour', 'ev'], implicit: '投射物攻击伤害提高 20%' },

    // 鞋子
    { id: 'sorcerer_boots', name: '术士长靴', en: 'Sorcerer Boots', slot: 'boots', ilvl: 69, defence: { es: 60 }, tags: ['armour', 'es'] },
    { id: 'two_toned_boots', name: '双色调之靴', en: 'Two-Toned Boots', slot: 'boots', ilvl: 60, defence: { ar: 80, ev: 80 }, tags: ['armour', 'ar', 'ev'], implicit: '+15% 火焰与冰霜抗性' },
    { id: 'titan_greaves', name: '泰坦护胫', en: 'Titan Greaves', slot: 'boots', ilvl: 65, defence: { ar: 300 }, tags: ['armour', 'ar'] },
    { id: 'assassin_boots', name: '刺客长靴', en: "Assassin's Boots", slot: 'boots', ilvl: 63, defence: { ev: 200 }, tags: ['armour', 'ev'] },

    // 盾
    { id: 'spirit_shield', name: '灵能之盾', en: 'Spirit Shield', slot: 'shield', ilvl: 69, defence: { es: 120 }, tags: ['armour', 'es', 'shield'] },
    { id: 'colossal_shield', name: '巨型塔盾', en: 'Colossal Tower Shield', slot: 'shield', ilvl: 65, defence: { ar: 400 }, tags: ['armour', 'ar', 'shield'] },

    // 武器
    { id: 'imbued_wand', name: '附魔短杖', en: 'Imbued Wand', slot: 'weapon', ilvl: 68, tags: ['weapon', 'wand', 'caster'], weapon: { type: 'wand', class: ['caster'], phys: [22, 41], aps: 1.5, crit: 7.0 }, implicit: '法术伤害提高 40%' },
    { id: 'profane_wand', name: '亵渎短杖', en: 'Profane Wand', slot: 'weapon', ilvl: 68, tags: ['weapon', 'wand', 'caster'], weapon: { type: 'wand', class: ['caster'], phys: [20, 38], aps: 1.5, crit: 7.0 }, implicit: '施法速度提高 8%' },
    { id: 'opal_wand', name: '欧珀短杖', en: 'Opal Wand', slot: 'weapon', ilvl: 68, tags: ['weapon', 'wand', 'caster'], weapon: { type: 'wand', class: ['caster'], phys: [25, 47], aps: 1.4, crit: 7.5 }, implicit: '元素伤害提高 15%' },
    { id: 'void_sceptre', name: '虚空权杖', en: 'Void Sceptre', slot: 'weapon', ilvl: 68, tags: ['weapon', 'sceptre', 'caster', 'attack'], weapon: { type: 'sceptre', class: ['caster', 'attack'], phys: [35, 65], aps: 1.2, crit: 6.5 }, implicit: '元素伤害提高 30%' },
    { id: 'platinum_kris', name: '白金短剑', en: 'Platinum Kris', slot: 'weapon', ilvl: 68, tags: ['weapon', 'dagger', 'caster', 'attack'], weapon: { type: 'dagger', class: ['caster', 'attack'], phys: [30, 70], aps: 1.4, crit: 7.5 }, implicit: '暴击率提高 30%' },
    { id: 'imperial_claw', name: '帝国之爪', en: 'Imperial Claw', slot: 'weapon', ilvl: 68, tags: ['weapon', 'claw', 'attack'], weapon: { type: 'claw', class: ['attack'], phys: [26, 60], aps: 1.7, crit: 6.5 }, implicit: '物理攻击伤害的 1.5% 转化为生命' },
    { id: 'jewelled_foil', name: '宝石细剑', en: 'Jewelled Foil', slot: 'weapon', ilvl: 68, tags: ['weapon', 'sword', 'attack'], weapon: { type: 'sword', class: ['attack'], phys: [20, 55], aps: 1.6, crit: 5.5 }, implicit: '攻击速度提高 20%' },
    { id: 'exquisite_blade', name: '精致之刃', en: 'Exquisite Blade', slot: 'weapon', ilvl: 68, tags: ['weapon', 'sword', 'attack'], weapon: { type: 'sword', class: ['attack'], phys: [60, 120], aps: 1.3, crit: 7.0 }, implicit: '暴击伤害加成 +25%' },
    { id: 'siege_axe', name: '攻城斧', en: 'Siege Axe', slot: 'weapon', ilvl: 68, tags: ['weapon', 'axe', 'attack'], weapon: { type: 'axe', class: ['attack'], phys: [45, 90], aps: 1.2, crit: 5.0 }, implicit: '物理伤害提高 25%' },
    { id: 'thicket_bow', name: '荆棘弓', en: 'Thicket Bow', slot: 'weapon', ilvl: 68, tags: ['weapon', 'bow', 'attack'], weapon: { type: 'bow', class: ['attack'], phys: [30, 90], aps: 1.4, crit: 6.0 }, implicit: '攻击速度提高 10%' },
    { id: 'spine_bow', name: '脊弓', en: 'Spine Bow', slot: 'weapon', ilvl: 68, tags: ['weapon', 'bow', 'attack'], weapon: { type: 'bow', class: ['attack'], phys: [36, 100], aps: 1.3, crit: 6.5 }, implicit: '暴击率提高 30%' },
    { id: 'citadel_bow', name: '城塞弓', en: 'Citadel Bow', slot: 'weapon', ilvl: 68, tags: ['weapon', 'bow', 'attack'], weapon: { type: 'bow', class: ['attack'], phys: [45, 120], aps: 1.2, crit: 5.0 }, implicit: '物理伤害提高 25%' },
    { id: 'judgement_staff', name: '审判长杖', en: 'Judgement Staff', slot: 'weapon', ilvl: 68, tags: ['weapon', 'staff', 'caster'], weapon: { type: 'staff', class: ['caster'], phys: [50, 100], aps: 1.1, crit: 6.0 }, implicit: '法术格挡率 +20%' },

    // 戒指
    { id: 'opal_ring', name: '欧珀戒指', en: 'Opal Ring', slot: 'ring', ilvl: 68, tags: ['jewellery', 'ring'], implicit: '元素伤害提高 15%' },
    { id: 'steel_ring', name: '钢制戒指', en: 'Steel Ring', slot: 'ring', ilvl: 68, tags: ['jewellery', 'ring'], implicit: '攻击附加 4 - 8 点物理伤害' },
    { id: 'vermillion_ring', name: '朱红戒指', en: 'Vermillion Ring', slot: 'ring', ilvl: 68, tags: ['jewellery', 'ring'], implicit: '+10 最大生命' },
    { id: 'prismatic_ring', name: '棱彩戒指', en: 'Prismatic Ring', slot: 'ring', ilvl: 68, tags: ['jewellery', 'ring'], implicit: '+8% 全部元素抗性' },
    { id: 'amethyst_ring', name: '紫水晶戒指', en: 'Amethyst Ring', slot: 'ring', ilvl: 68, tags: ['jewellery', 'ring'], implicit: '+17% 混沌抗性' },
    { id: 'diamond_ring', name: '钻石戒指', en: 'Diamond Ring', slot: 'ring', ilvl: 68, tags: ['jewellery', 'ring'], implicit: '暴击率提高 30%' },

    // 项链
    { id: 'onyx_amulet', name: '玛瑙护身符', en: 'Onyx Amulet', slot: 'amulet', ilvl: 68, tags: ['jewellery', 'amulet'], implicit: '+16 全部属性' },
    { id: 'marble_amulet', name: '大理石护身符', en: 'Marble Amulet', slot: 'amulet', ilvl: 68, tags: ['jewellery', 'amulet'], implicit: '每秒回复 1.5% 生命' },
    { id: 'citrine_amulet', name: '黄水晶护身符', en: 'Citrine Amulet', slot: 'amulet', ilvl: 68, tags: ['jewellery', 'amulet'], implicit: '+25 力量与敏捷' },
    { id: 'jade_amulet', name: '翡翠护身符', en: 'Jade Amulet', slot: 'amulet', ilvl: 68, tags: ['jewellery', 'amulet'], implicit: '+25 敏捷' },
    { id: 'amber_amulet', name: '琥珀护身符', en: 'Amber Amulet', slot: 'amulet', ilvl: 68, tags: ['jewellery', 'amulet'], implicit: '+25 力量' },
    { id: 'lapis_amulet', name: '青金石护身符', en: 'Lapis Amulet', slot: 'amulet', ilvl: 68, tags: ['jewellery', 'amulet'], implicit: '+25 智慧' },
    { id: 'gold_amulet', name: '金护身符', en: 'Gold Amulet', slot: 'amulet', ilvl: 68, tags: ['jewellery', 'amulet'], implicit: '物品稀有度提高 30%' },

    // 腰带
    { id: 'leather_belt', name: '皮革腰带', en: 'Leather Belt', slot: 'belt', ilvl: 68, tags: ['jewellery', 'belt'], implicit: '+25 最大生命' },
    { id: 'heavy_belt', name: '重腰带', en: 'Heavy Belt', slot: 'belt', ilvl: 68, tags: ['jewellery', 'belt'], implicit: '+35 力量' },
    { id: 'rustic_sash', name: '乡村腰带', en: 'Rustic Sash', slot: 'belt', ilvl: 68, tags: ['jewellery', 'belt'], implicit: '物理伤害提高 25%' },
    { id: 'crystal_belt', name: '水晶腰带', en: 'Crystal Belt', slot: 'belt', ilvl: 68, tags: ['jewellery', 'belt'], implicit: '+60 最大能量护盾' },
    { id: 'vanguard_belt', name: '先锋腰带', en: 'Vanguard Belt', slot: 'belt', ilvl: 68, tags: ['jewellery', 'belt'], implicit: '护甲与闪避值提高 20%' },
    { id: 'stygian_vise', name: '冥河腰带', en: 'Stygian Vise', slot: 'belt', ilvl: 68, tags: ['jewellery', 'belt'], implicit: '拥有 1 个深渊插槽' },

    // 箭袋
    { id: 'broadhead_quiver', name: '宽头箭袋', en: 'Broadhead Quiver', slot: 'quiver', ilvl: 68, tags: ['quiver'], implicit: '攻击附加 5 - 10 点物理伤害' },
    { id: 'spike_point_quiver', name: '尖头箭袋', en: 'Spike-Point Arrow Quiver', slot: 'quiver', ilvl: 68, tags: ['quiver'], implicit: '暴击率提高 30%' },
  ];

  /* ------------------------------------------------------------------ *
   * 词缀（前缀 / 后缀）
   * v: [[min,max], ...] 每个数字是一条属性
   * ------------------------------------------------------------------ */
  const mods = [
    /* ---------------- 前缀：生命 / 防御 ---------------- */
    mod({
      id: 'life_flat', name: '最大生命', affix: 'prefix', tags: ['life'], weight: 1600, group: 'life',
      text: '+{0} 最大生命',
      tiers: [
        t(1, [10, 19]), t(11, [20, 29]), t(23, [30, 39]), t(35, [40, 49]),
        t(45, [50, 59]), t(55, [60, 69]), t(65, [70, 79]), t(74, [80, 89]),
        t(80, [90, 99]), t(86, [100, 109]),
      ],
    }),
    mod({
      id: 'life_hybrid_es', name: '生命 + 能量护盾', affix: 'prefix', tags: ['life', 'defence', 'es'],
      weight: 560, slots: ARMOUR, def: ['es'],
      text: '+{0} 最大生命\n+{1} 最大能量护盾',
      tiers: [
        t(1, [5, 9], [3, 5]), t(20, [10, 14], [6, 9]), t(40, [15, 19], [10, 14]),
        t(60, [20, 24], [15, 20]), t(75, [25, 29], [21, 28]), t(84, [30, 34], [29, 38]),
      ],
    }),
    mod({
      id: 'life_hybrid_ar', name: '生命 + 护甲', affix: 'prefix', tags: ['life', 'defence', 'armour'],
      weight: 560, slots: ARMOUR, def: ['ar'],
      text: '+{0} 最大生命\n+{1} 护甲',
      tiers: [
        t(1, [5, 9], [10, 20]), t(20, [10, 14], [21, 40]), t(40, [15, 19], [41, 70]),
        t(60, [20, 24], [71, 110]), t(75, [25, 29], [111, 160]), t(84, [30, 34], [161, 220]),
      ],
    }),
    mod({
      id: 'life_hybrid_ev', name: '生命 + 闪避', affix: 'prefix', tags: ['life', 'defence', 'evasion'],
      weight: 560, slots: ARMOUR, def: ['ev'],
      text: '+{0} 最大生命\n+{1} 闪避值',
      tiers: [
        t(1, [5, 9], [8, 16]), t(20, [10, 14], [17, 32]), t(40, [15, 19], [33, 56]),
        t(60, [20, 24], [57, 88]), t(75, [25, 29], [89, 128]), t(84, [30, 34], [129, 180]),
      ],
    }),
    mod({
      id: 'es_flat', name: '最大能量护盾', affix: 'prefix', tags: ['defence', 'es'], weight: 1150,
      slots: ARMOUR, def: ['es'], text: '+{0} 最大能量护盾',
      tiers: [
        t(1, [3, 5]), t(15, [6, 11]), t(30, [12, 18]), t(45, [19, 26]),
        t(60, [27, 35]), t(70, [36, 45]), t(78, [46, 55]), t(84, [56, 65]), t(86, [66, 75]),
      ],
    }),
    mod({
      id: 'es_pct', name: '能量护盾提高', affix: 'prefix', tags: ['defence', 'es'], weight: 620,
      slots: ARMOUR, def: ['es'], text: '{0}% 最大能量护盾提高',
      tiers: [
        t(1, [11, 20]), t(20, [21, 32]), t(40, [33, 44]), t(55, [45, 56]),
        t(68, [57, 70]), t(76, [71, 85]), t(83, [86, 100]), t(86, [101, 120]),
      ],
    }),
    mod({
      id: 'ar_flat', name: '护甲', affix: 'prefix', tags: ['defence', 'armour'], weight: 1150,
      slots: ARMOUR, def: ['ar'], text: '+{0} 护甲',
      tiers: [
        t(1, [3, 10]), t(15, [11, 30]), t(30, [31, 60]), t(45, [61, 100]),
        t(60, [101, 150]), t(70, [151, 220]), t(78, [221, 300]), t(84, [301, 380]), t(86, [381, 450]),
      ],
    }),
    mod({
      id: 'ar_pct', name: '护甲提高', affix: 'prefix', tags: ['defence', 'armour'], weight: 620,
      slots: ARMOUR, def: ['ar'], text: '{0}% 护甲提高',
      tiers: [
        t(1, [11, 20]), t(20, [21, 32]), t(40, [33, 44]), t(55, [45, 56]),
        t(68, [57, 70]), t(76, [71, 85]), t(83, [86, 100]), t(86, [101, 120]),
      ],
    }),
    mod({
      id: 'ev_flat', name: '闪避值', affix: 'prefix', tags: ['defence', 'evasion'], weight: 1150,
      slots: ARMOUR, def: ['ev'], text: '+{0} 闪避值',
      tiers: [
        t(1, [3, 8]), t(15, [9, 25]), t(30, [26, 50]), t(45, [51, 85]),
        t(60, [86, 130]), t(70, [131, 190]), t(78, [191, 260]), t(84, [261, 340]), t(86, [341, 420]),
      ],
    }),
    mod({
      id: 'ev_pct', name: '闪避值提高', affix: 'prefix', tags: ['defence', 'evasion'], weight: 620,
      slots: ARMOUR, def: ['ev'], text: '{0}% 闪避值提高',
      tiers: [
        t(1, [11, 20]), t(20, [21, 32]), t(40, [33, 44]), t(55, [45, 56]),
        t(68, [57, 70]), t(76, [71, 85]), t(83, [86, 100]), t(86, [101, 120]),
      ],
    }),
    mod({
      id: 'mana_flat', name: '最大魔力', affix: 'prefix', tags: ['mana'], weight: 780,
      text: '+{0} 最大魔力',
      tiers: [
        t(1, [10, 19]), t(20, [20, 29]), t(40, [30, 39]), t(60, [40, 49]),
        t(70, [50, 59]), t(80, [60, 69]), t(85, [70, 79]), t(86, [80, 89]),
      ],
    }),
    mod({
      id: 'belt_es_flat', name: '腰带能量护盾', affix: 'prefix', tags: ['defence', 'es'], weight: 800,
      slots: ['belt'], text: '+{0} 最大能量护盾',
      tiers: [
        t(1, [5, 9]), t(20, [10, 19]), t(40, [20, 29]), t(60, [30, 39]),
        t(75, [40, 49]), t(84, [50, 60]),
      ],
    }),
    mod({
      id: 'belt_ar_flat', name: '腰带护甲', affix: 'prefix', tags: ['defence', 'armour'], weight: 800,
      slots: ['belt'], text: '+{0} 护甲',
      tiers: [
        t(1, [10, 25]), t(20, [26, 55]), t(40, [56, 100]), t(60, [101, 160]),
        t(75, [161, 230]), t(84, [231, 300]),
      ],
    }),
    mod({
      id: 'belt_ev_flat', name: '腰带闪避', affix: 'prefix', tags: ['defence', 'evasion'], weight: 800,
      slots: ['belt'], text: '+{0} 闪避值',
      tiers: [
        t(1, [8, 20]), t(20, [21, 45]), t(40, [46, 85]), t(60, [86, 135]),
        t(75, [136, 195]), t(84, [196, 260]),
      ],
    }),

    /* ---------------- 前缀：攻击附加伤害 ---------------- */
    mod({
      id: 'added_phys_attack', name: '附加物理伤害', affix: 'prefix', tags: ['physical', 'attack'], weight: 650,
      slots: ['gloves', 'ring', 'amulet', 'quiver'], weaponClass: 'attack',
      text: '增加 {0} 到 {1} 点物理伤害',
      tiers: [
        t(1, [1, 2], [2, 4]), t(20, [3, 5], [7, 9]), t(40, [6, 9], [12, 16]),
        t(60, [10, 14], [19, 25]), t(75, [15, 20], [27, 35]), t(83, [21, 27], [37, 47]),
      ],
    }),
    mod({
      id: 'added_fire_attack', name: '附加火焰伤害', affix: 'prefix', tags: ['fire', 'attack'], weight: 620,
      slots: ['gloves', 'ring', 'amulet', 'quiver'], weaponClass: 'attack',
      text: '增加 {0} 到 {1} 点火焰伤害',
      tiers: [
        t(1, [1, 2], [2, 3]), t(20, [3, 5], [6, 8]), t(40, [6, 9], [11, 15]),
        t(60, [10, 14], [18, 24]), t(75, [15, 20], [26, 34]), t(83, [21, 26], [35, 45]),
      ],
    }),
    mod({
      id: 'added_cold_attack', name: '附加冰霜伤害', affix: 'prefix', tags: ['cold', 'attack'], weight: 620,
      slots: ['gloves', 'ring', 'amulet', 'quiver'], weaponClass: 'attack',
      text: '增加 {0} 到 {1} 点冰霜伤害',
      tiers: [
        t(1, [1, 2], [2, 3]), t(20, [3, 5], [6, 8]), t(40, [6, 9], [11, 15]),
        t(60, [10, 14], [18, 24]), t(75, [15, 20], [26, 34]), t(83, [21, 26], [35, 45]),
      ],
    }),
    mod({
      id: 'added_light_attack', name: '附加闪电伤害', affix: 'prefix', tags: ['lightning', 'attack'], weight: 620,
      slots: ['gloves', 'ring', 'amulet', 'quiver'], weaponClass: 'attack',
      text: '增加 {0} 到 {1} 点闪电伤害',
      tiers: [
        t(1, [1, 2], [3, 5]), t(20, [2, 4], [8, 12]), t(40, [4, 7], [16, 22]),
        t(60, [8, 11], [26, 36]), t(75, [12, 16], [38, 52]), t(83, [17, 22], [54, 70]),
      ],
    }),
    mod({
      id: 'added_fire_spell', name: '法术附加火焰伤害', affix: 'prefix', tags: ['fire', 'caster'], weight: 520,
      slots: ['weapon', 'shield'], weaponClass: 'caster',
      text: '法术附加 {0} 到 {1} 点火焰伤害',
      tiers: [
        t(1, [1, 2], [2, 4]), t(20, [3, 5], [7, 10]), t(40, [6, 9], [13, 18]),
        t(60, [10, 14], [21, 28]), t(75, [15, 19], [30, 39]), t(83, [20, 25], [41, 52]),
      ],
    }),
    mod({
      id: 'added_cold_spell', name: '法术附加冰霜伤害', affix: 'prefix', tags: ['cold', 'caster'], weight: 520,
      slots: ['weapon', 'shield'], weaponClass: 'caster',
      text: '法术附加 {0} 到 {1} 点冰霜伤害',
      tiers: [
        t(1, [1, 2], [2, 4]), t(20, [3, 5], [7, 10]), t(40, [6, 9], [13, 18]),
        t(60, [10, 14], [21, 28]), t(75, [15, 19], [30, 39]), t(83, [20, 25], [41, 52]),
      ],
    }),
    mod({
      id: 'added_light_spell', name: '法术附加闪电伤害', affix: 'prefix', tags: ['lightning', 'caster'], weight: 520,
      slots: ['weapon', 'shield'], weaponClass: 'caster',
      text: '法术附加 {0} 到 {1} 点闪电伤害',
      tiers: [
        t(1, [1, 2], [3, 5]), t(20, [2, 4], [9, 13]), t(40, [4, 7], [18, 25]),
        t(60, [8, 11], [29, 40]), t(75, [12, 16], [42, 57]), t(83, [17, 22], [59, 76]),
      ],
    }),

    /* ---------------- 前缀：武器 ---------------- */
    mod({
      id: 'weapon_phys_flat', name: '附加物理伤害', affix: 'prefix', tags: ['physical', 'attack'], weight: 900,
      slots: ['weapon'], weaponClass: 'attack', text: '增加 {0} 到 {1} 点物理伤害',
      tiers: [
        t(1, [1, 2], [2, 4]), t(15, [3, 5], [6, 9]), t(30, [6, 9], [10, 15]),
        t(45, [10, 14], [16, 22]), t(60, [15, 20], [23, 30]), t(70, [21, 26], [31, 40]),
        t(80, [27, 34], [41, 52]), t(84, [35, 42], [53, 65]),
      ],
    }),
    mod({
      id: 'weapon_phys_pct', name: '物理伤害提高', affix: 'prefix', tags: ['physical', 'attack'], weight: 900,
      slots: ['weapon'], weaponClass: 'attack', text: '{0}% 物理伤害提高',
      tiers: [
        t(1, [10, 19]), t(20, [20, 39]), t(40, [40, 59]), t(55, [60, 79]),
        t(68, [80, 99]), t(76, [100, 119]), t(83, [120, 149]), t(86, [150, 179]),
      ],
    }),
    mod({
      id: 'weapon_fire_flat', name: '附加火焰伤害', affix: 'prefix', tags: ['fire', 'attack'], weight: 620,
      slots: ['weapon'], weaponClass: 'attack', text: '增加 {0} 到 {1} 点火焰伤害',
      tiers: [
        t(1, [1, 2], [3, 5]), t(20, [3, 5], [8, 12]), t(40, [6, 9], [16, 22]),
        t(60, [10, 14], [26, 36]), t(75, [15, 20], [38, 52]), t(83, [21, 28], [54, 72]),
      ],
    }),
    mod({
      id: 'weapon_cold_flat', name: '附加冰霜伤害', affix: 'prefix', tags: ['cold', 'attack'], weight: 620,
      slots: ['weapon'], weaponClass: 'attack', text: '增加 {0} 到 {1} 点冰霜伤害',
      tiers: [
        t(1, [1, 2], [3, 5]), t(20, [3, 5], [8, 12]), t(40, [6, 9], [16, 22]),
        t(60, [10, 14], [26, 36]), t(75, [15, 20], [38, 52]), t(83, [21, 28], [54, 72]),
      ],
    }),
    mod({
      id: 'weapon_light_flat', name: '附加闪电伤害', affix: 'prefix', tags: ['lightning', 'attack'], weight: 620,
      slots: ['weapon'], weaponClass: 'attack', text: '增加 {0} 到 {1} 点闪电伤害',
      tiers: [
        t(1, [1, 2], [4, 7]), t(20, [2, 4], [11, 16]), t(40, [4, 7], [22, 31]),
        t(60, [8, 11], [36, 50]), t(75, [12, 16], [52, 70]), t(83, [17, 22], [72, 96]),
      ],
    }),
    mod({
      id: 'ele_pct_attack', name: '攻击元素伤害提高', affix: 'prefix', tags: ['elemental', 'attack'], weight: 520,
      slots: ['weapon', 'gloves'], weaponClass: 'any', text: '攻击技能的元素伤害提高 {0}%',
      tiers: [
        t(1, [10, 15]), t(20, [16, 21]), t(40, [22, 27]), t(55, [28, 33]),
        t(68, [34, 39]), t(76, [40, 45]), t(83, [46, 52]),
      ],
    }),
    mod({
      id: 'quiver_phys_pct', name: '物理伤害提高', affix: 'prefix', tags: ['physical', 'attack'], weight: 650,
      slots: ['quiver'], text: '{0}% 物理伤害提高',
      tiers: [
        t(1, [10, 19]), t(20, [20, 29]), t(40, [30, 39]), t(55, [40, 49]),
        t(68, [50, 59]), t(76, [60, 69]), t(83, [70, 79]),
      ],
    }),

    /* ---------------- 前缀：法术 / 宝石 / 召唤 / 影响 ---------------- */
    mod({
      id: 'spell_damage', name: '法术伤害提高', affix: 'prefix', tags: ['caster', 'damage'], weight: 820,
      slots: ['weapon', 'shield'], weaponClass: 'caster', text: '法术伤害提高 {0}%',
      tiers: [
        t(1, [10, 19]), t(20, [20, 29]), t(40, [30, 39]), t(55, [40, 49]),
        t(68, [50, 59]), t(76, [60, 69]), t(83, [70, 79]), t(86, [80, 89]),
      ],
    }),
    mod({
      id: 'gem_level_all', name: '所有技能石等级 +1', affix: 'prefix', tags: ['gem'], weight: 45,
      slots: ['amulet'], text: '+1 所有技能石等级',
      tiers: [t(80, [1, 1])],
    }),
    mod({
      id: 'gem_level_spell', name: '法术技能石等级 +1', affix: 'prefix', tags: ['gem', 'caster'], weight: 55,
      slots: ['weapon'], weaponClass: 'caster', text: '+1 所有法术技能石等级',
      tiers: [t(55, [1, 1]), t(84, [2, 2])],
    }),
    mod({
      id: 'gem_level_minion', name: '召唤技能石等级 +2', affix: 'prefix', tags: ['gem', 'minion'], weight: 60,
      slots: ['helmet'], influence: 'elder', text: '+2 所有召唤技能石等级',
      tiers: [t(68, [2, 2])],
    }),
    mod({
      id: 'minion_damage', name: '召唤物伤害提高', affix: 'prefix', tags: ['minion', 'damage'], weight: 320,
      slots: ['helmet', 'body'], text: '召唤物伤害提高 {0}%',
      tiers: [
        t(1, [10, 15]), t(20, [16, 22]), t(40, [23, 29]), t(55, [30, 36]),
        t(68, [37, 43]), t(76, [44, 50]), t(83, [51, 58]),
      ],
    }),
    mod({
      id: 'aura_effect', name: '非诅咒光环效果提高', affix: 'prefix', tags: ['aura'], weight: 140,
      slots: ['helmet', 'body'], influence: 'crusader', text: '非诅咒光环效果提高 {0}%',
      tiers: [
        t(68, [6, 8]), t(75, [9, 11]), t(82, [12, 14]), t(86, [15, 18]),
      ],
    }),
    mod({
      id: 'elder_life_pct', name: '最大生命提高', affix: 'prefix', tags: ['life'], weight: 140,
      slots: ['body'], influence: 'elder', text: '最大生命提高 {0}%',
      tiers: [
        t(68, [5, 7]), t(75, [8, 10]), t(82, [11, 13]), t(86, [14, 16]),
      ],
    }),
    mod({
      id: 'phys_as_extra', name: '获得物理伤害的额外元素伤害', affix: 'prefix', tags: ['physical', 'elemental'], weight: 120,
      slots: ['weapon', 'amulet'], influence: 'shaper', text: '获得 {0}% 物理伤害的额外火焰伤害',
      tiers: [
        t(68, [5, 7]), t(75, [8, 10]), t(82, [11, 13]), t(86, [14, 16]),
      ],
    }),

    /* ---------------- 后缀：抗性 / 属性 ---------------- */
    mod({
      id: 'res_fire', name: '火焰抗性', affix: 'suffix', tags: ['resistance', 'fire'], weight: 1200,
      text: '+{0}% 火焰抗性',
      tiers: [
        t(1, [6, 11]), t(12, [12, 17]), t(24, [18, 23]), t(36, [24, 29]),
        t(48, [30, 35]), t(60, [36, 41]), t(72, [42, 45]), t(84, [46, 48]),
      ],
    }),
    mod({
      id: 'res_cold', name: '冰霜抗性', affix: 'suffix', tags: ['resistance', 'cold'], weight: 1200,
      text: '+{0}% 冰霜抗性',
      tiers: [
        t(1, [6, 11]), t(12, [12, 17]), t(24, [18, 23]), t(36, [24, 29]),
        t(48, [30, 35]), t(60, [36, 41]), t(72, [42, 45]), t(84, [46, 48]),
      ],
    }),
    mod({
      id: 'res_light', name: '闪电抗性', affix: 'suffix', tags: ['resistance', 'lightning'], weight: 1200,
      text: '+{0}% 闪电抗性',
      tiers: [
        t(1, [6, 11]), t(12, [12, 17]), t(24, [18, 23]), t(36, [24, 29]),
        t(48, [30, 35]), t(60, [36, 41]), t(72, [42, 45]), t(84, [46, 48]),
      ],
    }),
    mod({
      id: 'res_chaos', name: '混沌抗性', affix: 'suffix', tags: ['resistance', 'chaos'], weight: 460,
      text: '+{0}% 混沌抗性',
      tiers: [
        t(1, [5, 9]), t(20, [10, 14]), t(40, [15, 19]), t(60, [20, 24]),
        t(75, [25, 29]), t(84, [30, 35]),
      ],
    }),
    mod({
      id: 'all_res', name: '全元素抗性', affix: 'suffix', tags: ['resistance', 'elemental'], weight: 300,
      text: '+{0}% 全部元素抗性',
      tiers: [
        t(1, [4, 7]), t(30, [8, 11]), t(50, [12, 15]), t(70, [16, 18]), t(84, [19, 20]),
      ],
    }),
    mod({
      id: 'str', name: '力量', affix: 'suffix', tags: ['attribute'], weight: 760,
      text: '+{0} 力量',
      tiers: [
        t(1, [8, 12]), t(20, [13, 17]), t(40, [18, 22]), t(55, [23, 27]),
        t(70, [28, 32]), t(80, [33, 37]), t(86, [38, 42]),
      ],
    }),
    mod({
      id: 'dex', name: '敏捷', affix: 'suffix', tags: ['attribute'], weight: 760,
      text: '+{0} 敏捷',
      tiers: [
        t(1, [8, 12]), t(20, [13, 17]), t(40, [18, 22]), t(55, [23, 27]),
        t(70, [28, 32]), t(80, [33, 37]), t(86, [38, 42]),
      ],
    }),
    mod({
      id: 'int', name: '智慧', affix: 'suffix', tags: ['attribute'], weight: 760,
      text: '+{0} 智慧',
      tiers: [
        t(1, [8, 12]), t(20, [13, 17]), t(40, [18, 22]), t(55, [23, 27]),
        t(70, [28, 32]), t(80, [33, 37]), t(86, [38, 42]),
      ],
    }),
    mod({
      id: 'all_attributes', name: '全属性', affix: 'suffix', tags: ['attribute'], weight: 190,
      slots: ['ring', 'amulet'], text: '+{0} 全部属性',
      tiers: [
        t(1, [5, 8]), t(30, [9, 12]), t(50, [13, 16]), t(70, [17, 20]), t(84, [21, 24]),
      ],
    }),

    /* ---------------- 后缀：攻防 / 速度 / 暴击 ---------------- */
    mod({
      id: 'accuracy', name: '命中值', affix: 'suffix', tags: ['attack'], weight: 500,
      slots: ['gloves', 'ring', 'amulet', 'quiver', 'weapon'], text: '+{0} 命中值',
      tiers: [
        t(1, [80, 120]), t(20, [121, 200]), t(40, [201, 300]), t(60, [301, 400]),
        t(75, [401, 500]), t(84, [501, 600]),
      ],
    }),
    mod({
      id: 'attack_speed', name: '攻击速度', affix: 'suffix', tags: ['speed', 'attack'], weight: 560,
      slots: ['gloves', 'quiver', 'weapon'], weaponClass: 'attack', text: '攻击速度提高 {0}%',
      tiers: [
        t(1, [5, 7]), t(20, [8, 10]), t(40, [11, 13]), t(60, [14, 16]),
        t(80, [17, 18]), t(86, [19, 20]),
      ],
    }),
    mod({
      id: 'cast_speed', name: '施法速度', affix: 'suffix', tags: ['speed', 'caster'], weight: 520,
      slots: ['gloves', 'ring', 'amulet', 'weapon'], weaponClass: 'caster', text: '施法速度提高 {0}%',
      tiers: [
        t(1, [5, 7]), t(20, [8, 10]), t(40, [11, 13]), t(60, [14, 16]),
        t(80, [17, 18]), t(86, [19, 20]),
      ],
    }),
    mod({
      id: 'crit_multi', name: '暴击伤害加成', affix: 'suffix', tags: ['critical'], weight: 320,
      slots: ['ring', 'amulet', 'weapon'], text: '+{0}% 暴击伤害加成',
      tiers: [
        t(1, [10, 15]), t(20, [16, 20]), t(40, [21, 25]), t(60, [26, 30]),
        t(75, [31, 35]), t(84, [36, 40]),
      ],
    }),
    mod({
      id: 'crit_chance_weapon', name: '攻击暴击率', affix: 'suffix', tags: ['critical', 'attack'], weight: 420,
      slots: ['weapon'], weaponClass: 'attack', text: '攻击暴击率提高 {0}%',
      tiers: [
        t(1, [10, 15]), t(20, [16, 20]), t(40, [21, 25]), t(60, [26, 28]),
        t(75, [29, 31]), t(84, [32, 35]),
      ],
    }),
    mod({
      id: 'spell_crit', name: '法术暴击率', affix: 'suffix', tags: ['critical', 'caster'], weight: 420,
      slots: ['weapon'], weaponClass: 'caster', text: '法术暴击率提高 {0}%',
      tiers: [
        t(1, [10, 15]), t(20, [16, 20]), t(40, [21, 25]), t(60, [26, 28]),
        t(75, [29, 31]), t(84, [32, 35]),
      ],
    }),
    mod({
      id: 'move_speed', name: '移动速度', affix: 'suffix', tags: ['speed'], weight: 900,
      slots: ['boots'], text: '移动速度提高 {0}%',
      tiers: [
        t(1, [10, 15]), t(20, [16, 20]), t(40, [21, 25]), t(60, [26, 30]), t(80, [31, 35]),
      ],
    }),
    mod({
      id: 'life_regen', name: '生命回复', affix: 'suffix', tags: ['life'], weight: 460,
      slots: ['belt', 'ring', 'amulet'], text: '每秒回复 {0} 点生命',
      tiers: [
        t(1, [10, 15]), t(20, [16, 25]), t(40, [26, 40]), t(60, [41, 60]),
        t(75, [61, 80]), t(84, [81, 100]),
      ],
    }),
    mod({
      id: 'mana_regen', name: '魔力回复', affix: 'suffix', tags: ['mana'], weight: 460,
      text: '魔力回复速度提高 {0}%',
      tiers: [
        t(1, [10, 15]), t(20, [16, 20]), t(40, [21, 25]), t(55, [26, 30]),
        t(70, [31, 35]), t(80, [36, 40]), t(86, [41, 45]),
      ],
    }),
    mod({
      id: 'spell_suppression', name: '法术压制', affix: 'suffix', tags: ['defence', 'evasion'], weight: 520,
      slots: ['helmet', 'body', 'gloves', 'boots', 'shield'], def: ['ev'], text: '+{0}% 法术压制率',
      tiers: [
        t(1, [5, 7]), t(20, [8, 10]), t(40, [11, 13]), t(60, [14, 16]),
        t(75, [17, 19]), t(84, [20, 22]),
      ],
    }),
    mod({
      id: 'ailment_avoid', name: '元素异常免疫', affix: 'suffix', tags: ['defence'], weight: 420,
      slots: ['helmet', 'gloves', 'boots'], text: '{0}% 几率避免元素异常状态',
      tiers: [
        t(1, [10, 15]), t(20, [16, 20]), t(40, [21, 25]), t(60, [26, 30]),
        t(75, [31, 35]), t(84, [36, 40]),
      ],
    }),
    mod({
      id: 'stun_avoid', name: '眩晕免疫', affix: 'suffix', tags: ['defence'], weight: 320,
      slots: ['helmet', 'gloves', 'boots'], text: '{0}% 几率避免被眩晕',
      tiers: [
        t(1, [10, 15]), t(20, [16, 20]), t(40, [21, 25]), t(60, [26, 30]),
        t(75, [31, 35]), t(84, [36, 40]),
      ],
    }),
    mod({
      id: 'block', name: '格挡率', affix: 'suffix', tags: ['defence'], weight: 420,
      slots: ['shield'], text: '+{0}% 格挡率',
      tiers: [
        t(1, [3, 4]), t(20, [5, 6]), t(40, [7, 8]), t(60, [9, 10]), t(80, [11, 12]),
      ],
    }),
    mod({
      id: 'spell_block', name: '法术格挡率', affix: 'suffix', tags: ['defence'], weight: 320,
      slots: ['shield'], text: '+{0}% 法术格挡率',
      tiers: [
        t(1, [3, 4]), t(20, [5, 6]), t(40, [7, 8]), t(60, [9, 10]), t(80, [11, 12]),
      ],
    }),

    /* ---------------- 后缀：功能 ---------------- */
    mod({
      id: 'flask_effect', name: '药剂效果', affix: 'suffix', tags: ['flask'], weight: 420,
      slots: ['belt'], text: '药剂效果提高 {0}%',
      tiers: [
        t(1, [5, 8]), t(20, [9, 12]), t(40, [13, 16]), t(60, [17, 20]), t(80, [21, 25]),
      ],
    }),
    mod({
      id: 'flask_charges', name: '药剂充能获取', affix: 'suffix', tags: ['flask'], weight: 420,
      slots: ['belt'], text: '药剂充能获取提高 {0}%',
      tiers: [
        t(1, [5, 10]), t(20, [11, 16]), t(40, [17, 22]), t(60, [23, 28]), t(80, [29, 35]),
      ],
    }),
    mod({
      id: 'reduced_flask', name: '药剂充能消耗降低', affix: 'suffix', tags: ['flask'], weight: 320,
      slots: ['belt'], text: '药剂充能消耗降低 {0}%',
      tiers: [
        t(1, [5, 8]), t(20, [9, 11]), t(40, [12, 14]), t(60, [15, 17]), t(80, [18, 20]),
      ],
    }),
    mod({
      id: 'projectile_speed', name: '投射物速度', affix: 'suffix', tags: ['speed', 'attack'], weight: 380,
      slots: ['quiver'], text: '投射物速度提高 {0}%',
      tiers: [
        t(1, [10, 15]), t(20, [16, 20]), t(40, [21, 25]), t(60, [26, 30]), t(80, [31, 35]),
      ],
    }),
    mod({
      id: 'dot_multi', name: '持续伤害加成', affix: 'suffix', tags: ['damage', 'dot'], weight: 260,
      slots: ['amulet'], text: '+{0}% 持续伤害加成',
      tiers: [
        t(1, [8, 10]), t(30, [11, 13]), t(50, [14, 16]), t(70, [17, 19]), t(84, [20, 22]),
      ],
    }),
    mod({
      id: 'chaos_dot_multi', name: '混沌持续伤害加成', affix: 'suffix', tags: ['damage', 'dot', 'chaos'], weight: 160,
      slots: ['amulet'], influence: 'hunter', text: '+{0}% 混沌持续伤害加成',
      tiers: [
        t(68, [15, 20]), t(75, [21, 26]), t(82, [27, 32]), t(86, [33, 38]),
      ],
    }),
    mod({
      id: 'minion_life', name: '召唤物生命', affix: 'suffix', tags: ['minion', 'life'], weight: 300,
      slots: ['helmet', 'body'], text: '召唤物最大生命提高 {0}%',
      tiers: [
        t(1, [10, 15]), t(20, [16, 20]), t(40, [21, 25]), t(60, [26, 30]), t(80, [31, 35]),
      ],
    }),
    mod({
      id: 'leech_life', name: '生命偷取', affix: 'suffix', tags: ['life', 'attack'], weight: 260,
      slots: ['ring', 'weapon'], text: '物理攻击伤害的 {0}% 转化为生命偷取',
      tiers: [
        t(1, [0.2, 0.4]), t(20, [0.5, 0.7]), t(40, [0.8, 1.0]), t(60, [1.1, 1.2]), t(80, [1.3, 1.5]),
      ],
    }),
    mod({
      id: 'leech_mana', name: '魔力偷取', affix: 'suffix', tags: ['mana', 'attack'], weight: 260,
      slots: ['ring', 'weapon'], text: '物理攻击伤害的 {0}% 转化为魔力偷取',
      tiers: [
        t(1, [0.2, 0.4]), t(20, [0.5, 0.7]), t(40, [0.8, 1.0]), t(60, [1.1, 1.2]), t(80, [1.3, 1.5]),
      ],
    }),
    mod({
      id: 'reservation_efficiency', name: '魔力保留效率', affix: 'suffix', tags: ['mana', 'aura'], weight: 120,
      slots: ['helmet'], text: '魔力保留效率提高 {0}%',
      tiers: [
        t(68, [5, 7]), t(75, [8, 10]), t(82, [11, 13]), t(86, [14, 16]),
      ],
    }),
    mod({
      id: 'warlord_fire_pen', name: '周围敌人火焰抗性降低', affix: 'prefix', tags: ['fire', 'aura'], weight: 150,
      slots: ['helmet'], influence: 'warlord', text: '周围敌人 -{0}% 火焰抗性',
      tiers: [t(68, [5, 6]), t(75, [7, 8]), t(82, [9, 10]), t(86, [11, 12])],
    }),
    mod({
      id: 'redeemer_cold_pen', name: '周围敌人冰霜抗性降低', affix: 'prefix', tags: ['cold', 'aura'], weight: 150,
      slots: ['helmet'], influence: 'redeemer', text: '周围敌人 -{0}% 冰霜抗性',
      tiers: [t(68, [5, 6]), t(75, [7, 8]), t(82, [9, 10]), t(86, [11, 12])],
    }),
    mod({
      id: 'crusader_light_pen', name: '周围敌人闪电抗性降低', affix: 'prefix', tags: ['lightning', 'aura'], weight: 150,
      slots: ['helmet'], influence: 'crusader', text: '周围敌人 -{0}% 闪电抗性',
      tiers: [t(68, [5, 6]), t(75, [7, 8]), t(82, [9, 10]), t(86, [11, 12])],
    }),
    mod({
      id: 'hunter_chaos_pen', name: '周围敌人混沌抗性降低', affix: 'prefix', tags: ['chaos', 'aura'], weight: 150,
      slots: ['helmet'], influence: 'hunter', text: '周围敌人 -{0}% 混沌抗性',
      tiers: [t(68, [5, 6]), t(75, [7, 8]), t(82, [9, 10]), t(86, [11, 12])],
    }),
  ];

  /* ------------------------------------------------------------------ *
   * 精华：按槽位覆盖；没有覆盖时使用 byCat
   * ------------------------------------------------------------------ */
  const ESSENCE_CAT = (slot) => (slot === 'weapon' || slot === 'quiver') ? 'weapon'
    : (slot === 'ring' || slot === 'amulet' || slot === 'belt') ? 'jewellery' : 'armour';

  const essences = [
    {
      id: 'greed', name: '贪婪', tierName: '震耳', cost: 4, color: '#d8c27a',
      byCat: {
        armour: { affix: 'prefix', group: 'life', text: '+{0} 最大生命', tags: ['life'], v: [[90, 99]] },
        weapon: { affix: 'suffix', group: 'life_leech', text: '物理攻击伤害的 {0}% 转化为生命偷取', tags: ['life', 'attack'], v: [[2.5, 3.0]] },
        jewellery: { affix: 'suffix', group: 'life_regen', text: '每秒回复 {0} 点生命', tags: ['life'], v: [[25, 30]] },
      },
      bySlot: {
        belt: { affix: 'suffix', group: 'flask_life', text: '药剂生命回复速度提高 {0}%', tags: ['flask', 'life'], v: [[15, 20]] },
      },
    },
    {
      id: 'woe', name: '哀伤', tierName: '震耳', cost: 4, color: '#9db8e8',
      byCat: {
        armour: { affix: 'prefix', group: 'es_flat', text: '+{0} 最大能量护盾', tags: ['defence', 'es'], v: [[95, 110]] },
        weapon: { affix: 'prefix', group: 'spell_damage', text: '法术伤害提高 {0}%', tags: ['caster', 'damage'], v: [[45, 55]] },
        jewellery: { affix: 'prefix', group: 'es_flat', text: '+{0} 最大能量护盾', tags: ['defence', 'es'], v: [[45, 55]] },
      },
      bySlot: {
        quiver: { affix: 'prefix', group: 'bow_damage', text: '弓技能伤害提高 {0}%', tags: ['attack', 'damage'], v: [[45, 55]] },
      },
    },
    {
      id: 'zeal', name: '狂热', tierName: '震耳', cost: 4, color: '#e8b46a',
      byCat: {
        armour: { affix: 'suffix', group: 'stun_recovery', text: '眩晕与格挡回复提高 {0}%', tags: ['defence'], v: [[31, 44]] },
        weapon: { affix: 'suffix', group: 'attack_speed', text: '攻击速度提高 {0}%', tags: ['speed', 'attack'], v: [[15, 18]] },
        jewellery: { affix: 'suffix', group: 'cast_speed', text: '施法速度提高 {0}%', tags: ['speed', 'caster'], v: [[15, 18]] },
      },
      bySlot: {
        gloves: { affix: 'suffix', group: 'attack_speed', text: '攻击速度提高 {0}%', tags: ['speed', 'attack'], v: [[15, 18]] },
        boots: { affix: 'suffix', group: 'move_speed', text: '移动速度提高 {0}%', tags: ['speed'], v: [[25, 30]] },
        belt: { affix: 'suffix', group: 'trap_speed', text: '陷阱与地雷投掷速度提高 {0}%', tags: ['speed'], v: [[15, 18]] },
      },
    },
    {
      id: 'loathing', name: '厌恶', tierName: '震耳', cost: 6, color: '#c9a7e8',
      byCat: {
        armour: { affix: 'suffix', group: 'ailment_avoid', text: '{0}% 几率避免元素异常状态', tags: ['defence'], v: [[35, 40]] },
        weapon: { affix: 'suffix', group: 'crit_chance_weapon', text: '暴击率提高 {0}%', tags: ['critical'], v: [[30, 35]] },
        jewellery: { affix: 'suffix', group: 'crit_multi', text: '+{0}% 暴击伤害加成', tags: ['critical'], v: [[27, 32]] },
      },
      bySlot: {
        helmet: { affix: 'suffix', group: 'reservation_efficiency', text: '魔力保留效率提高 {0}%', tags: ['mana', 'aura'], v: [[15, 20]] },
        gloves: { affix: 'suffix', group: 'crit_chance_global', text: '全局暴击率提高 {0}%', tags: ['critical'], v: [[25, 30]] },
        shield: { affix: 'suffix', group: 'block', text: '+{0}% 格挡率', tags: ['defence'], v: [[8, 10]] },
      },
    },
    {
      id: 'contempt', name: '蔑视', tierName: '震耳', cost: 4, color: '#d89a7a',
      byCat: {
        armour: { affix: 'prefix', group: 'reflect_phys', text: '反射 {0} 点物理伤害给近战攻击者', tags: ['physical'], v: [[20, 30]] },
        weapon: { affix: 'prefix', group: 'weapon_phys_flat', text: '增加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v: [[20, 30], [35, 45]] },
        jewellery: { affix: 'prefix', group: 'added_phys_attack', text: '攻击附加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v: [[8, 12], [16, 20]] },
      },
      bySlot: {
        gloves: { affix: 'prefix', group: 'added_phys_attack', text: '攻击附加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v: [[8, 12], [16, 20]] },
        quiver: { affix: 'prefix', group: 'added_phys_attack', text: '攻击附加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v: [[8, 12], [16, 20]] },
      },
    },
    {
      id: 'hatred', name: '憎恨', tierName: '震耳', cost: 4, color: '#8fd8e8',
      byCat: {
        armour: { affix: 'suffix', group: 'res_cold', text: '+{0}% 冰霜抗性', tags: ['resistance', 'cold'], v: [[46, 48]] },
        weapon: { affix: 'prefix', group: 'weapon_cold_flat', text: '增加 {0} 到 {1} 点冰霜伤害', tags: ['cold', 'attack'], v: [[20, 26], [40, 50]] },
        jewellery: { affix: 'prefix', group: 'cold_damage', text: '冰霜伤害提高 {0}%', tags: ['cold', 'damage'], v: [[30, 40]] },
      },
    },
    {
      id: 'anger', name: '愤怒', tierName: '震耳', cost: 4, color: '#e88a6a',
      byCat: {
        armour: { affix: 'suffix', group: 'res_fire', text: '+{0}% 火焰抗性', tags: ['resistance', 'fire'], v: [[46, 48]] },
        weapon: { affix: 'prefix', group: 'weapon_fire_flat', text: '增加 {0} 到 {1} 点火焰伤害', tags: ['fire', 'attack'], v: [[20, 26], [40, 50]] },
        jewellery: { affix: 'prefix', group: 'fire_damage', text: '火焰伤害提高 {0}%', tags: ['fire', 'damage'], v: [[30, 40]] },
      },
    },
    {
      id: 'wrath', name: '雷霆', tierName: '震耳', cost: 4, color: '#f0d96a',
      byCat: {
        armour: { affix: 'suffix', group: 'res_light', text: '+{0}% 闪电抗性', tags: ['resistance', 'lightning'], v: [[46, 48]] },
        weapon: { affix: 'prefix', group: 'weapon_light_flat', text: '增加 {0} 到 {1} 点闪电伤害', tags: ['lightning', 'attack'], v: [[15, 20], [45, 60]] },
        jewellery: { affix: 'prefix', group: 'light_damage', text: '闪电伤害提高 {0}%', tags: ['lightning', 'damage'], v: [[30, 40]] },
      },
    },
    {
      id: 'envy', name: '嫉妒', tierName: '震耳', cost: 6, color: '#a8e88f',
      byCat: {
        armour: { affix: 'suffix', group: 'res_chaos', text: '+{0}% 混沌抗性', tags: ['resistance', 'chaos'], v: [[30, 35]] },
        weapon: { affix: 'prefix', group: 'chaos_flat', text: '增加 {0} 到 {1} 点混沌伤害', tags: ['chaos', 'attack'], v: [[15, 20], [30, 40]] },
        jewellery: { affix: 'prefix', group: 'chaos_damage', text: '混沌伤害提高 {0}%', tags: ['chaos', 'damage'], v: [[30, 40]] },
      },
    },
    {
      id: 'misery', name: '悲惨', tierName: '震耳', cost: 4, color: '#9a9ae8',
      byCat: {
        armour: { affix: 'prefix', group: 'mana_flat', text: '+{0} 最大魔力', tags: ['mana'], v: [[70, 80]] },
        weapon: { affix: 'suffix', group: 'cast_speed', text: '施法速度提高 {0}%', tags: ['speed', 'caster'], v: [[15, 18]] },
        jewellery: { affix: 'suffix', group: 'mana_regen', text: '魔力回复速度提高 {0}%', tags: ['mana'], v: [[35, 45]] },
      },
    },
    {
      id: 'doubt', name: '疑虑', tierName: '震耳', cost: 3, color: '#9ad8b8',
      byCat: {
        armour: { affix: 'prefix', group: 'ev_flat', text: '+{0} 闪避值', tags: ['defence', 'evasion'], v: [[300, 380]] },
        weapon: { affix: 'suffix', group: 'accuracy', text: '+{0} 命中值', tags: ['attack'], v: [[350, 450]] },
        jewellery: { affix: 'prefix', group: 'ev_flat', text: '+{0} 闪避值', tags: ['defence', 'evasion'], v: [[150, 200]] },
      },
    },
    {
      id: 'dread', name: '恐惧', tierName: '震耳', cost: 3, color: '#b8a88f',
      byCat: {
        armour: { affix: 'prefix', group: 'ar_flat', text: '+{0} 护甲', tags: ['defence', 'armour'], v: [[300, 380]] },
        weapon: { affix: 'prefix', group: 'weapon_phys_pct', text: '{0}% 物理伤害提高', tags: ['physical', 'attack'], v: [[40, 50]] },
        jewellery: { affix: 'prefix', group: 'ar_flat', text: '+{0} 护甲', tags: ['defence', 'armour'], v: [[150, 200]] },
      },
    },
    {
      id: 'sorrow', name: '悲伤', tierName: '震耳', cost: 4, color: '#8fc9e8',
      byCat: {
        armour: { affix: 'suffix', group: 'dex', text: '+{0} 敏捷', tags: ['attribute'], v: [[45, 50]] },
        weapon: { affix: 'prefix', group: 'cold_pen', text: '伤害穿透 {0}% 冰霜抗性', tags: ['cold'], v: [[8, 10]] },
        jewellery: { affix: 'suffix', group: 'dex', text: '+{0} 敏捷', tags: ['attribute'], v: [[45, 50]] },
      },
    },
    {
      id: 'rage', name: '暴怒', tierName: '震耳', cost: 4, color: '#e89a7a',
      byCat: {
        armour: { affix: 'suffix', group: 'str', text: '+{0} 力量', tags: ['attribute'], v: [[45, 50]] },
        weapon: { affix: 'prefix', group: 'fire_pen', text: '伤害穿透 {0}% 火焰抗性', tags: ['fire'], v: [[8, 10]] },
        jewellery: { affix: 'suffix', group: 'str', text: '+{0} 力量', tags: ['attribute'], v: [[45, 50]] },
      },
    },
    {
      id: 'spite', name: '恶意', tierName: '震耳', cost: 4, color: '#e8d88f',
      byCat: {
        armour: { affix: 'suffix', group: 'int', text: '+{0} 智慧', tags: ['attribute'], v: [[45, 50]] },
        weapon: { affix: 'prefix', group: 'light_pen', text: '伤害穿透 {0}% 闪电抗性', tags: ['lightning'], v: [[8, 10]] },
        jewellery: { affix: 'suffix', group: 'int', text: '+{0} 智慧', tags: ['attribute'], v: [[45, 50]] },
      },
    },
    {
      id: 'scorn', name: '轻视', tierName: '震耳', cost: 5, color: '#c9b8e8',
      byCat: {
        armour: { affix: 'suffix', group: 'stun_avoid', text: '{0}% 几率避免被眩晕', tags: ['defence'], v: [[35, 40]] },
        weapon: { affix: 'suffix', group: 'spell_crit', text: '法术暴击率提高 {0}%', tags: ['critical', 'caster'], v: [[30, 35]] },
        jewellery: { affix: 'suffix', group: 'crit_multi', text: '+{0}% 暴击伤害加成', tags: ['critical'], v: [[27, 32]] },
      },
    },
  ];

  /* ------------------------------------------------------------------ *
   * 化石
   * ------------------------------------------------------------------ */
  const fossils = [
    { id: 'pristine', name: '纯净化石', cost: 6, more: ['life'], block: ['defence'], desc: '生命词缀权重 ×10；屏蔽防御词缀' },
    { id: 'dense', name: '致密化石', cost: 6, more: ['defence'], block: ['life'], desc: '防御词缀权重 ×10；屏蔽生命词缀' },
    { id: 'serrated', name: '锯齿化石', cost: 5, more: ['attack'], fewer: ['caster'], desc: '攻击词缀 ×10；施法词缀 ×0.15' },
    { id: 'aetheric', name: '以太化石', cost: 5, more: ['caster'], fewer: ['attack'], desc: '施法词缀 ×10；攻击词缀 ×0.15' },
    { id: 'scorched', name: '灼热化石', cost: 5, more: ['fire'], block: ['cold'], desc: '火焰词缀 ×10；屏蔽冰霜词缀' },
    { id: 'frigid', name: '冰寒化石', cost: 5, more: ['cold'], block: ['fire'], desc: '冰霜词缀 ×10；屏蔽火焰词缀' },
    { id: 'metallic', name: '金属化石', cost: 5, more: ['lightning'], block: ['physical'], desc: '闪电词缀 ×10；屏蔽物理词缀' },
    { id: 'jagged', name: '尖锐化石', cost: 5, more: ['physical'], block: ['chaos'], desc: '物理词缀 ×10；屏蔽混沌词缀' },
    { id: 'aberrant', name: '异化化石', cost: 5, more: ['chaos'], block: ['lightning'], desc: '混沌词缀 ×10；屏蔽闪电词缀' },
    { id: 'prismatic', name: '棱彩化石', cost: 6, more: ['elemental', 'fire', 'cold', 'lightning'], desc: '元素词缀 ×6' },
    { id: 'deft', name: '灵巧化石', cost: 5, more: ['critical'], block: ['attribute'], desc: '暴击词缀 ×10；屏蔽属性词缀' },
    { id: 'fundamental', name: '基础化石', cost: 5, more: ['attribute'], block: ['critical'], desc: '属性词缀 ×10；屏蔽暴击词缀' },
    { id: 'lucent', name: '透光化石', cost: 5, more: ['mana'], block: ['speed'], desc: '魔力词缀 ×10；屏蔽速度词缀' },
    { id: 'shuddering', name: '震颤化石', cost: 5, more: ['speed'], block: ['mana'], desc: '速度词缀 ×10；屏蔽魔力词缀' },
    { id: 'bound', name: '束缚化石', cost: 6, more: ['minion', 'aura', 'curse'], desc: '召唤 / 光环 / 诅咒词缀 ×10' },
    { id: 'faceted', name: '多面化石', cost: 8, more: ['gem'], desc: '宝石词缀 ×10' },
    { id: 'sanctified', name: '圣洁化石', cost: 10, more: [], sanctified: true, desc: '词缀等级越高，权重越高' },
  ];

  /* ------------------------------------------------------------------ *
   * 工艺台固定词缀（占用一个前缀 / 后缀）
   * ------------------------------------------------------------------ */
  const bench = [
    { id: 'bench_life', name: '最大生命', affix: 'prefix', group: 'life', text: '+{0} 最大生命', v: [[55, 64]], tags: ['life'], cost: 4, slots: GEAR },
    { id: 'bench_life_high', name: '最大生命（高阶）', affix: 'prefix', group: 'life', text: '+{0} 最大生命', v: [[70, 79]], tags: ['life'], cost: 20, slots: GEAR },
    { id: 'bench_es', name: '最大能量护盾', affix: 'prefix', group: 'es_flat', text: '+{0} 最大能量护盾', v: [[80, 100]], tags: ['defence', 'es'], cost: 4, slots: ARMOUR, def: ['es'] },
    { id: 'bench_ar', name: '护甲', affix: 'prefix', group: 'ar_flat', text: '+{0} 护甲', v: [[300, 400]], tags: ['defence', 'armour'], cost: 4, slots: ARMOUR, def: ['ar'] },
    { id: 'bench_ev', name: '闪避值', affix: 'prefix', group: 'ev_flat', text: '+{0} 闪避值', v: [[300, 400]], tags: ['defence', 'evasion'], cost: 4, slots: ARMOUR, def: ['ev'] },
    { id: 'bench_mana', name: '最大魔力', affix: 'prefix', group: 'mana_flat', text: '+{0} 最大魔力', v: [[60, 70]], tags: ['mana'], cost: 4, slots: GEAR },
    { id: 'bench_fire_res', name: '火焰抗性', affix: 'suffix', group: 'res_fire', text: '+{0}% 火焰抗性', v: [[30, 35]], tags: ['resistance', 'fire'], cost: 4, slots: GEAR },
    { id: 'bench_cold_res', name: '冰霜抗性', affix: 'suffix', group: 'res_cold', text: '+{0}% 冰霜抗性', v: [[30, 35]], tags: ['resistance', 'cold'], cost: 4, slots: GEAR },
    { id: 'bench_light_res', name: '闪电抗性', affix: 'suffix', group: 'res_light', text: '+{0}% 闪电抗性', v: [[30, 35]], tags: ['resistance', 'lightning'], cost: 4, slots: GEAR },
    { id: 'bench_chaos_res', name: '混沌抗性', affix: 'suffix', group: 'res_chaos', text: '+{0}% 混沌抗性', v: [[20, 25]], tags: ['resistance', 'chaos'], cost: 8, slots: GEAR },
    { id: 'bench_all_res', name: '全元素抗性', affix: 'suffix', group: 'all_res', text: '+{0}% 全部元素抗性', v: [[12, 15]], tags: ['resistance', 'elemental'], cost: 8, slots: GEAR },
    { id: 'bench_attack_speed', name: '攻击速度', affix: 'suffix', group: 'attack_speed', text: '攻击速度提高 {0}%', v: [[8, 10]], tags: ['speed', 'attack'], cost: 4, slots: ['gloves', 'weapon', 'quiver'] },
    { id: 'bench_cast_speed', name: '施法速度', affix: 'suffix', group: 'cast_speed', text: '施法速度提高 {0}%', v: [[8, 10]], tags: ['speed', 'caster'], cost: 4, slots: ['gloves', 'ring', 'amulet', 'weapon'] },
    { id: 'bench_crit_multi', name: '暴击伤害加成', affix: 'suffix', group: 'crit_multi', text: '+{0}% 暴击伤害加成', v: [[15, 18]], tags: ['critical'], cost: 4, slots: ['ring', 'amulet', 'weapon'] },
    { id: 'bench_move_speed', name: '移动速度', affix: 'suffix', group: 'move_speed', text: '移动速度提高 {0}%', v: [[20, 25]], tags: ['speed'], cost: 8, slots: ['boots'] },
    { id: 'bench_accuracy', name: '命中值', affix: 'suffix', group: 'accuracy', text: '+{0} 命中值', v: [[250, 300]], tags: ['attack'], cost: 4, slots: ['gloves', 'ring', 'amulet', 'quiver', 'weapon'] },
  ];

  const metaCrafts = [
    { id: 'lock_prefix', name: '前缀无法改变', cost: 36, affix: 'suffix', group: 'meta_lock_prefix', text: '前缀无法改变', desc: '锁住前缀，用于剥离 / 重铸后缀' },
    { id: 'lock_suffix', name: '后缀无法改变', cost: 36, affix: 'prefix', group: 'meta_lock_suffix', text: '后缀无法改变', desc: '锁住后缀，用于剥离 / 重铸前缀' },
    { id: 'multimod', name: '多重工艺', cost: 36, affix: 'suffix', group: 'meta_multimod', text: '多重工艺', desc: '允许最多 3 条工艺台词缀' },
    { id: 'no_attack', name: '不能出现攻击词缀', cost: 36, affix: 'suffix', group: 'meta_no_attack', text: '不能出现攻击词缀', desc: '重铸 / 混沌 / 精华等不会再出现攻击词缀' },
    { id: 'no_caster', name: '不能出现施法词缀', cost: 36, affix: 'suffix', group: 'meta_no_caster', text: '不能出现施法词缀', desc: '重铸 / 混沌 / 精华等不会再出现施法词缀' },
  ];

  /* ------------------------------------------------------------------ *
   * 价格（混沌石）与设置默认值
   * ------------------------------------------------------------------ */
  const prices = {
    transmute: 0.1, alteration: 0.2, augmentation: 0.5, regal: 1, alchemy: 0.5,
    chaos: 1, exalted: 18, annulment: 8, scour: 0.5, vaal: 1,
    taintedChaos: 4, taintedExalted: 25, taintedDivine: 40, taintedAnnul: 8,
    divine: 200, resonator: 1, harvest: 15, awakener: 120, aisling: 160, influenceExalt: 90, scrap: 0.1, whetstone: 0.1,
    jeweller: 0.5, fusing: 0.5, chromatic: 0.2,
    recombine: 100,
    veiledChaos: 6,
    eldritchLesser: 1, eldritchGreater: 4, eldritchGrand: 15, eldritchExceptional: 50, orbConflict: 80,
    lock: 36, multimod: 36, essenceMult: 1, fossilMult: 1,
    essence: 1, // 精华基础倍率，实际价格见 essence.cost
  };

  /* ------------------------------------------------------------------ *
   * 目标模板
   * ------------------------------------------------------------------ */
  /* 当前内置的是震耳（Deafening, tier 7）精华：普通/稀有可用，物品等级至少 65。 */
  essences.forEach((e) => { e.tier = 7; e.minIlvl = 65; e.canReforgeRare = true; });

  /* 先补齐 4 种常用精华的第 5 / 6 阶；其余类型仍只有震耳。 */
  [
    {
      id: 'greed_5', name: '贪婪', tierName: '尖啸', tier: 5, minIlvl: 46, cost: 3, color: '#d8c27a',
      byCat: {
        armour: { affix: 'prefix', group: 'life', text: '+{0} 最大生命', tags: ['life'], v: [[61, 75]] },
        weapon: { affix: 'suffix', group: 'life_leech', text: '物理攻击伤害的 {0}% 转化为生命偷取', tags: ['life', 'attack'], v: [[3.3, 3.6]] },
        jewellery: { affix: 'suffix', group: 'life_regen', text: '每秒回复 {0} 点生命', tags: ['life'], v: [[24.1, 32]] },
      },
      bySlot: { belt: { affix: 'suffix', group: 'flask_life', text: '药剂生命回复速度提高 {0}%', tags: ['flask', 'life'], v: [[24, 27]] } },
    },
    {
      id: 'greed_6', name: '贪婪', tierName: '刺耳', tier: 6, minIlvl: 59, cost: 4, color: '#d8c27a',
      byCat: {
        armour: { affix: 'prefix', group: 'life', text: '+{0} 最大生命', tags: ['life'], v: [[76, 90]] },
        weapon: { affix: 'suffix', group: 'life_leech', text: '物理攻击伤害的 {0}% 转化为生命偷取', tags: ['life', 'attack'], v: [[3.7, 4.0]] },
        jewellery: { affix: 'suffix', group: 'life_regen', text: '每秒回复 {0} 点生命', tags: ['life'], v: [[32.1, 48]] },
      },
      bySlot: { belt: { affix: 'suffix', group: 'flask_life', text: '药剂生命回复速度提高 {0}%', tags: ['flask', 'life'], v: [[28, 31]] } },
    },
    {
      id: 'woe_5', name: '哀伤', tierName: '尖啸', tier: 5, minIlvl: 46, cost: 3, color: '#9db8e8',
      byCat: {
        armour: { affix: 'prefix', group: 'es_flat', text: '+{0} 最大能量护盾', tags: ['defence', 'es'], v: [[50, 61]] },
        weapon: { affix: 'prefix', group: 'spell_damage', text: '法术伤害提高 {0}%', tags: ['caster', 'damage'], v: [[50, 66]] },
        jewellery: { affix: 'prefix', group: 'es_flat', text: '+{0} 最大能量护盾', tags: ['defence', 'es'], v: [[14, 16]] },
      },
      bySlot: { quiver: { affix: 'prefix', group: 'bow_damage', text: '弓技能伤害提高 {0}%', tags: ['attack', 'damage'], v: [[31, 36]] } },
    },
    {
      id: 'woe_6', name: '哀伤', tierName: '刺耳', tier: 6, minIlvl: 59, cost: 4, color: '#9db8e8',
      byCat: {
        armour: { affix: 'prefix', group: 'es_flat', text: '+{0} 最大能量护盾', tags: ['defence', 'es'], v: [[62, 75]] },
        weapon: { affix: 'prefix', group: 'spell_damage', text: '法术伤害提高 {0}%', tags: ['caster', 'damage'], v: [[67, 87]] },
        jewellery: { affix: 'prefix', group: 'es_flat', text: '+{0} 最大能量护盾', tags: ['defence', 'es'], v: [[17, 20]] },
      },
      bySlot: { quiver: { affix: 'prefix', group: 'bow_damage', text: '弓技能伤害提高 {0}%', tags: ['attack', 'damage'], v: [[37, 44]] } },
    },
    {
      id: 'zeal_5', name: '狂热', tierName: '尖啸', tier: 5, minIlvl: 46, cost: 3, color: '#e8b46a',
      byCat: {
        armour: { affix: 'suffix', group: 'stun_recovery', text: '眩晕与格挡回复提高 {0}%', tags: ['defence'], v: [[23, 25]] },
        weapon: { affix: 'suffix', group: 'attack_speed', text: '攻击速度提高 {0}%', tags: ['speed', 'attack'], v: [[23, 25]] },
        jewellery: { affix: 'suffix', group: 'cast_speed', text: '施法速度提高 {0}%', tags: ['speed', 'caster'], v: [[9, 12]] },
      },
      bySlot: {
        gloves: { affix: 'suffix', group: 'attack_speed', text: '攻击速度提高 {0}%', tags: ['speed', 'attack'], v: [[11, 13]] },
        boots: { affix: 'suffix', group: 'move_speed', text: '移动速度提高 {0}%', tags: ['speed'], v: [[25, 25]] },
        belt: { affix: 'suffix', group: 'trap_speed', text: '陷阱与地雷投掷速度提高 {0}%', tags: ['speed'], v: [[11, 13]] },
      },
    },
    {
      id: 'zeal_6', name: '狂热', tierName: '刺耳', tier: 6, minIlvl: 59, cost: 4, color: '#e8b46a',
      byCat: {
        armour: { affix: 'suffix', group: 'stun_recovery', text: '眩晕与格挡回复提高 {0}%', tags: ['defence'], v: [[26, 28]] },
        weapon: { affix: 'suffix', group: 'attack_speed', text: '攻击速度提高 {0}%', tags: ['speed', 'attack'], v: [[26, 28]] },
        jewellery: { affix: 'suffix', group: 'cast_speed', text: '施法速度提高 {0}%', tags: ['speed', 'caster'], v: [[13, 15]] },
      },
      bySlot: {
        gloves: { affix: 'suffix', group: 'attack_speed', text: '攻击速度提高 {0}%', tags: ['speed', 'attack'], v: [[14, 16]] },
        boots: { affix: 'suffix', group: 'move_speed', text: '移动速度提高 {0}%', tags: ['speed'], v: [[30, 30]] },
        belt: { affix: 'suffix', group: 'trap_speed', text: '陷阱与地雷投掷速度提高 {0}%', tags: ['speed'], v: [[14, 16]] },
      },
    },
    {
      id: 'loathing_5', name: '厌恶', tierName: '尖啸', tier: 5, minIlvl: 46, cost: 5, color: '#c9a7e8',
      byCat: {
        armour: { affix: 'suffix', group: 'ailment_avoid', text: '{0}% 几率避免元素异常状态', tags: ['defence'], v: [[23, 25]] },
        weapon: { affix: 'suffix', group: 'crit_chance_weapon', text: '暴击率提高 {0}%', tags: ['critical'], v: [[25, 29]] },
        jewellery: { affix: 'suffix', group: 'crit_multi', text: '+{0}% 暴击伤害加成', tags: ['critical'], v: [[21, 25]] },
      },
      bySlot: {
        helmet: { affix: 'suffix', group: 'reservation_efficiency', text: '魔力保留效率提高 {0}%', tags: ['mana', 'aura'], v: [[7, 10]] },
        gloves: { affix: 'suffix', group: 'crit_chance_global', text: '全局暴击率提高 {0}%', tags: ['critical'], v: [[18, 20]] },
        shield: { affix: 'suffix', group: 'block', text: '+{0}% 格挡率', tags: ['defence'], v: [[58, 63]] },
      },
    },
    {
      id: 'loathing_6', name: '厌恶', tierName: '刺耳', tier: 6, minIlvl: 59, cost: 6, color: '#c9a7e8',
      byCat: {
        armour: { affix: 'suffix', group: 'ailment_avoid', text: '{0}% 几率避免元素异常状态', tags: ['defence'], v: [[26, 28]] },
        weapon: { affix: 'suffix', group: 'crit_chance_weapon', text: '暴击率提高 {0}%', tags: ['critical'], v: [[30, 34]] },
        jewellery: { affix: 'suffix', group: 'crit_multi', text: '+{0}% 暴击伤害加成', tags: ['critical'], v: [[26, 30]] },
      },
      bySlot: {
        helmet: { affix: 'suffix', group: 'reservation_efficiency', text: '魔力保留效率提高 {0}%', tags: ['mana', 'aura'], v: [[11, 14]] },
        gloves: { affix: 'suffix', group: 'crit_chance_global', text: '全局暴击率提高 {0}%', tags: ['critical'], v: [[21, 23]] },
        shield: { affix: 'suffix', group: 'block', text: '+{0}% 格挡率', tags: ['defence'], v: [[64, 70]] },
      },
    },
  ].forEach((e) => { if (!essences.some((x) => x.id === e.id)) essences.push(e); });

  [
    {
      id: 'contempt_5', name: '蔑视', tierName: '尖啸', tier: 5, minIlvl: 46, cost: 3, color: '#d89a7a',
      byCat: {
        armour: { affix: 'prefix', group: 'reflect_phys', text: '反射 {0} 点物理伤害给近战攻击者', tags: ['physical'], v: [[51, 100]] },
        weapon: { affix: 'prefix', group: 'weapon_phys_flat', text: '增加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v: [[13, 18], [27, 31]] },
        jewellery: { affix: 'prefix', group: 'added_phys_attack', text: '攻击附加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v: [[9, 12], [19, 22]] },
      },
      bySlot: {
        gloves: { affix: 'prefix', group: 'added_phys_attack', text: '攻击附加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v: [[9, 12], [19, 22]] },
        quiver: { affix: 'prefix', group: 'added_phys_attack', text: '攻击附加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v: [[9, 12], [19, 22]] },
      },
    },
    {
      id: 'contempt_6', name: '蔑视', tierName: '刺耳', tier: 6, minIlvl: 59, cost: 4, color: '#d89a7a',
      byCat: {
        armour: { affix: 'prefix', group: 'reflect_phys', text: '反射 {0} 点物理伤害给近战攻击者', tags: ['physical'], v: [[101, 150]] },
        weapon: { affix: 'prefix', group: 'weapon_phys_flat', text: '增加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v: [[16, 21], [32, 38]] },
        jewellery: { affix: 'prefix', group: 'added_phys_attack', text: '攻击附加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v: [[11, 15], [22, 26]] },
      },
      bySlot: {
        gloves: { affix: 'prefix', group: 'added_phys_attack', text: '攻击附加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v: [[11, 15], [22, 26]] },
        quiver: { affix: 'prefix', group: 'added_phys_attack', text: '攻击附加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v: [[11, 15], [22, 26]] },
      },
    },
    {
      id: 'hatred_5', name: '憎恨', tierName: '尖啸', tier: 5, minIlvl: 46, cost: 3, color: '#8fd8e8',
      byCat: {
        armour: { affix: 'suffix', group: 'res_cold', text: '+{0}% 冰霜抗性', tags: ['resistance', 'cold'], v: [[36, 41]] },
        weapon: { affix: 'prefix', group: 'weapon_cold_flat', text: '增加 {0} 到 {1} 点冰霜伤害', tags: ['cold', 'attack'], v: [[54, 74], [108, 126]] },
        jewellery: { affix: 'prefix', group: 'cold_damage', text: '冰霜伤害提高 {0}%', tags: ['cold', 'damage'], v: [[23, 26]] },
      },
    },
    {
      id: 'hatred_6', name: '憎恨', tierName: '刺耳', tier: 6, minIlvl: 59, cost: 4, color: '#8fd8e8',
      byCat: {
        armour: { affix: 'suffix', group: 'res_cold', text: '+{0}% 冰霜抗性', tags: ['resistance', 'cold'], v: [[42, 45]] },
        weapon: { affix: 'prefix', group: 'weapon_cold_flat', text: '增加 {0} 到 {1} 点冰霜伤害', tags: ['cold', 'attack'], v: [[75, 91], [127, 145]] },
        jewellery: { affix: 'prefix', group: 'cold_damage', text: '冰霜伤害提高 {0}%', tags: ['cold', 'damage'], v: [[27, 30]] },
      },
    },
    {
      id: 'anger_5', name: '愤怒', tierName: '尖啸', tier: 5, minIlvl: 46, cost: 3, color: '#e88a6a',
      byCat: {
        armour: { affix: 'suffix', group: 'res_fire', text: '+{0}% 火焰抗性', tags: ['resistance', 'fire'], v: [[36, 41]] },
        weapon: { affix: 'prefix', group: 'weapon_fire_flat', text: '增加 {0} 到 {1} 点火焰伤害', tags: ['fire', 'attack'], v: [[59, 81], [120, 140]] },
        jewellery: { affix: 'prefix', group: 'fire_damage', text: '火焰伤害提高 {0}%', tags: ['fire', 'damage'], v: [[23, 26]] },
      },
    },
    {
      id: 'anger_6', name: '愤怒', tierName: '刺耳', tier: 6, minIlvl: 59, cost: 4, color: '#e88a6a',
      byCat: {
        armour: { affix: 'suffix', group: 'res_fire', text: '+{0}% 火焰抗性', tags: ['resistance', 'fire'], v: [[42, 45]] },
        weapon: { affix: 'prefix', group: 'weapon_fire_flat', text: '增加 {0} 到 {1} 点火焰伤害', tags: ['fire', 'attack'], v: [[82, 100], [141, 165]] },
        jewellery: { affix: 'prefix', group: 'fire_damage', text: '火焰伤害提高 {0}%', tags: ['fire', 'damage'], v: [[27, 30]] },
      },
    },
    {
      id: 'wrath_5', name: '雷霆', tierName: '尖啸', tier: 5, minIlvl: 46, cost: 3, color: '#f0d96a',
      byCat: {
        armour: { affix: 'suffix', group: 'res_light', text: '+{0}% 闪电抗性', tags: ['resistance', 'lightning'], v: [[36, 41]] },
        weapon: { affix: 'prefix', group: 'weapon_light_flat', text: '增加 {0} 到 {1} 点闪电伤害', tags: ['lightning', 'attack'], v: [[10, 14], [197, 229]] },
        jewellery: { affix: 'prefix', group: 'light_damage', text: '闪电伤害提高 {0}%', tags: ['lightning', 'damage'], v: [[23, 26]] },
      },
    },
    {
      id: 'wrath_6', name: '雷霆', tierName: '刺耳', tier: 6, minIlvl: 59, cost: 4, color: '#f0d96a',
      byCat: {
        armour: { affix: 'suffix', group: 'res_light', text: '+{0}% 闪电抗性', tags: ['resistance', 'lightning'], v: [[42, 45]] },
        weapon: { affix: 'prefix', group: 'weapon_light_flat', text: '增加 {0} 到 {1} 点闪电伤害', tags: ['lightning', 'attack'], v: [[15, 20], [230, 268]] },
        jewellery: { affix: 'prefix', group: 'light_damage', text: '闪电伤害提高 {0}%', tags: ['lightning', 'damage'], v: [[27, 30]] },
      },
    },
    {
      id: 'envy_5', name: '嫉妒', tierName: '尖啸', tier: 5, minIlvl: 46, cost: 4, color: '#a8e88f',
      byCat: {
        armour: { affix: 'suffix', group: 'res_chaos', text: '+{0}% 混沌抗性', tags: ['resistance', 'chaos'], v: [[21, 25]] },
        weapon: { affix: 'prefix', group: 'chaos_flat', text: '增加 {0} 到 {1} 点混沌伤害', tags: ['chaos', 'attack'], v: [[37, 59], [79, 103]] },
        jewellery: { affix: 'prefix', group: 'chaos_damage', text: '混沌伤害提高 {0}%', tags: ['chaos', 'damage'], v: [[23, 26]] },
      },
    },
    {
      id: 'envy_6', name: '嫉妒', tierName: '刺耳', tier: 6, minIlvl: 59, cost: 5, color: '#a8e88f',
      byCat: {
        armour: { affix: 'suffix', group: 'res_chaos', text: '+{0}% 混沌抗性', tags: ['resistance', 'chaos'], v: [[26, 30]] },
        weapon: { affix: 'prefix', group: 'chaos_flat', text: '增加 {0} 到 {1} 点混沌伤害', tags: ['chaos', 'attack'], v: [[60, 80], [104, 130]] },
        jewellery: { affix: 'prefix', group: 'chaos_damage', text: '混沌伤害提高 {0}%', tags: ['chaos', 'damage'], v: [[27, 30]] },
      },
    },
    {
      id: 'misery_5', name: '悲惨', tierName: '尖啸', tier: 5, minIlvl: 46, cost: 3, color: '#9a9ae8',
      byCat: {
        armour: { affix: 'prefix', group: 'mana_flat', text: '+{0} 最大魔力', tags: ['mana'], v: [[55, 59]] },
        weapon: { affix: 'suffix', group: 'cast_speed', text: '施法速度提高 {0}%', tags: ['speed', 'caster'], v: [[21, 24]] },
        jewellery: { affix: 'suffix', group: 'mana_regen', text: '魔力回复速度提高 {0}%', tags: ['mana'], v: [[50, 59]] },
      },
    },
    {
      id: 'misery_6', name: '悲惨', tierName: '刺耳', tier: 6, minIlvl: 59, cost: 4, color: '#9a9ae8',
      byCat: {
        armour: { affix: 'prefix', group: 'mana_flat', text: '+{0} 最大魔力', tags: ['mana'], v: [[65, 68]] },
        weapon: { affix: 'suffix', group: 'cast_speed', text: '施法速度提高 {0}%', tags: ['speed', 'caster'], v: [[25, 28]] },
        jewellery: { affix: 'suffix', group: 'mana_regen', text: '魔力回复速度提高 {0}%', tags: ['mana'], v: [[60, 69]] },
      },
    },
  ].forEach((e) => { if (!essences.some((x) => x.id === e.id)) essences.push(e); });

  [
    {
      id: 'doubt_5', name: '疑虑', tierName: '尖啸', tier: 5, minIlvl: 46, cost: 3, color: '#9ad8b8',
      byCat: {
        armour: { affix: 'prefix', group: 'ev_flat', text: '+{0} 闪避值', tags: ['defence', 'evasion'], v: [[91, 105]] },
        weapon: { affix: 'suffix', group: 'accuracy', text: '+{0} 命中值', tags: ['attack'], v: [[326, 455]] },
        jewellery: { affix: 'prefix', group: 'ev_flat', text: '+{0} 闪避值', tags: ['defence', 'evasion'], v: [[81, 120]] },
      },
    },
    {
      id: 'doubt_6', name: '疑虑', tierName: '刺耳', tier: 6, minIlvl: 59, cost: 4, color: '#9ad8b8',
      byCat: {
        armour: { affix: 'prefix', group: 'ev_flat', text: '+{0} 闪避值', tags: ['defence', 'evasion'], v: [[106, 120]] },
        weapon: { affix: 'suffix', group: 'accuracy', text: '+{0} 命中值', tags: ['attack'], v: [[456, 624]] },
        jewellery: { affix: 'prefix', group: 'ev_flat', text: '+{0} 闪避值', tags: ['defence', 'evasion'], v: [[121, 150]] },
      },
    },
    {
      id: 'dread_5', name: '恐惧', tierName: '尖啸', tier: 5, minIlvl: 46, cost: 3, color: '#b8a88f',
      byCat: {
        armour: { affix: 'prefix', group: 'ar_flat', text: '+{0} 护甲', tags: ['defence', 'armour'], v: [[91, 105]] },
        weapon: { affix: 'prefix', group: 'weapon_phys_pct', text: '{0}% 物理伤害提高', tags: ['physical', 'attack'], v: [[12, 16]] },
        jewellery: { affix: 'prefix', group: 'ar_flat', text: '+{0} 护甲', tags: ['defence', 'armour'], v: [[81, 120]] },
      },
    },
    {
      id: 'dread_6', name: '恐惧', tierName: '刺耳', tier: 6, minIlvl: 59, cost: 4, color: '#b8a88f',
      byCat: {
        armour: { affix: 'prefix', group: 'ar_flat', text: '+{0} 护甲', tags: ['defence', 'armour'], v: [[106, 120]] },
        weapon: { affix: 'prefix', group: 'weapon_phys_pct', text: '{0}% 物理伤害提高', tags: ['physical', 'attack'], v: [[17, 21]] },
        jewellery: { affix: 'prefix', group: 'ar_flat', text: '+{0} 护甲', tags: ['defence', 'armour'], v: [[121, 150]] },
      },
    },
    {
      id: 'sorrow_5', name: '悲伤', tierName: '尖啸', tier: 5, minIlvl: 46, cost: 3, color: '#8fc9e8',
      byCat: {
        armour: { affix: 'suffix', group: 'dex', text: '+{0} 敏捷', tags: ['attribute'], v: [[33, 37]] },
        weapon: { affix: 'prefix', group: 'cold_pen', text: '伤害穿透 {0}% 冰霜抗性', tags: ['cold'], v: [[6, 6]] },
        jewellery: { affix: 'suffix', group: 'dex', text: '+{0} 敏捷', tags: ['attribute'], v: [[33, 37]] },
      },
    },
    {
      id: 'sorrow_6', name: '悲伤', tierName: '刺耳', tier: 6, minIlvl: 59, cost: 4, color: '#8fc9e8',
      byCat: {
        armour: { affix: 'suffix', group: 'dex', text: '+{0} 敏捷', tags: ['attribute'], v: [[43, 50]] },
        weapon: { affix: 'prefix', group: 'cold_pen', text: '伤害穿透 {0}% 冰霜抗性', tags: ['cold'], v: [[7, 7]] },
        jewellery: { affix: 'suffix', group: 'dex', text: '+{0} 敏捷', tags: ['attribute'], v: [[43, 50]] },
      },
    },
    {
      id: 'rage_5', name: '暴怒', tierName: '尖啸', tier: 5, minIlvl: 46, cost: 3, color: '#e89a7a',
      byCat: {
        armour: { affix: 'suffix', group: 'str', text: '+{0} 力量', tags: ['attribute'], v: [[33, 37]] },
        weapon: { affix: 'prefix', group: 'fire_pen', text: '伤害穿透 {0}% 火焰抗性', tags: ['fire'], v: [[6, 6]] },
        jewellery: { affix: 'suffix', group: 'str', text: '+{0} 力量', tags: ['attribute'], v: [[33, 37]] },
      },
    },
    {
      id: 'rage_6', name: '暴怒', tierName: '刺耳', tier: 6, minIlvl: 59, cost: 4, color: '#e89a7a',
      byCat: {
        armour: { affix: 'suffix', group: 'str', text: '+{0} 力量', tags: ['attribute'], v: [[43, 50]] },
        weapon: { affix: 'prefix', group: 'fire_pen', text: '伤害穿透 {0}% 火焰抗性', tags: ['fire'], v: [[7, 7]] },
        jewellery: { affix: 'suffix', group: 'str', text: '+{0} 力量', tags: ['attribute'], v: [[43, 50]] },
      },
    },
    {
      id: 'spite_5', name: '恶意', tierName: '尖啸', tier: 5, minIlvl: 46, cost: 3, color: '#e8d88f',
      byCat: {
        armour: { affix: 'suffix', group: 'int', text: '+{0} 智慧', tags: ['attribute'], v: [[33, 37]] },
        weapon: { affix: 'prefix', group: 'light_pen', text: '伤害穿透 {0}% 闪电抗性', tags: ['lightning'], v: [[6, 6]] },
        jewellery: { affix: 'suffix', group: 'int', text: '+{0} 智慧', tags: ['attribute'], v: [[33, 37]] },
      },
    },
    {
      id: 'spite_6', name: '恶意', tierName: '刺耳', tier: 6, minIlvl: 59, cost: 4, color: '#e8d88f',
      byCat: {
        armour: { affix: 'suffix', group: 'int', text: '+{0} 智慧', tags: ['attribute'], v: [[43, 50]] },
        weapon: { affix: 'prefix', group: 'light_pen', text: '伤害穿透 {0}% 闪电抗性', tags: ['lightning'], v: [[7, 7]] },
        jewellery: { affix: 'suffix', group: 'int', text: '+{0} 智慧', tags: ['attribute'], v: [[43, 50]] },
      },
    },
    {
      id: 'scorn_5', name: '轻视', tierName: '尖啸', tier: 5, minIlvl: 46, cost: 4, color: '#c9b8e8',
      byCat: {
        armour: { affix: 'suffix', group: 'stun_avoid', text: '{0}% 几率避免被眩晕', tags: ['defence'], v: [[23, 26]] },
        weapon: { affix: 'suffix', group: 'spell_crit', text: '法术暴击率提高 {0}%', tags: ['critical', 'caster'], v: [[80, 89]] },
        jewellery: { affix: 'suffix', group: 'crit_multi', text: '+{0}% 暴击伤害加成', tags: ['critical'], v: [[21, 25]] },
      },
    },
    {
      id: 'scorn_6', name: '轻视', tierName: '刺耳', tier: 6, minIlvl: 59, cost: 5, color: '#c9b8e8',
      byCat: {
        armour: { affix: 'suffix', group: 'stun_avoid', text: '{0}% 几率避免被眩晕', tags: ['defence'], v: [[27, 30]] },
        weapon: { affix: 'suffix', group: 'spell_crit', text: '法术暴击率提高 {0}%', tags: ['critical', 'caster'], v: [[90, 109]] },
        jewellery: { affix: 'suffix', group: 'crit_multi', text: '+{0}% 暴击伤害加成', tags: ['critical'], v: [[26, 30]] },
      },
    },
  ].forEach((e) => { if (!essences.some((x) => x.id === e.id)) essences.push(e); });

  [
    {
      id: 'greed_4', name: '贪婪', tierName: '哀嚎', tier: 4, minIlvl: 30, cost: 2, canReforgeRare: false, color: '#d8c27a',
      byCat: {
        armour: { affix: 'prefix', group: 'life', text: '+{0} 最大生命', tags: ['life'], v: [[46, 60]] },
        weapon: { affix: 'suffix', group: 'life_leech', text: '物理攻击伤害的 {0}% 转化为生命偷取', tags: ['life', 'attack'], v: [[2.9, 3.2]] },
        jewellery: { affix: 'suffix', group: 'life_regen', text: '每秒回复 {0} 点生命', tags: ['life'], v: [[17.1, 24]] },
      },
      bySlot: { belt: { affix: 'suffix', group: 'flask_life', text: '药剂生命回复速度提高 {0}%', tags: ['flask', 'life'], v: [[19, 23]] } },
    },
    {
      id: 'woe_4', name: '哀伤', tierName: '哀嚎', tier: 4, minIlvl: 30, cost: 2, canReforgeRare: false, color: '#9db8e8',
      byCat: {
        armour: { affix: 'prefix', group: 'es_flat', text: '+{0} 最大能量护盾', tags: ['defence', 'es'], v: [[18, 26]] },
        weapon: { affix: 'prefix', group: 'spell_damage', text: '法术伤害提高 {0}%', tags: ['caster', 'damage'], v: [[40, 54]] },
        jewellery: { affix: 'prefix', group: 'es_flat', text: '+{0} 最大能量护盾', tags: ['defence', 'es'], v: [[10, 12]] },
      },
      bySlot: { quiver: { affix: 'prefix', group: 'bow_damage', text: '弓技能伤害提高 {0}%', tags: ['attack', 'damage'], v: [[23, 27]] } },
    },
    {
      id: 'zeal_4', name: '狂热', tierName: '哀嚎', tier: 4, minIlvl: 30, cost: 2, canReforgeRare: false, color: '#e8b46a',
      byCat: {
        armour: { affix: 'suffix', group: 'stun_recovery', text: '眩晕与格挡回复提高 {0}%', tags: ['defence'], v: [[20, 22]] },
        weapon: { affix: 'suffix', group: 'attack_speed', text: '攻击速度提高 {0}%', tags: ['speed', 'attack'], v: [[20, 22]] },
        jewellery: { affix: 'suffix', group: 'cast_speed', text: '施法速度提高 {0}%', tags: ['speed', 'caster'], v: [[7, 9]] },
      },
      bySlot: {
        gloves: { affix: 'suffix', group: 'attack_speed', text: '攻击速度提高 {0}%', tags: ['speed', 'attack'], v: [[8, 10]] },
        boots: { affix: 'suffix', group: 'move_speed', text: '移动速度提高 {0}%', tags: ['speed'], v: [[20, 20]] },
        belt: { affix: 'suffix', group: 'trap_speed', text: '陷阱与地雷投掷速度提高 {0}%', tags: ['speed'], v: [[9, 11]] },
      },
    },
    {
      id: 'loathing_4', name: '厌恶', tierName: '哀嚎', tier: 4, minIlvl: 30, cost: 3, canReforgeRare: false, color: '#c9a7e8',
      byCat: {
        armour: { affix: 'suffix', group: 'ailment_avoid', text: '{0}% 几率避免元素异常状态', tags: ['defence'], v: [[16, 20]] },
        weapon: { affix: 'suffix', group: 'crit_chance_weapon', text: '暴击率提高 {0}%', tags: ['critical'], v: [[20, 24]] },
        jewellery: { affix: 'suffix', group: 'crit_multi', text: '+{0}% 暴击伤害加成', tags: ['critical'], v: [[17, 20]] },
      },
      bySlot: {
        helmet: { affix: 'suffix', group: 'reservation_efficiency', text: '魔力保留效率提高 {0}%', tags: ['mana', 'aura'], v: [[5, 7]] },
        gloves: { affix: 'suffix', group: 'crit_chance_global', text: '全局暴击率提高 {0}%', tags: ['critical'], v: [[15, 17]] },
        shield: { affix: 'suffix', group: 'block', text: '+{0}% 格挡率', tags: ['defence'], v: [[46, 50]] },
      },
    },
  ].forEach((e) => { if (!essences.some((x) => x.id === e.id)) essences.push(e); });

  [
    {
      id: 'contempt_4', name: '蔑视', tierName: '哀嚎', tier: 4, minIlvl: 30, cost: 2, canReforgeRare: false, color: '#d89a7a',
      byCat: {
        armour: { affix: 'prefix', group: 'reflect_phys', text: '反射 {0} 点物理伤害给近战攻击者', tags: ['physical'], v: [[26, 50]] },
        weapon: { affix: 'prefix', group: 'weapon_phys_flat', text: '增加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v: [[8, 12], [17, 20]] },
        jewellery: { affix: 'prefix', group: 'added_phys_attack', text: '攻击附加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v: [[5, 7], [11, 14]] },
      },
      bySlot: {
        gloves: { affix: 'prefix', group: 'added_phys_attack', text: '攻击附加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v: [[5, 7], [11, 14]] },
        quiver: { affix: 'prefix', group: 'added_phys_attack', text: '攻击附加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v: [[5, 7], [11, 14]] },
      },
    },
    {
      id: 'hatred_4', name: '憎恨', tierName: '哀嚎', tier: 4, minIlvl: 30, cost: 2, canReforgeRare: false, color: '#8fd8e8',
      byCat: {
        armour: { affix: 'suffix', group: 'res_cold', text: '+{0}% 冰霜抗性', tags: ['resistance', 'cold'], v: [[24, 29]] },
        weapon: { affix: 'prefix', group: 'weapon_cold_flat', text: '增加 {0} 到 {1} 点冰霜伤害', tags: ['cold', 'attack'], v: [[31, 42], [62, 71]] },
        jewellery: { affix: 'prefix', group: 'cold_damage', text: '冰霜伤害提高 {0}%', tags: ['cold', 'damage'], v: [[18, 21]] },
      },
    },
    {
      id: 'anger_4', name: '愤怒', tierName: '哀嚎', tier: 4, minIlvl: 30, cost: 2, canReforgeRare: false, color: '#e88a6a',
      byCat: {
        armour: { affix: 'suffix', group: 'res_fire', text: '+{0}% 火焰抗性', tags: ['resistance', 'fire'], v: [[24, 29]] },
        weapon: { affix: 'prefix', group: 'weapon_fire_flat', text: '增加 {0} 到 {1} 点火焰伤害', tags: ['fire', 'attack'], v: [[34, 46], [68, 80]] },
        jewellery: { affix: 'prefix', group: 'fire_damage', text: '火焰伤害提高 {0}%', tags: ['fire', 'damage'], v: [[18, 21]] },
      },
    },
    {
      id: 'wrath_4', name: '雷霆', tierName: '哀嚎', tier: 4, minIlvl: 30, cost: 2, canReforgeRare: false, color: '#f0d96a',
      byCat: {
        armour: { affix: 'suffix', group: 'res_light', text: '+{0}% 闪电抗性', tags: ['resistance', 'lightning'], v: [[24, 29]] },
        weapon: { affix: 'prefix', group: 'weapon_light_flat', text: '增加 {0} 到 {1} 点闪电伤害', tags: ['lightning', 'attack'], v: [[5, 8], [112, 131]] },
        jewellery: { affix: 'prefix', group: 'light_damage', text: '闪电伤害提高 {0}%', tags: ['lightning', 'damage'], v: [[18, 21]] },
      },
    },
    {
      id: 'envy_4', name: '嫉妒', tierName: '哀嚎', tier: 4, minIlvl: 30, cost: 3, canReforgeRare: false, color: '#a8e88f',
      byCat: {
        armour: { affix: 'suffix', group: 'res_chaos', text: '+{0}% 混沌抗性', tags: ['resistance', 'chaos'], v: [[16, 20]] },
        weapon: { affix: 'prefix', group: 'chaos_flat', text: '增加 {0} 到 {1} 点混沌伤害', tags: ['chaos', 'attack'], v: [[22, 35], [48, 62]] },
        jewellery: { affix: 'prefix', group: 'chaos_damage', text: '混沌伤害提高 {0}%', tags: ['chaos', 'damage'], v: [[18, 21]] },
      },
    },
    {
      id: 'misery_4', name: '悲惨', tierName: '哀嚎', tier: 4, minIlvl: 30, cost: 2, canReforgeRare: false, color: '#9a9ae8',
      byCat: {
        armour: { affix: 'prefix', group: 'mana_flat', text: '+{0} 最大魔力', tags: ['mana'], v: [[40, 44]] },
        weapon: { affix: 'suffix', group: 'cast_speed', text: '施法速度提高 {0}%', tags: ['speed', 'caster'], v: [[17, 20]] },
        jewellery: { affix: 'suffix', group: 'mana_regen', text: '魔力回复速度提高 {0}%', tags: ['mana'], v: [[40, 48]] },
      },
    },
    {
      id: 'doubt_4', name: '疑虑', tierName: '哀嚎', tier: 4, minIlvl: 30, cost: 2, canReforgeRare: false, color: '#9ad8b8',
      byCat: {
        armour: { affix: 'prefix', group: 'ev_flat', text: '+{0} 闪避值', tags: ['defence', 'evasion'], v: [[61, 80]] },
        weapon: { affix: 'suffix', group: 'accuracy', text: '+{0} 命中值', tags: ['attack'], v: [[216, 325]] },
        jewellery: { affix: 'prefix', group: 'ev_flat', text: '+{0} 闪避值', tags: ['defence', 'evasion'], v: [[61, 80]] },
      },
    },
    {
      id: 'dread_4', name: '恐惧', tierName: '哀嚎', tier: 4, minIlvl: 30, cost: 2, canReforgeRare: false, color: '#b8a88f',
      byCat: {
        armour: { affix: 'prefix', group: 'ar_flat', text: '+{0} 护甲', tags: ['defence', 'armour'], v: [[61, 80]] },
        weapon: { affix: 'prefix', group: 'weapon_phys_pct', text: '{0}% 物理伤害提高', tags: ['physical', 'attack'], v: [[9, 12]] },
        jewellery: { affix: 'prefix', group: 'ar_flat', text: '+{0} 护甲', tags: ['defence', 'armour'], v: [[61, 80]] },
      },
    },
    {
      id: 'sorrow_4', name: '悲伤', tierName: '哀嚎', tier: 4, minIlvl: 30, cost: 2, canReforgeRare: false, color: '#8fc9e8',
      byCat: {
        armour: { affix: 'suffix', group: 'dex', text: '+{0} 敏捷', tags: ['attribute'], v: [[28, 32]] },
        weapon: { affix: 'prefix', group: 'cold_pen', text: '伤害穿透 {0}% 冰霜抗性', tags: ['cold'], v: [[5, 5]] },
        jewellery: { affix: 'suffix', group: 'dex', text: '+{0} 敏捷', tags: ['attribute'], v: [[28, 32]] },
      },
    },
    {
      id: 'rage_4', name: '暴怒', tierName: '哀嚎', tier: 4, minIlvl: 30, cost: 2, canReforgeRare: false, color: '#e89a7a',
      byCat: {
        armour: { affix: 'suffix', group: 'str', text: '+{0} 力量', tags: ['attribute'], v: [[28, 32]] },
        weapon: { affix: 'prefix', group: 'fire_pen', text: '伤害穿透 {0}% 火焰抗性', tags: ['fire'], v: [[5, 5]] },
        jewellery: { affix: 'suffix', group: 'str', text: '+{0} 力量', tags: ['attribute'], v: [[28, 32]] },
      },
    },
    {
      id: 'spite_4', name: '恶意', tierName: '哀嚎', tier: 4, minIlvl: 30, cost: 2, canReforgeRare: false, color: '#e8d88f',
      byCat: {
        armour: { affix: 'suffix', group: 'int', text: '+{0} 智慧', tags: ['attribute'], v: [[28, 32]] },
        weapon: { affix: 'prefix', group: 'light_pen', text: '伤害穿透 {0}% 闪电抗性', tags: ['lightning'], v: [[5, 5]] },
        jewellery: { affix: 'suffix', group: 'int', text: '+{0} 智慧', tags: ['attribute'], v: [[28, 32]] },
      },
    },
    {
      id: 'scorn_4', name: '轻视', tierName: '哀嚎', tier: 4, minIlvl: 30, cost: 3, canReforgeRare: false, color: '#c9b8e8',
      byCat: {
        armour: { affix: 'suffix', group: 'stun_avoid', text: '{0}% 几率避免被眩晕', tags: ['defence'], v: [[16, 20]] },
        weapon: { affix: 'suffix', group: 'spell_crit', text: '法术暴击率提高 {0}%', tags: ['critical', 'caster'], v: [[60, 69]] },
        jewellery: { affix: 'suffix', group: 'crit_multi', text: '+{0}% 暴击伤害加成', tags: ['critical'], v: [[17, 20]] },
      },
    },
  ].forEach((e) => { if (!essences.some((x) => x.id === e.id)) essences.push(e); });

  [
    {
      id: 'greed_3', name: '贪婪', tierName: '哭泣', tier: 3, minIlvl: 18, cost: 1, canReforgeRare: false, color: '#d8c27a',
      byCat: {
        armour: { affix: 'prefix', group: 'life', text: '+{0} 最大生命', tags: ['life'], v: [[31, 45]] },
        weapon: { affix: 'suffix', group: 'life_leech', text: '物理攻击伤害的 {0}% 转化为生命偷取', tags: ['life', 'attack'], v: [[2.5, 2.8]] },
        jewellery: { affix: 'suffix', group: 'life_regen', text: '每秒回复 {0} 点生命', tags: ['life'], v: [[12.1, 17]] },
      },
      bySlot: { belt: { affix: 'suffix', group: 'flask_life', text: '药剂生命回复速度提高 {0}%', tags: ['flask', 'life'], v: [[14, 18]] } },
    },
    {
      id: 'woe_3', name: '哀伤', tierName: '哭泣', tier: 3, minIlvl: 18, cost: 1, canReforgeRare: false, color: '#9db8e8',
      byCat: {
        armour: { affix: 'prefix', group: 'es_flat', text: '+{0} 最大能量护盾', tags: ['defence', 'es'], v: [[17, 23]] },
        weapon: { affix: 'prefix', group: 'spell_damage', text: '法术伤害提高 {0}%', tags: ['caster', 'damage'], v: [[30, 39]] },
        jewellery: { affix: 'prefix', group: 'es_flat', text: '+{0} 最大能量护盾', tags: ['defence', 'es'], v: [[8, 10]] },
      },
      bySlot: { quiver: { affix: 'prefix', group: 'bow_damage', text: '弓技能伤害提高 {0}%', tags: ['attack', 'damage'], v: [[17, 21]] } },
    },
    {
      id: 'zeal_3', name: '狂热', tierName: '哭泣', tier: 3, minIlvl: 18, cost: 1, canReforgeRare: false, color: '#e8b46a',
      byCat: {
        armour: { affix: 'suffix', group: 'stun_recovery', text: '眩晕与格挡回复提高 {0}%', tags: ['defence'], v: [[15, 17]] },
        weapon: { affix: 'suffix', group: 'attack_speed', text: '攻击速度提高 {0}%', tags: ['speed', 'attack'], v: [[15, 17]] },
        jewellery: { affix: 'suffix', group: 'cast_speed', text: '施法速度提高 {0}%', tags: ['speed', 'caster'], v: [[6, 8]] },
      },
      bySlot: {
        gloves: { affix: 'suffix', group: 'attack_speed', text: '攻击速度提高 {0}%', tags: ['speed', 'attack'], v: [[6, 8]] },
        boots: { affix: 'suffix', group: 'move_speed', text: '移动速度提高 {0}%', tags: ['speed'], v: [[15, 15]] },
        belt: { affix: 'suffix', group: 'trap_speed', text: '陷阱与地雷投掷速度提高 {0}%', tags: ['speed'], v: [[7, 9]] },
      },
    },
    {
      id: 'loathing_3', name: '厌恶', tierName: '哭泣', tier: 3, minIlvl: 18, cost: 2, canReforgeRare: false, color: '#c9a7e8',
      byCat: {
        armour: { affix: 'suffix', group: 'ailment_avoid', text: '{0}% 几率避免元素异常状态', tags: ['defence'], v: [[12, 15]] },
        weapon: { affix: 'suffix', group: 'crit_chance_weapon', text: '暴击率提高 {0}%', tags: ['critical'], v: [[15, 18]] },
        jewellery: { affix: 'suffix', group: 'crit_multi', text: '+{0}% 暴击伤害加成', tags: ['critical'], v: [[13, 16]] },
      },
      bySlot: {
        helmet: { affix: 'suffix', group: 'reservation_efficiency', text: '魔力保留效率提高 {0}%', tags: ['mana', 'aura'], v: [[4, 6]] },
        gloves: { affix: 'suffix', group: 'crit_chance_global', text: '全局暴击率提高 {0}%', tags: ['critical'], v: [[11, 13]] },
        shield: { affix: 'suffix', group: 'block', text: '+{0}% 格挡率', tags: ['defence'], v: [[34, 38]] },
      },
    },
  ].forEach((e) => { if (!essences.some((x) => x.id === e.id)) essences.push(e); });

  [
    {
      id: 'contempt_3', name: '蔑视', tierName: '哭泣', tier: 3, minIlvl: 18, cost: 1, canReforgeRare: false, color: '#d89a7a',
      byCat: {
        armour: { affix: 'prefix', group: 'reflect_phys', text: '反射 {0} 点物理伤害给近战攻击者', tags: ['physical'], v: [[13, 25]] },
        weapon: { affix: 'prefix', group: 'weapon_phys_flat', text: '增加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v: [[6, 9], [13, 15]] },
        jewellery: { affix: 'prefix', group: 'added_phys_attack', text: '攻击附加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v: [[4, 5], [9, 11]] },
      },
      bySlot: {
        gloves: { affix: 'prefix', group: 'added_phys_attack', text: '攻击附加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v: [[4, 5], [9, 11]] },
        quiver: { affix: 'prefix', group: 'added_phys_attack', text: '攻击附加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v: [[4, 5], [9, 11]] },
      },
    },
    {
      id: 'hatred_3', name: '憎恨', tierName: '哭泣', tier: 3, minIlvl: 18, cost: 1, canReforgeRare: false, color: '#8fd8e8',
      byCat: {
        armour: { affix: 'suffix', group: 'res_cold', text: '+{0}% 冰霜抗性', tags: ['resistance', 'cold'], v: [[17, 20]] },
        weapon: { affix: 'prefix', group: 'weapon_cold_flat', text: '增加 {0} 到 {1} 点冰霜伤害', tags: ['cold', 'attack'], v: [[17, 23], [34, 39]] },
        jewellery: { affix: 'prefix', group: 'cold_damage', text: '冰霜伤害提高 {0}%', tags: ['cold', 'damage'], v: [[13, 15]] },
      },
    },
    {
      id: 'anger_3', name: '愤怒', tierName: '哭泣', tier: 3, minIlvl: 18, cost: 1, canReforgeRare: false, color: '#e88a6a',
      byCat: {
        armour: { affix: 'suffix', group: 'res_fire', text: '+{0}% 火焰抗性', tags: ['resistance', 'fire'], v: [[17, 20]] },
        weapon: { affix: 'prefix', group: 'weapon_fire_flat', text: '增加 {0} 到 {1} 点火焰伤害', tags: ['fire', 'attack'], v: [[20, 27], [40, 47]] },
        jewellery: { affix: 'prefix', group: 'fire_damage', text: '火焰伤害提高 {0}%', tags: ['fire', 'damage'], v: [[13, 15]] },
      },
    },
    {
      id: 'wrath_3', name: '雷霆', tierName: '哭泣', tier: 3, minIlvl: 18, cost: 1, canReforgeRare: false, color: '#f0d96a',
      byCat: {
        armour: { affix: 'suffix', group: 'res_light', text: '+{0}% 闪电抗性', tags: ['resistance', 'lightning'], v: [[17, 20]] },
        weapon: { affix: 'prefix', group: 'weapon_light_flat', text: '增加 {0} 到 {1} 点闪电伤害', tags: ['lightning', 'attack'], v: [[3, 3], [57, 67]] },
        jewellery: { affix: 'prefix', group: 'light_damage', text: '闪电伤害提高 {0}%', tags: ['lightning', 'damage'], v: [[13, 15]] },
      },
    },
    {
      id: 'envy_3', name: '嫉妒', tierName: '哭泣', tier: 3, minIlvl: 18, cost: 2, canReforgeRare: false, color: '#a8e88f',
      byCat: {
        armour: { affix: 'suffix', group: 'res_chaos', text: '+{0}% 混沌抗性', tags: ['resistance', 'chaos'], v: [[12, 15]] },
        weapon: { affix: 'prefix', group: 'chaos_flat', text: '增加 {0} 到 {1} 点混沌伤害', tags: ['chaos', 'attack'], v: [[13, 20], [28, 36]] },
        jewellery: { affix: 'prefix', group: 'chaos_damage', text: '混沌伤害提高 {0}%', tags: ['chaos', 'damage'], v: [[13, 15]] },
      },
    },
    {
      id: 'misery_3', name: '悲惨', tierName: '哭泣', tier: 3, minIlvl: 18, cost: 1, canReforgeRare: false, color: '#9a9ae8',
      byCat: {
        armour: { affix: 'prefix', group: 'mana_flat', text: '+{0} 最大魔力', tags: ['mana'], v: [[28, 31]] },
        weapon: { affix: 'suffix', group: 'cast_speed', text: '施法速度提高 {0}%', tags: ['speed', 'caster'], v: [[12, 14]] },
        jewellery: { affix: 'suffix', group: 'mana_regen', text: '魔力回复速度提高 {0}%', tags: ['mana'], v: [[28, 34]] },
      },
    },
    {
      id: 'doubt_3', name: '疑虑', tierName: '哭泣', tier: 3, minIlvl: 18, cost: 1, canReforgeRare: false, color: '#9ad8b8',
      byCat: {
        armour: { affix: 'prefix', group: 'ev_flat', text: '+{0} 闪避值', tags: ['defence', 'evasion'], v: [[45, 60]] },
        weapon: { affix: 'suffix', group: 'accuracy', text: '+{0} 命中值', tags: ['attack'], v: [[131, 215]] },
        jewellery: { affix: 'prefix', group: 'ev_flat', text: '+{0} 闪避值', tags: ['defence', 'evasion'], v: [[45, 60]] },
      },
    },
    {
      id: 'dread_3', name: '恐惧', tierName: '哭泣', tier: 3, minIlvl: 18, cost: 1, canReforgeRare: false, color: '#b8a88f',
      byCat: {
        armour: { affix: 'prefix', group: 'ar_flat', text: '+{0} 护甲', tags: ['defence', 'armour'], v: [[45, 60]] },
        weapon: { affix: 'prefix', group: 'weapon_phys_pct', text: '{0}% 物理伤害提高', tags: ['physical', 'attack'], v: [[7, 9]] },
        jewellery: { affix: 'prefix', group: 'ar_flat', text: '+{0} 护甲', tags: ['defence', 'armour'], v: [[45, 60]] },
      },
    },
    {
      id: 'sorrow_3', name: '悲伤', tierName: '哭泣', tier: 3, minIlvl: 18, cost: 1, canReforgeRare: false, color: '#8fc9e8',
      byCat: {
        armour: { affix: 'suffix', group: 'dex', text: '+{0} 敏捷', tags: ['attribute'], v: [[22, 25]] },
        weapon: { affix: 'prefix', group: 'cold_pen', text: '伤害穿透 {0}% 冰霜抗性', tags: ['cold'], v: [[4, 4]] },
        jewellery: { affix: 'suffix', group: 'dex', text: '+{0} 敏捷', tags: ['attribute'], v: [[22, 25]] },
      },
    },
    {
      id: 'rage_3', name: '暴怒', tierName: '哭泣', tier: 3, minIlvl: 18, cost: 1, canReforgeRare: false, color: '#e89a7a',
      byCat: {
        armour: { affix: 'suffix', group: 'str', text: '+{0} 力量', tags: ['attribute'], v: [[22, 25]] },
        weapon: { affix: 'prefix', group: 'fire_pen', text: '伤害穿透 {0}% 火焰抗性', tags: ['fire'], v: [[4, 4]] },
        jewellery: { affix: 'suffix', group: 'str', text: '+{0} 力量', tags: ['attribute'], v: [[22, 25]] },
      },
    },
    {
      id: 'spite_3', name: '恶意', tierName: '哭泣', tier: 3, minIlvl: 18, cost: 1, canReforgeRare: false, color: '#e8d88f',
      byCat: {
        armour: { affix: 'suffix', group: 'int', text: '+{0} 智慧', tags: ['attribute'], v: [[22, 25]] },
        weapon: { affix: 'prefix', group: 'light_pen', text: '伤害穿透 {0}% 闪电抗性', tags: ['lightning'], v: [[4, 4]] },
        jewellery: { affix: 'suffix', group: 'int', text: '+{0} 智慧', tags: ['attribute'], v: [[22, 25]] },
      },
    },
    {
      id: 'scorn_3', name: '轻视', tierName: '哭泣', tier: 3, minIlvl: 18, cost: 2, canReforgeRare: false, color: '#c9b8e8',
      byCat: {
        armour: { affix: 'suffix', group: 'stun_avoid', text: '{0}% 几率避免被眩晕', tags: ['defence'], v: [[12, 15]] },
        weapon: { affix: 'suffix', group: 'spell_crit', text: '法术暴击率提高 {0}%', tags: ['critical', 'caster'], v: [[40, 49]] },
        jewellery: { affix: 'suffix', group: 'crit_multi', text: '+{0}% 暴击伤害加成', tags: ['critical'], v: [[13, 16]] },
      },
    },
  ].forEach((e) => { if (!essences.some((x) => x.id === e.id)) essences.push(e); });

  /* Tier 1 / 2：低语 / 呢喃。低阶精华只能升级普通物品。 */
  const lowTierSpecs = [
    {
      id: 'greed', name: '贪婪', color: '#d8c27a',
      byCat: {
        armour: { affix: 'prefix', group: 'life', text: '+{0} 最大生命', tags: ['life'], v2: [[16, 30]], v1: [[11, 15]] },
        weapon: { affix: 'suffix', group: 'life_leech', text: '物理攻击伤害的 {0}% 转化为生命偷取', tags: ['life', 'attack'], v2: [[2.1, 2.4]], v1: [[1.7, 2.0]] },
        jewellery: { affix: 'suffix', group: 'life_regen', text: '每秒回复 {0} 点生命', tags: ['life'], v2: [[8.1, 12]], v1: [[4.1, 8]] },
      },
      bySlot: { belt: { affix: 'suffix', group: 'flask_life', text: '药剂生命回复速度提高 {0}%', tags: ['flask', 'life'], v2: [[9, 13]], v1: [[5, 8]] } },
    },
    {
      id: 'woe', name: '哀伤', color: '#9db8e8',
      byCat: {
        armour: { affix: 'prefix', group: 'es_flat', text: '+{0} 最大能量护盾', tags: ['defence', 'es'], v2: [[12, 16]], v1: [[8, 11]] },
        weapon: { affix: 'prefix', group: 'spell_damage', text: '法术伤害提高 {0}%', tags: ['caster', 'damage'], v2: [[20, 29]], v1: [[10, 19]] },
        jewellery: { affix: 'prefix', group: 'es_flat', text: '+{0} 最大能量护盾', tags: ['defence', 'es'], v2: [[6, 8]], v1: [[4, 5]] },
      },
      bySlot: { quiver: { affix: 'prefix', group: 'bow_damage', text: '弓技能伤害提高 {0}%', tags: ['attack', 'damage'], v2: [[12, 16]], v1: [[7, 11]] } },
    },
    {
      id: 'zeal', name: '狂热', color: '#e8b46a',
      byCat: {
        armour: { affix: 'suffix', group: 'stun_recovery', text: '眩晕与格挡回复提高 {0}%', tags: ['defence'], v2: [[12, 14]], v1: [[8, 10]] },
        weapon: { affix: 'suffix', group: 'attack_speed', text: '攻击速度提高 {0}%', tags: ['speed', 'attack'], v2: [[12, 14]], v1: [[8, 10]] },
        jewellery: { affix: 'suffix', group: 'cast_speed', text: '施法速度提高 {0}%', tags: ['speed', 'caster'], v2: [[5, 7]], v1: [[3, 4]] },
      },
      bySlot: {
        gloves: { affix: 'suffix', group: 'attack_speed', text: '攻击速度提高 {0}%', tags: ['speed', 'attack'], v2: [[4, 6]], v1: [[2, 3]] },
        boots: { affix: 'suffix', group: 'move_speed', text: '移动速度提高 {0}%', tags: ['speed'], v2: [[10, 10]], v1: [[5, 5]] },
        belt: { affix: 'suffix', group: 'trap_speed', text: '陷阱与地雷投掷速度提高 {0}%', tags: ['speed'], v2: [[5, 7]], v1: [[3, 4]] },
      },
    },
    {
      id: 'loathing', name: '厌恶', color: '#c9a7e8',
      byCat: {
        armour: { affix: 'suffix', group: 'ailment_avoid', text: '{0}% 几率避免元素异常状态', tags: ['defence'], v2: [[8, 11]], v1: [[5, 7]] },
        weapon: { affix: 'suffix', group: 'crit_chance_weapon', text: '暴击率提高 {0}%', tags: ['critical'], v2: [[10, 14]], v1: [[6, 9]] },
        jewellery: { affix: 'suffix', group: 'crit_multi', text: '+{0}% 暴击伤害加成', tags: ['critical'], v2: [[9, 12]], v1: [[5, 8]] },
      },
      bySlot: {
        helmet: { affix: 'suffix', group: 'reservation_efficiency', text: '魔力保留效率提高 {0}%', tags: ['mana', 'aura'], v2: [[3, 4]], v1: [[2, 3]] },
        gloves: { affix: 'suffix', group: 'crit_chance_global', text: '全局暴击率提高 {0}%', tags: ['critical'], v2: [[8, 10]], v1: [[5, 7]] },
        shield: { affix: 'suffix', group: 'block', text: '+{0}% 格挡率', tags: ['defence'], v2: [[25, 29]], v1: [[16, 20]] },
      },
    },
    {
      id: 'contempt', name: '蔑视', color: '#d89a7a',
      byCat: {
        armour: { affix: 'prefix', group: 'reflect_phys', text: '反射 {0} 点物理伤害给近战攻击者', tags: ['physical'], v2: [[6, 12]], v1: [[3, 5]] },
        weapon: { affix: 'prefix', group: 'weapon_phys_flat', text: '增加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v2: [[4, 6], [9, 11]], v1: [[2, 4], [5, 7]] },
        jewellery: { affix: 'prefix', group: 'added_phys_attack', text: '攻击附加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v2: [[3, 4], [6, 8]], v1: [[2, 3], [4, 5]] },
      },
      bySlot: {
        gloves: { affix: 'prefix', group: 'added_phys_attack', text: '攻击附加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v2: [[3, 4], [6, 8]], v1: [[2, 3], [4, 5]] },
        quiver: { affix: 'prefix', group: 'added_phys_attack', text: '攻击附加 {0} 到 {1} 点物理伤害', tags: ['physical', 'attack'], v2: [[3, 4], [6, 8]], v1: [[2, 3], [4, 5]] },
      },
    },
    {
      id: 'hatred', name: '憎恨', color: '#8fd8e8',
      byCat: {
        armour: { affix: 'suffix', group: 'res_cold', text: '+{0}% 冰霜抗性', tags: ['resistance', 'cold'], v2: [[12, 16]], v1: [[6, 11]] },
        weapon: { affix: 'prefix', group: 'weapon_cold_flat', text: '增加 {0} 到 {1} 点冰霜伤害', tags: ['cold', 'attack'], v2: [[9, 13], [18, 23]], v1: [[5, 8], [10, 15]] },
        jewellery: { affix: 'prefix', group: 'cold_damage', text: '冰霜伤害提高 {0}%', tags: ['cold', 'damage'], v2: [[8, 10]], v1: [[5, 7]] },
      },
    },
    {
      id: 'anger', name: '愤怒', color: '#e88a6a',
      byCat: {
        armour: { affix: 'suffix', group: 'res_fire', text: '+{0}% 火焰抗性', tags: ['resistance', 'fire'], v2: [[12, 16]], v1: [[6, 11]] },
        weapon: { affix: 'prefix', group: 'weapon_fire_flat', text: '增加 {0} 到 {1} 点火焰伤害', tags: ['fire', 'attack'], v2: [[10, 14], [20, 24]], v1: [[6, 9], [11, 16]] },
        jewellery: { affix: 'prefix', group: 'fire_damage', text: '火焰伤害提高 {0}%', tags: ['fire', 'damage'], v2: [[8, 10]], v1: [[5, 7]] },
      },
    },
    {
      id: 'wrath', name: '雷霆', color: '#f0d96a',
      byCat: {
        armour: { affix: 'suffix', group: 'res_light', text: '+{0}% 闪电抗性', tags: ['resistance', 'lightning'], v2: [[12, 16]], v1: [[6, 11]] },
        weapon: { affix: 'prefix', group: 'weapon_light_flat', text: '增加 {0} 到 {1} 点闪电伤害', tags: ['lightning', 'attack'], v2: [[2, 2], [35, 44]], v1: [[1, 1], [18, 26]] },
        jewellery: { affix: 'prefix', group: 'light_damage', text: '闪电伤害提高 {0}%', tags: ['lightning', 'damage'], v2: [[8, 10]], v1: [[5, 7]] },
      },
    },
    {
      id: 'envy', name: '嫉妒', color: '#a8e88f',
      byCat: {
        armour: { affix: 'suffix', group: 'res_chaos', text: '+{0}% 混沌抗性', tags: ['resistance', 'chaos'], v2: [[8, 11]], v1: [[5, 7]] },
        weapon: { affix: 'prefix', group: 'chaos_flat', text: '增加 {0} 到 {1} 点混沌伤害', tags: ['chaos', 'attack'], v2: [[7, 12], [15, 22]], v1: [[4, 7], [8, 13]] },
        jewellery: { affix: 'prefix', group: 'chaos_damage', text: '混沌伤害提高 {0}%', tags: ['chaos', 'damage'], v2: [[8, 10]], v1: [[5, 7]] },
      },
    },
    {
      id: 'misery', name: '悲惨', color: '#9a9ae8',
      byCat: {
        armour: { affix: 'prefix', group: 'mana_flat', text: '+{0} 最大魔力', tags: ['mana'], v2: [[18, 22]], v1: [[10, 14]] },
        weapon: { affix: 'suffix', group: 'cast_speed', text: '施法速度提高 {0}%', tags: ['speed', 'caster'], v2: [[8, 11]], v1: [[5, 7]] },
        jewellery: { affix: 'suffix', group: 'mana_regen', text: '魔力回复速度提高 {0}%', tags: ['mana'], v2: [[18, 24]], v1: [[10, 16]] },
      },
    },
    {
      id: 'doubt', name: '疑虑', color: '#9ad8b8',
      byCat: {
        armour: { affix: 'prefix', group: 'ev_flat', text: '+{0} 闪避值', tags: ['defence', 'evasion'], v2: [[28, 44]], v1: [[15, 27]] },
        weapon: { affix: 'suffix', group: 'accuracy', text: '+{0} 命中值', tags: ['attack'], v2: [[66, 130]], v1: [[33, 65]] },
        jewellery: { affix: 'prefix', group: 'ev_flat', text: '+{0} 闪避值', tags: ['defence', 'evasion'], v2: [[28, 44]], v1: [[15, 27]] },
      },
    },
    {
      id: 'dread', name: '恐惧', color: '#b8a88f',
      byCat: {
        armour: { affix: 'prefix', group: 'ar_flat', text: '+{0} 护甲', tags: ['defence', 'armour'], v2: [[28, 44]], v1: [[15, 27]] },
        weapon: { affix: 'prefix', group: 'weapon_phys_pct', text: '{0}% 物理伤害提高', tags: ['physical', 'attack'], v2: [[5, 6]], v1: [[3, 4]] },
        jewellery: { affix: 'prefix', group: 'ar_flat', text: '+{0} 护甲', tags: ['defence', 'armour'], v2: [[28, 44]], v1: [[15, 27]] },
      },
    },
    {
      id: 'sorrow', name: '悲伤', color: '#8fc9e8',
      byCat: {
        armour: { affix: 'suffix', group: 'dex', text: '+{0} 敏捷', tags: ['attribute'], v2: [[16, 19]], v1: [[10, 15]] },
        weapon: { affix: 'prefix', group: 'cold_pen', text: '伤害穿透 {0}% 冰霜抗性', tags: ['cold'], v2: [[3, 3]], v1: [[2, 2]] },
        jewellery: { affix: 'suffix', group: 'dex', text: '+{0} 敏捷', tags: ['attribute'], v2: [[16, 19]], v1: [[10, 15]] },
      },
    },
    {
      id: 'rage', name: '暴怒', color: '#e89a7a',
      byCat: {
        armour: { affix: 'suffix', group: 'str', text: '+{0} 力量', tags: ['attribute'], v2: [[16, 19]], v1: [[10, 15]] },
        weapon: { affix: 'prefix', group: 'fire_pen', text: '伤害穿透 {0}% 火焰抗性', tags: ['fire'], v2: [[3, 3]], v1: [[2, 2]] },
        jewellery: { affix: 'suffix', group: 'str', text: '+{0} 力量', tags: ['attribute'], v2: [[16, 19]], v1: [[10, 15]] },
      },
    },
    {
      id: 'spite', name: '恶意', color: '#e8d88f',
      byCat: {
        armour: { affix: 'suffix', group: 'int', text: '+{0} 智慧', tags: ['attribute'], v2: [[16, 19]], v1: [[10, 15]] },
        weapon: { affix: 'prefix', group: 'light_pen', text: '伤害穿透 {0}% 闪电抗性', tags: ['lightning'], v2: [[3, 3]], v1: [[2, 2]] },
        jewellery: { affix: 'suffix', group: 'int', text: '+{0} 智慧', tags: ['attribute'], v2: [[16, 19]], v1: [[10, 15]] },
      },
    },
    {
      id: 'scorn', name: '轻视', color: '#c9b8e8',
      byCat: {
        armour: { affix: 'suffix', group: 'stun_avoid', text: '{0}% 几率避免被眩晕', tags: ['defence'], v2: [[8, 11]], v1: [[5, 7]] },
        weapon: { affix: 'suffix', group: 'spell_crit', text: '法术暴击率提高 {0}%', tags: ['critical', 'caster'], v2: [[25, 34]], v1: [[15, 24]] },
        jewellery: { affix: 'suffix', group: 'crit_multi', text: '+{0}% 暴击伤害加成', tags: ['critical'], v2: [[9, 12]], v1: [[5, 8]] },
      },
    },
  ];
  const tierNames = { 2: '呢喃', 1: '低语' };
  const tierIlvl = { 2: 10, 1: 2 };
  const pickV = (def, tier) => ({ affix: def.affix, group: def.group, text: def.text, tags: def.tags, v: def['v' + tier] });
  lowTierSpecs.forEach((spec) => {
    [2, 1].forEach((tier) => {
      const byCat = {};
      const bySlot = {};
      Object.keys(spec.byCat).forEach((k) => { byCat[k] = pickV(spec.byCat[k], tier); });
      Object.keys(spec.bySlot || {}).forEach((k) => { bySlot[k] = pickV(spec.bySlot[k], tier); });
      const id = spec.id + '_' + tier;
      if (!essences.some((e) => e.id === id)) essences.push({
        id, name: spec.name, tierName: tierNames[tier], tier, minIlvl: tierIlvl[tier], cost: tier === 2 ? 1 : 1,
        canReforgeRare: false, color: spec.color, byCat, bySlot,
      });
    });
  });

  const presets = [
    {
      id: 'life_helmet', name: '血量双抗头盔', desc: '入门目标：T3 生命 + T4 双抗。T4 抗性可以用工艺补最后一条，适合先跑通流程。',
      baseId: 'hubris_circlet', ilvl: 86,
      targets: [
        { modId: 'life_flat', tier: 3 }, { modId: 'res_fire', tier: 4 },
        { modId: 'res_cold', tier: 4 },
      ],
    },
    {
      id: 'life_helmet_triple', name: '血量三抗头盔', desc: '进阶四词缀：T3 生命 + 三抗 T4，最后一抗可以靠工艺补。',
      baseId: 'hubris_circlet', ilvl: 86,
      targets: [
        { modId: 'life_flat', tier: 3 }, { modId: 'res_fire', tier: 4 },
        { modId: 'res_cold', tier: 4 }, { modId: 'res_light', tier: 4 },
      ],
    },
    {
      id: 'move_boots', name: '移速血抗鞋', desc: 'T2 移速 + T2 生命 + T4 火抗，精华开局，工艺补抗。',
      baseId: 'sorcerer_boots', ilvl: 86,
      targets: [
        { modId: 'move_speed', tier: 2 }, { modId: 'life_flat', tier: 2 },
        { modId: 'res_fire', tier: 4 },
      ],
    },
    {
      id: 'attack_gloves', name: '攻速血抗手套', desc: '物理 / 元素攻击通用，T2 攻速与生命，抗性用 T4 工艺补。',
      baseId: 'fingerless_silk', ilvl: 86,
      targets: [
        { modId: 'life_flat', tier: 2 }, { modId: 'attack_speed', tier: 2 },
        { modId: 'res_fire', tier: 4 }, { modId: 'res_cold', tier: 4 },
      ],
    },
    {
      id: 'phys_bow', name: '物理弓', desc: '高预算物理弓：前缀物理三连，后缀攻速 / 暴击。',
      baseId: 'spine_bow', ilvl: 86,
      targets: [
        { modId: 'weapon_phys_pct', tier: 3 }, { modId: 'weapon_phys_flat', tier: 2 },
        { modId: 'attack_speed', tier: 3 }, { modId: 'crit_chance_weapon', tier: 3 },
        { modId: 'crit_multi', tier: 3 },
      ],
    },
    {
      id: 'spell_wand', name: '法术短杖', desc: '法术技能等级 + 法术伤害 + 施法速度，适合法系。',
      baseId: 'imbued_wand', ilvl: 86,
      targets: [
        { modId: 'gem_level_spell', tier: 2 }, { modId: 'spell_damage', tier: 2 },
        { modId: 'cast_speed', tier: 3 }, { modId: 'crit_multi', tier: 3 },
      ],
    },
    {
      id: 'minion_helmet', name: '召唤头盔', desc: '需要长者影响的 +2 召唤技能等级，走精华 / 化石路线。',
      baseId: 'hubris_circlet', ilvl: 86, influences: ['elder'],
      targets: [
        { modId: 'gem_level_minion', tier: 1 }, { modId: 'minion_life', tier: 3 },
        { modId: 'life_flat', tier: 3 }, { modId: 'res_fire', tier: 4 },
      ],
    },
    {
      id: 'belt_life', name: '血抗腰带', desc: 'T3 生命 + T4 三抗 + T3 药剂效果，工艺台收尾非常关键。',
      baseId: 'leather_belt', ilvl: 86,
      targets: [
        { modId: 'life_flat', tier: 3 }, { modId: 'res_fire', tier: 4 },
        { modId: 'res_cold', tier: 4 }, { modId: 'res_light', tier: 4 },
        { modId: 'flask_effect', tier: 3 },
      ],
    },
    {
      id: 'steel_ring', name: '物理点伤戒指', desc: '钢制戒指，生命 + 物理点伤 + T4 双抗 / 命中。',
      baseId: 'steel_ring', ilvl: 86,
      targets: [
        { modId: 'life_flat', tier: 3 }, { modId: 'added_phys_attack', tier: 2 },
        { modId: 'res_fire', tier: 4 }, { modId: 'res_cold', tier: 4 },
      ],
    },
  ];

  const slots = [
    { id: 'helmet', name: '头盔' }, { id: 'body', name: '胸甲' }, { id: 'gloves', name: '手套' },
    { id: 'boots', name: '鞋子' }, { id: 'shield', name: '盾牌' }, { id: 'weapon', name: '武器' },
    { id: 'ring', name: '戒指' }, { id: 'amulet', name: '项链' }, { id: 'belt', name: '腰带' },
    { id: 'quiver', name: '箭袋' },
  ];

  const influences = [
    { id: 'shaper', name: '塑界者', color: '#8fd8e8' },
    { id: 'elder', name: '裂界者', color: '#c9a7e8' },
    { id: 'crusader', name: '圣战者', color: '#f0d96a' },
    { id: 'hunter', name: '狩猎者', color: '#a8e88f' },
    { id: 'redeemer', name: '救赎者', color: '#8fc9e8' },
    { id: 'warlord', name: '督军', color: '#e88a6a' },
  ];

  const harvestTags = [
    { id: 'life', name: '生命' }, { id: 'defence', name: '防御' }, { id: 'physical', name: '物理' },
    { id: 'fire', name: '火焰' }, { id: 'cold', name: '冰霜' }, { id: 'lightning', name: '闪电' },
    { id: 'chaos', name: '混沌' }, { id: 'attack', name: '攻击' }, { id: 'caster', name: '施法' },
    { id: 'speed', name: '速度' }, { id: 'critical', name: '暴击' }, { id: 'minion', name: '召唤' },
    { id: 'aura', name: '光环' }, { id: 'resistance', name: '抗性' },
  ];

  const vaalImplicits = {
    helmet: ['+1 to Level of Socketed Gems', '+(15-25) to Strength', '(4-6)% increased maximum Life'],
    body: ['+1 to Level of Socketed Gems', '+(15-25) to all Attributes', '(4-6)% increased maximum Life'],
    gloves: ['(8-10)% increased Attack Speed', '+(15-25) to Dexterity', '(4-6)% increased maximum Life'],
    boots: ['(8-10)% increased Movement Speed', '+(15-25) to Strength', '(4-6)% increased maximum Life'],
    shield: ['+(1-2)% to all maximum Elemental Resistances', '+(15-25) to Intelligence', '(4-6)% increased maximum Life'],
    weapon: ['(8-10)% increased Attack Speed', '+1 to Level of Socketed Gems', '(10-15)% increased Physical Damage'],
    quiver: ['(8-10)% increased Attack Speed', '+(15-25) to Dexterity', '(10-15)% increased Projectile Damage'],
    ring: ['+(10-15) to all Attributes', '+(20-30)% to Chaos Resistance', '+(15-25) to maximum Life'],
    amulet: ['+(10-15) to all Attributes', '+1 to Level of Socketed Gems', '+(20-30)% to Chaos Resistance'],
    belt: ['+(10-15) to all Attributes', '+(20-30)% to Chaos Resistance', '(10-15)% increased Flask Effect Duration'],
  };

  const veiledMods = [
    { id: 'veiled_life', name: '最大生命', affix: 'prefix', group: 'life', text: '+{0} 最大生命', v: [[80, 89]], slots: GEAR },
    { id: 'veiled_life_pct', name: '最大生命提高', affix: 'prefix', group: 'life_pct', text: '{0}% 最大生命提高', v: [[8, 10]], slots: ['body', 'helmet', 'belt'] },
    { id: 'veiled_es', name: '最大能量护盾', affix: 'prefix', group: 'es_flat', text: '+{0} 最大能量护盾', v: [[80, 100]], slots: ARMOUR },
    { id: 'veiled_ar', name: '护甲提高', affix: 'prefix', group: 'ar_pct', text: '{0}% 护甲提高', v: [[25, 35]], slots: ARMOUR },
    { id: 'veiled_ev', name: '闪避值提高', affix: 'prefix', group: 'ev_pct', text: '{0}% 闪避值提高', v: [[25, 35]], slots: ARMOUR },
    { id: 'veiled_all_attr', name: '全属性', affix: 'suffix', group: 'all_attributes', text: '+{0} 全部属性', v: [[15, 20]], slots: GEAR },
    { id: 'veiled_fire_res', name: '火焰抗性', affix: 'suffix', group: 'res_fire', text: '+{0}% 火焰抗性', v: [[40, 45]], slots: GEAR },
    { id: 'veiled_cold_res', name: '冰霜抗性', affix: 'suffix', group: 'res_cold', text: '+{0}% 冰霜抗性', v: [[40, 45]], slots: GEAR },
    { id: 'veiled_light_res', name: '闪电抗性', affix: 'suffix', group: 'res_light', text: '+{0}% 闪电抗性', v: [[40, 45]], slots: GEAR },
    { id: 'veiled_chaos_res', name: '混沌抗性', affix: 'suffix', group: 'res_chaos', text: '+{0}% 混沌抗性', v: [[25, 30]], slots: GEAR },
    { id: 'veiled_attack_speed', name: '攻击速度', affix: 'suffix', group: 'attack_speed', text: '攻击速度提高 {0}%', v: [[10, 12]], slots: ['gloves', 'weapon', 'quiver'] },
    { id: 'veiled_cast_speed', name: '施法速度', affix: 'suffix', group: 'cast_speed', text: '施法速度提高 {0}%', v: [[10, 12]], slots: ['gloves', 'ring', 'amulet', 'weapon'] },
    { id: 'veiled_crit_multi', name: '暴击伤害加成', affix: 'suffix', group: 'crit_multi', text: '+{0}% 暴击伤害加成', v: [[20, 25]], slots: ['ring', 'amulet', 'weapon'] },
    { id: 'veiled_move_speed', name: '移动速度', affix: 'suffix', group: 'move_speed', text: '移动速度提高 {0}%', v: [[25, 30]], slots: ['boots'] },
  ];

  const eldritchImplicits = {
    exarch: {
      helmet: { id: 'exarch_cast_speed', name: '施法速度', text: '施法速度提高 {0}%', tiers: [
        { tier: 1, name: 'Lesser', v: [8, 8] }, { tier: 2, name: 'Greater', v: [9, 9] },
        { tier: 3, name: 'Grand', v: [10, 10] }, { tier: 4, name: 'Exceptional', v: [11, 11] },
        { tier: 5, name: 'Exquisite', v: [12, 12] }, { tier: 6, name: 'Perfect', v: [13, 13] },
        { tier: 5, name: 'Exquisite', v: [12, 12] }, { tier: 6, name: 'Perfect', v: [13, 13] },
      ] },
      body: { id: 'exarch_fire_damage', name: '火焰伤害', text: '火焰伤害提高 {0}%', tiers: [
        { tier: 1, name: 'Lesser', v: [15, 17] }, { tier: 2, name: 'Greater', v: [18, 20] },
        { tier: 3, name: 'Grand', v: [21, 23] }, { tier: 4, name: 'Exceptional', v: [24, 26] },
        { tier: 5, name: 'Exquisite', v: [27, 28] }, { tier: 6, name: 'Perfect', v: [29, 30] },
      ] },
      gloves: { id: 'exarch_attack_speed', name: '攻击速度', text: '攻击速度提高 {0}%', tiers: [
        { tier: 1, name: 'Lesser', v: [8, 8] }, { tier: 2, name: 'Greater', v: [9, 9] },
        { tier: 3, name: 'Grand', v: [10, 10] }, { tier: 4, name: 'Exceptional', v: [11, 11] },
      ] },
      boots: { id: 'exarch_move_speed', name: '移动速度', text: '移动速度提高 {0}%', tiers: [
        { tier: 1, name: 'Lesser', v: [5, 5] }, { tier: 2, name: 'Greater', v: [6, 6] },
        { tier: 3, name: 'Grand', v: [7, 7] }, { tier: 4, name: 'Exceptional', v: [8, 8] },
        { tier: 5, name: 'Exquisite', v: [9, 9] }, { tier: 6, name: 'Perfect', v: [10, 10] },
        { tier: 5, name: 'Exquisite', v: [9, 9] }, { tier: 6, name: 'Perfect', v: [10, 10] },
      ] },
    },
    eater: {
      helmet: { id: 'eater_es_recharge', name: '能量护盾回复', text: '能量护盾回复率提高 {0}%', tiers: [
        { tier: 1, name: 'Lesser', v: [21, 21] }, { tier: 2, name: 'Greater', v: [22, 22] },
        { tier: 3, name: 'Grand', v: [23, 23] }, { tier: 4, name: 'Exceptional', v: [24, 24] },
        { tier: 5, name: 'Exquisite', v: [25, 25] }, { tier: 6, name: 'Perfect', v: [26, 26] },
      ] },
      body: { id: 'eater_armour', name: '护甲', text: '护甲提高 {0}%', tiers: [
        { tier: 1, name: 'Lesser', v: [17, 18] }, { tier: 2, name: 'Greater', v: [19, 20] },
        { tier: 3, name: 'Grand', v: [21, 22] }, { tier: 4, name: 'Exceptional', v: [23, 24] },
        { tier: 5, name: 'Exquisite', v: [25, 26] }, { tier: 6, name: 'Perfect', v: [27, 28] },
      ] },
      gloves: { id: 'eater_spell_suppress', name: '法术压制', text: '+{0}% 法术压制率', tiers: [
        { tier: 1, name: 'Lesser', v: [5, 5] }, { tier: 2, name: 'Greater', v: [6, 6] },
        { tier: 3, name: 'Grand', v: [7, 7] }, { tier: 4, name: 'Exceptional', v: [8, 8] },
      ] },
      boots: { id: 'eater_life_regen', name: '生命回复', text: '生命回复率提高 {0}%', tiers: [
        { tier: 1, name: 'Lesser', v: [7, 7] }, { tier: 2, name: 'Greater', v: [8, 8] },
        { tier: 3, name: 'Grand', v: [9, 9] }, { tier: 4, name: 'Exceptional', v: [10, 10] },
        { tier: 5, name: 'Exquisite', v: [11, 11] }, { tier: 6, name: 'Perfect', v: [12, 12] },
      ] },
    },
  };

  const influenceOrbs = [
    { id: 'shaper_exalt', name: '塑界者崇高石', influence: 'shaper' },
    { id: 'elder_exalt', name: '裂界者崇高石', influence: 'elder' },
    { id: 'crusader_exalt', name: '圣战者崇高石', influence: 'crusader' },
    { id: 'redeemer_exalt', name: '救赎者崇高石', influence: 'redeemer' },
    { id: 'hunter_exalt', name: '狩猎者崇高石', influence: 'hunter' },
    { id: 'warlord_exalt', name: '督军崇高石', influence: 'warlord' },
  ];

  const data = {
    version: '1.0.1',
    configMode: 'static',
    essenceHint: '精华只能用于普通或稀有物品，且物品等级要达到该档位要求（当前低语 2 / 呢喃 10 / 哭泣 18 / 哀嚎 30 / 尖啸 46 / 刺耳 59 / 震耳 65）；有 meta 工艺时不能使用。普通物品会升级为稀有并保底一条词缀；稀有物品会重铸全部非破裂词缀并保底一条。',
    taintedActions: [
      { type: 'tainted_chaos', name: '腐化混沌石', short: '腐混', color: '#b06a7a', desc: '重铸腐化稀有物品的随机词缀' },
      { type: 'tainted_exalted', name: '腐化崇高石', short: '腐崇', color: '#d19a8a', desc: '给腐化稀有物品增加一条词缀' },
      { type: 'tainted_divine', name: '腐化神圣石', short: '腐圣', color: '#d8c9a8', desc: '重掷腐化物品的词缀数值' },
      { type: 'tainted_annul', name: '腐化剥离石', short: '腐剥', color: '#9a8f8a', desc: '随机移除腐化物品的一条非破裂词缀' },
    ],
    socketActions: [
      { type: 'jeweller', name: '珠宝匠的宝珠', short: '珠', color: '#9ab8d8', desc: '给装备增加 1 个插槽' },
      { type: 'fusing', name: '链结石', short: '链', color: '#c9a76a', desc: '重掷插槽连接' },
      { type: 'chromatic', name: '幻色石', short: '色', color: '#b08ad8', desc: '重掷所有非白孔颜色' },
    ],
    basicActions: [
      { type: 'transmute', name: '蜕变石', short: '蜕', color: '#8fa3c8', desc: '普通 → 1 词缀魔法', cost: 'transmute' },
      { type: 'alteration', name: '改造石', short: '改', color: '#7f9fe8', desc: '重铸魔法词缀（1–2 条）', cost: 'alteration' },
      { type: 'augmentation', name: '增幅石', short: '增', color: '#9db8e8', desc: '仅魔法：补 1 条，最多 2 条', cost: 'augmentation' },
      { type: 'regal', name: '富豪石', short: '富', color: '#d8c27a', desc: '仅魔法 → 稀有，加 1 条', cost: 'regal' },
      { type: 'alchemy', name: '点金石', short: '点', color: '#c9a76a', desc: '普通 → 4 词缀稀有', cost: 'alchemy' },
      { type: 'chaos', name: '混沌石', short: '混', color: '#b98a5a', desc: '重铸稀有词缀（4–6 条）', cost: 'chaos' },
      { type: 'exalted', name: '崇高石', short: '崇', color: '#e6cf9a', desc: '稀有补 1 条空位', cost: 'exalted' },
      { type: 'annulment', name: '剥离石', short: '剥', color: '#9a8f7a', desc: '魔法 / 稀有：移除 1 条非破裂', cost: 'annulment' },
      { type: 'scour', name: '重铸石', short: '洗', color: '#7a8496', desc: '魔法 / 稀有：清空非破裂', cost: 'scour' },
      { type: 'divine', name: '神圣石', short: '圣', color: '#e7d8b0', desc: '魔法 / 稀有：重掷数值', cost: 'divine' },
      { type: 'vaal', name: '瓦尔宝珠', short: '瓦', color: '#d28b8b', desc: '腐化：可能加腐化基底 / 变稀有 / 无变化', cost: 'vaal' },
      { type: 'scrap', name: '护甲片', short: '片', color: '#a9b3c2', desc: '护甲 / 盾：品质 +1~5%，最高 20%', cost: 'scrap' },
      { type: 'whetstone', name: '磨刀石', short: '磨', color: '#b8a58a', desc: '武器：品质 +1~5%，最高 20%', cost: 'whetstone' },
      { type: 'veiled_chaos', name: '隐秘混沌石', short: '隐混', color: '#b9a7d8', desc: '重铸稀有物品，并保证 1 条待揭露隐秘词缀', cost: 'veiledChaos' },
    ],
    bases, mods, essences, fossils, bench, metaCrafts, prices, presets, slots, influences, harvestTags, vaalImplicits, veiledMods, eldritchImplicits, influenceOrbs,
    ARMOUR, JEWEL, GEAR,
  };

  global.PoEData = data;
  if (typeof module !== 'undefined' && module.exports) module.exports = data;
})(typeof window !== 'undefined' ? window : globalThis);
