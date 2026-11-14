/* 流放做装台 · 界面逻辑 */
(function () {
  'use strict';

  const GAME_ID = new URLSearchParams(location.search).get('game') === 'poe2' ? 'poe2' : 'poe1';
  const GAME = (window.PoEGames || {})[GAME_ID] || (window.PoEGames || {}).poe1;
  const IS_POE2 = GAME_ID === 'poe2';
  const D = GAME.data;
  const E = GAME.engine;
  const A = GAME.advisor;
  const C = GAME.config;
  const RUNTIME = window.POE_RUNTIME || {};
  const STORAGE_KEY = GAME.storageKey;

  const $ = (sel, root) => (root || document).querySelector(sel);
  const $$ = (sel, root) => Array.prototype.slice.call((root || document).querySelectorAll(sel));
  const iconForSlot = {
    helmet: '盔', body: '甲', gloves: '手', boots: '靴', shield: '盾', focus: '焦',
    weapon: '刃', ring: '戒', amulet: '链', belt: '带', quiver: '袋',
  };
  const TAG_CN = {};
  D.harvestTags.forEach((t) => { TAG_CN[t.id] = t.name; });
  TAG_CN.physical = '物理'; TAG_CN.elemental = '元素'; TAG_CN.resistance = '抗性';
  TAG_CN.attack = '攻击'; TAG_CN.caster = '施法'; TAG_CN.speed = '速度'; TAG_CN.critical = '暴击';
  TAG_CN.minion = '召唤'; TAG_CN.aura = '光环'; TAG_CN.curse = '诅咒'; TAG_CN.attribute = '属性';
  TAG_CN.defence = '防御'; TAG_CN.life = '生命'; TAG_CN.mana = '魔力'; TAG_CN.gem = '宝石';
  TAG_CN.chaos = '混沌'; TAG_CN.fire = '火焰'; TAG_CN.cold = '冰霜'; TAG_CN.lightning = '闪电';
  TAG_CN.dot = '持续伤害'; TAG_CN.damage = '伤害'; TAG_CN.flask = '药剂';
  const LOG_CHAR = {
    transmute: '蜕', alteration: '改', augmentation: '增', regal: '富', alchemy: '点',
    chaos: '混', exalted: '崇', annulment: '剥', scour: '洗', essence: '精', fossil: '化',
    harvest: '庄', bench: '艺', lock_chaos: '锁', lock_scour: '锁', lock_exalt: '锁',
    multimod: '多', manual: '同', divine: '圣', omen: '兆',
  };

  /* ------------------------------------------------------------------ state */
  function runtimeCooldown() {
    return Math.max(60, Math.round(Number(RUNTIME.cooldownSeconds) || 300));
  }
  function baseSettings() {
    const configUrl = RUNTIME[GAME.configKey] || (IS_POE2 ? 'data/config-poe2.json' : RUNTIME.configUrl) || '';
    return {
      prices: Object.assign({}, D.prices),
      samples: 160,
      autoSync: RUNTIME.autoSync !== false && !!configUrl,
      configUrl,
      cooldownSeconds: runtimeCooldown(),
    };
  }
  function defaultState() {
    const p = D.presets[0];
    const ilvl = p.ilvl || 86;
    const influences = (p.influences || []).slice();
    return {
      baseId: p.baseId,
      ilvl,
      influences,
      item: E.createItem(p.baseId, { ilvl, influences }),
      targets: p.targets.map((t) => Object.assign({}, t)),
      log: [],
      spent: 0,
      attempts: 0,
      history: [],
      slot: E.getBase(p.baseId).slot,
      tab: (D.actionTabs && D.actionTabs[0] && D.actionTabs[0].id) || 'basic',
      targetSide: 'prefix',
      baseSearch: '',
      targetSearch: '',
      fossilSelection: [],
      settings: baseSettings(),
      routeStats: null,
      analysisNonce: 0,
      autoRunning: false,
      autoSteps: 0,
      simulating: false,
      customTargets: false,
      configMeta: null,
      nextPullAt: 0,
      pendingResult: null,
      collapsed: { presets: false, base: false, targets: false, actions: false, log: false, plan: false },
    };
  }
  function loadState() {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (!raw) return defaultState();
      const parsed = JSON.parse(raw);
      if (!parsed || !parsed.item || !E.getBase(parsed.item.baseId)) return defaultState();
      const state = Object.assign(defaultState(), parsed);
      state.settings = Object.assign(baseSettings(), parsed.settings || {});
      state.settings.prices = Object.assign(baseSettings().prices, (parsed.settings && parsed.settings.prices) || {});
      state.settings.configUrl = baseSettings().configUrl;
      state.settings.cooldownSeconds = runtimeCooldown();
      state.configMeta = parsed.configMeta || null;
      state.nextPullAt = parsed.nextPullAt || 0;
      state.pendingResult = parsed.pendingResult && parsed.pendingResult.before && parsed.pendingResult.after ? parsed.pendingResult : null;
      state.collapsed = Object.assign({ presets: false, base: false, targets: false, actions: false, log: false, plan: false }, parsed.collapsed || {});
      state.item.meta = state.item.meta || { multimod: false };
      state.item.influences = state.item.influences || [];
      state.item.affixes = state.item.affixes || [];
      state.item.ilvl = state.item.ilvl || E.getBase(state.item.baseId).ilvl;
      E.syncUid(state.item);
      state.baseId = state.item.baseId;
      state.influences = state.item.influences.slice();
      state.slot = E.getBase(state.baseId).slot;
      state.targets = (state.targets || []).filter((t) => E.getTargetDef(t.modId));
      state.targets = state.targets.filter((t) => E.targetEligibleOnBase(t.modId, state.baseId, state.item.influences, state.item.ilvl));
      state.log = state.log || [];
      state.history = state.history || [];
      state.autoRunning = false;
      state.simulating = false;
      state.routeStats = null;
      state.fossilSelection = [];
      return state;
    } catch (e) {
      return defaultState();
    }
  }

  const state = loadState();
  let saveTimer = null;
  let autoTimer = null;
  let autoSyncTimer = null;
  let configRefreshing = false;
  let toastSeq = 0;

  /* ------------------------------------------------------------------ save */
  function save() {
    clearTimeout(saveTimer);
    saveTimer = setTimeout(() => {
      try {
        const copy = {
          baseId: state.baseId, ilvl: state.ilvl, influences: state.influences,
          item: state.item, targets: state.targets, log: state.log.slice(0, 100),
          spent: state.spent, attempts: state.attempts,
          slot: state.slot, tab: state.tab, targetSide: state.targetSide,
          settings: state.settings, history: state.history.slice(-20),
          analysisNonce: state.analysisNonce, customTargets: state.customTargets,
          configMeta: state.configMeta, nextPullAt: state.nextPullAt || 0, pendingResult: state.pendingResult || null,
          collapsed: state.collapsed || {},
        };
        localStorage.setItem(STORAGE_KEY, JSON.stringify(copy));
      } catch (e) { /* 本地存储不可用时静默降级 */ }
    }, 220);
  }

  /* ------------------------------------------------------------------ small ui utils */
  function toast(message, type, ms) {
    const wrap = $('#toast-wrap');
    const el = document.createElement('div');
    el.className = 'toast ' + (type || '');
    el.textContent = message;
    el.style.animationDelay = (toastSeq++ % 3) * 30 + 'ms';
    wrap.appendChild(el);
    setTimeout(() => {
      el.style.opacity = '0';
      el.style.transform = 'translateY(6px)';
      el.style.transition = 'all .18s ease';
      setTimeout(() => el.remove(), 200);
    }, ms || 3200);
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }
  function costText(n) {
    if (!Number.isFinite(n)) return '—';
    if (n >= 1000) return Math.round(n) + 'c';
    if (n >= 10) return n.toFixed(0) + 'c';
    if (n >= 1) return (Math.round(n * 10) / 10) + 'c';
    if (n >= 0.01) return n.toFixed(3).replace(/0+$/, '').replace(/\.$/, '') + 'c';
    return n.toFixed(4).replace(/0+$/, '').replace(/\.$/, '') + 'c';
  }
  function pctText(x) {
    if (!Number.isFinite(x)) return '—';
    return (x * 100).toFixed(x >= 0.1 ? 0 : 1) + '%';
  }
  function nowTime() {
    return new Date().toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }
  function mdText(text) {
    return esc(text).replace(/\n/g, '<br>');
  }
  function priceOverrides() {
    return Object.assign({}, state.settings.prices);
  }
  function currentTargets() {
    return state.targets.filter((t) => E.getTargetDef(t.modId));
  }
  function sideCN(side) { return side === 'prefix' ? '前缀' : '后缀'; }
  function slotName(slot) {
    const s = D.slots.find((x) => x.id === slot);
    return s ? s.name : slot;
  }

  /* ------------------------------------------------------------------ modals */
  function openModal(html, opts) {
    opts = opts || {};
    if (state.autoRunning) stopAuto('已暂停连续执行。');
    const root = $('#modal-root');
    root.innerHTML = '<div class="modal-backdrop"><div class="modal-card ' + (opts.narrow ? 'narrow' : '') + '">' + html + '</div></div>';
    document.body.style.overflow = 'hidden';
  }
  function closeModal() {
    $('#modal-root').innerHTML = '';
    document.body.style.overflow = '';
  }
  function openConfirm(title, text, onConfirm) {
    openModal(
      '<div class="modal-head"><div><h3>' + esc(title) + '</h3></div>' +
      '<button class="modal-close" data-close type="button">×</button></div>' +
      '<div class="modal-body"><p class="confirm-text">' + text + '</p></div>' +
      '<div class="modal-foot"><button class="btn ghost" data-close type="button">取消</button>' +
      '<button class="btn gold" id="confirm-ok" type="button">确认</button></div>', { narrow: true });
    $('#confirm-ok').onclick = () => { closeModal(); onConfirm(); };
  }

  /* ------------------------------------------------------------------ render: base */
  function renderGameSwitch() {
    const el = $('#game-switch');
    if (!el) return;
    $$('#game-switch [data-game]').forEach((a) => {
      const active = a.dataset.game === GAME_ID;
      a.classList.toggle('active', active);
      a.setAttribute('aria-current', active ? 'page' : 'false');
    });
    const sub = $('#brand-sub');
    if (sub) sub.textContent = (IS_POE2 ? 'PATH OF EXILE 2' : 'PATH OF EXILE 1') + ' · 装备制作助手';
    document.title = '流放做装台 · ' + (IS_POE2 ? '流放之路 2' : '流放之路 1') + ' 做装助手';
  }
  function renderHeader() {
    $('#data-version').textContent = D.version;
    const modeEl = $('#runtime-mode');
    if (modeEl) {
      const hosted = location.protocol !== 'file:' && location.hostname !== 'localhost' && location.hostname !== '127.0.0.1';
      modeEl.textContent = hosted ? (staticConfigMode() ? '静态站点' : '在线') : '本地运行';
      modeEl.title = hosted ? (staticConfigMode() ? '当前使用同源静态价格配置' : '当前使用 Worker 实时价格配置') : '本机预览';
    }
    $('#spent-total').textContent = costText(state.spent);
    $('#attempt-total').textContent = state.attempts;
    renderGameSwitch();
  }
  function renderJourney() {
    const next = $('#journey-next');
    if (!next) return;
    const ev = E.evaluate(state.item, currentTargets());
    let active = 'base';
    if (state.targets.length) active = 'craft';
    if (!state.targets.length) active = 'targets';
    if (state.targets.length && ev.complete) active = 'finish';
    const order = ['base', 'targets', 'craft', 'finish'];
    const activeIndex = order.indexOf(active);
    $$('#journey [data-step]').forEach((li) => {
      const idx = order.indexOf(li.dataset.step);
      li.classList.toggle('active', idx === activeIndex);
      li.classList.toggle('done', idx < activeIndex);
      const btn = li.querySelector('button');
      if (btn) btn.setAttribute('aria-current', idx === activeIndex ? 'step' : 'false');
    });
    if (state.pendingResult) {
      next.textContent = '先确认这一步的实际结果，再继续';
    } else if (!state.targets.length) {
      next.textContent = '先选一个模板，或者添加 2–3 条你最想要的词缀';
    } else if (ev.complete) {
      next.textContent = '目标齐了：检查数值，满意就可以停';
    } else if (state.item.rarity === 'normal') {
      next.textContent = '底子和目标都选好了，看顾问推荐做第一步';
    } else {
      next.textContent = '下一步：看顾问的「先做这个」，点执行这一步';
    }
  }
  function openGuide() {
    const html =
      '<div class="modal-head"><div><h3>3 分钟看懂做装</h3><p>不用背通货，按顺序走就行。</p></div>' +
      '<button class="modal-close" data-close type="button">×</button></div>' +
      '<div class="modal-body">' +
      '<div class="guide-grid">' +
      '<article class="guide-card"><span class="guide-no">1</span><h4>先选底子</h4><p>底子就是你要做的装备类型。它决定这件装备能出现哪些词缀。</p></article>' +
      '<article class="guide-card"><span class="guide-no">2</span><h4>定 2–3 条目标</h4><p>挑你最终最想保留的属性。T1 最好，T4 较低；先少选几条，成功率会高很多。</p></article>' +
      '<article class="guide-card"><span class="guide-no">3</span><h4>跟着推荐做</h4><p>顾问会告诉你下一步、成功率、风险和平均花费。做完一步后，先在页面里确认游戏中的实际结果，顾问再给下一步。</p></article>' +
      '<article class="guide-card"><span class="guide-no">4</span><h4>收尾检查</h4><p>目标齐了再补数值。做错了点「撤销」；想保留当前结果就点「保存方案」。</p></article>' +
      '</div>' +
      '<h4 class="guide-sub">几个会反复看到的词</h4>' +
      '<div class="guide-glossary">' +
      '<div><b>前缀 / 后缀</b><span>稀有装备最多 3 条前缀 + 3 条后缀。目标词缀会占其中一格。</span></div>' +
      '<div><b>T1 – T4</b><span>词缀品级。T1 最好、最难出；T4 较低，但更容易命中。</span></div>' +
      '<div><b>通货</b><span>蜕变、增幅、富豪、崇高……都是操作道具。卡片上会写它做什么，不用背。</span></div>' +
      '<div><b>风险</b><span>有些操作会弄丢已经命中的词缀。出现红色提醒时，先停一下。</span></div>' +
      '<div><b>结果确认</b><span>模拟不等于游戏实际。每做一步，先选「和模拟一致」或「结果不同，我来录入」。</span></div>' +
      '</div>' +
      '</div>' +
      '<div class="modal-foot"><button class="btn ghost" data-close type="button">先看看</button>' +
      '<button class="btn gold" id="guide-start" type="button">从当前模板开始</button></div>';
    openModal(html);
    $$('#modal-root [data-close]').forEach((b) => { b.onclick = closeModal; });
    const start = $('#guide-start');
    if (start) start.onclick = () => {
      closeModal();
      const mobile = $('#mobile-next');
      const target = mobile && mobile.offsetParent !== null ? mobile : $('#step-finish');
      if (target) target.scrollIntoView({ behavior: 'smooth', block: 'start' });
      toast('看顾问的「先做这个」，点「执行这一步」就可以。', 'success', 3600);
    };
  }
  function renderSlotTabs() {
    $('#slot-tabs').innerHTML = D.slots.map((s) =>
      '<button type="button" data-slot="' + s.id + '" class="' + (s.id === state.slot ? 'active' : '') + '">' + s.name + '</button>'
    ).join('');
    $$('#slot-tabs button').forEach((b) => {
      b.onclick = () => {
        state.slot = b.dataset.slot;
        state.baseSearch = '';
        $('#base-search').value = '';
        renderSlotTabs();
        renderBases();
      };
    });
  }
  function baseStatText(b) {
    if (b.weapon) {
      const w = b.weapon;
      const dps = ((w.phys[0] + w.phys[1]) / 2) * w.aps;
      return 'pDPS ' + Math.round(dps) + ' · ' + w.aps + ' 攻速';
    }
    if (b.defence) {
      return Object.keys(b.defence).map((k) => k.toUpperCase() + ' ' + b.defence[k]).join(' · ');
    }
    return 'iLvl ' + b.ilvl;
  }
  function renderBases() {
    const q = (state.baseSearch || '').trim().toLowerCase();
    const list = D.bases.filter((b) => {
      if (b.slot !== state.slot) return false;
      if (!q) return true;
      return (b.name + ' ' + b.en + ' ' + b.id).toLowerCase().indexOf(q) !== -1;
    });
    $('#base-count').textContent = list.length + ' 个';
    if (!list.length) {
      $('#base-list').innerHTML = '<div class="target-empty">没有匹配的底子，换个关键词试试。</div>';
      return;
    }
    $('#base-list').innerHTML = list.map((b) => {
      const active = b.id === state.baseId;
      return '<button type="button" class="base-card ' + (active ? 'active' : '') + '" data-base="' + b.id + '" title="' + esc(b.implicit || b.en) + '">' +
        '<span class="base-glyph">' + (iconForSlot[b.slot] || (b.slot || '◆').slice(0, 1).toUpperCase()) + '</span>' +
        '<span class="base-main"><span class="bn">' + esc(b.name) + '</span><span class="be">' + esc(b.en) + ' · i' + b.ilvl + '</span></span>' +
        '<span class="base-stats">' + esc(baseStatText(b)) + '</span></button>';
    }).join('');
    $$('#base-list [data-base]').forEach((b) => {
      b.onclick = () => changeBase(b.dataset.base);
    });
  }
  function changeBase(baseId) {
    if (baseId === state.baseId) return;
    if (state.autoRunning) stopAuto('已手动切换底子，连续执行停止。');
    const apply = () => {
      const base = E.getBase(baseId);
      state.baseId = baseId;
      state.slot = base.slot;
      state.ilvl = Math.max(state.ilvl, base.ilvl);
      state.item = E.createItem(baseId, { ilvl: state.ilvl, influences: state.influences });
      state.targets = state.targets.filter((t) => E.targetEligibleOnBase(t.modId, state.baseId, state.influences, state.ilvl));
      state.fossilSelection = [];
      resetProgress();
      $('#ilvl-input').value = state.ilvl;
      save();
      renderAll();
      toast('已切换底子：' + base.name, 'success');
    };
    if (state.item.affixes.length || state.log.length || state.spent > 0) {
      openConfirm('切换底子？', '切换底子会重置当前物品、制作记录和花费统计。目标词缀中不适用的会被移除。', apply);
    } else {
      apply();
    }
  }

  /* ------------------------------------------------------------------ render: targets */
  function targetPreview(def, tierRank) {
    if (!def) return '';
    if (D.bench.some((b) => b.id === def.id)) {
      return E.formatText(def.text, def.v.map((r) => (r[0] + r[1]) / 2));
    }
    let tier = def.tiers[def.tiers.length - 1];
    if (tierRank) tier = def.tiers.find((t) => E.tierRank(def, t) === tierRank) || tier;
    return E.formatText(def.text, tier.v.map((r) => (r[0] + r[1]) / 2));
  }
  function renderTargets() {
    $('#target-count').textContent = state.targets.length + ' / 6';
    const el = $('#target-list');
    if (!state.targets.length) {
      el.innerHTML = '<div class="target-empty">还没有目标词缀。<br>从下方添加，或直接点一个快速模板。</div>';
      return;
    }
    el.innerHTML = state.targets.map((t, i) => {
      const def = E.getTargetDef(t.modId);
      if (!def) return '';
      const matched = E.findMatchingAffix(state.item, t);
      const isBench = D.bench.some((b) => b.id === t.modId);
      const chosenTier = !isBench && t.tier ? def.tiers.find((tier) => E.tierRank(def, tier) === Number(t.tier)) : null;
      const unavailable = !!(chosenTier && chosenTier.ilvl > state.ilvl);
      const tierOptions = !isBench
        ? def.tiers.map((tier) => {
          const rank = E.tierRank(def, tier);
          const avail = tier.ilvl <= state.ilvl;
          return '<option value="' + rank + '" ' + (Number(t.tier) === rank ? 'selected' : '') + ' ' + (avail ? '' : 'disabled') +
            ' title="需要物品等级 ' + tier.ilvl + '">T' + rank + (avail ? '' : '·等级不足') + '</option>';
        }).join('')
        : '<option>工艺</option>';
      return '<div class="target-item ' + (matched ? 'hit' : '') + (unavailable ? ' invalid' : '') + '" data-target-index="' + i + '">' +
        '<span class="side-badge ' + def.affix + '">' + (def.affix === 'prefix' ? '前' : '后') + '</span>' +
        '<span><span class="target-name" title="' + esc(targetPreview(def, t.tier)) + '">' + esc(def.name) + '</span>' +
        '<span class="target-sub">' + esc(targetPreview(def, t.tier)) + (unavailable ? ' · 物品等级不足' : '') + '</span></span>' +
        '<select class="tier-select" data-tier-index="' + i + '" ' + (isBench ? 'disabled' : '') + '>' + tierOptions + '</select>' +
        '<button class="remove-btn" data-remove-target="' + i + '" type="button" title="移除目标">×</button></div>';
    }).join('');
    $$('#target-list [data-tier-index]').forEach((sel) => {
      sel.onchange = () => {
        if (state.autoRunning) stopAuto('已手动调整目标，连续执行停止。');
        const idx = Number(sel.dataset.tierIndex);
        state.targets[idx].tier = Number(sel.value);
        state.routeStats = null;
        save(); renderAdvisor(); renderTargets();
      };
    });
    $$('#target-list [data-remove-target]').forEach((b) => {
      b.onclick = () => {
        if (state.autoRunning) stopAuto('已手动调整目标，连续执行停止。');
        state.targets.splice(Number(b.dataset.removeTarget), 1);
        state.routeStats = null;
        save(); renderAll();
      };
    });
  }
  function renderTargetSideTabs() {
    $('#target-side-tabs').innerHTML = ['prefix', 'suffix'].map((s) =>
      '<button type="button" data-side="' + s + '" class="' + (state.targetSide === s ? 'active' : '') + '">' + sideCN(s) + '</button>'
    ).join('');
    $$('#target-side-tabs button').forEach((b) => {
      b.onclick = () => { state.targetSide = b.dataset.side; renderTargetSideTabs(); renderTargetPool(); };
    });
  }
  function targetPoolEntries() {
    const side = state.targetSide;
    const q = (state.targetSearch || '').trim().toLowerCase();
    const chosen = state.targets.map((t) => t.modId);
    const sideCount = state.targets.filter((t) => {
      const d = E.getTargetDef(t.modId);
      return d && d.affix === side;
    }).length;
    const natural = [];
    const crafts = [];
    D.mods.forEach((m) => {
      if (m.affix !== side) return;
      if (chosen.indexOf(m.id) !== -1) return;
      if (!E.targetEligibleOnBase(m.id, state.baseId, state.influences, state.ilvl)) return;
      if (q && (m.name + ' ' + m.text + ' ' + m.tags.join(' ')).toLowerCase().indexOf(q) === -1) return;
      natural.push(m);
    });
    D.bench.forEach((b) => {
      if (b.affix !== side) return;
      if (chosen.indexOf(b.id) !== -1) return;
      if (!E.targetEligibleOnBase(b.id, state.baseId, state.influences, state.ilvl)) return;
      if (q && (b.name + ' ' + b.text).toLowerCase().indexOf(q) === -1) return;
      crafts.push(b);
    });
    return { natural, crafts, sideCount };
  }
  function renderTargetPool() {
    const { natural, crafts, sideCount } = targetPoolEntries();
    const full = sideCount >= 3;
    const build = (items, isBench) => {
      if (!items.length) return '';
      return items.map((m) => {
        const eligible = isBench ? [] : m.tiers.filter((tier) => tier.ilvl <= state.ilvl);
        const bestTier = isBench ? null : (eligible[eligible.length - 1] || m.tiers[m.tiers.length - 1]);
        const preview = isBench
          ? E.formatText(m.text, m.v.map((r) => (r[0] + r[1]) / 2))
          : E.formatText(m.text, bestTier.v.map((r) => (r[0] + r[1]) / 2));
        const tags = (m.tags || []).filter((t) => TAG_CN[t]).slice(0, 3).map((t) => TAG_CN[t]).join(' · ');
        return '<div class="pool-row">' +
          '<span class="pool-info"><span class="pool-name">' + esc(m.name) + (isBench ? ' <small style="color:var(--cyan)">工艺</small>' : '') + '</span>' +
          '<span class="pool-stat">' + esc(preview) + '</span>' +
          '<span class="pool-tags">' + esc(tags) + (isBench ? '' : ' · T' + E.tierRank(m, bestTier) + ' / i' + bestTier.ilvl) + '</span></span>' +
          '<button class="pool-add" type="button" data-add-target="' + m.id + '" ' + (full ? 'disabled title="该侧目标已满"' : '') + '>+</button></div>';
      }).join('');
    };
    let html = '';
    if (full) html += '<div class="manual-note" style="margin:0 0 6px">该侧已有 3 条目标，无法继续添加。</div>';
    if (natural.length) html += '<div class="pool-group-label">自然词缀</div>' + build(natural, false);
    if (crafts.length) html += '<div class="pool-group-label">工艺台</div>' + build(crafts, true);
    if (!html) html = '<div class="pool-empty">没有符合当前底子 / 影响 / 物品等级的词缀。</div>';
    $('#target-pool').innerHTML = html;
    $$('#target-pool [data-add-target]').forEach((b) => {
      b.onclick = () => addTarget(b.dataset.addTarget);
    });
  }
  function addTarget(modId) {
    if (state.targets.some((t) => t.modId === modId)) return;
    if (state.autoRunning) stopAuto('已手动调整目标，连续执行停止。');
    const def = E.getTargetDef(modId);
    if (!def) return;
    const sideCount = state.targets.filter((t) => {
      const d = E.getTargetDef(t.modId);
      return d && d.affix === def.affix;
    }).length;
    if (sideCount >= 3) { toast('该侧最多 3 条目标词缀。', 'error'); return; }
    const isBench = D.bench.some((b) => b.id === modId);
    let defaultTier = 1;
    if (!isBench) {
      const ranks = def.tiers
        .filter((tier) => tier.ilvl <= state.ilvl)
        .map((tier) => E.tierRank(def, tier));
      defaultTier = ranks.indexOf(2) !== -1 ? 2 : (ranks.length ? ranks[ranks.length - 1] : 1);
    }
    state.targets.push({ modId, tier: isBench ? null : defaultTier });
    state.customTargets = true;
    state.routeStats = null;
    save();
    renderTargets(); renderTargetPool(); renderAdvisor();
    toast('已添加目标：' + def.name);
  }
  function loadPreset(preset) {
    if (state.autoRunning) stopAuto('已手动载入模板，连续执行停止。');
    const apply = () => {
      state.baseId = preset.baseId;
      state.ilvl = preset.ilvl || 86;
      state.influences = (preset.influences || []).slice();
      state.slot = E.getBase(preset.baseId).slot;
      state.item = E.createItem(preset.baseId, { ilvl: state.ilvl, influences: state.influences });
      state.targets = preset.targets.map((t) => Object.assign({}, t))
        .filter((t) => E.targetEligibleOnBase(t.modId, state.baseId, state.influences, state.ilvl));
      state.fossilSelection = [];
      state.tab = 'basic';
      state.targetSide = 'prefix';
      resetProgress();
      $('#ilvl-input').value = state.ilvl;
      save();
      renderAll();
      toast('已载入模板：' + preset.name, 'success');
    };
    if (state.item.affixes.length || state.log.length || state.spent > 0) {
      openConfirm('载入模板？', '当前物品和制作记录会被重置，目标词缀会替换为模板内容。', apply);
    } else {
      apply();
    }
  }
  function renderPresets() {
    $('#preset-list').innerHTML = D.presets.map((p) =>
      '<button class="preset" type="button" data-preset="' + p.id + '"><b>' + esc(p.name) + '</b><span>' + esc(p.desc) + '</span></button>'
    ).join('');
    $$('#preset-list [data-preset]').forEach((b) => {
      const preset = D.presets.find((p) => p.id === b.dataset.preset);
      b.onclick = () => loadPreset(preset);
    });
  }

  /* ------------------------------------------------------------------ render: item */
  function renderInfluences() {
    const selected = state.item.influences || [];
    const row = $('#influence-row');
    row.style.display = D.influences.length ? '' : 'none';
    $('#influence-row').innerHTML = D.influences.map((inf) => {
      const active = selected.indexOf(inf.id) !== -1;
      return '<button type="button" class="inf-chip ' + (active ? 'active' : '') + '" data-inf="' + inf.id + '" style="' + (active ? 'color:' + inf.color : '') + '">' + inf.name + '</button>';
    }).join('') + '<span class="inf-note">影响是特殊势力词缀；新手可以先不选</span>';
    $$('#influence-row [data-inf]').forEach((b) => {
      b.onclick = () => toggleInfluence(b.dataset.inf);
    });
  }
  function toggleInfluence(id) {
    const active = state.item.influences || [];
    const next = active.indexOf(id) === -1
      ? (active.length >= 2 ? active : active.concat([id]))
      : active.filter((x) => x !== id);
    if (next.length === active.length && active.indexOf(id) === -1) {
      toast('最多同时拥有 2 个影响。', 'error');
      return;
    }
    const apply = () => {
      state.influences = next;
      state.item.influences = next.slice();
      if (state.item.affixes.length || state.log.length || state.spent > 0) {
        state.item = E.createItem(state.baseId, { ilvl: state.ilvl, influences: next });
        state.targets = state.targets.filter((t) => E.targetEligibleOnBase(t.modId, state.baseId, next, state.ilvl));
        resetProgress();
      } else {
        state.targets = state.targets.filter((t) => E.targetEligibleOnBase(t.modId, state.baseId, next, state.ilvl));
      }
      save(); renderAll();
    };
    if (state.item.affixes.length || state.log.length || state.spent > 0) {
      openConfirm('更改影响？', '更改影响会重置当前物品词缀和制作记录。是否继续？', apply);
    } else {
      apply();
    }
  }
  function renderItem() {
    const item = state.item;
    const base = E.getBase(item.baseId);
    const stats = E.derivedStats(item);
    const ev = E.evaluate(item, currentTargets());
    $('#rarity-label').textContent = E.rarityName(item.rarity) + '物品';
    $('#rarity-label').className = 'rarity-label ' + item.rarity;
    $('#item-meta').textContent = '物品等级 ' + item.ilvl + (item.influences.length ? ' · ' + item.influences.length + ' 个影响' : '');
    const infNames = item.influences.map((id) => (D.influences.find((x) => x.id === id) || {}).name).filter(Boolean).join(' / ');
    const modsHtml = item.affixes.length
      ? '<ul class="item-mod-list">' + item.affixes.map((a) => {
        const tagBits = [];
        if (!a.crafted && !a.essence) tagBits.push('T' + a.tierRank);
        if (a.essence) tagBits.push('精华');
        if (a.crafted) tagBits.push('工艺');
        if (a.fractured) tagBits.push('破裂');
        return '<li class="item-mod ' + a.affix + (a.crafted ? ' crafted' : '') + (a.fractured ? ' fractured' : '') + (a.essence ? ' essence' : '') + '">' +
          '<span class="mod-text">' + mdText(a.text) + '</span>' +
          '<span class="mod-tag">' + esc(tagBits.join(' · ')) + '</span></li>';
      }).join('') + '</ul>'
      : '<div class="item-open item-start"><b>还没有词缀，先做第一步</b><p>看「现在推荐这样做」，点「执行这一步」；也可以从下方通货里选一个起手。</p><button class="btn tiny ghost" id="item-guide" type="button">看新手指南</button></div>';
    const openBits = [];
    if (ev.openPrefix) openBits.push('空前缀 ' + ev.openPrefix);
    if (ev.openSuffix) openBits.push('空后缀 ' + ev.openSuffix);
    $('#item-card').className = 'item-card rarity-' + item.rarity;
    $('#item-card').innerHTML =
      '<div class="item-header"><div class="item-name">' + esc(base.name) + '</div>' +
      '<div class="item-en">' + esc(base.en) + '</div></div>' +
      '<div class="item-sep"></div>' +
      (base.implicit ? '<div class="item-implicit">' + esc(base.implicit) + '</div><div class="item-sep"></div>' : '') +
      (infNames ? '<div class="item-implicit" style="color:var(--purple)">影响：' + esc(infNames) + '</div><div class="item-sep"></div>' : '') +
      '<div class="item-body">' + modsHtml +
      (openBits.length ? '<div class="item-open">' + openBits.join(' · ') + '</div>' : '') +
      '</div>' +
      '<div class="item-sep"></div>' +
      '<div class="item-footer"><span>物品等级 <b>' + item.ilvl + '</b></span>' +
      '<span>前缀 <b>' + ev.prefixCount + '/3</b> · 后缀 <b>' + ev.suffixCount + '/3</b></span></div>';

    const resText = [stats.res.fire, stats.res.cold, stats.res.light].join(' / ') + (stats.res.chaos ? ' · 混 ' + stats.res.chaos : '');
    const openHtml = '<div class="stat"><span>还能加词缀</span><b>' + (ev.openPrefix + ev.openSuffix) + '</b></div>';
    let statsHtml;
    if (base.weapon) {
      statsHtml =
        '<div class="stat"><span>物理 DPS</span><b class="gold">' + (stats.dps != null ? Math.round(stats.dps) : '—') + '</b></div>' +
        '<div class="stat"><span>攻击速度</span><b>' + (stats.aps != null ? stats.aps.toFixed(2) : '—') + '</b></div>' +
        '<div class="stat"><span>暴击率</span><b class="red">' + (stats.crit != null ? stats.crit.toFixed(1) + '%' : '—') + '</b></div>' +
        openHtml;
    } else if (base.defence) {
      let defLabel = '防御', defValue = '—';
      const defKeys = Object.keys(base.defence);
      if (defKeys.length > 1) {
        const labels = { ar: '护甲', ev: '闪避', es: 'ES' };
        defValue = defKeys.map((k) => labels[k] + ' ' + Math.round(stats[k] || 0)).join(' / ');
      } else if (stats.es) { defLabel = '能量护盾'; defValue = Math.round(stats.es); }
      else if (stats.ar) { defLabel = '护甲'; defValue = Math.round(stats.ar); }
      else if (stats.ev) { defLabel = '闪避'; defValue = Math.round(stats.ev); }
      statsHtml =
        '<div class="stat"><span>生命</span><b class="red">' + Math.round(stats.life) + '</b></div>' +
        '<div class="stat"><span>' + defLabel + '</span><b class="blue">' + defValue + '</b></div>' +
        '<div class="stat"><span>火焰 / 冰霜 / 闪电</span><b>' + esc(resText) + '</b></div>' +
        openHtml;
    } else {
      statsHtml =
        '<div class="stat"><span>生命</span><b class="red">' + Math.round(stats.life) + '</b></div>' +
        '<div class="stat"><span>能量护盾</span><b class="blue">' + (stats.es ? Math.round(stats.es) : '—') + '</b></div>' +
        '<div class="stat"><span>火焰 / 冰霜 / 闪电</span><b>' + esc(resText) + '</b></div>' +
        openHtml;
    }
    $('#item-stats').innerHTML = statsHtml;
    const itemGuide = $('#item-guide');
    if (itemGuide) itemGuide.onclick = openGuide;
  }

  /* ------------------------------------------------------------------ actions */
  function resetProgress() {
    state.log = [];
    state.spent = 0;
    state.attempts = 0;
    state.history = [];
    state.routeStats = null;
    state.autoSteps = 0;
    state.pendingResult = null;
  }
  function actionPhase(type) {
    if (type === 'transmute' || type === 'alchemy') return '起手';
    if (type === 'augmentation' || type === 'regal' || type === 'exalted') return '补词缀';
    if (type === 'alteration' || type === 'chaos' || type === 'scour' || type === 'annulment') return '重洗 / 清理';
    if (type === 'divine') return '调数值';
    if (type === 'essence') return '保底';
    if (type === 'fossil' || type === 'harvest') return '重铸';
    if (type === 'bench' || type === 'multimod') return '收尾';
    return '操作';
  }
  function basicActions() {
    return D.basicActions || [
      { type: 'transmute', name: '蜕变石', short: '蜕', color: '#8fa3c8', desc: '普通 → 魔法', cost: 'transmute' },
      { type: 'alteration', name: '改造石', short: '改', color: '#7f9fe8', desc: '重铸魔法词缀', cost: 'alteration' },
      { type: 'augmentation', name: '增幅石', short: '增', color: '#9db8e8', desc: '魔法 / 稀有补一条', cost: 'augmentation' },
      { type: 'regal', name: '富豪石', short: '富', color: '#d8c27a', desc: '魔法 → 稀有', cost: 'regal' },
      { type: 'alchemy', name: '点金石', short: '点', color: '#c9a76a', desc: '普通 → 4 词缀稀有', cost: 'alchemy' },
      { type: 'chaos', name: '混沌石', short: '混', color: '#b98a5a', desc: '重铸稀有词缀', cost: 'chaos' },
      { type: 'exalted', name: '崇高石', short: '崇', color: '#e6cf9a', desc: '稀有加一条词缀', cost: 'exalted' },
      { type: 'annulment', name: '剥离石', short: '剥', color: '#9a8f7a', desc: '随机移除一条', cost: 'annulment' },
      { type: 'scour', name: '重铸石', short: '洗', color: '#7a8496', desc: '清空词缀', cost: 'scour' },
    ];
  }
  function basicAvailability(type) {
    const item = state.item;
    if (typeof E.actionAvailability === 'function') return E.actionAvailability(item, type);
    const space = E.canAdd(item, 'prefix') || E.canAdd(item, 'suffix');
    const removable = item.affixes.some((a) => !a.fractured);
    switch (type) {
      case 'transmute': return item.rarity === 'normal' ? null : '只能用于普通物品';
      case 'alteration': return item.rarity === 'magic' ? null : '只能用于魔法物品';
      case 'augmentation': return (item.rarity === 'magic' || item.rarity === 'rare') && space ? null : (space ? '只能用于魔法 / 稀有物品' : '词缀已满');
      case 'regal': return item.rarity === 'magic' ? null : '只能用于魔法物品';
      case 'alchemy': return item.rarity === 'normal' ? null : '只能用于普通物品';
      case 'chaos': return item.rarity === 'rare' ? null : '只能用于稀有物品';
      case 'exalted': return item.rarity === 'rare' && space ? null : (item.rarity !== 'rare' ? '只能用于稀有物品' : '词缀已满');
      case 'annulment': return (item.rarity === 'rare' || item.rarity === 'magic') && removable ? null : (removable ? '只能用于魔法 / 稀有物品' : '没有可剥离词缀');
      case 'scour': return item.rarity === 'rare' || item.rarity === 'magic' ? null : '只能用于魔法 / 稀有物品';
      default: return '不可用';
    }
  }
  function renderActionTabs() {
    const tabs = D.actionTabs || [
      { id: 'basic', name: '通货' }, { id: 'essence', name: '精华' }, { id: 'fossil', name: '化石' },
      { id: 'harvest', name: '庄园重铸' }, { id: 'bench', name: '工艺台收尾' },
    ];
    const tabHelp = {
      basic: '起手、补词缀、重洗和调数值用的通货',
      essence: '给魔法 / 稀有物品保底一条指定词缀',
      fossil: '用化石重铸，适合中级 / 高级玩家',
      harvest: '按标签重铸，适合中级 / 高级玩家',
      bench: '收尾补一条固定工艺词缀',
      omen: '改变下一条通货结果的预兆',
    };
    if (!tabs.some((t) => t.id === state.tab)) state.tab = tabs[0].id;
    $('#action-tabs').innerHTML = tabs.map((t) =>
      '<button type="button" data-tab="' + t.id + '" title="' + esc(tabHelp[t.id] || '') + '" class="' + (state.tab === t.id ? 'active' : '') + '">' + t.name + '</button>'
    ).join('');
    $$('#action-tabs button').forEach((b) => {
      b.onclick = () => { state.tab = b.dataset.tab; renderActionTabs(); renderActionBody(); };
    });
  }
  function renderActionBody() {
    const hint = $('#action-hint');
    const hints = D.hints || {};
    if (state.pendingResult) hint.textContent = '先确认上一步的实际结果，再执行新的操作。';
    else if (state.item.rarity === 'normal') hint.textContent = hints.normal || '普通物品：先用蜕变石做出魔法，或点金石直接做稀有。';
    else if (state.item.rarity === 'magic') hint.textContent = hints.magic || '魔法物品：增幅补到 2 条；命中目标后用富豪石升稀有。';
    else hint.textContent = hints.rare || '稀有物品：崇高补空位；不要的词缀用混沌或剥离处理。';
    const body = $('#action-body');
    if (state.tab === 'basic') renderBasicActions(body);
    else if (state.tab === 'essence') renderEssenceActions(body);
    else if (state.tab === 'fossil') renderFossilActions(body);
    else if (state.tab === 'harvest') renderHarvestActions(body);
    else if (state.tab === 'omen') renderOmenActions(body);
    else renderBenchActions(body);
  }
  function renderBasicActions(body) {
    const prices = priceOverrides();
    body.innerHTML = '<div class="action-grid">' + basicActions().map((a) => {
      const reason = state.pendingResult ? '先确认上一步实际结果' : basicAvailability(a.type);
      const cost = E.actionCost({ type: a.type }, prices);
      return '<button type="button" class="action-btn ' + (reason ? 'unavailable' : '') + '" data-basic="' + a.type + '" ' + (reason ? 'title="' + esc(reason) + '" aria-disabled="true"' : '') + '>' +
        '<span class="orb" style="--orb:' + a.color + '">' + a.short + '</span>' +
        '<span class="action-info"><span class="action-name">' + a.name + '<span class="phase-tag">' + actionPhase(a.type) + '</span></span><span class="action-desc">' + a.desc + '</span>' +
        (reason ? '<span class="action-reason">' + esc(reason) + '</span>' : '') + '</span>' +
        '<span class="action-cost"><b>' + costText(cost) + '</b></span></button>';
    }).join('') + '</div>';
    $$('#action-body [data-basic]').forEach((b) => {
      b.onclick = () => {
        const reason = basicAvailability(b.dataset.basic);
        if (reason) { toast(reason, 'error'); return; }
        performAction({ type: b.dataset.basic });
      };
    });
  }
  function essenceDescFor(e) {
    const slot = E.getBase(state.item.baseId).slot;
    const cat = (slot === 'weapon' || slot === 'quiver') ? 'weapon'
      : (slot === 'ring' || slot === 'amulet' || slot === 'belt') ? 'jewellery' : 'armour';
    return (e.bySlot && e.bySlot[slot]) || (e.byCat && e.byCat[cat]) || null;
  }
  function renderEssenceActions(body) {
    const prices = priceOverrides();
    const available = D.essences.filter((e) => essenceDescFor(e));
    if (!available.length) {
      body.innerHTML = '<div class="action-none">当前底子没有可用的精华。箭袋等底子只支持通用通货 / 预兆。</div>';
      return;
    }
    body.innerHTML =
      '<div class="form-hint" style="margin-bottom:8px">' + esc(D.essenceHint || '精华会保底一条对应词缀；对魔法 / 稀有物品的具体规则由引擎决定。') + '</div>' +
      '<div class="essence-grid">' + available.map((e) => {
        const desc = essenceDescFor(e);
        const preview = E.formatText(desc.text, desc.v.map((r) => (r[0] + r[1]) / 2));
        const cost = E.actionCost({ type: 'essence', essenceId: e.id }, prices);
        const reason = typeof E.essenceAvailability === 'function'
          ? E.essenceAvailability(state.item, e)
          : (state.item.rarity === 'magic' ? '该版本精华不能用于魔法物品。' : null);
        return '<button type="button" class="essence-card ' + (reason ? 'unavailable' : '') + '" data-essence="' + e.id + '" style="--ec:' + e.color + '" title="' + esc(reason || preview) + '">' +
          '<span class="essence-dot"></span>' +
          '<span class="essence-info"><span class="essence-name"><b>' + esc(e.tierName + e.name) + '</b> 精华</span>' +
          '<span class="essence-mod">' + esc(preview) + '</span></span>' +
          '<span class="essence-cost">' + costText(cost) + '</span></button>';
      }).join('') + '</div>';
    $$('#action-body [data-essence]').forEach((b) => {
      b.onclick = () => {
        const e = D.essences.find((x) => x.id === b.dataset.essence);
        const reason = e && typeof E.essenceAvailability === 'function' ? E.essenceAvailability(state.item, e) : null;
        if (reason) { toast(reason, 'error'); return; }
        performAction({ type: 'essence', essenceId: b.dataset.essence });
      };
    });
  }
  function renderFossilActions(body) {
    const prices = priceOverrides();
    const selected = state.fossilSelection;
    const selectedFossils = selected.map((id) => D.fossils.find((f) => f.id === id)).filter(Boolean);
    body.innerHTML =
      '<div class="form-hint" style="margin-bottom:8px">选择 1–3 枚化石（共鸣器），化石会重铸整件稀有物品。权重会相互叠加。</div>' +
      '<div class="fossil-grid">' + D.fossils.map((f) =>
        '<button type="button" class="fossil-chip ' + (selected.indexOf(f.id) !== -1 ? 'selected' : '') + '" data-fossil="' + f.id + '" title="' + esc(f.desc) + '">' +
        esc(f.name) + '<small>' + costText(f.cost) + '</small></button>'
      ).join('') + '</div>' +
      '<div class="fossil-bar"><div class="fossil-detail">' +
      (selectedFossils.length ? selectedFossils.map((f) => '<b>' + esc(f.name) + '</b>：' + esc(f.desc)).join('<br>') : '尚未选择化石。单枚化石也会重铸物品，多枚会叠加权重与屏蔽。') +
      '</div><button class="btn gold fossil-apply" id="apply-fossil" type="button" ' + (selected.length ? '' : 'disabled') + '>使用化石 <span style="opacity:.75">' + costText(E.actionCost({ type: 'fossil', fossilIds: selected }, prices)) + '</span></button></div>';
    $$('#action-body [data-fossil]').forEach((b) => {
      b.onclick = () => {
        const id = b.dataset.fossil;
        const idx = state.fossilSelection.indexOf(id);
        if (idx === -1) {
          if (state.fossilSelection.length >= 3) { toast('最多同时使用 3 枚化石。', 'error'); return; }
          state.fossilSelection.push(id);
        } else {
          state.fossilSelection.splice(idx, 1);
        }
        renderFossilActions(body);
      };
    });
    const apply = $('#apply-fossil');
    if (apply) apply.onclick = () => {
      if (state.item.rarity === 'magic') { toast('化石不能用于魔法物品。', 'error'); return; }
      if (!state.fossilSelection.length) return;
      const ids = state.fossilSelection.slice();
      state.fossilSelection = [];
      performAction({ type: 'fossil', fossilIds: ids });
    };
  }
  function renderHarvestActions(body) {
    const prices = priceOverrides();
    body.innerHTML =
      '<div class="form-hint" style="margin-bottom:8px">庄园重铸会重铸稀有物品，并保证至少一条所选标签的词缀。适合补指定标签，不适合保词缀。</div>' +
      '<div class="harvest-grid">' + D.harvestTags.map((t) =>
        '<button type="button" class="harvest-chip" data-harvest="' + t.id + '">' + t.name + '</button>'
      ).join('') + '</div>' +
      '<div class="harvest-note">每次消耗约 ' + costText(prices.harvest) + '（按当前价格估算），会重铸全部非破裂词缀。</div>';
    $$('#action-body [data-harvest]').forEach((b) => {
      b.onclick = () => {
        if (state.item.rarity !== 'rare') { toast('庄园重铸只能用于稀有物品。', 'error'); return; }
        performAction({ type: 'harvest', tag: b.dataset.harvest });
      };
    });
  }
  function renderOmenActions(body) {
    const prices = priceOverrides();
    const omens = D.omens || [];
    if (!omens.length) {
      body.innerHTML = '<div class="action-none">这个游戏版本还没有配置预兆数据。</div>';
      return;
    }
    body.innerHTML = '<div class="form-hint" style="margin-bottom:8px">预兆会改变下一条通货的结果；这里把「预兆 + 对应通货」组合成一步，方便直接推演。</div>' +
      '<div class="action-grid">' + omens.map((omen) => {
        const reason = E.omenAvailability(state.item, omen.id);
        const cost = E.actionCost({ type: 'omen', omenId: omen.id }, prices);
        return '<button type="button" class="action-btn ' + (reason ? 'unavailable' : '') + '" data-omen="' + omen.id + '" ' + (reason ? 'title="' + esc(reason) + '"' : '') + '>' +
          '<span class="orb" style="--orb:' + omen.color + '">兆</span>' +
          '<span class="action-info"><span class="action-name">' + esc(omen.name) + '</span><span class="action-desc">' + esc(omen.desc) + '</span></span>' +
          '<span class="action-cost"><b>' + costText(cost) + '</b></span></button>';
      }).join('') + '</div>';
    $$('#action-body [data-omen]').forEach((b) => {
      b.onclick = () => {
        const reason = E.omenAvailability(state.item, b.dataset.omen);
        if (reason) { toast(reason, 'error'); return; }
        performAction({ type: 'omen', omenId: b.dataset.omen });
      };
    });
  }
  function benchPreview(b) {
    return E.formatText(b.text, b.v.map((r) => (r[0] + r[1]) / 2));
  }
  function renderBenchActions(body) {
    const options = E.benchOptions(state.item);
    const prices = priceOverrides();
    let html = '';
    if (options.length) {
      html += '<div class="bench-list">' + options.map((b) =>
        '<div class="bench-row"><span class="side-badge ' + b.affix + '">' + (b.affix === 'prefix' ? '前' : '后') + '</span>' +
        '<span class="bench-lead"><span class="bench-name">' + esc(b.name) + '</span><span class="bench-mod">' + esc(benchPreview(b)) + '</span></span>' +
        '<span class="bench-cost">' + costText(b.cost) + '</span>' +
        '<button class="btn tiny gold" type="button" data-bench="' + b.id + '">添加</button></div>'
      ).join('') + '</div>';
    } else {
      html += '<div class="action-none">当前没有可添加的工艺：可能词缀已满、同组词缀已存在，或该底子不支持。</div>';
    }
    const rare = state.item.rarity === 'rare';
    const canLockPrefix = rare && E.sides(state.item, 'prefix').length > 0;
    const canLockSuffix = rare && E.sides(state.item, 'suffix').length > 0;
    html += '<div class="form-hint" style="margin-top:12px;margin-bottom:6px">meta 工艺（价格按 2 神圣估算，可在设置中调整）</div>' +
      '<div class="lock-grid">' +
      '<div class="lock-card"><h4>保护前缀</h4><p>锁住前缀，只处理后缀。适合前缀已经完成的情况。</p>' +
      '<div class="lock-btns"><button class="btn tiny" data-lock="prefix" data-method="chaos" ' + (canLockPrefix ? '' : 'disabled') + '>锁前 + 混沌</button>' +
      '<button class="btn tiny" data-lock="prefix" data-method="scour" ' + (canLockPrefix ? '' : 'disabled') + '>锁前 + 重铸</button></div></div>' +
      '<div class="lock-card"><h4>保护后缀</h4><p>锁住后缀，只处理前缀。适合后缀已经完成的情况。</p>' +
      '<div class="lock-btns"><button class="btn tiny" data-lock="suffix" data-method="chaos" ' + (canLockSuffix ? '' : 'disabled') + '>锁后 + 混沌</button>' +
      '<button class="btn tiny" data-lock="suffix" data-method="scour" ' + (canLockSuffix ? '' : 'disabled') + '>锁后 + 重铸</button></div></div>' +
      '</div>' +
      '<div class="fossil-bar" style="margin-top:9px"><div class="fossil-detail">' +
      (state.item.meta && state.item.meta.multimod ? '已拥有多重工艺。' : '多重工艺允许最多 3 条工艺词缀，适合最后收尾。') +
      '</div><button class="btn tiny" id="btn-multimod" ' + (rare && !(state.item.meta && state.item.meta.multimod) ? '' : 'disabled') + '>多重工艺 ' + costText(prices.multimod || 400) + '</button></div>';
    body.innerHTML = html;
    $$('#action-body [data-bench]').forEach((b) => {
      b.onclick = () => performAction({ type: 'bench', benchId: b.dataset.bench });
    });
    $$('#action-body [data-lock]').forEach((b) => {
      b.onclick = () => {
        const side = b.dataset.lock;
        const method = b.dataset.method;
        performAction({ type: method === 'scour' ? 'lock_scour' : 'lock_chaos', side });
      };
    });
    const mm = $('#btn-multimod');
    if (mm) mm.onclick = () => performAction({ type: 'multimod' });
  }

  /* ------------------------------------------------------------------ perform */
  function addLog(action, result, before, after, silent) {
    const beforeMods = before.affixes.map((a) => a.text.replace(/\n/g, ' / '));
    const afterMods = after.affixes.map((a) => a.text.replace(/\n/g, ' / '));
    const added = afterMods.filter((x) => {
      const idx = beforeMods.indexOf(x);
      if (idx !== -1) { beforeMods.splice(idx, 1); return false; }
      return true;
    });
    const removed = beforeMods.slice();
    const beforeEval = E.evaluate(before, currentTargets());
    const afterEval = E.evaluate(after, currentTargets());
    const actionDef = action.type;
    const title = A.actionTitle(action);
    const entry = {
      id: Date.now() + Math.random(),
      t: Date.now(),
      title,
      message: result.message,
      cost: result.cost,
      added,
      removed,
      beforeMatched: beforeEval.matchedCount,
      afterMatched: afterEval.matchedCount,
      beforeCount: beforeEval.matchedCount + '/' + beforeEval.targetCount,
      afterCount: afterEval.matchedCount + '/' + afterEval.targetCount,
      type: actionDef,
    };
    state.log.unshift(entry);
    if (state.log.length > 100) state.log.length = 100;
    return entry;
  }
  function performAction(action, opts) {
    opts = opts || {};
    if (state.pendingResult) { toast('先确认上一步的实际结果，再执行新的操作。', 'error'); return false; }
    if (!opts.fromAuto && state.autoRunning) stopAuto('已手动接管');
    const before = E.clone(state.item);
    const res = E.applyAction(before, action, { prices: priceOverrides() });
    if (res.error) { toast(res.error, 'error'); return false; }
    state.history.push({
      item: before, log: state.log.slice(), spent: state.spent, attempts: state.attempts,
    });
    if (state.history.length > 40) state.history.shift();
    state.item = res.item;
    state.spent += res.cost;
    state.attempts++;
    state.routeStats = null;
    const entry = addLog(action, res, before, state.item, opts.silent);
    if (!opts.fromAuto && !opts.skipConfirm) {
      state.pendingResult = {
        action: E.clone(action), title: A.actionTitle(action), message: res.message,
        before: E.clone(before), after: E.clone(state.item), cost: res.cost,
        logId: entry && entry.id, timestamp: Date.now(),
      };
    }
    save();
    renderHeader();
    renderItem();
    renderTargets();
    renderInfluences();
    renderActionBody();
    renderLog();
    renderAdvisor();
    renderJourney();
    renderResultPrompt();
    if (!opts.silent && !opts.fromAuto && state.pendingResult) {
      const prompt = $('#result-prompt');
      if (prompt) setTimeout(() => prompt.scrollIntoView({ behavior: 'smooth', block: 'center' }), 80);
    }
    if (!opts.silent) {
      toast(res.message, 'success', 1900);
      if (E.evaluate(state.item, currentTargets()).complete && currentTargets().length) {
        toast('目标词缀已全部命中，可以收尾或继续追求更高品级。', 'success', 3800);
      }
    }
    return true;
  }
  function resultActionsHtml() {
    return '<div class="result-actions">' +
      '<button class="btn gold" type="button" data-result-same>和模拟一致</button>' +
      '<button class="btn ghost" type="button" data-result-none>实际没变化</button>' +
      '<button class="btn ghost" type="button" data-result-edit>结果不同，我来录入</button>' +
      '</div>';
  }
  function bindResultActions(root) {
    const same = root.querySelector('[data-result-same]');
    const none = root.querySelector('[data-result-none]');
    const edit = root.querySelector('[data-result-edit]');
    if (same) same.onclick = confirmResult;
    if (none) none.onclick = noChangeResult;
    if (edit) edit.onclick = editResult;
  }
  function confirmResult() {
    const pending = state.pendingResult;
    if (!pending) return;
    const log = state.log.find((l) => l.id === pending.logId);
    if (log) log.confirmed = true;
    state.pendingResult = null;
    save();
    renderAll();
    toast('已确认结果，助理重新计算下一步。', 'success', 3000);
  }
  function noChangeResult() {
    const pending = state.pendingResult;
    if (!pending) return;
    state.item = E.clone(pending.before);
    state.pendingResult = null;
    state.routeStats = null;
    const beforeEval = E.evaluate(state.item, currentTargets());
    state.log.unshift({
      id: Date.now() + Math.random(), t: Date.now(), title: '实际结果',
      message: '这一步实际没有变化，已恢复到操作前。', cost: 0,
      added: [], removed: [], beforeMatched: beforeEval.matchedCount,
      afterMatched: beforeEval.matchedCount,
      beforeCount: beforeEval.matchedCount + '/' + beforeEval.targetCount,
      afterCount: beforeEval.matchedCount + '/' + beforeEval.targetCount,
      type: 'manual', confirmed: true,
    });
    save();
    renderAll();
    toast('已记录：这一步没有变化。', 'success', 3000);
  }
  function editResult() {
    openManual({ fromResult: true });
  }
  function renderResultPrompt() {
    const el = $('#result-prompt');
    if (!el) return;
    const pending = state.pendingResult;
    if (!pending) {
      el.hidden = true;
      el.innerHTML = '';
      return;
    }
    el.hidden = false;
    el.innerHTML =
      '<div class="result-head"><span>刚刚这一步</span><b>' + esc(pending.title) + '</b><em>花费 ' + costText(pending.cost) + '</em></div>' +
      '<p class="result-message">模拟结果：' + esc(pending.message) + '</p>' +
      '<div class="result-question">游戏里实际发生了什么？</div>' +
      resultActionsHtml() +
      '<p class="result-foot">确认后，助理才会给出新的下一步。</p>';
    bindResultActions(el);
  }
  function undo() {
    if (!state.history.length) return;
    if (state.autoRunning) stopAuto('已撤销，连续执行停止。');
    const snap = state.history.pop();
    state.pendingResult = null;
    state.item = snap.item;
    state.log = snap.log;
    state.spent = snap.spent;
    state.attempts = snap.attempts;
    state.routeStats = null;
    save();
    renderAll();
    toast('已撤销上一步。');
  }

  /* ------------------------------------------------------------------ log */
  function renderLog() {
    const el = $('#craft-log');
    if (!state.log.length) {
      el.innerHTML = '<div class="log-empty">还没有制作记录。选择一种通货或工艺开始推演。</div>';
      return;
    }
    el.innerHTML = state.log.map((l, i) => {
      const delta = [];
      (l.added || []).forEach((x) => delta.push('<span class="add">+' + esc(x) + '</span>'));
      (l.removed || []).forEach((x) => delta.push('<span class="del">−' + esc(x) + '</span>'));
      if (l.beforeCount || l.afterCount) delta.push('<span class="prog">目标 ' + esc(l.beforeCount) + ' → ' + esc(l.afterCount) + '</span>');
      return '<div class="log-entry ' + (i === 0 ? 'latest' : '') + '">' +
        '<span class="log-dot">' + esc(LOG_CHAR[l.type] || (l.type || '').slice(0, 1)) + '</span>' +
        '<div><div class="log-title"><b>' + esc(l.title) + '</b>' + (l.confirmed ? '<span class="log-confirmed">已确认真实结果</span>' : '') + '<span>' + nowTimeFor(l.t) + '</span><em>' + costText(l.cost) + '</em></div>' +
        '<div class="log-detail">' + esc(l.message) + '</div>' +
        (delta.length ? '<div class="log-delta">' + delta.join('') + '</div>' : '') +
        '</div></div>';
    }).join('');
  }
  function nowTimeFor(ts) {
    return new Date(ts).toLocaleTimeString('zh-CN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  }

  /* ------------------------------------------------------------------ advisor */
  function targetChecksHtml(analysis) {
    if (!state.targets.length) return '';
    return '<ul class="target-checks">' + state.targets.map((t) => {
      const def = E.getTargetDef(t.modId);
      if (!def) return '';
      const hit = E.findMatchingAffix(state.item, t);
      const isBench = D.bench.some((b) => b.id === t.modId);
      return '<li class="check-item ' + (hit ? 'ok' : 'miss') + '">' +
        '<span class="mark">' + (hit ? '✓' : '×') + '</span>' +
        '<span>' + esc(def.name) + '</span>' +
        '<span class="tier">' + (isBench ? '工艺' : 'T' + (t.tier || 1) + '+') + (hit ? ' · 已命中' : '') + '</span></li>';
    }).join('') + '</ul>';
  }
  function renderAdvisor() {
    const targets = currentTargets();
    const elDiag = $('#diagnosis');
    const elRecs = $('#recommendations');
    if (!targets.length) {
      elDiag.textContent = '先选 2–3 条你最想要的词缀，顾问才会告诉你下一步怎么做。';
      $('#progress-text').textContent = '0 / 0';
      $('#progress-fill').style.width = '0%';
      $('#progress-meta').textContent = '等待目标';
      $('#target-checks').innerHTML = '';
      elRecs.innerHTML = '<div class="action-none">添加至少 1 条目标词缀后，这里会给出下一步建议。</div>';
      $('#route-plan').innerHTML = '<div class="plan-diagnosis">选择一个快速模板，或手动添加目标。</div>';
      $('#plan-title').textContent = '等待目标';
      $('#route-stats').classList.remove('show');
      $('#route-stats').innerHTML = '';
      state._analysis = null;
      const mn = $('#mobile-next');
      if (mn) mn.hidden = true;
      return;
    }
    let analysis;
    try {
      analysis = A.analyze(state.item, targets, {
        prices: priceOverrides(),
        samples: state.settings.samples,
        seed: 20260413 + state.analysisNonce * 997,
      });
    } catch (e) {
      console.error(e);
      elDiag.textContent = '顾问计算出现异常：' + e.message;
      const mn = $('#mobile-next');
      if (mn) mn.hidden = true;
      return;
    }
    state._analysis = analysis;
    const ev = analysis.eval;
    elDiag.innerHTML = '<b class="diag-label">现在的情况</b>' + esc(!state.item.affixes.length ? '还没有词缀。先看右边的「先做这个」，点执行；不用自己算。' : analysis.diagnosis);
    $('#progress-text').textContent = ev.matchedCount + ' / ' + ev.targetCount;
    $('#progress-fill').style.width = Math.round(ev.progress * 100) + '%';
    const meta = [];
    meta.push('还能加 ' + ev.openPrefix + ' 条前缀 · ' + ev.openSuffix + ' 条后缀');
    meta.push('不想要的词缀 ' + ev.junk.length);
    if (ev.complete) meta.push('目标完成');
    $('#progress-meta').textContent = meta.join(' · ');
    $('#target-checks').innerHTML = targetChecksHtml(analysis);

    if (state.pendingResult) {
      elDiag.innerHTML = '<b class="diag-label">等待确认</b>这一步已经模拟完成。先告诉助理游戏里实际发生了什么，确认后再计算新的下一步。';
      elRecs.innerHTML = '<div class="result-wait"><b>先确认上一步结果</b><p>' + esc(state.pendingResult.title) + '：' + esc(state.pendingResult.message) + '</p>' + resultActionsHtml() + '</div>';
      bindResultActions(elRecs);
      const mobileWait = $('#mobile-next');
      if (mobileWait) mobileWait.hidden = true;
      $('#plan-title').textContent = '等待确认';
      $('#route-plan').innerHTML = '<div class="plan-diagnosis">确认实际结果后，这里会重新规划。</div>';
      $('#route-stats').classList.remove('show');
      $('#route-stats').innerHTML = '';
      const simWait = $('#btn-sim-route');
      if (simWait) simWait.disabled = true;
      renderAutoButton();
      return;
    }

    const recs = analysis.recommendations.slice(0, 3);
    if (!recs.length) {
      elRecs.innerHTML = '<div class="action-none">当前没有可执行的建议，请检查目标与物品状态。</div>';
    } else {
      elRecs.innerHTML = recs.map((r, i) => {
        const rank = i === 0 ? '先做这个' : i === 1 ? '也可以' : '备选';
        const steps = (r.steps || []).map((s) => '<li>' + esc(s) + '</li>').join('');
        return '<article class="rec-card ' + (i === 0 ? 'primary' : '') + '">' +
          '<div class="rec-top"><span class="rec-rank">' + rank + '</span><span class="rec-title">' + esc(r.title) + '</span>' +
          '<span class="rec-cost"><b>' + costText(r.cost) + '</b> / 次</span></div>' +
          '<div class="rec-detail">' + esc(r.detail) + '</div>' +
          '<div class="rec-metrics">' +
          '<div class="metric"><span>更接近目标</span><b class="' + (r.pImprove >= 0.25 ? 'good' : r.pImprove > 0 ? '' : 'warn') + '">' + pctText(r.pImprove) + '</b></div>' +
          '<div class="metric"><span>直接做完</span><b class="' + (r.pComplete > 0 ? 'good' : '') + '">' + pctText(r.pComplete) + '</b></div>' +
          '<div class="metric"><span>平均花费</span><b>' + A.fmtCost(r.expectedCost) + '</b></div>' +
          '</div>' +
          (r.pRegress > 0 ? '<div class="rec-risk">可能弄丢已有目标 ' + pctText(r.pRegress) + '</div>' : '') +
          (r.warning ? '<div class="rec-warning">' + esc(r.warning) + '</div>' : '') +
          '<details class="rec-details" ' + (i === 0 ? 'open' : '') + '><summary>为什么推荐 / 怎么做</summary>' +
          '<ul class="rec-why">' + (r.why || []).map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul>' +
          (steps ? '<ul class="rec-steps">' + steps + '</ul>' : '') + '</details>' +
          '<div class="rec-actions"><button class="btn gold" type="button" data-exec-rec="' + i + '">执行这一步</button>' +
          '<button class="btn ghost details" type="button" data-rec-detail="' + i + '">为什么</button></div></article>';
      }).join('');
      $$('#recommendations [data-exec-rec]').forEach((b) => {
        b.onclick = () => {
          const rec = recs[Number(b.dataset.execRec)];
          if (rec) performAction(rec.action);
        };
      });
      $$('#recommendations [data-rec-detail]').forEach((b) => {
        b.onclick = () => {
          const card = b.closest('.rec-card');
          const details = card && card.querySelector('details');
          if (details) details.open = !details.open;
        };
      });
    }

    const mobileNext = $('#mobile-next');
    if (mobileNext) {
      const top = recs[0];
      if (!top || ev.complete) mobileNext.hidden = true;
      else {
        mobileNext.hidden = false;
        mobileNext.innerHTML = '<div class="mobile-next-top"><span>下一步建议</span><b>' + esc(top.title) + '</b><em>' + costText(top.cost) + ' / 次</em></div>' +
          '<p>' + esc(top.detail) + '</p>' +
          '<div class="mobile-next-actions"><button class="btn gold" type="button" data-mobile-exec>执行这一步</button>' +
          '<button class="btn ghost" type="button" data-mobile-more>完整建议</button></div>';
        const exec = mobileNext.querySelector('[data-mobile-exec]');
        if (exec) exec.onclick = () => performAction(top.action);
        const more = mobileNext.querySelector('[data-mobile-more]');
        if (more) more.onclick = () => $('#step-finish').scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    }
    $('#plan-title').textContent = ev.complete ? '完成' : '按当前策略';
    const steps = (analysis.plan.steps || []).map((s, i) =>
      '<div class="plan-step"><span class="no">' + (i + 1) + '</span><p>' + esc(s) + '</p></div>'
    ).join('');
    $('#route-plan').innerHTML =
      '<div class="plan-diagnosis">' + esc(analysis.plan.diagnosis) + '</div>' + steps +
      '<div class="plan-finish">' + esc(analysis.plan.finish) + '</div>';

    const rs = state.routeStats;
    const elStats = $('#route-stats');
    if (rs) {
      elStats.classList.add('show');
      elStats.innerHTML =
        '<div class="rs-item"><span>成功率</span><b>' + pctText(rs.successRate) + '</b></div>' +
        '<div class="rs-item"><span>平均花费</span><b>' + A.fmtCost(rs.avgCost) + '</b></div>' +
        '<div class="rs-item"><span>成功时花费</span><b>' + A.fmtCost(rs.avgWinCost) + '</b></div>' +
        '<div class="rs-item"><span>平均步数</span><b>' + rs.avgSteps.toFixed(1) + '</b></div>';
    } else {
      elStats.classList.remove('show');
      elStats.innerHTML = '';
    }
    const simBtn = $('#btn-sim-route');
    if (simBtn) {
      simBtn.disabled = state.simulating;
      simBtn.textContent = state.simulating ? '估算中…' : '估算整套要花多少';
    }
    renderAutoButton();
  }
  function renderAutoButton() {
    const b = $('#btn-auto');
    if (!b) return;
    if (state.pendingResult && !state.autoRunning) {
      b.disabled = true;
      b.textContent = '等待确认';
      b.classList.remove('danger');
      return;
    }
    b.disabled = false;
    b.textContent = state.autoRunning ? '停止连续执行' : '连续执行';
    b.classList.toggle('danger', state.autoRunning);
  }

  /* ------------------------------------------------------------------ auto */
  function stopAuto(reason) {
    if (!state.autoRunning) return;
    state.autoRunning = false;
    clearTimeout(autoTimer);
    renderAutoButton();
    if (reason) toast(reason, 'success', 2600);
  }
  function toggleAuto() {
    if (state.autoRunning) { stopAuto('已停止连续执行。'); return; }
    if (state.pendingResult) { toast('先确认上一步的实际结果，再继续。', 'error'); return; }
    if (!currentTargets().length) { toast('请先设置目标词缀。', 'error'); return; }
    if (E.evaluate(state.item, currentTargets()).complete) { toast('目标已经完成。', 'success'); return; }
    state.autoRunning = true;
    state.autoSteps = 0;
    state.autoStartSpent = state.spent;
    renderAutoButton();
    toast('开始模拟连续推演：不逐步确认结果，最多 30 步 / 1500c。');
    autoLoop();
  }
  function autoLoop() {
    if (!state.autoRunning) return;
    if (state.autoSteps >= 30) { stopAuto('已到达 30 步上限，停在当前状态。'); return; }
    if (state.spent - (state.autoStartSpent || 0) > 1500) { stopAuto('连续执行已花费 1500c，先停下来评估更划算的路线。'); return; }
    const analysis = A.analyze(state.item, currentTargets(), {
      prices: priceOverrides(), samples: 100, seed: 20260413 + state.autoSteps * 131,
    });
    if (analysis.complete) { stopAuto('目标达成！'); return; }
    let rec = analysis.recommendations[0];
    if (!rec) { stopAuto('没有可执行的建议了。'); return; }
    if (analysis.eval.matchedCount >= 1 && rec.pRegress >= 0.45 && rec.pComplete < 0.15) {
      const safer = analysis.recommendations.find((r) => r !== rec && r.pRegress < 0.3 && r.pImprove > 0);
      if (!safer) { stopAuto('下一步操作风险较高，已停下来给你手动判断。'); return; }
      rec = safer;
    }
    state.autoSteps++;
    const ok = performAction(rec.action, { silent: true, fromAuto: true });
    if (!ok) { stopAuto('首选操作执行失败，已停止。'); return; }
    renderAutoButton();
    if (E.evaluate(state.item, currentTargets()).complete) { stopAuto('目标达成！'); return; }
    autoTimer = setTimeout(autoLoop, 280);
  }

  /* ------------------------------------------------------------------ manual */
  function openManual(opts) {
    opts = opts || {};
    let draft = E.clone(state.item);
    draft.meta = draft.meta || { multimod: false };
    let manualSide = 'prefix';
    let manualQuery = '';
    const render = () => {
      const base = E.getBase(draft.baseId);
      const pCount = E.sides(draft, 'prefix').length;
      const sCount = E.sides(draft, 'suffix').length;
      const affixes = draft.affixes.map((a) => {
        return '<div class="manual-mod">' +
          '<span class="side-badge ' + a.affix + '">' + (a.affix === 'prefix' ? '前' : '后') + '</span>' +
          '<span><span class="mm-text">' + mdText(a.text) + '</span><div class="mm-meta">T' + a.tierRank + (a.crafted ? ' · 工艺' : '') + (a.fractured ? ' · 破裂' : '') + (a.essence ? ' · 精华' : '') + '</div></span>' +
          '<button class="btn tiny ghost" data-mf="' + a.uid + '" type="button">' + (a.fractured ? '取消破裂' : '设为破裂') + '</button>' +
          '<button class="btn tiny ghost" data-mc="' + a.uid + '" type="button">' + (a.crafted ? '取消工艺' : '设为工艺') + '</button>' +
          '<button class="remove-btn" data-mr="' + a.uid + '" type="button" title="移除">×</button></div>';
      }).join('');
      const pool = D.mods.concat(D.bench).filter((m) => {
        if (m.affix !== manualSide) return false;
        if (draft.affixes.some((a) => a.modId === m.id)) return false;
        if (!E.targetEligibleOnBase(m.id, draft.baseId, draft.influences, draft.ilvl)) return false;
        if (manualQuery && (m.name + ' ' + m.text).toLowerCase().indexOf(manualQuery.toLowerCase()) === -1) return false;
        return true;
      });
      const poolHtml = pool.length ? pool.map((m) => {
        const isBench = D.bench.some((b) => b.id === m.id);
        const tiers = isBench ? '<span style="font-size:9px;color:var(--muted-2)">工艺</span>' :
          '<select data-mtier="' + m.id + '">' + m.tiers.map((t) => {
            const rank = E.tierRank(m, t);
            return '<option value="' + rank + '" ' + (rank === (m.tiers.length >= 2 ? 2 : 1) ? 'selected' : '') + '>T' + rank + ' · i' + t.ilvl + '</option>';
          }).join('') + '</select>';
        const preview = isBench ? E.formatText(m.text, m.v.map((r) => (r[0] + r[1]) / 2)) : E.formatText(m.text, m.tiers[m.tiers.length - 1].v.map((r) => (r[0] + r[1]) / 2));
        return '<div class="pool-row" data-manual-row="' + (m.name + ' ' + m.text + ' ' + (m.tags || []).join(' ')).toLowerCase() + '">' +
          '<span class="pool-info"><span class="pool-name">' + esc(m.name) + (isBench ? ' <small style="color:var(--cyan)">工艺</small>' : '') + '</span>' +
          '<span class="pool-stat">' + esc(preview) + '</span></span>' + tiers +
          '<button class="pool-add" type="button" data-madd="' + m.id + '">+</button></div>';
      }).join('') : '<div class="pool-empty">没有可添加的词缀。</div>';
      const html =
        '<div class="modal-head"><div><h3>' + (opts.fromResult ? '录入这一步的实际结果' : '录入现有装备') + '</h3><p>' + (opts.fromResult ? '以模拟结果为起点，把游戏里实际出现的词缀改成一致。' : '把游戏里已经做出来的装备填进来，顾问会从当前状态继续。') + '</p></div>' +
        '<button class="modal-close" data-close type="button">×</button></div>' +
        '<div class="modal-body">' +
        '<div class="modal-note">底子：<b>' + esc(base.name) + '</b> · 物品等级 ' + draft.ilvl + ' · 影响 ' + (draft.influences.length ? draft.influences.map((id) => (D.influences.find((x) => x.id === id) || {}).name).join(' / ') : '无') + '</div>' +
        '<div class="form-grid" style="margin-bottom:13px">' +
        '<div class="form-row"><label>稀有度</label><select id="manual-rarity">' +
        ['normal', 'magic', 'rare'].map((r) => '<option value="' + r + '" ' + (draft.rarity === r ? 'selected' : '') + '>' + E.rarityName(r) + '</option>').join('') +
        '</select></div>' +
        '<div class="form-row"><label>前缀 / 后缀</label><div style="font-size:11px;color:var(--muted);padding-top:6px">' + pCount + ' / 3 前缀 · ' + sCount + ' / 3 后缀</div></div>' +
        '</div>' +
        '<label class="manual-check"><input type="checkbox" id="manual-multimod" ' + (draft.meta.multimod ? 'checked' : '') + '> 已有多重工艺（允许 3 条工艺词缀）</label>' +
        '<div class="manual-section"><h4>当前词缀</h4><div class="manual-mods">' + (affixes || '<div class="empty-manual">没有词缀。</div>') + '</div></div>' +
        '<div class="manual-section"><h4>添加词缀</h4>' +
        '<div class="tabs tiny" style="margin-bottom:6px">' +
        ['prefix', 'suffix'].map((s) => '<button type="button" data-mside="' + s + '" class="' + (manualSide === s ? 'active' : '') + '">' + sideCN(s) + '</button>').join('') +
        '</div>' +
        '<div class="field search-field compact"><span class="field-icon">⌕</span><input id="manual-search" type="search" placeholder="搜索词缀" value="' + esc(manualQuery) + '"></div>' +
        '<div class="target-pool" style="max-height:190px">' + poolHtml + '</div></div>' +
        '</div>' +
        '<div class="modal-foot"><button class="btn ghost" data-close type="button">取消</button><button class="btn gold" id="manual-apply" type="button">应用物品状态</button></div>';
      openModal(html);
      $('#manual-rarity').onchange = (e) => { draft.rarity = e.target.value; render(); };
      $('#manual-multimod').onchange = (e) => { draft.meta.multimod = e.target.checked; render(); };
      $$('#modal-root [data-close]').forEach((b) => { b.onclick = closeModal; });
      $$('#modal-root [data-mside]').forEach((b) => {
        b.onclick = () => { manualSide = b.dataset.mside; render(); };
      });
      const search = $('#manual-search');
      search.oninput = () => {
        manualQuery = search.value;
        const q = manualQuery.toLowerCase();
        $$('#modal-root [data-manual-row]').forEach((row) => {
          row.style.display = !q || row.dataset.manualRow.indexOf(q) !== -1 ? '' : 'none';
        });
      };
      search.onkeydown = (e) => { if (e.key === 'Enter') e.preventDefault(); };
      $$('#modal-root [data-mr]').forEach((b) => {
        b.onclick = () => {
          const res = E.removeAffix(draft, Number(b.dataset.mr));
          if (res.error) { toast(res.error, 'error'); return; }
          draft = res.item; render();
        };
      });
      $$('#modal-root [data-mf]').forEach((b) => {
        b.onclick = () => {
          const a = draft.affixes.find((x) => x.uid === Number(b.dataset.mf));
          if (a) a.fractured = !a.fractured;
          render();
        };
      });
      $$('#modal-root [data-mc]').forEach((b) => {
        b.onclick = () => {
          const a = draft.affixes.find((x) => x.uid === Number(b.dataset.mc));
          if (a) a.crafted = !a.crafted;
          render();
        };
      });
      $$('#modal-root [data-madd]').forEach((b) => {
        b.onclick = () => {
          const modId = b.dataset.madd;
          const tierSel = $('[data-mtier="' + modId + '"]');
          const tier = tierSel ? Number(tierSel.value) : null;
          const res = E.addManualAffix(draft, modId, { tier });
          if (res.error) { toast(res.error, 'error'); return; }
          draft = res.item; render();
        };
      });
      $('#manual-apply').onclick = () => applyManual(draft);
      setTimeout(() => {
        const s = $('#manual-search');
        if (s && manualQuery) { s.focus(); s.setSelectionRange(s.value.length, s.value.length); }
      }, 0);
    };
    render();
  }
  function validateDraft(d) {
    const p = E.sides(d, 'prefix').length;
    const s = E.sides(d, 'suffix').length;
    if (d.rarity === 'normal' && d.affixes.length) return '普通物品不能有词缀。';
    if (d.rarity === 'magic' && (p > 1 || s > 1 || d.affixes.length > 2)) return '魔法物品最多 1 前缀 + 1 后缀。';
    if (d.rarity === 'rare' && (p > 3 || s > 3 || d.affixes.length > 6)) return '稀有物品最多 3 前缀 + 3 后缀。';
    const maxCrafted = d.meta && d.meta.multimod ? 3 : 1;
    if (d.affixes.filter((a) => a.crafted).length > maxCrafted) return '工艺词缀超过上限：没有多重工艺时最多 1 条。';
    return null;
  }
  function applyManual(draft) {
    const err = validateDraft(draft);
    if (err) { toast(err, 'error'); return; }
    const before = E.clone(state.item);
    state.history.push({ item: before, log: state.log.slice(), spent: state.spent, attempts: state.attempts });
    if (state.history.length > 40) state.history.shift();
    state.item = E.clone(draft);
    state.pendingResult = null;
    E.syncUid(state.item);
    state.item.influences = (state.item.influences || state.influences).slice();
    state.baseId = state.item.baseId;
    state.ilvl = state.item.ilvl;
    state.influences = state.item.influences.slice();
    const after = state.item;
    const entry = {
      id: Date.now() + Math.random(), t: Date.now(), title: '录入实际结果',
      message: '按实际游戏状态录入了 ' + after.affixes.length + ' 条词缀。', cost: 0,
      added: after.affixes.map((a) => a.text.replace(/\n/g, ' / ')),
      removed: before.affixes.map((a) => a.text.replace(/\n/g, ' / ')),
      beforeMatched: E.evaluate(before, currentTargets()).matchedCount,
      afterMatched: E.evaluate(after, currentTargets()).matchedCount,
      beforeCount: E.evaluate(before, currentTargets()).matchedCount + '/' + currentTargets().length,
      afterCount: E.evaluate(after, currentTargets()).matchedCount + '/' + currentTargets().length,
      type: 'manual', confirmed: true,
    };
    state.log.unshift(entry);
    if (state.log.length > 100) state.log.length = 100;
    state.routeStats = null;
    save(); closeModal(); renderAll();
    toast('已录入现有装备。', 'success');
  }

  /* ------------------------------------------------------------------ config sync */
  function configSourceLabel() {
    const m = state.configMeta;
    if (!m) return '源码内置';
    if (m.backend && (m.backend.provider === 'poe.ninja' || m.backend.provider === 'poe.ninja-poe2')) {
      return 'poe.ninja' + (m.backend.league ? ' · ' + m.backend.league : '');
    }
    if (staticConfigMode()) return '同源静态配置';
    if (m.source === 'built-in') return '服务器配置';
    if (m.source === 'backend') return '后端拉取';
    if (m.source === 'local') return '本地缓存';
    if (m.source === 'import') return '旧版导入';
    if (m.source === 'export') return '旧版导出';
    return m.source || '远程配置';
  }
  function renderConfigBadge() {
    const el = $('#config-badge');
    if (!el) return;
    el.classList.toggle('remote', !!(state.configMeta && state.configMeta.source !== 'built-in'));
    if (configRefreshing) {
      el.textContent = '同步中…';
      el.title = '正在从服务器读取数据配置';
      return;
    }
    if (state.configMeta) {
      el.textContent = '配置 ' + (state.configMeta.version || '本地');
      el.title = configSourceLabel() + (state.configMeta.updatedAt ? ' · ' + new Date(state.configMeta.updatedAt).toLocaleString('zh-CN') : '');
    } else {
      el.textContent = '内置配置';
      el.title = '使用 js/data.js 中的内置数据';
    }
  }
  function applyCachedConfig() {
    const cache = C.loadCache();
    if (!cache) return false;
    if (cache.dataVersion && cache.dataVersion !== D.version) {
      C.clearCache();
      return false;
    }
    try {
      C.apply(cache);
      state.settings.prices = Object.assign({}, D.prices);
      if (cache.settings && Number.isFinite(Number(cache.settings.samples))) {
        state.settings.samples = Number(cache.settings.samples);
      }
      state.configMeta = {
        version: cache.version || 'local',
        updatedAt: cache.updatedAt || new Date().toISOString(),
        source: cache.source || 'cache',
        appliedAt: new Date().toISOString(),
        backend: cache.backend || null,
      };
      return true;
    } catch (e) {
      console.warn('缓存配置应用失败', e);
      return false;
    }
  }
  function persistCurrentConfig(meta) {
    const m = Object.assign({}, state.configMeta || {}, meta || {});
    const cfg = C.current({
      version: m.version || 'local',
      updatedAt: m.updatedAt || new Date().toISOString(),
      source: m.source || 'local',
      samples: state.settings.samples,
    });
    cfg.backend = m.backend || null;
    C.saveCache(cfg);
    state.configMeta = {
      version: cfg.version,
      updatedAt: cfg.updatedAt,
      source: cfg.source,
      appliedAt: new Date().toISOString(),
      backend: m.backend || null,
    };
    return cfg;
  }
  function applyConfigPack(payload) {
    const result = C.apply(payload);
    state.settings.prices = Object.assign({}, D.prices);
    if (payload.settings && Number.isFinite(Number(payload.settings.samples))) {
      state.settings.samples = Number(payload.settings.samples);
    }
    state.configMeta = {
      version: payload.version || 'local',
      updatedAt: payload.updatedAt || new Date().toISOString(),
      source: payload.source || 'backend',
      appliedAt: new Date().toISOString(),
      backend: payload.backend || null,
    };
    state.routeStats = null;
    persistCurrentConfig();
    save();
    renderConfigBadge();
    return result;
  }
  function cooldownRemainingMs() {
    return Math.max(0, Number(state.nextPullAt || 0) - Date.now());
  }
  function cooldownText() {
    const ms = cooldownRemainingMs();
    if (ms <= 0) return '可拉取';
    const sec = Math.ceil(ms / 1000);
    return Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
  }
  function backendConfigured() {
    return !!state.settings.configUrl && state.settings.configUrl.indexOf('YOUR-WORKER') === -1;
  }
  function staticConfigMode() {
    return D.configMode === 'static' && /^data\//.test(String(state.settings.configUrl || ''));
  }
  async function refreshConfig(opts) {
    opts = opts || {};
    if (configRefreshing) return false;
    if (location.protocol === 'file:') {
      if (!opts.silent) toast('本地文件模式无法拉取后端；请通过 GitHub Pages / HTTP 访问。', 'error', 4200);
      return false;
    }
    if (!backendConfigured()) {
      if (!opts.silent) toast('还没有配置后端地址：请编辑 js/runtime-config.js 填入 Worker URL。', 'error', 4400);
      return false;
    }
    if (cooldownRemainingMs() > 0) {
      if (!opts.silent) toast('拉取冷却中，还需 ' + cooldownText() + '。', 'error', 2600);
      return false;
    }
    const url = state.settings.configUrl;
    configRefreshing = true;
    renderConfigBadge();
    try {
      const payload = await C.fetchRemote(url);
      const backend = payload.backend || {};
      const nextAt = backend.nextAllowedAt ? Date.parse(backend.nextAllowedAt) : NaN;
      state.nextPullAt = Number.isFinite(nextAt) ? nextAt : Date.now() + runtimeCooldown() * 1000;
      if (opts.onlyIfNewer && state.configMeta
        && payload.version && payload.version === state.configMeta.version
        && payload.updatedAt && payload.updatedAt === state.configMeta.updatedAt) {
        save();
        return false;
      }
      const result = applyConfigPack(payload);
      renderAll();
      if (!opts.silent) {
        const warn = result.warnings && result.warnings.length ? '（' + result.warnings.length + ' 条警告）' : '';
        toast('数据已拉取' + warn + '，冷却 ' + Math.round(runtimeCooldown() / 60) + ' 分钟。', 'success', 3200);
      }
      return true;
    } catch (e) {
      if (!opts.silent) toast('拉取失败：' + e.message, 'error', 4400);
      return false;
    } finally {
      configRefreshing = false;
      save();
      renderConfigBadge();
      setupAutoSync();
    }
  }
  function setupAutoSync() {
    clearTimeout(autoSyncTimer);
    autoSyncTimer = null;
    if (!state.settings.autoSync || location.protocol === 'file:' || !backendConfigured()) return;
    const delay = Math.max(60 * 1000, cooldownRemainingMs() + 1000);
    autoSyncTimer = setTimeout(() => {
      autoSyncTimer = null;
      const busy = document.activeElement && /^(INPUT|SELECT|TEXTAREA)$/.test(document.activeElement.tagName);
      if (!document.hidden && !busy && !$('#modal-root').innerHTML && cooldownRemainingMs() <= 0) {
        refreshConfig({ onlyIfNewer: true, silent: true }).finally(() => setupAutoSync());
      } else {
        setupAutoSync();
      }
    }, delay);
  }
  /* ------------------------------------------------------------------ settings */
  function configStatusHtml() {
    const m = state.configMeta;
    const version = m ? (m.version || '本地') : '内置数据';
    const updated = m && m.updatedAt ? new Date(m.updatedAt).toLocaleString('zh-CN') : '—';
    const source = configSourceLabel();
    const cooldown = Math.round(runtimeCooldown() / 60);
    let note;
    if (!backendConfigured()) {
      note = '<span class="warn">尚未配置后端地址：请编辑 js/runtime-config.js，把 configUrl 换成你的 Worker 地址。</span>';
    } else if (location.protocol === 'file:') {
      note = '<span class="warn">本地文件模式无法拉取配置；请通过 GitHub Pages / HTTP 访问。</span>';
    } else if (staticConfigMode()) {
      note = '同源静态配置：前端每 ' + cooldown + ' 分钟最多请求一次；静态模式没有服务端强制冷却。';
    } else {
      note = '后端每 ' + cooldown + ' 分钟最多向上游拉取一次；页面只读展示，不提供手动改价。';
    }
    const warnings = m && m.backend && Array.isArray(m.backend.warnings) ? m.backend.warnings : [];
    return '<div class="config-status">' +
      '<div class="config-status-head"><b>' + esc(version) + '</b><span>' + esc(source) + '</span></div>' +
      '<p>更新时间：' + esc(updated) + '。' + note + '</p>' +
      '<p>下次可拉取：<b id="config-cooldown">' + (cooldownRemainingMs() > 0 ? cooldownText() : '现在') + '</b></p>' +
      (warnings.length ? '<p class="warn">后端告警：' + esc(warnings.slice(0, 2).join('；')) + '</p>' : '') +
      '</div>';
  }
  function readRows(items, labelFn, unit) {
    return items.map((item) => '<div class="read-row">' +
      '<span>' + esc(labelFn(item)) + '</span><b>' + esc(String(item.cost)) + (unit || 'c') + '</b>' +
      '</div>').join('');
  }
  function openSettings() {
    const prices = priceOverrides();
    const canAuto = backendConfigured() && location.protocol !== 'file:';
    const fields = D.priceFields || [
      ['chaos', '混沌石'], ['exalted', '崇高石'], ['annulment', '剥离石'], ['alteration', '改造石'],
      ['regal', '富豪石'], ['alchemy', '点金石'], ['transmute', '蜕变石'], ['augmentation', '增幅石'],
      ['scour', '重铸石'], ['divine', '神圣石'], ['harvest', '庄园重铸'], ['lock', 'meta 锁前/锁后'],
      ['multimod', '多重工艺'], ['essenceMult', '精华价格倍率'], ['fossilMult', '化石价格倍率'],
    ];
    const essenceSection = D.essences.length
      ? '<details class="config-section"><summary>精华单价 <small>只读 · ' + D.essences.length + ' 条</small></summary><div class="config-section-body"><div class="read-grid">' +
        readRows(D.essences, (e) => e.tierName + e.name) + '</div></div></details>'
      : '';
    const fossilSection = D.fossils.length
      ? '<details class="config-section"><summary>化石单价 <small>只读 · ' + D.fossils.length + ' 条</small></summary><div class="config-section-body"><div class="read-grid">' +
        readRows(D.fossils, (f) => f.name) + '</div></div></details>'
      : '';
    const benchSection = D.bench.length
      ? '<details class="config-section"><summary>工艺单价 <small>只读 · ' + D.bench.length + ' 条</small></summary><div class="config-section-body"><div class="read-grid">' +
        readRows(D.bench, (b) => b.name) + '</div></div></details>'
      : '';
    const staticMode = staticConfigMode();
    const html =
      '<div class="modal-head"><div><h3>数据状态</h3><p>价格由' + (staticMode ? '同源静态配置' : '后端统一拉取') + '，页面只读展示；不提供手动改价。</p></div>' +
      '<button class="modal-close" data-close type="button">×</button></div>' +
      '<div class="modal-body">' +
      configStatusHtml() +
      '<div class="config-url-row"><code class="config-url">' + esc(state.settings.configUrl || '未配置') + '</code>' +
      '<button class="btn tiny gold" id="config-refresh" type="button">立即拉取</button></div>' +
      '<label class="config-check"><input type="checkbox" id="config-auto" ' + (canAuto ? '' : ' disabled') + ' ' + (state.settings.autoSync && canAuto ? 'checked' : '') + '> 自动拉取（每 ' + Math.round(runtimeCooldown() / 60) + ' 分钟最多一次）</label>' +
      '<div class="config-note">' + (staticMode
        ? '价格来自同源静态配置，前端只能请求刷新，不能填写。前端每 ' + Math.round(runtimeCooldown() / 60) + ' 分钟最多请求一次。'
        : '价格由后端从上游拉取，前端只能请求刷新，不能填写。每轮拉取后进入 ' + Math.round(runtimeCooldown() / 60) + ' 分钟冷却；冷却由后端强制，前端另有倒计时。') + '</div>' +

      '<details class="config-section" open><summary>当前价格 <small>只读 · 单位混沌石</small></summary><div class="config-section-body">' +
      '<div class="read-grid">' + fields.map(([key, label]) =>
        '<div class="read-row"><span>' + label + '</span><b>' + esc(String(prices[key] != null ? prices[key] : 0)) + 'c</b></div>'
      ).join('') + '</div></div></details>' +

      essenceSection + fossilSection + benchSection +
      '</div>' +
      '<div class="modal-foot"><button class="btn ghost" data-close type="button">关闭</button></div>';
    openModal(html);
    $$('#modal-root [data-close]').forEach((b) => { b.onclick = closeModal; });

    const refreshBtn = $('#config-refresh');
    const updateRefreshBtn = () => {
      if (!document.body.contains(refreshBtn)) return false;
      const remain = cooldownRemainingMs();
      if (!backendConfigured()) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = '未配置后端';
      } else if (location.protocol === 'file:') {
        refreshBtn.disabled = true;
        refreshBtn.textContent = '本地模式';
      } else if (configRefreshing) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = '拉取中…';
      } else if (remain > 0) {
        refreshBtn.disabled = true;
        refreshBtn.textContent = '冷却 ' + cooldownText();
      } else {
        refreshBtn.disabled = false;
        refreshBtn.textContent = '立即拉取';
      }
      const cd = $('#config-cooldown');
      if (cd) cd.textContent = remain > 0 ? cooldownText() : '现在';
      return true;
    };
    updateRefreshBtn();
    const tick = setInterval(() => {
      if (!document.body.contains(refreshBtn)) clearInterval(tick);
      else updateRefreshBtn();
    }, 1000);

    refreshBtn.onclick = async () => {
      if (cooldownRemainingMs() > 0) return;
      refreshBtn.disabled = true;
      refreshBtn.textContent = '拉取中…';
      const ok = await refreshConfig();
      if (ok) openSettings();
      else updateRefreshBtn();
    };
    $('#config-auto').onchange = (e) => {
      state.settings.autoSync = e.target.checked;
      setupAutoSync();
      save();
      toast(e.target.checked ? '已开启自动拉取。' : '已关闭自动拉取。');
      if (e.target.checked && cooldownRemainingMs() <= 0) {
        refreshConfig({ silent: true }).then((ok) => { if (ok) openSettings(); });
      }
    };
  }

  /* ------------------------------------------------------------------ export / import */
  function exportState() {
    const data = {
      app: 'poe1-craft-lab', version: 1, savedAt: new Date().toISOString(),
      baseId: state.baseId, ilvl: state.ilvl, influences: state.influences,
      item: state.item, targets: state.targets, log: state.log,
      spent: state.spent, attempts: state.attempts, settings: state.settings,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    const d = new Date();
    const stamp = d.getFullYear() + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0') +
      '-' + String(d.getHours()).padStart(2, '0') + String(d.getMinutes()).padStart(2, '0');
    a.download = 'poe1-craft-' + stamp + '.json';
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    toast('已导出当前做装方案。', 'success');
  }
  function importFile(file) {
    if (state.autoRunning) stopAuto('已导入方案，连续执行停止。');
    file.text().then((text) => {
      let parsed;
      try { parsed = JSON.parse(text); } catch (e) { toast('导入失败：不是有效的 JSON。', 'error'); return; }
      if (!parsed || !parsed.item || !E.getBase(parsed.item.baseId)) {
        toast('导入失败：缺少有效的物品数据。', 'error'); return;
      }
      state.baseId = parsed.item.baseId;
      state.ilvl = parsed.item.ilvl || E.getBase(state.baseId).ilvl;
      state.influences = parsed.item.influences || [];
      state.item = parsed.item;
      state.item.meta = state.item.meta || { multimod: false };
      state.item.influences = state.influences.slice();
      state.item.affixes = state.item.affixes || [];
      state.item.ilvl = state.item.ilvl || state.ilvl;
      E.syncUid(state.item);
      state.targets = (parsed.targets || []).filter((t) => E.getTargetDef(t.modId));
      state.targets = state.targets.filter((t) => E.targetEligibleOnBase(t.modId, state.baseId, state.influences, state.ilvl));
      state.log = parsed.log || [];
      state.spent = parsed.spent || 0;
      state.attempts = parsed.attempts || 0;
      state.settings = Object.assign(baseSettings(), parsed.settings || {});
      state.settings.prices = Object.assign(baseSettings().prices, (parsed.settings && parsed.settings.prices) || {});
      state.slot = E.getBase(state.baseId).slot;
      state.history = [];
      state.routeStats = null;
      state.pendingResult = null;
      state.fossilSelection = [];
      $('#ilvl-input').value = state.ilvl;
      save(); renderAll();
      toast('导入成功：' + E.getBase(state.baseId).name, 'success');
    }).catch(() => toast('读取文件失败。', 'error'));
  }

  /* ------------------------------------------------------------------ route sim */
  function simulateRoute() {
    if (!currentTargets().length) { toast('请先设置目标词缀。', 'error'); return; }
    if (state.simulating) return;
    state.simulating = true;
    state.routeStats = null;
    renderAdvisor();
    setTimeout(() => {
      let res;
      try {
        res = A.simulateRoute(state.item, currentTargets(), {
          runs: 90, maxSteps: 40, budget: 2500, prices: priceOverrides(), seed: 424242,
        });
      } catch (e) {
        console.error(e);
        state.simulating = false;
        renderAdvisor();
        toast('整套估算失败：' + e.message, 'error');
        return;
      }
      state.simulating = false;
      state.routeStats = res;
      save();
      renderAdvisor();
      toast('整套估算完成：成功率 ' + pctText(res.successRate) + '。', 'success', 3000);
    }, 40);
  }

  /* ------------------------------------------------------------------ static bind */
  function applyCollapsedState() {
    $$('[data-collapse]').forEach((btn) => {
      const key = btn.dataset.collapse;
      const section = btn.closest('.collapsible');
      if (!section) return;
      const collapsed = !!state.collapsed[key];
      section.classList.toggle('collapsed', collapsed);
      btn.setAttribute('aria-expanded', String(!collapsed));
      const label = btn.querySelector('.collapse-label');
      if (label) label.textContent = collapsed ? '展开' : '收起';
    });
  }
  function toggleCollapse(key) {
    state.collapsed[key] = !state.collapsed[key];
    save();
    applyCollapsedState();
  }
  function bindStatic() {
    $$('#journey [data-jump]').forEach((btn) => {
      btn.onclick = () => {
        const target = {
          base: '#step-base', targets: '#step-targets',
          craft: '#step-craft', finish: '#step-finish',
        }[btn.dataset.jump];
        const el = target && $(target);
        if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' });
      };
    });
    $$('[data-collapse]').forEach((btn) => {
      btn.onclick = () => toggleCollapse(btn.dataset.collapse);
    });
    applyCollapsedState();
    const guideBtn = $('#journey-guide');
    if (guideBtn) guideBtn.onclick = openGuide;
    $$('.help-dot').forEach((dot) => {
      dot.setAttribute('role', 'button');
      dot.onclick = openGuide;
      dot.onkeydown = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openGuide(); } };
    });
    $('#base-search').addEventListener('input', (e) => { state.baseSearch = e.target.value; renderBases(); });
    $('#target-search').addEventListener('input', (e) => { state.targetSearch = e.target.value; renderTargetPool(); });
    $('#ilvl-input').addEventListener('change', (e) => {
      let v = parseInt(e.target.value, 10);
      if (!Number.isFinite(v)) v = 1;
      v = Math.max(1, Math.min(100, v));
      state.ilvl = v;
      state.item.ilvl = v;
      e.target.value = v;
      state.routeStats = null;
      state.targets = state.targets.filter((t) => E.targetEligibleOnBase(t.modId, state.baseId, state.influences, v));
      save(); renderAll();
      toast('物品等级已设为 ' + v + '。');
    });
    $('#btn-undo').onclick = undo;
    $('#btn-reset').onclick = () => {
      openConfirm('重置物品？', '会清空当前物品词缀、制作记录与花费统计，底子和目标保留。', () => {
        state.item = E.createItem(state.baseId, { ilvl: state.ilvl, influences: state.influences });
        resetProgress();
        save(); renderAll();
        toast('物品已重置。');
      });
    };
    $('#btn-copy').onclick = () => {
      const text = E.itemText(state.item);
      const done = () => toast('物品文本已复制。', 'success');
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(text).then(done).catch(() => fallbackCopy(text, done));
      } else fallbackCopy(text, done);
    };
    $('#btn-settings').onclick = openSettings;
    $('#config-badge').onclick = openSettings;
    $('#btn-manual').onclick = () => openManual({ fromResult: !!state.pendingResult });
    $('#btn-export').onclick = exportState;
    $('#btn-import').onclick = () => $('#file-import').click();
    $('#file-import').addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0];
      if (f) importFile(f);
      e.target.value = '';
    });
    $('#btn-auto').onclick = toggleAuto;
    $('#btn-analyze').onclick = () => {
      state.analysisNonce++;
      state.routeStats = null;
      save(); renderAdvisor();
      toast('已用新的随机样本重新计算。');
    };
    $('#btn-sim-route').onclick = simulateRoute;
    $('#modal-root').addEventListener('click', (e) => {
      if (e.target === e.currentTarget || e.target.classList.contains('modal-backdrop')) closeModal();
      if (e.target.matches('[data-close]')) closeModal();
    });
    document.addEventListener('keydown', (e) => {
      if (e.key === 'Escape') {
        if ($('#modal-root').innerHTML) closeModal();
        else if (state.autoRunning) stopAuto('已停止连续执行。');
      }
      if ((e.ctrlKey || e.metaKey) && e.key.toLowerCase() === 'z' && !$('#modal-root').innerHTML) {
        e.preventDefault(); undo();
      }
    });
    window.addEventListener('beforeunload', save);
  }
  function fallbackCopy(text, done) {
    const ta = document.createElement('textarea');
    ta.value = text;
    ta.style.position = 'fixed';
    ta.style.opacity = '0';
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand('copy'); done(); } catch (e) { toast('复制失败，请手动复制。', 'error'); }
    ta.remove();
  }

  /* ------------------------------------------------------------------ init */
  function renderAll() {
    renderHeader();
    renderSlotTabs();
    renderBases();
    renderTargets();
    renderTargetSideTabs();
    renderTargetPool();
    renderPresets();
    renderInfluences();
    renderItem();
    renderActionTabs();
    renderActionBody();
    renderLog();
    renderAdvisor();
    renderJourney();
    renderResultPrompt();
    renderAutoButton();
    renderConfigBadge();
    applyCollapsedState();
    $('#ilvl-input').value = state.ilvl;
    $('#base-search').value = state.baseSearch || '';
    $('#target-search').value = state.targetSearch || '';
  }

  function init() {
    bindStatic();
    if (!applyCachedConfig()) {
      state.configMeta = null;
      if (state.settings.prices) {
        Object.keys(state.settings.prices).forEach((key) => {
          if (key in D.prices && Number.isFinite(Number(state.settings.prices[key]))) {
            D.prices[key] = Number(state.settings.prices[key]);
          }
        });
      }
    }
    if (!state.targets.length) {
      const p = D.presets[0];
      state.targets = p.targets.map((t) => Object.assign({}, t));
      state.baseId = p.baseId;
      state.ilvl = p.ilvl || 86;
      state.influences = (p.influences || []).slice();
      state.item = E.createItem(p.baseId, { ilvl: state.ilvl, influences: state.influences });
      state.slot = E.getBase(p.baseId).slot;
      state.log = [];
      state.spent = 0;
      state.attempts = 0;
      state.history = [];
    }
    renderAll();
    setupAutoSync();
    if (state.settings.autoSync) {
      setTimeout(() => refreshConfig({ onlyIfNewer: true, silent: true }), 800);
    }
  }

  init();
})();
