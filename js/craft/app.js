/* 流放 2 做装台 · 界面
 *
 * 主流程是「陪着玩家做」：我的装备 → 我想要 → 下一步 → 回报结果 → 下一步……
 * 玩家在游戏里操作，工具只负责告诉他做什么、做完之后怎么判断。模拟只是次要的「试一次」。
 */
(function () {
  'use strict';

  const R = window.CraftRules;
  const S = window.CraftSolver;
  const P = window.CraftItemText;
  const T2S = window.CraftT2S || ((s) => s);
  const $ = (id) => document.getElementById(id);
  const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const KEY = 'poe2-craft-lab-v2';

  const SLOTS = [['helmet', '头盔'], ['body', '胸甲'], ['gloves', '手套'], ['boots', '鞋子'], ['shield', '盾牌'], ['focus', '法器'],
    ['weapon', '武器'], ['quiver', '箭袋'], ['ring', '戒指'], ['amulet', '项链'], ['belt', '腰带'], ['jewel', '珠宝']];
  const WCLS = [['sword1', '单手剑'], ['sword2', '双手剑'], ['axe1', '单手斧'], ['axe2', '双手斧'], ['mace1', '单手锤'], ['mace2', '双手锤'],
    ['spear', '长矛'], ['flail', '连枷'], ['claw', '爪'], ['dagger', '匕首'], ['quarterstaff', '长棍'], ['bow', '弓'], ['crossbow', '弩'],
    ['wand', '法杖'], ['staff', '长杖'], ['sceptre', '权杖'], ['talisman', '魔符']];
  const THEMES = [['ink', '墨金', '#0f0e0c', '#c9a25a', '#a3aeea'], ['paper', '纸本', '#f2eee4', '#8f3320', '#36458f'], ['slate', '石墨', '#0d1014', '#62c3b1', '#93b5ff']];
  /* 只给「还只有繁中」的文本用（预兆名 / 效果说明、秘籍类）。底子名、词缀、精华、符文、预兆名都有官方简中，不走这里 */
  const TERMS = [['精髓', '精华'], ['无效石', '剥离石'], ['抺', '抹']];
  const HELP = {
    transmute: '把白色（普通）装备变成蓝色，带 1 条随机词缀。',
    augment: '给只有 1 条词缀的蓝色装备再加 1 条。',
    regal: '把蓝色装备升成黄色（稀有），原有词缀保留，再加 1 条。',
    alchemy: '直接变成带 4 条随机词缀的黄色装备，原有词缀不保留。',
    exalt: '给黄色装备加 1 条随机词缀。',
    chaos: '随机去掉 1 条词缀，再加 1 条新的。',
    annul: '随机去掉 1 条词缀。',
    essence: '精华会加上一条固定的词缀，不看运气。',
    desecrate: '加一条「待揭露」的词缀，之后去灵魂之井从三个选项里挑一条。',
    reveal: '在灵魂之井揭露：三个选项里有你要的就选它，没有就随便选一条。',
  };
  const TIER_NOTE = '高级 / 完美版本只会出等级较高的词缀，更容易出高档。';

  /* ------------------------------------------------------------------ 状态 */
  const defaults = {
    step: 'item', item: null, targets: [], history: [], log: [],
    basePrice: 1, prices: {}, lang: 'zhs', theme: 'ink', sideModel: 'pooled', off: {},
    slot: 'helmet', wcls: 'sword1', q: '', ilvl: 82, tq: '',
  };
  let state = Object.assign({}, defaults);
  try { Object.assign(state, JSON.parse(localStorage.getItem(KEY) || '{}')); } catch (e) { /* 存档坏了就用默认值 */ }
  /* 存档是唯一的数据入口：旧版本、手改、写到一半都可能让它结构不对。
   * 逐项归一，坏的那一项当没存过——以前 targets 是 null 就会让整页画不出来。 */
  function repairState(s) {
    if (!s || typeof s !== 'object' || Array.isArray(s)) return defaults;
    if (['item', 'targets', 'craft'].indexOf(s.step) === -1) s.step = 'item';
    if (!Array.isArray(s.targets)) s.targets = [];
    s.targets = s.targets.filter((t) => t && typeof t === 'object' && (t.row || t.type));
    if (!Array.isArray(s.history)) s.history = [];
    /* 旧存档里 history 直接存的是物品对象，这里统一成 { item, targets } */
    s.history = s.history.map((h) => (h && h.item ? h : { item: h, targets: null }))
      .filter((h) => h.item && typeof h.item === 'object' && R.base(h.item.base));
    if (!Array.isArray(s.log)) s.log = [];
    s.log = s.log.filter((x) => typeof x === 'string').slice(-80);
    if (!s.prices || typeof s.prices !== 'object' || Array.isArray(s.prices)) s.prices = {};
    if (!s.off || typeof s.off !== 'object' || Array.isArray(s.off)) s.off = {};
    if (s.item && (!s.item.base || !R.base(s.item.base) || !Array.isArray(s.item.affixes))) s.item = null;
    if (s.item) {
      s.item.quality = Number(s.item.quality) || 0;
      s.item.sockets = Math.max(0, Number(s.item.sockets) || 0);
      s.item.augments = Array.isArray(s.item.augments) ? s.item.augments : [];
      s.item.affixes = s.item.affixes.filter((a) => a && typeof a === 'object');
      s.item.affixes.forEach((a) => { if (!Array.isArray(a.values)) a.values = []; if (!Array.isArray(a.fam)) a.fam = []; });
      if (!s.item.ilvl) s.item.ilvl = 82;
    }
    if (!s.item) s.targets = [];
    if (!(Number(s.ilvl) >= 1 && Number(s.ilvl) <= 100)) s.ilvl = 82;
    if (!(Number(s.basePrice) >= 0)) s.basePrice = 1;
    if (['zhs', 'zht', 'en'].indexOf(s.lang) === -1) s.lang = 'zhs';
    if (['ink', 'paper', 'slate'].indexOf(s.theme) === -1) s.theme = 'ink';
    if (['pooled', 'sideFirst'].indexOf(s.sideModel) === -1) s.sideModel = 'pooled';
    if (typeof s.q !== 'string') s.q = '';
    if (typeof s.tq !== 'string') s.tq = '';
    return s;
  }
  state = repairState(state);
  /* 兜底：任何没接住的异常都不让页面变成白板（存档对不上是最常见的来源） */
  let fatalDone = false;
  function fatal(err) {
    if (fatalDone) return;
    fatalDone = true;
    try {
      $('stage').innerHTML = '<div class="next"><div class="next-title">页面出错了</div>'
        + '<p class="next-how">' + esc(String((err && err.message) || err || '未知错误')) + '</p>'
        + '<p class="small muted">多半是浏览器里存的旧存档和这个版本对不上。清空存档就能继续用，装备和目标要重新填。</p>'
        + '<div class="row"><button class="btn primary" data-act="reset-all" type="button">清空存档并重新开始</button></div></div>';
      $('side').innerHTML = '';
    } catch (e) { /* 连兜底都画不出来就没办法了 */ }
  }
  window.addEventListener('error', (e) => fatal(e.error || e.message));
  window.addEventListener('unhandledrejection', (e) => fatal(e.reason));
  const ui = { plan: null, planKey: '', busy: false, report: null, paste: false, pasteText: '', edit: false, sens: null, sensBusy: false, more: 60, folds: {} };
  function save() {
    try { localStorage.setItem(KEY, JSON.stringify(state)); } catch (e) { /* 隐私模式下存不了也不影响使用 */ }
  }

  /* ------------------------------------------------------------------ 文本 */
  /* tx() 只给「只能拿到繁中」的字符串用（通货 / 预兆 / 底子名等）；
   * 词缀模板本身有官方简中（data.zhs.js），直接用，不再逐字转换。 */
  function tx(s) {
    if (state.lang === 'zht') return String(s);
    let out = T2S(s);
    for (const [a, b] of TERMS) out = out.split(a).join(b);
    return out;
  }
  const lang = () => (state.lang === 'en' ? 'en' : state.lang === 'zht' ? 'zht' : 'zhs');
  const rowText = (row) => R.rowText(row, lang());
  function affixText(a) {
    if (a.unknown && !a.row) return a.text || '（没细选的词缀）';
    return R.affixText(a, lang());
  }
  /* 「+(150–174)最大生命」→「最大生命」：给目标起个短名字。
   * 数值一律换成「X」而不是直接删掉——直接删会留下「附加 - 物理伤害」「击中时有 的几率…」这种残句。
   * 多行的混搭词缀（一条词缀占两行）拼成一句。 */
  function shortName(text) {
    const one = (s) => String(s)
      .replace(/[（(]\s*[+\-–]?\s*\d[\d.]*\s*[-–]\s*[+\-–]?\s*\d[\d.]*\s*[)）](%?)/g, 'X$1')
      .replace(/[+\-–]?\d[\d.]*(%?)/g, 'X$1')
      .replace(/[ \t]+/g, ' ')
      .trim()
      .replace(/^(?:[+＋\-–]?\s*X%?\s*)+/, '')      // 开头只有数值（「+X 生命上限」）就去掉
      .replace(/^(?:[+＋\s]+)/, '')
      .replace(/\s*[+＋\-–、]\s*$/, '')
      .trim();
    const parts = String(text == null ? '' : text).split('\n').map(one).filter(Boolean);
    return parts.length ? parts.join('、') : String(text == null ? '' : text);
  }
  /* 底子名：英文 / 繁中 / 官方简中（国服名，比如 克己权杖） */
  const baseName = (b) => {
    if (state.lang === 'en' || !(b.zhs || b.zh)) return b.name;
    if (state.lang === 'zht') return b.zh || b.zhs;
    return b.zhs || tx(b.zh);
  };
  const fmt = (n) => (!Number.isFinite(n) ? '—' : n >= 100 ? Math.round(n).toLocaleString('en-US') : n >= 10 ? n.toFixed(0) : n >= 1 ? n.toFixed(1) : n.toFixed(2));
  const pct = (p) => (p >= 0.995 ? '100%' : p >= 0.1 ? (p * 100).toFixed(0) + '%' : p >= 0.01 ? (p * 100).toFixed(1) + '%' : p > 0 ? '<1%' : '0%');
  const sideName = (g) => (g === 'p' ? '前缀' : '后缀');
  /* 前缀 / 后缀在全站用同一对颜色 + 文字标签，颜色不是唯一线索 */
  const sideTag = (g, short) => '<span class="side-tag ' + g + '">' + (short ? sideName(g).charAt(0) : sideName(g)) + '</span>';
  const pips = (n, cap) => '<span class="pips ' + (n > cap ? 'over' : '') + '" aria-hidden="true">'
    + Array.from({ length: Math.max(cap, n) }, (x, i) => '<i class="' + (i < n ? 'on' : '') + '"></i>').join('') + '</span>';
  function targetGen(base, t) {
    const row = t.row ? R.row(t.row) : R.ladder(base, t.type, t.pool)[0];
    return row ? row.gen : 'p';
  }
  /* 一个「物品 / 词缀」名字在三种语言下的写法：官方简中优先，其次官方繁中，最后退回英文 id */
  function locName(o, fallback) {
    if (!o) return fallback || '';
    if (state.lang === 'en') return o.en || fallback || '';
    if (state.lang === 'zht') return o.zh || o.zhs || fallback || '';
    return o.zhs || (o.zh ? tx(o.zh) : (fallback || ''));
  }
  function curName(action, item) {
    if (action.essence) return locName(R.essence(action.essence), action.essence);
    if (action.rune) return locName(R.augment(action.rune), action.rune);
    const c = R.CUR[action.cur];
    if (c && c.kind === 'desecrate' && item) return R.boneName(R.baseOf(item), action.cur);
    return c ? c.zh : action.cur;
  }
  const omenNames = (action) => (action.omens || []).map((id) => locName(R.data.omens.find((o) => o.id === id), id));
  const actionLabel = (action, item) => omenNames(action).concat([curName(action, item)]).join(' + ');
  function toast(msg, action) {
    const el = $('toast');
    el.textContent = msg;
    if (action) {
      const b = document.createElement('button');
      b.type = 'button'; b.className = 'toast-act'; b.dataset.act = action.act; b.textContent = action.label;
      el.appendChild(b);
    }
    /* 提示条会盖住下面的内容，给一个手动关掉的口子 */
    const x = document.createElement('button');
    x.type = 'button'; x.className = 'toast-close'; x.dataset.act = 'toast-close';
    x.textContent = '×'; x.setAttribute('aria-label', '关闭提示');
    el.appendChild(x);
    el.hidden = false;
    clearTimeout(toast.t);
    toast.t = setTimeout(() => { el.hidden = true; }, action ? 8000 : 4200);
  }

  /* ------------------------------------------------------------------ 求解（后台线程，失败则退回主线程）
   * 后台线程的脚本是现拼的：数据 + 规则 + 求解器的源码打成一个 Blob。这样双击 index.html（file://）
   * 也能用后台线程——浏览器不许 file:// 页面直接加载 worker 文件，那样求解会卡死整个界面。 */
  function workerMain() {
    self.onmessage = function (e) {
      var m = e.data;
      try {
        self.CraftRules.setSideModel(m.sideModel || 'pooled');
        var opts = m.opts || {};
        if (m.kind === 'sensitivity') {
          /* 逐条试算要好几秒：把「第几条」发回主线程显示。这个函数只在本线程里用，不跨线程传 */
          opts.progress = function (i, n) { self.postMessage({ id: m.id, progress: [i, n] }); };
        }
        var out = m.kind === 'sensitivity'
          ? self.CraftSolver.sensitivity(m.item, m.targets, opts)
          : self.CraftSolver.plan(m.item, m.targets, opts);
        self.postMessage({ id: m.id, ok: true, result: out });
      } catch (err) {
        self.postMessage({ id: m.id, ok: false, error: String((err && err.message) || err) });
      }
    };
  }
  let workerUrl = null;
  let workerDead = false;
  let seq = 0;
  const STALE = { stale: true };
  function spawn() {
    if (workerDead) return null;
    try {
      if (!workerUrl) {
        const src = window.CraftSource;
        const code = ['CRAFT_BASES', 'CRAFT_MODS', 'CRAFT_MISC', 'CRAFT_ZH', 'CRAFT_ZHS'].map((k) => 'self.' + k + '=' + JSON.stringify(window[k]) + ';')
          .concat(['(' + src.rules.toString() + ')(self);', '(' + src.solver.toString() + ')(self);', '(' + workerMain.toString() + ')();']).join('\n');
        workerUrl = URL.createObjectURL(new Blob([code], { type: 'text/javascript' }));
      }
      return new Worker(workerUrl);
    } catch (e) { workerDead = true; return null; }
  }
  function local(msg) {
    return new Promise((res) => setTimeout(() => {
      document.documentElement.dataset.solver = 'main';
      R.setSideModel(msg.sideModel);
      try { res(msg.kind === 'sensitivity' ? S.sensitivity(msg.item, msg.targets, msg.opts) : S.plan(msg.item, msg.targets, msg.opts)); } catch (err) { res(null); }
    }, 30));
  }
  /* 一条通道 = 一个后台线程。同一时间只算一个；排队的只留最新一个（玩家连点几下时，中间的不必算）。
   * 「下一步怎么做」和「哪条目标最贵」各走一条：后者要解十几个子问题，不能挡住前者。 */
  function lane() {
    let worker = null;
    let inflight = null;
    let queued = null;
    const pump = () => {
      if (inflight || !queued) return;
      inflight = queued;
      queued = null;
      worker.postMessage(inflight.msg);
    };
    const start = () => {
      if (worker) return worker;
      worker = spawn();
      if (!worker) return null;
      worker.onmessage = (e) => {
        const job = inflight;
        /* 进度消息不算结果：算出第几条了就顺手报一声，让界面能显示进度 */
        if (e.data && e.data.progress) {
          if (job && job.msg.id === e.data.id && job.onProgress) job.onProgress(e.data.progress);
          return;
        }
        inflight = null;
        document.documentElement.dataset.solver = 'worker';
        if (job && job.msg.id === e.data.id) job.res(e.data.ok ? e.data.result : null);
        pump();
      };
      worker.onerror = () => {                 // 后台线程起不来：之后都在主线程算
        workerDead = true;
        worker = null;
        const jobs = [inflight, queued].filter(Boolean);
        inflight = null; queued = null;
        jobs.forEach((job) => local(job.msg).then(job.res));
      };
      return worker;
    };
    return {
      warm: start,
      run(kind, item, targets, opts, onProgress) {
        const msg = { id: ++seq, kind, item, targets, opts, sideModel: state.sideModel };
        if (!start()) return local(msg);
        return new Promise((res) => {
          if (queued) queued.res(STALE);
          queued = { msg, res, onProgress };
          pump();
        });
      },
      /* 丢掉正在算的：直接关掉线程，下次用到再起 */
      cancel() {
        if (!worker || (!inflight && !queued)) return;
        worker.terminate();
        worker = null;
        [inflight, queued].filter(Boolean).forEach((job) => job.res(STALE));
        inflight = null; queued = null;
      },
    };
  }
  const planLane = lane();
  const sensLane = lane();
  function solverOpts() {
    const allow = {};
    for (const id of Object.keys(R.CUR)) {
      if (state.off.greater && /_greater$/.test(id)) allow[id] = false;
      if (state.off.perfect && /_perfect$/.test(id)) allow[id] = false;
      if (state.off.bones && R.CUR[id].kind === 'desecrate') allow[id] = false;
    }
    if (state.off.annul) allow.annul = false;
    if (state.off.essence) allow.essence = false;
    if (state.off.omens) for (const id of Object.keys(R.OMEN)) allow[id] = false;
    /* 求解器用不到的通货价格不进 opts：改了也不会影响建议，没有必要触发重算 */
    const prices = {};
    for (const id of Object.keys(state.prices)) if (!R.NOT_IN_SOLVER[id]) prices[id] = state.prices[id];
    return { basePrice: Number(state.basePrice) || 0, prices, allow };
  }
  function replan() {
    ui.sens = null;
    if (!state.item || !state.targets.length) { ui.plan = null; ui.planKey = ''; ui.busy = false; return; }
    if (state.step !== 'craft') return;         // 只有「跟着做」这一步要看计划；选目标时不在后台白算
    const key = JSON.stringify([state.item, state.targets, solverOpts(), state.sideModel]);
    if (key === ui.planKey && (ui.plan || ui.busy)) return;
    ui.planKey = key;
    sensLane.cancel();                           // 目标或装备变了，之前那次「哪条最贵」不用算完
    ui.sensBusy = false;
    ui.busy = true;
    planLane.run('plan', state.item, state.targets, solverOpts()).then((plan) => {
      if (ui.planKey !== key || plan === STALE) return;
      ui.plan = plan || { status: 'error' };
      ui.busy = false;
      render();
    });
  }

  /* ------------------------------------------------------------------ 物品卡 */
  function tierOfAffix(item, a) {
    const row = a.row && R.row(a.row);
    return row ? R.tierOf(R.baseOf(item), row) : null;
  }
  function tierBadge(item, a) {
    const t = tierOfAffix(item, a);
    return t ? '<span class="tag">T' + t + '</span>' : '';
  }
  function modRow(item, a, i, opts) {
    opts = opts || {};
    const hit = state.targets.some((t) => R.targetAccepts(R.baseOf(item), t, a));
    const tier = tierOfAffix(item, a);
    const cls = ['mod', hit ? 'hit' : '', a.fractured ? 'frac' : '', a.desecrated ? 'des' : '', a.unknown ? 'unk' : '', opts.pick ? 'pick' : ''].join(' ');
    const meta = tierBadge(item, a)
      + (a.fractured ? '<span class="tag frac">破裂</span>' : '') + (a.desecrated ? '<span class="tag des">亵渎</span>' : '')
      + (a.essence ? '<span class="tag">精华</span>' : '') + (hit ? '<span class="tag hit">目标</span>' : '')
      + (a.approxValues ? '<span class="tag" title="汇报时没有逐条填数值，这里按下限—上限的中点记的">数值≈</span>' : '')
      + (!hit && opts.copy && tier
        ? '<button class="ghost small" data-act="copy-mod" data-i="' + i + '" type="button" title="把这条词缀设成目标（按它现在的档位）">复制</button>' : '')
      + (opts.remove ? '<span class="tag bad">移除</span>' : '');
    const tag = opts.pick || opts.remove ? 'button type="button" data-act="' + (opts.pick || 'edit-remove') + '" data-i="' + i + '"' : 'div';
    return '<' + tag + ' class="' + cls + '"><span class="mod-text">' + esc(affixText(a)) + '</span><span class="mod-meta">' + meta + '</span></' + tag.split(' ')[0] + '>';
  }
  function itemCard(item, opts) {
    opts = opts || {};
    if (!item) return '<div class="item normal"><div class="item-empty">还没有装备<br><span class="small">先在右边粘贴或选一个底子</span></div></div>';
    const base = R.baseOf(item);
    const cap = R.caps(item, item.rarity === 'normal' ? 'rare' : item.rarity);
    /* 白色装备本身没有词缀位，这里显示的是「升到稀有之后的上限」 */
    const capNote = item.rarity === 'normal' ? '（升到稀有后的上限）' : '';
    const augs = (item.augments || []).map((id) => locName(R.augment(id), id)).filter(Boolean);
    const rowOpts = (a) => {
      if (opts.filter && opts.filter(a)) return { pick: opts.pick };
      if (ui.edit && !opts.pick) return { remove: true };
      return opts.copy ? { copy: true } : null;
    };
    const group = (g) => {
      const list = item.affixes.map((a, i) => [a, i]).filter(([a]) => a.gen === g);
      if (!list.length) return '';
      return '<div class="mod-side ' + g + '"><span>' + sideName(g) + '</span></div>' + list.map(([a, i]) => modRow(item, a, i, rowOpts(a))).join('');
    };
    /* 底子固有词缀同理：官方简中优先 */
    const impText = (x) => {
      const tpl = state.lang === 'en' ? x.tpl
        : state.lang === 'zht' ? (x.zh || x.tpl)
          : (x.zhs || (x.zh ? tx(x.zh) : x.tpl));
      return R.fill(tpl, x.v.map((v) => (v[0] === v[1] ? v[0] : v[0] + '–' + v[1])));
    };
    const imp = (base.imp || []).map((x) => esc(impText(x))).join('<br>');
    const rar = { normal: '普通', magic: '魔法', rare: '稀有' }[item.rarity];
    return '<div class="item ' + item.rarity + '">'
      + '<div class="item-head"><div class="item-name">' + esc(baseName(base)) + '</div><div class="item-en">' + esc(base.name) + '</div></div>'
      + '<div class="item-sec">' + rar + ' · 物品等级 ' + item.ilvl + (item.quality ? ' · 品质 ' + item.quality + '%' : '') + (item.corrupted ? ' · <span style="color:var(--bad)">已腐化</span>' : '') + '</div>'
      + (imp ? '<div class="item-sec">' + imp + '</div>' : '')
      + (item.affixes.length ? '<div class="item-mods">' + group('p') + group('s') + '</div>' : '<div class="item-empty">还没有词缀</div>')
      + (item.sockets || augs.length
        ? '<div class="item-sec">插槽 ' + (item.sockets || 0) + (augs.length ? ' · ' + esc(augs.join('、')) : item.sockets ? ' · 空着 ' + Math.max(0, item.sockets - augs.length) + ' 个' : '') + '</div>'
        : '')
      + '<div class="item-sec">前缀 ' + R.count(item, 'p') + '/' + cap.p + ' · 后缀 ' + R.count(item, 's') + '/' + cap.s + (capNote ? ' <span class="faint small">' + capNote + '</span>' : '') + '</div></div>';
  }
  function renderSide() {
    const item = state.item;
    /* 选目标那一步：装备卡上每条词缀多一个「复制」，一下就把这条加进右边的目标 */
    let html = itemCard(item, state.step === 'targets' ? { copy: true } : null);
    if (item) {
      html += '<div class="row">'
        + '<button class="ghost" data-act="toggle-paste" type="button">粘贴更新</button>'
        + '<button class="ghost" data-act="toggle-edit" type="button">' + (ui.edit ? '改好了' : '手动修改') + '</button>'
        + (state.history.length ? '<button class="ghost" data-act="undo" type="button">撤销</button>' : '') + '</div>';
      if (ui.edit) html += '<div class="row"><button class="btn" data-act="edit-add" type="button">＋ 添加词缀</button><span class="small faint">点词缀可以移除</span></div>';
    }
    if (state.targets.length) {
      const ev = item ? R.evaluate(item, state.targets) : { hits: [] };
      html += '<div><div class="spread"><span class="h2">我想要</span><span class="row"><span class="muted small">' + (ev.matched || 0) + ' / ' + state.targets.length + '</span>'
        + '<button class="ghost small" data-act="clear-targets" type="button">清空</button></span></div>'
        + ['p', 's'].map((g) => state.targets.map((t, i) => (targetGen(R.baseOf(item), t) !== g ? '' : '<div class="goal ' + (ev.hits[i] ? 'hit' : '') + '">' + sideTag(g, true)
          + '<span class="goal-name">' + esc(t.name) + '</span><span class="tag ' + (ev.hits[i] ? 'hit' : '') + '">' + (ev.hits[i] ? '已有' : t.tier ? 'T' + t.tier + ' 以上' : '指定') + '</span></div>')).join('')).join('') + '</div>';
    }
    $('side').innerHTML = html;
  }

  /* ------------------------------------------------------------------ 第 1 步：装备 */
  function baseStat(b) {
    const d = b.def || {};
    const parts = [];
    if (d.ar) parts.push('护甲 ' + d.ar);
    if (d.ev) parts.push('闪避 ' + d.ev);
    if (d.es) parts.push('护盾 ' + d.es);
    if (b.wpn && b.wpn.phys) parts.push('物理 ' + b.wpn.phys[0] + '–' + b.wpn.phys[1]);
    if (b.wpn && b.wpn.aps) parts.push(b.wpn.aps + ' 次/秒');
    return parts.join(' · ');
  }
  function baseList() {
    const q = state.q.trim().toLowerCase();
    let list = R.data.bases.filter((b) => (q ? true : b.slot === state.slot && (b.slot !== 'weapon' || b.wcls === state.wcls)));
    if (q) list = list.filter((b) => b.name.toLowerCase().includes(q) || (b.zh && (b.zh.includes(q) || T2S(b.zh).includes(q))) || (b.zhs && b.zhs.includes(q)));
    /* 高等级底子排前面；联盟专属的符锻 / 符匠变体放到最后，免得把常规底子挤下去 */
    const special = (b) => (/Verisium/.test(b.id) ? 1 : 0);
    return list.sort((a, b) => special(a) - special(b) || b.drop - a.drop || (a.name < b.name ? -1 : 1));
  }
  function stepItem() {
    const list = baseList();
    const shown = list.slice(0, ui.more);
    const cur = state.item && state.item.base;
    return '<div class="stack"><div class="eyebrow">第 1 步</div><h1 class="title">你手上是什么装备？</h1>'
      + '<p class="lede">在游戏里把鼠标放到装备上，按 <b>Ctrl+C</b>，再粘贴到下面。词缀、档位、物品等级都会自动认出来。</p></div>'
      + '<div class="panel stack"><textarea class="field" id="pasteBox" data-bind="paste" aria-label="物品文本" placeholder="把物品文本粘贴到这里（支持简体、繁體、English）">' + esc(ui.pasteText || '') + '</textarea>'
      + '<div class="row"><button class="btn primary" data-act="paste-parse" type="button">识别这件装备</button><span class="small faint" id="pasteMsg"></span></div>'
      + '<div id="pastePick" class="stack"></div></div>'
      + '<div class="stack"><h2 class="h2">或者，从一个白底开始</h2>'
      + '<div class="chips">' + SLOTS.map(([id, n]) => '<button class="chip ' + (state.slot === id && !state.q ? 'on' : '') + '" data-act="slot" data-v="' + id + '" type="button">' + n + '</button>').join('') + '</div>'
      + (state.slot === 'weapon' && !state.q ? '<div class="chips">' + WCLS.map(([id, n]) => '<button class="chip ' + (state.wcls === id ? 'on' : '') + '" data-act="wcls" data-v="' + id + '" type="button">' + n + '</button>').join('') + '</div>' : '')
      + '<div class="row"><input class="field" style="max-width:280px" data-bind="q" aria-label="搜索底子" value="' + esc(state.q) + '" placeholder="搜索底子名（中文 / 英文）">'
      + '<label class="row small muted">物品等级 <input class="field num" type="number" min="1" max="100" data-bind="ilvl" value="' + state.ilvl + '"></label>'
      + '<span class="small faint">物品等级决定能出多高档的词缀；后期地图掉的一般是 79–82。</span></div>'
      + '<div class="base-list">' + (shown.map((b) => '<button class="base ' + (b.id === cur ? 'on' : '') + '" data-act="pick-base" data-v="' + b.id + '" type="button">'
        + '<span>' + esc(baseName(b)) + ' <span class="faint small">' + esc(b.name) + '</span></span><span class="base-stat">' + esc(baseStat(b)) + '</span>'
        + '<span class="base-sub">需求等级 ' + (b.req.lvl || 1) + (b.imp ? ' · ' + esc(b.imp.map((x) => {
          const tpl = state.lang === 'en' ? x.tpl : state.lang === 'zht' ? (x.zh || x.tpl) : (x.zhs || (x.zh ? tx(x.zh) : x.tpl));
          return R.fill(tpl, x.v.map((v) => v[0] + (v[0] === v[1] ? '' : '–' + v[1])));
        }).join('；')) : '') + '</span></button>').join('')
        || '<div class="item-empty">没有找到这个底子</div>')
      + (list.length > shown.length ? '<button class="ghost" data-act="more-bases" type="button">再显示 ' + Math.min(60, list.length - shown.length) + ' 个（共 ' + list.length + '）</button>' : '') + '</div></div>'
      + (state.item ? '<div class="row"><button class="btn primary big" data-act="go" data-v="targets" type="button">下一步：选想要的词缀 →</button></div>' : '');
  }

  /* ------------------------------------------------------------------ 第 2 步：目标 */
  function typeOptions(base, ilvl) {
    const pool = base.slot === 'jewel' ? 'j' : 'i';
    const probe = R.newItem(base.id, { ilvl });
    probe.rarity = 'rare';
    const share = new Map();
    for (const d of R.addDist(probe, {})) share.set(d.row.type, (share.get(d.row.type) || 0) + d.p);
    const natural = R.typesFor(base, { ilvl, pools: [pool] }).map((t) => Object.assign(t, { share: share.get(t.type) || 0 }));
    const abyss = R.typesFor(base, { ilvl, pools: ['x'] }).map((t) => Object.assign(t, { share: 0 }));
    return { natural: natural.sort((a, b) => b.share - a.share), abyss };
  }
  const defaultTier = (rows, ilvl) => {
    const firstOk = Math.max(0, rows.findIndex((r) => r.lvl <= ilvl));
    return Math.min(rows.length, Math.max(firstOk + 1, Math.min(3, rows.length)));
  };
  /* 深渊专属词缀有时只有一侧有（头盔的 14 条全在后缀），界面要说一句，
   * 不然玩家会以为「物品等级 65+ 保底一条专属」在自己身上失效了。 */
  function abyssNote(list) {
    const sides = new Set(list.map((t) => t.gen));
    if (sides.size !== 1) return '';
    return '<p class="small faint" style="margin:10px 0 0">这个部位只有' + (sides.has('s') ? '后缀' : '前缀')
      + '有深渊专属词缀：亵渎落在另一侧时，揭露出来只会是常规词缀。</p>';
  }
  function stepTargets() {    const item = state.item;
    const base = R.baseOf(item);
    const opts = typeOptions(base, item.ilvl);
    const q = state.tq.trim().toLowerCase();
    const chosen = new Set(state.targets.map((t) => t.pool + '|' + t.type));
    const pickRow = (t) => {
      const top = t.best || t.rows[t.rows.length - 1];
      const text = rowText(top);
      if (q && !text.toLowerCase().includes(q) && !R.rowText(top, 'en').toLowerCase().includes(q)) return '';
      const on = chosen.has(t.pool + '|' + t.type);
      return '<button class="pick ' + (on ? 'on' : '') + '" data-act="add-target" data-type="' + esc(t.type) + '" data-pool="' + t.pool + '" type="button"' + (t.best ? '' : ' disabled') + '>'
        + '<span class="mod-text">' + esc(text) + '</span><span class="small faint">' + (on ? '已选' : !t.best ? '物品等级不够' : t.share ? '约 ' + pct(t.share) : '') + '</span></button>';
    };
    const col = (list, g) => list.filter((t) => t.gen === g).map(pickRow).join('') || '<span class="faint small">没有</span>';
    const cap = R.caps(Object.assign({}, item, { rarity: 'rare' }));
    /* 已选目标按前缀 / 后缀分两组：一件装备两侧各有自己的位置上限，混在一起看不出哪侧满了 */
    const bySide = { p: [], s: [] };
    state.targets.forEach((t, i) => {
      const ladder = t.row ? [] : R.ladder(base, t.type, t.pool);
      const floor = ladder[Math.min(ladder.length, t.tier || 1) - 1];
      const need = floor && floor.lvl > item.ilvl;
      bySide[targetGen(base, t)].push('<div class="target"><div><div class="mod-text">' + esc(floor ? rowText(floor) : t.name) + '</div>'
        + '<div class="small ' + (need ? '' : 'faint') + '"' + (need ? ' style="color:var(--bad)"' : '') + '>'
        + (need ? '这一档需要物品等级 ' + floor.lvl : '接受这一档或更好的') + '</div></div>'
        + '<span class="tier"><button data-act="tier" data-i="' + i + '" data-d="1" type="button" ' + ((t.tier || 1) >= ladder.length ? 'disabled' : '') + ' title="放宽一档">−</button>'
        + '<b>T' + (t.tier || 1) + ' 以上</b><button data-act="tier" data-i="' + i + '" data-d="-1" type="button" ' + ((t.tier || 1) <= 1 ? 'disabled' : '') + ' title="收紧一档">＋</button></span>'
        + '<button class="ghost" data-act="del-target" data-i="' + i + '" type="button">移除</button></div>');
    });
    const over = ['p', 's'].filter((g) => bySide[g].length > cap[g]);
    const group = (g) => '<section class="tgroup ' + g + '"><header class="tgroup-head">' + sideTag(g) + pips(bySide[g].length, cap[g])
      + '<span class="small ' + (bySide[g].length > cap[g] ? '' : 'muted') + '"' + (bySide[g].length > cap[g] ? ' style="color:var(--bad)"' : '') + '>'
      + bySide[g].length + ' / ' + cap[g] + (bySide[g].length > cap[g] ? ' · 选多了，这一侧放不下' : '') + '</span></header>'
      + (bySide[g].length > cap[g] ? '<p class="small" style="color:var(--bad);margin:2px 0 6px">这一侧最多放 ' + cap[g] + ' 条：点某一行右边的「移除」去掉一条，就能开始了。</p>' : '')
      + (bySide[g].join('') || '<div class="tgroup-empty">还没选' + sideName(g) + '</div>') + '</section>';
    return '<div class="stack"><div class="eyebrow">第 2 步</div><h1 class="title">你想要哪些词缀？</h1>'
      + '<p class="lede">挑 2–3 条最看重的就够了。T1 是这个底子能出的最高档，档位要求越高、条数越多，花费涨得越快。'
      + '一件装备的' + sideTag('p') + '和' + sideTag('s') + '各有 ' + cap.p + ' / ' + cap.s + ' 个位置，互不占用。</p></div>'
      + '<div class="panel">' + (state.targets.length ? '<div class="spread panel-head"><span class="small muted">已选 ' + state.targets.length + ' 条</span>'
        + '<button class="ghost" data-act="clear-targets" type="button">清空已选</button></div>' : '') + group('p') + group('s') + '</div>'
      + '<div class="stack"><div class="spread"><h2 class="h2">这个底子能出的词缀</h2><input class="field" style="max-width:240px" data-bind="tq" aria-label="搜索词缀" value="' + esc(state.tq) + '" placeholder="搜索，如 生命 / 抗性"></div>'
      + '<p class="small faint">右边的百分比是「每加一条随机词缀，出这种词缀的大概机会」<span class="tag est" title="' + esc(R.ESTIMATES.weights) + '">估算</span></p>'
      + '<div class="pick-cols"><div class="pick-col p"><div class="pick-head">' + sideTag('p') + '</div><div class="pick-list">' + col(opts.natural, 'p') + '</div></div>'
      + '<div class="pick-col s"><div class="pick-head">' + sideTag('s') + '</div><div class="pick-list">' + col(opts.natural, 's') + '</div></div></div>'
      + (opts.abyss.length ? '<details class="fold"' + foldAttr('abyss', false) + '><summary>深渊专属词缀（只能靠亵渎获得）</summary>' + abyssNote(opts.abyss) + '<div class="pick-cols" style="margin-top:12px">'
        + '<div class="pick-col p"><div class="pick-head">' + sideTag('p') + '</div><div class="pick-list">' + col(opts.abyss, 'p') + '</div></div>'
        + '<div class="pick-col s"><div class="pick-head">' + sideTag('s') + '</div><div class="pick-list">' + col(opts.abyss, 's') + '</div></div></div></details>' : '')
      + '</div><div class="row"><button class="btn primary big" data-act="go" data-v="craft" type="button" ' + (state.targets.length && !over.length ? '' : 'disabled') + '>开始做装 →</button></div>';
  }

  /* ------------------------------------------------------------------ 第 3 步：跟着做 */
  function estTag() {
    return '<span class="tag est" title="' + esc(Object.values(R.ESTIMATES).join('\n')) + '">估算</span>';
  }
  /* 「没出目标」的几种情况如果后续做法相同，就合成一行：新手只需要知道「没出 → 怎么办」 */
  function groupOutcomes(list) {
    const out = [];
    const miss = new Map();
    for (const o of list || []) {
      if (['junk', 'same', 'block'].indexOf(o.kind) === -1) { out.push(o); continue; }
      const key = o.then.kind + '|' + (o.then.action ? JSON.stringify(o.then.action) : '');
      let g = miss.get(key);
      if (!g) { g = Object.assign({}, o, { p: 0, n: 0 }); miss.set(key, g); out.push(g); }
      g.p += o.p; g.n++;
    }
    for (const g of miss.values()) if (g.n > 1) { g.label = '没出想要的词缀'; g.kind = 'junk'; }
    return out;
  }
  function outcomeRows(next) {
    return groupOutcomes(next.outcomes).map((o) => '<div class="out ' + o.kind + '"><div class="out-p">' + pct(o.p) + '</div>'
      + '<div class="out-label">' + esc(o.label) + '<div class="bar"><i style="width:' + Math.max(1.5, o.p * 100).toFixed(1) + '%"></i></div></div>'
      + '<div class="out-then">' + (o.then.kind === 'done' ? '<b style="color:var(--good)">做完了</b>' : o.then.kind === 'restart' ? '换一个底子重来'
        : o.then.kind === 'go' ? '接着用 ' + esc(actionLabel(o.then.action, state.item)) : '到此为止') + '</div></div>').join('');
  }
  function nextCard(plan) {
    const next = plan.next;
    if (next.restart) {
      const keep = plan.keepBest;
      return '<div class="next"><div class="eyebrow">下一步</div><div class="next-title">这件不值得再投入，<em>换一个新底子</em></div>'
        + (keep ? '<p class="next-how">继续在这件上做，最省的路子从这一步起平均还要 <b>' + fmt(keep.total) + '</b> 崇高石；'
          + '换一个白底从头做平均 <b>' + fmt(next.total) + '</b>（已经算进买底子的钱）。</p>' : '')
        + '<p class="next-how">流放 2 没有洗白装备的通货。继续在这件上花钱，平均下来比换一个白底从头做更贵。'
        + '这个结论取决于底子的价格：如果这种底子很难弄到，把下面的「白底价格」调高，建议会跟着变。</p>'
        + (plan.freshRoute && plan.freshRoute.length ? '<p class="small muted">换底子之后的路线画在下面，照着走就行。</p>' : '')
        + '<div class="row"><button class="btn primary big" data-act="restart" type="button">换好了，从白底继续</button>'
        + '<button class="btn" data-act="toggle-paste" type="button">新底子不一样，我粘贴</button></div></div>';
    }
    const a = next.action;
    const kind = R.actionKind(a);
    const omens = omenNames(a);
    const tiered = /_(greater|perfect)$/.test(a.cur || '');
    const title = kind === 'reveal' ? '去灵魂之井<em>揭露</em>那条亵渎词缀' : '对装备使用 <em>' + esc(curName(a, state.item)) + '</em>';
    return '<div class="next"><div class="eyebrow">下一步</div><div class="next-title">' + title + '</div>'
      + (omens.length ? '<div class="note">使用之前，先在背包里右键激活：<b>' + esc(omens.join('、')) + '</b></div>' : '')
      + '<p class="next-how">' + esc(HELP[kind] || '') + (tiered ? ' ' + TIER_NOTE : '') + ' <span class="faint">这一步大约花 ' + fmt(next.cost) + ' 崇高石。</span></p>'
      + '<div><div class="spread" style="margin-bottom:6px"><span class="h2">做完之后会怎样</span>' + estTag() + '</div><div class="outs">' + outcomeRows(next) + '</div></div>'
      + '<div class="row"><button class="btn primary big" data-act="report" type="button">我做完了，告诉你结果</button>'
      + '<button class="btn" data-act="toggle-paste" type="button">直接粘贴物品文本</button>'
      + '<button class="ghost" data-act="simulate" type="button" title="不在游戏里做，让工具掷一次骰子看看">帮我模拟一次</button></div></div>';
  }
  function figures(plan) {
    const c = plan.cost;
    const pb = plan.perBase;
    /* 换底子是最优策略时，这些数字讲的是「换白底重做」那条路，不是这件继续做 */
    const restart = !!(plan.next && plan.next.restart);
    /* 成功率太低时不做模拟，直接用指数分布拟合；标签上说清楚，别让人以为是跑出来的 */
    const fit = c.approx ? '（拟合值）' : '';
    return '<div class="figs"><div class="fig"><div class="fig-n">' + fmt(c.mean) + '</div><div class="fig-l">' + (restart ? '换白底重做的平均总花费' : '平均总花费') + '（崇高石）</div></div>'
      + '<div class="fig"><div class="fig-n">' + fmt(c.p50) + '</div><div class="fig-l">一半的人在这以内做完' + fit + '</div></div>'
      + '<div class="fig"><div class="fig-n">' + fmt(c.p90) + '</div><div class="fig-l">九成的人在这以内做完' + fit + '</div></div>'
      + (pb && pb.bases > 1.5 ? '<div class="fig"><div class="fig-n">' + fmt(pb.bases) + '</div><div class="fig-l">平均要用掉的底子数</div></div>' : '')
      + (restart && pb ? '<div class="fig"><div class="fig-n">' + pct(pb.pSuccess) + '</div><div class="fig-l">一个底子就做成的机会</div></div>' : '') + '</div>';
  }
  /* 数字有多可信：拟合 / 截断 / 没收敛都要说出来，不能让它看起来和精确解一样 */
  function figCaveats(plan) {
    const out = [];
    if (plan.cost && plan.cost.approx) out.push('「一半 / 九成」这两个数按指数分布估的，不是模拟出来的（做成的机会太少，采不到样本）。');
    if (plan.truncated) out.push('这件装备可能的状态太多，求解到一半截断了，数字只能当参考。');
    else if (plan.converged === false) out.push('这次没有完全收敛，数字是迭代到一半的近似。');
    return out.map((t) => '<p class="small faint">' + esc(t) + '</p>').join('');
  }
  /* 折叠块的展开状态存在 ui 里：整块重画时不会被收回去。
   * 以前点「算一下哪条目标最贵」，重画两次会把面板收起来，结果算完了也看不见。 */
  function foldAttr(k, auto) {
    const open = ui.folds[k] === undefined ? !!auto : !!ui.folds[k];
    return ' data-fold="' + k + '"' + (open ? ' open' : '');
  }
  function sensBlock() {
    if (ui.sensBusy) {
      const p = ui.sensProgress;
      return '<div class="row muted"><span class="spinner"></span>正在逐条试算…' + (p ? '（第 ' + (p[0] + 1) + ' / ' + p[1] + ' 条）' : '') + '</div>'
        + '<div class="row"><span class="small faint">目标越多越慢，每条都要把整组重新解一遍。</span>'
        + '<button class="btn" data-act="sens-cancel" type="button">取消</button></div>';
    }
    if (!ui.sens) return '<button class="btn" data-act="sens" type="button">算一下哪条目标最贵</button>';
    const many = state.targets.length > 1;
    return ui.sens.map((x) => {
      const t = state.targets[x.index];
      const save = (v) => (v == null ? '' : '约 ' + fmt(v) + '（省 ' + Math.round((1 - v / x.mean) * 100) + '%）');
      const without = !many ? '' : x.without == null ? '<br>不要这条：这组目标就做不出来了' : '<br>不要这条：' + save(x.without);
      return '<div class="alt"><span>' + esc(t.name) + ' <span class="tag">T' + (t.tier || 1) + ' 以上</span></span>'
        + '<span class="small muted">' + (x.relaxed != null ? '放宽到 T' + ((t.tier || 1) + 1) + '：' + save(x.relaxed) : '已经是最低档') + without + '</span>'
        + (x.relaxed != null ? '<button class="ghost" data-act="tier" data-i="' + x.index + '" data-d="1" type="button">放宽</button>' : '<span></span>') + '</div>';
    }).join('');
  }
  /* 做完之后的收尾：只用现有数据能算出来的建议（品质 / 插槽 / 数值），
   * 每条都说清「会不会弄丢词缀」。以前这里是一句三位一体的空话。 */
  function closeout(item) {
    if (!item) return '';
    const base = R.baseOf(item);
    const price = (id) => { const p = Object.assign({}, R.DEFAULT_PRICES, state.prices); return p[id] != null ? Number(p[id]) : null; };
    const money = (id) => { const p = price(id); return p == null ? '' : '（约 ' + fmt(p) + ' 崇高石）'; };
    const rows = [];
    if (item.corrupted) {
      rows.push('这件已经腐化，通货用不了了，只能插符文。');
    } else {
      const qcur = ['whetstone', 'etcher', 'scrap'].find((id) => R.available(item, { cur: id }) === null);
      if (qcur) rows.push('用 <b>' + esc(R.CUR[qcur].zh) + '</b> 把品质补到 20%' + esc(money(qcur)) + '：只涨防御 / 伤害，词缀不受影响。');
      else if (R.socketCap(base) && R.available(item, { cur: 'whetstone' }) !== null && R.available(item, { cur: 'scrap' }) !== null) rows.push('品质已经到顶了。');
      const low = item.affixes.filter((a) => {
        const row = a.row && R.row(a.row);
        return row && !a.fractured && row.v.some((v, i) => a.values[i] == null || a.values[i] < Math.max(v[0], v[1]) - 1e-9);
      });
      if (low.length && R.available(item, { cur: 'divine' }) === null) {
        rows.push('有 ' + low.length + ' 条词缀的数值没到顶：<b>神圣石</b> 可以重掷全部数值' + esc(money('divine')) + '，可能变高也可能变低，不满意可以再掷。');
      }
      const cap = R.socketCap(base);
      const free = item.sockets - item.augments.length;
      if (!cap) rows.push('这个部位没有插槽。');
      else if (!item.sockets) rows.push('还没有插槽：<b>巧匠石</b> 可以打一个' + esc(money('artificer')) + '，然后插符文。');
      else if (free > 0) rows.push('还有 ' + free + ' 个空插槽，可以插符文（插上去就取不下来，先看清楚效果）。');
    }
    return rows.length
      ? '<div class="stack"><h2 class="h2">收尾还能做什么</h2>' + rows.map((t) => '<p class="small muted">· ' + t + '</p>').join('') + '</div>'
      : '';
  }
  /* 求解器只会建议它建模过的通货。玩家想自己动手时走这里：
   * 点一个能用的通货，进和「跟着做」完全一样的回报向导，按游戏里的结果更新装备。
   * 品质 / 巧匠石是确定性的（数值可算），点了直接记账，不用问。 */
  const MANUAL_UNSUPPORTED = {
    divine: '数值会重掷成什么算不出来，先在游戏里做完，再用「粘贴更新」把新的数值贴回来更准。',
    vaal: '四种结果（没事 / 重掷词缀 / 腐化附魔 / 加插槽）还没做回报流程，先做完再用「粘贴更新」。',
    fracture: '破裂哪一条还不支持回报，先做完再用「粘贴更新」。',
  };
  function manualPanel() {
    const item = state.item;
    if (!item) return '';
    const usable = [];
    const blocked = [];
    for (const id of Object.keys(R.CUR)) {
      const name = curName({ cur: id }, item);
      if (MANUAL_UNSUPPORTED[id]) { blocked.push({ id, name, why: MANUAL_UNSUPPORTED[id] }); continue; }
      const why = R.available(item, { cur: id });
      if (why) blocked.push({ id, name, why });
      else usable.push({ id, name });
    }
    return '<details class="fold"' + foldAttr('manual', false) + '><summary>自己动手：用别的通货（不跟着建议走）</summary>'
      + '<p class="small faint" style="margin:10px 0">点了之后照样会问你「游戏里发生了什么」，然后按结果更新装备。</p>'
      + (usable.length
        ? '<div class="row">' + usable.map((x) => '<button class="btn" data-act="manual" data-v="' + esc(x.id) + '" type="button">' + esc(x.name) + '</button>').join('') + '</div>'
        : '<p class="small muted">按现在的状态，没有别的通货能用。</p>')
      + (blocked.length
        ? '<details class="fold" style="margin-top:12px"><summary>这些现在用不了（点开看原因）</summary><div class="log" style="margin-top:10px">'
          + blocked.map((x) => '<div>· ' + esc(x.name) + '：' + esc(x.why) + '</div>').join('') + '</div></details>'
        : '')
      + '</details>';
  }
  /* 第 3 步也要能改这两个数：抄错物品等级、或者想看看换个底子价会怎样，不该退回第 1 步 */
  function tuneRow() {
    return '<div class="row small muted"><label class="row">一个这样的白底值多少崇高石？<input class="field num" type="number" min="0" step="0.5" data-bind="basePrice" value="' + state.basePrice + '"></label>'
      + '<label class="row">物品等级 <input class="field num" type="number" min="1" max="100" data-bind="itemIlvl" value="' + (state.item ? state.item.ilvl : state.ilvl) + '"></label>'
      + '<span class="faint">底子越便宜，「没出就换」越划算。物品等级决定能出多高档的词缀。</span></div>';
  }
  function stepCraft() {
    const head = '<div class="stack"><div class="eyebrow">第 3 步</div><h1 class="title">跟着做</h1></div>';
    if (ui.report) return head + reportPanel();
    if (ui.paste) return head + pastePanel();
    const plan = ui.plan;
    if (ui.busy || !plan) return head + '<div class="next pending"><div class="row muted late"><span class="spinner"></span>正在算最省钱的做法…</div><p class="small muted later">目标越多、档位越高，要比较的做法就越多，一般几秒内出结果。</p></div>';
    if (plan.status === 'done') {
      return head + '<div class="next"><div class="eyebrow">完成</div><div class="next-title">目标词缀<em>全部到手</em></div>'
        + '<p class="next-how">可以收手了。想要更好的话，下面这些都不会弄丢刚做好的词缀。</p>'
        + closeout(state.item)
        + '<div class="row"><button class="btn" data-act="go" data-v="targets" type="button">再加一条目标</button><button class="btn" data-act="new-item" type="button">做下一件</button></div></div>'
        + manualPanel();
    }
    if (plan.status === 'corrupted') return head + '<div class="next"><div class="next-title">这件装备<em>已经腐化</em></div><p class="next-how">腐化后不能再用通货改词缀，只能继续插符文。要做新目标得换一件。</p><div class="row"><button class="btn" data-act="new-item" type="button">换一件</button></div></div>';
    if (plan.status === 'impossible' || plan.status === 'error') {
      const probs = (plan.problems || [{ text: '计算出了问题，请换个目标试试。' }]).map((p) => '<div class="note bad">' + esc(p.text)
        + (p.kind === 'ilvl' ? ' <button class="link" data-act="set-ilvl" data-v="' + p.need + '" type="button">把物品等级改成 ' + p.need + '</button>' : '') + '</div>').join('');
      return head + '<div class="next"><div class="next-title">按现在的目标<em>做不出来</em></div>' + probs
        + '<div class="row"><button class="btn primary" data-act="go" data-v="targets" type="button">回去调整目标</button></div></div>'
        + '<div class="stack"><h2 class="h2">换个条件再算</h2>' + tuneRow() + '</div>'
        + manualPanel();
    }
    const restart = !!(plan.next && plan.next.restart);
    const routeLine = (list) => list.map((r, i) => (i ? '<i>→</i>' : '') + '<span>' + esc(actionLabel(r.action, state.item)) + (r.hit ? ' <b style="color:var(--good)">出' + esc(r.hit) + '</b>' : '') + '</span>').join('');
    const route = routeLine(plan.route);
    /* 换底子是最优策略时，把「换白底之后怎么走」也画出来：第一步是买底子，后面是策略给出的路线 */
    const freshRoute = plan.freshRoute && plan.freshRoute.length
      ? '<span>买一个白底 ' + fmt(plan.next.cost) + '</span><i>→</i>' + routeLine(plan.freshRoute) : '';
    const alts = plan.alternatives.map((x) => '<div class="alt"><span>' + esc(actionLabel(x.action, state.item)) + '</span><span class="small muted">走完全程平均 ' + fmt(x.total) + '</span>'
      + '<span class="small ' + (x.total - plan.cost.mean < 0.005 * plan.cost.mean ? 'muted' : 'faint') + '">贵 ' + fmt(Math.max(0, x.total - plan.cost.mean)) + '</span></div>').join('');
    const log = state.log.slice(-8).reverse().map((l) => '<div>' + esc(l) + '</div>').join('');
    return head + nextCard(plan)
      + '<div class="stack"><div class="spread"><h2 class="h2">' + (restart ? '换白底重做大概要花多少' : '做完这件大概要花多少') + '</h2>' + estTag() + '</div>' + figures(plan) + figCaveats(plan)
      + tuneRow() + '</div>'
      + (freshRoute ? '<div class="stack"><h2 class="h2">换白底之后，每一步都成功的话是这样</h2><div class="route">' + freshRoute + '</div>'
        + '<p class="small faint">只画一路顺利的那一支：某一步没出目标，就回到「换一个新底子」重新开始。</p></div>' : '')
      + (route ? '<div class="stack"><h2 class="h2">每一步都成功的话，大概是这样</h2><div class="route">' + route + '</div>'
        + '<p class="small faint">这是「每次都出想要的」那种运气下的顺序。某一步没出，就按上面「做完之后会怎样」里对应的那一行走。</p></div>' : '')
      + '<details class="fold"' + foldAttr('sens', ui.sensBusy || !!ui.sens) + '><summary>哪条目标最贵？放宽一档能省多少</summary><div style="margin-top:12px">' + sensBlock() + '</div></details>'
      + (alts ? '<details class="fold"' + foldAttr('alts', false) + '><summary>这一步的其它选择</summary><div style="margin-top:8px">' + alts + '</div></details>' : '')
      + (log ? '<details class="fold"' + foldAttr('log', false) + '><summary>做装记录</summary><div class="log" style="margin-top:10px">' + log + '</div></details>' : '')
      + manualPanel();
  }
  function pastePanel() {
    return '<div class="next"><div class="next-title">粘贴<em>现在的装备</em></div><p class="next-how">在游戏里对着装备按 Ctrl+C，粘贴到这里。目标保持不变。</p>'
      + '<textarea class="field" id="pasteBox" data-bind="paste" aria-label="物品文本" placeholder="物品文本">' + esc(ui.pasteText || '') + '</textarea><div class="row"><button class="btn primary" data-act="paste-parse" type="button">更新装备</button>'
      + '<button class="btn" data-act="toggle-paste" type="button">取消</button><span class="small faint" id="pasteMsg"></span></div>'
      + '<div id="pastePick" class="stack"></div></div>';
  }

  /* ------------------------------------------------------------------ 回报结果
   * 把一次操作拆成几个小问题：哪条被移除了？新出的是哪条？每答一步，草稿物品就更新一步。 */
  function buildReport(item, action, manual) {
    const kind = manual ? 'manual' : R.actionKind(action);
    const flags = manual ? {} : R.omenFlags(action);
    const cur = (action && R.CUR[action.cur]) || {};
    const draft = R.clone(item);
    const steps = [];
    const add = (extra) => steps.push(Object.assign({ t: 'add', minLvl: cur.min || 0 }, extra));
    if (kind === 'manual') {
      if (draft.rarity === 'normal') draft.rarity = 'magic';
      if (draft.rarity === 'magic' && draft.affixes.length >= 2) draft.rarity = 'rare';
      steps.push({ t: 'add', minLvl: 0, manual: true });
    } else if (kind === 'transmute') { draft.rarity = 'magic'; add(); }
    else if (kind === 'augment') add();
    else if (kind === 'regal') { draft.rarity = 'rare'; add({ gen: flags.side }); }
    else if (kind === 'alchemy') { draft.rarity = 'rare'; draft.affixes = draft.affixes.filter((a) => a.fractured); for (let i = 0; i < 4; i++) add({ minLvl: 0 }); }
    else if (kind === 'exalt') for (let i = 0; i < (flags.two ? 2 : 1); i++) add({ gen: flags.side });
    else if (kind === 'chaos') { steps.push({ t: 'remove', gen: flags.side, lowest: flags.lowest }); add(); }
    else if (kind === 'annul') for (let i = 0; i < (flags.two ? 2 : 1); i++) steps.push({ t: 'remove', gen: flags.side, desOnly: flags.desecratedOnly });
    else if (kind === 'essence') {
      const ess = R.essence(action.essence);
      if (R.isRemovingEssence(ess)) steps.push({ t: 'remove', essence: action.essence, gen: flags.side });
      steps.push({ t: 'essence', id: action.essence });
    } else if (kind === 'desecrate') {
      if (!R.openSides(draft).length) steps.push({ t: 'remove', gen: flags.side });
      steps.push({ t: 'side', gen: flags.side, minLvl: cur.min || 0, lord: flags.lord || null });
    } else if (kind === 'reveal') steps.push({ t: 'reveal' });
    return { action, kind, draft, steps, idx: 0, q: '', type: null, notes: [] };
  }
  function removeCandidates(rep, step) {
    const d = rep.draft;
    if (step.essence) return R.essenceVictims(d, R.essenceEffect(d, R.essence(step.essence)), step.gen);
    let list = R.removable(d).filter((a) => (!step.gen || a.gen === step.gen) && (!step.desOnly || a.desecrated));
    if (step.lowest && list.length) { const min = Math.min.apply(null, list.map((a) => a.lvl)); list = list.filter((a) => a.lvl === min); }
    return list;
  }
  /* 能自动回答的步骤直接跳过（只有一个候选、精华保底等） */
  function advanceReport() {
    const rep = ui.report;
    for (;;) {
      const step = rep.steps[rep.idx];
      if (!step) return finishReport();
      if (step.t === 'remove') {
        const c = removeCandidates(rep, step);
        if (c.length > 1) return render();
        if (c.length === 1) { rep.notes.push('移除「' + affixText(c[0]) + '」'); rep.draft.affixes = rep.draft.affixes.filter((a) => a !== c[0]); }
      } else if (step.t === 'essence') {
        rep.draft.rarity = 'rare';
        const aff = R.essenceAffixFor(rep.draft, step.id, () => 0.5);
        rep.draft.affixes.push(aff);
        rep.notes.push('精华加上「' + affixText(aff) + '」');
      } else if (step.t === 'side') {
        const sides = R.desecrateSides(rep.draft, { side: step.gen, lord: step.lord }, step.minLvl);
        if (sides.length > 1 && !step.picked) return render();
        pushUnrevealed(rep, step.picked || sides[0] || 'p', step);
      } else if (step.t === 'add') {
        if (!R.addDist(rep.draft, { minLvl: step.minLvl, gen: step.gen }).length) { rep.idx++; continue; }
        return render();
      } else return render();
      rep.idx++;
    }
  }
  function pushUnrevealed(rep, gen, step) {
    rep.draft.affixes.push({ row: null, type: null, fam: [], gen, lvl: 0, tags: [], values: [], desecrated: true, unrevealed: true, minLvl: step.minLvl, lord: step.lord });
    rep.notes.push('多了一条待揭露的' + sideName(gen));
  }
  function finishReport() {
    const rep = ui.report;
    if (!rep.draft.affixes.length && rep.draft.rarity !== 'normal') rep.draft.rarity = 'normal';
    commit(rep.draft, (rep.kind === 'manual' ? '手动添加' : actionLabel(rep.action, state.item)) + '：' + (rep.notes.join('，') || '没有变化'));
    ui.report = null;
    render();
  }
  function midValues(row) { return row.v.map((x) => { const k = Math.pow(10, x[2] || 0); return Math.round(((x[0] + x[1]) / 2) * k) / k; }); }
  function reportPanel() {
    const rep = ui.report;
    const step = rep.steps[rep.idx];
    const head = '<div class="next"><div class="spread"><div class="eyebrow">' + esc(rep.kind === 'manual' ? '手动添加' : actionLabel(rep.action, state.item)) + ' · 第 ' + (rep.idx + 1) + ' / ' + rep.steps.length + ' 问</div>'
      + '<span class="row">' + (rep.idx > 0 || rep.draft !== state.item ? '<button class="ghost" data-act="report-restart" type="button" title="从第一个问题重新来">重新开始回报</button>' : '')
      + '<button class="ghost" data-act="report-cancel" type="button">取消</button></span></div>';
    if (step.t === 'remove') {
      const c = removeCandidates(rep, step);
      return head + '<div class="next-title">游戏里<em>被移除</em>的是哪一条？</div>' + '<div class="item-mods" style="padding:0">'
        + rep.draft.affixes.map((a, i) => (c.indexOf(a) !== -1 ? modRow(rep.draft, a, i, { pick: 'report-remove' }) : '')).join('') + '</div></div>';
    }
    if (step.t === 'side') {
      return head + '<div class="next-title">那条「待揭露」的词缀加在了<em>哪一侧</em>？</div><p class="next-how">看装备上「未揭露的亵渎词缀」出现在前缀区还是后缀区；分不清就看哪一侧多了一条。</p>'
        + '<div class="row"><button class="btn big" data-act="report-side" data-v="p" type="button">前缀</button><button class="btn big" data-act="report-side" data-v="s" type="button">后缀</button></div></div>';
    }
    /* add / reveal：从候选里选类型，再选档位 */
    const base = R.baseOf(rep.draft);
    let rows;
    if (step.t === 'reveal') { const pool = R.revealPool(rep.draft); rows = pool.exclusive.concat(pool.regular); }
    else rows = (step.manual ? R.addPool(rep.draft, {}) : R.addDist(rep.draft, { minLvl: step.minLvl, gen: step.gen })).map((x) => x.row);
    const byType = new Map();
    for (const r of rows) { if (!byType.has(r.type)) byType.set(r.type, []); byType.get(r.type).push(r); }
    const isGoal = (list) => list.some((r) => state.targets.some((t) => R.targetAccepts(base, t, { type: r.type, lvl: r.lvl, row: r.id })));
    if (rep.type && byType.has(rep.type)) {
      const list = byType.get(rep.type).slice().sort((a, b) => b.lvl - a.lvl);
      return head + '<div class="next-title">是<em>哪一档</em>？</div><p class="next-how">对照游戏里的数值，落在哪个范围就选哪个。数值先按区间中点记，之后用神圣石重掷时会全改。</p><div class="pick-list">'
        + list.map((r) => '<button class="pick" data-act="report-row" data-v="' + esc(r.id) + '" type="button"><span class="mod-text">' + esc(rowText(r)) + '</span><span class="tag">T' + (R.tierOf(base, r) || '?') + '</span></button>').join('')
        + '</div><div class="row"><button class="ghost" data-act="report-type" data-v="" type="button">← 重新选词缀</button></div></div>';
    }
    const q = rep.q.trim().toLowerCase();
    const entries = [...byType.entries()].map(([type, list]) => ({ type, list, goal: isGoal(list), text: rowText(list.slice().sort((a, b) => b.lvl - a.lvl)[0]) }))
      .filter((e) => !q || shortName(e.text).toLowerCase().includes(q) || e.text.toLowerCase().includes(q))
      .sort((a, b) => (b.goal - a.goal) || (a.list[0].gen < b.list[0].gen ? -1 : a.list[0].gen > b.list[0].gen ? 1 : 0));
    const sides = [...new Set(rows.map((r) => r.gen))];
    const title = step.t === 'reveal' ? '你在灵魂之井<em>选了哪一条</em>？' : step.manual ? '要添加<em>哪条词缀</em>？' : '装备上<em>新出现</em>的是哪一条？';
    return head + '<div class="next-title">' + title + '</div>'
      + (step.t === 'reveal' ? '<p class="next-how">三个选项里有标着「目标」的就选它；没有的话随便选一条，回来告诉我。</p>' : '')
      + '<div class="row"><input class="field" style="max-width:260px" data-bind="rq" aria-label="搜索词缀" value="' + esc(rep.q) + '" placeholder="搜索，如 生命">'
      + (step.manual ? '' : sides.map((g) => '<button class="btn" data-act="report-junk" data-v="' + g + '" type="button">是没用的' + sideName(g) + '，不细选</button>').join('')) + '</div>'
      + '<div class="pick-list" style="max-height:380px;overflow:auto">' + entries.map((e) => '<button class="pick" data-act="report-type" data-v="' + esc(e.type) + '" type="button"><span class="mod-text">' + esc(shortName(e.text))
        + '</span><span class="mod-meta">' + (e.goal ? '<span class="tag hit">目标</span>' : '') + sideTag(e.list[0].gen) + '</span></button>').join('') + '</div></div>';
  }

  /* ------------------------------------------------------------------ 状态变更 */
  /* 撤销栈里存 { item, targets } 快照：以前只存物品，所以改目标、改档位撤销不了 */
  function snapshot() {
    if (!state.item) return null;
    return { item: state.item, targets: state.targets.map((t) => Object.assign({}, t)) };
  }
  function pushHistory() {
    const snap = snapshot();
    if (!snap) return;
    state.history.push(snap);
    if (state.history.length > 60) state.history.shift();
  }
  function commit(item, note) {
    pushHistory();
    state.item = item;
    if (note) state.log.push(note);
    if (state.log.length > 80) state.log.shift();
    save();
    replan();
  }
  function setItem(item, note) {
    state.targets = state.targets.filter((t) => R.baseOf(item).id === (state.item && state.item.base) || R.ladder(R.baseOf(item), t.type, t.pool).length);
    commit(item, note);
  }
  function go(step) {
    if (step !== 'item' && !state.item) step = 'item';
    if (step === 'craft' && !state.targets.length) step = 'targets';
    state.step = step;
    ui.report = null; ui.paste = false;
    save();
    if (step === 'craft') replan();
    render();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }
  /* 第 2 步：装备上的一条词缀直接变成目标，档位就是它现在的档位（意思是「这条不许掉」）。
   * 词缀是简体、目标列表也是同一套名字，所以只复制类型 + 档位，不复制数值。 */
  function copyToTarget(i) {
    const item = state.item;
    const a = item && item.affixes[i];
    const row = a && a.row ? R.row(a.row) : null;
    if (!row) return toast('这条词缀没认出来，没法设成目标。');
    if (state.targets.some((t) => (t.row ? t.row === row.id : t.type === a.type && t.pool === row.pool))) {
      return toast('「' + shortName(rowText(row)) + '」已经是目标了。');
    }
    const base = R.baseOf(item);
    const tier = R.tierOf(base, row);
    if (!tier) return toast('这条词缀只有精华才会出，暂时不能设成目标。');
    const cap = R.caps(item);
    const used = state.targets.filter((t) => targetGen(base, t) === row.gen).length;
    if (used >= cap[row.gen]) {
      return toast('这一侧已经有 ' + cap[row.gen] + ' 条目标了，先去掉一条再加。');
    }
    const target = { type: a.type, pool: row.pool, tier, name: shortName(rowText(row)) };
    pushHistory();
    state.targets.push(target);
    save(); replan(); render();
    toast('已加进目标：' + target.name + '（T' + tier + ' 以上）');
  }
  /* 国服的底子名和繁中不一样，对不上时解析会带回一张候选清单，让玩家点一下接着认 */
  function baseCandidates(g) {
    const label = { ar: '护甲', ev: '闪避', es: '能量护盾' };
    const hint = (g.defs || []).map((k) => label[k]).filter(Boolean);
    return '<p class="small muted" style="margin:0">需求等级 ' + g.level + (hint.length ? ' · ' + hint.join(' / ') : '') + '，对得上的是这几个：</p>'
      + '<div class="row">' + g.candidates.map((b) => '<button class="btn" data-act="paste-pick" data-v="' + esc(b.id) + '" type="button">'
        + esc(baseName(b)) + ' <span class="faint small">' + esc(b.name) + '</span>'
        + (baseStat(b) ? '<span class="small faint">' + esc(baseStat(b)) + '</span>' : '') + '</button>').join('') + '</div>';
  }
  function parsePaste(opts) {
    const box = $('pasteBox');
    const text = box ? box.value : (ui.pasteText || '');
    ui.pasteText = text;
    const res = P.parse(text, opts);
    const pick = $('pastePick');
    if (res.error) {
      const m = $('pasteMsg'); if (m) m.textContent = res.error;
      if (pick) pick.innerHTML = res.needBase ? baseCandidates(res.needBase) : '';
      return;
    }
    if (pick) pick.innerHTML = '';
    ui.paste = false;
    setItem(res.item, '粘贴了装备：' + baseName(res.base) + (res.alias ? '（国服叫「' + res.alias + '」）' : ''));
    if (res.warnings.length) toast(res.warnings[0]);
    go(state.targets.length ? 'craft' : 'targets');
  }
  function simulate() {
    const plan = ui.plan;
    if (!plan || !plan.next || plan.next.restart) return;
    let action = plan.next.action;
    if (action.cur === 'reveal') {
      const opts = R.revealOptions(state.item, Math.random);
      const base = R.baseOf(state.item);
      const want = opts.find((r) => state.targets.some((t) => R.targetAccepts(base, t, { type: r.type, lvl: r.lvl, row: r.id }))) || opts[0];
      action = Object.assign({}, action, { pick: want.id });
    }
    const res = R.apply(state.item, action, Math.random);
    if (res.error) return toast(res.error);
    const said = res.events.map((e) => (e.t === 'add' ? '出了「' + affixText(e.affix) + '」' : e.t === 'remove' ? '去掉「' + affixText(e.affix) + '」' : e.t === 'reveal' ? '揭露为「' + affixText(e.affix) + '」' : '')).filter(Boolean).join('，');
    commit(res.item, '模拟 ' + actionLabel(plan.next.action, state.item) + '：' + (said || '没有变化'));
    toast('模拟结果：' + (said || '没有变化'));
    render();
  }

  /* ------------------------------------------------------------------ 设置 */
  function renderSheet() {
    const off = (k, label) => '<label class="row"><input type="checkbox" data-off="' + k + '" ' + (state.off[k] ? 'checked' : '') + '> ' + label + '</label>';
    const priceRow = (id, name) => '<label class="spread small"><span>' + esc(name) + '</span><input class="field num" type="number" min="0" step="0.1" data-price="' + id + '" value="' + (state.prices[id] != null ? state.prices[id] : R.DEFAULT_PRICES[id]) + '"></label>';
    $('sheet').innerHTML = '<div class="spread"><h2 class="title" style="font-size:1.3rem">设置</h2><button class="ghost" data-act="close-settings" type="button">关闭</button></div>'
      + '<div class="stack"><h3 class="h2">外观</h3><div class="swatches">' + THEMES.map(([id, n, bg, ac, md]) => '<button class="swatch ' + (state.theme === id ? 'on' : '') + '" data-act="theme" data-v="' + id + '" type="button">'
        + '<span class="swatch-chip" style="background:' + bg + '"><i style="background:' + ac + '"></i><i style="background:' + md + '"></i></span><span>' + n + '</span></button>').join('') + '</div></div>'
      + '<div class="stack"><h3 class="h2">词缀文字</h3><div class="chips">' + [['zhs', '简体中文'], ['zht', '繁體中文（國際服原文）'], ['en', 'English']].map(([id, n]) => '<button class="chip ' + (state.lang === id ? 'on' : '') + '" data-act="lang" data-v="' + id + '" type="button">' + n + '</button>').join('') + '</div></div>'
      + '<div class="stack"><h3 class="h2">我没有 / 不想用</h3><p class="small faint">勾上之后，推荐里不会出现这些。</p>'
      + off('greater', '高级通货') + off('perfect', '完美通货') + off('omens', '预兆') + off('bones', '亵渎（骨头）') + off('essence', '精华') + off('annul', '剥离石') + '</div>'
      + '<div class="stack"><h3 class="h2">计算假设</h3><p class="small faint">游戏没有公开这些细节，结果都是估算：</p>'
      + Object.values(R.ESTIMATES).map((t) => '<p class="small muted">· ' + esc(t) + '</p>').join('')
      + '<div class="chips">' + [['pooled', '前后缀合并抽取'], ['sideFirst', '先各一半选侧']].map(([id, n]) => '<button class="chip ' + (state.sideModel === id ? 'on' : '') + '" data-act="side-model" data-v="' + id + '" type="button">' + n + '</button>').join('') + '</div></div>'
      + '<details class="fold"><summary>价格（单位：崇高石）</summary><p class="small faint" style="margin:10px 0">默认值只是大概行情，只影响「哪条路更省」。按你所在赛季的实际价格改会更准。</p><div class="stack">'
      + Object.keys(R.CUR).filter((id) => id !== 'reveal' && R.DEFAULT_PRICES[id] != null && !R.NOT_IN_SOLVER[id]).map((id) => priceRow(id, R.CUR[id].zh)).join('')
      + Object.keys(R.OMEN).map((id) => priceRow(id, locName(R.data.omens.find((o) => o.id === id), id))).join('')
      + '<button class="ghost" data-act="reset-prices" type="button">恢复默认价格</button>'
      + '<p class="small faint" style="margin:0">求解器现在不会建议：神圣石 / 瓦尔宝珠 / 破裂石 / 巧匠石 / 品质通货，所以没列在这里——改它们也不会改变任何建议。</p>'
      + '</div></details>'
      + '<p class="small faint">数据：游戏版本 ' + esc(R.data.meta.gameVersion) + ' · ' + R.data.meta.counts.bases + ' 个底子 · ' + R.data.meta.counts.liveRows + ' 条可掉落词缀档位'
      + ' · 词缀模板 ' + (R.data.meta.counts.zhsTemplates || 0) + '/' + R.data.meta.counts.templates + ' 有官方简中'
      + (R.data.meta.counts.essenceEffectsMatched ? ' · 精华效果对上 ' + esc(String(R.data.meta.counts.essenceEffectsMatched)) : '')
      + '</p>';
  }
  let sheetReturn = null;
  function openSheet(open) {
    const sheet = $('sheet');
    sheet.hidden = !open; $('sheetBackdrop').hidden = !open;
    if (open) {
      sheetReturn = document.activeElement;
      renderSheet();
      const first = sheet.querySelector('button, input');
      if (first) first.focus();
    } else if (sheetReturn) {
      try { sheetReturn.focus(); } catch (e) { /* 原来那个元素已经不在了 */ }
      sheetReturn = null;
    }
  }


  /* ------------------------------------------------------------------ 渲染 */
  function render() {
    document.documentElement.dataset.theme = state.theme;
    $('brandSub').textContent = '流放之路 2 · ' + R.data.meta.gameVersion;
    const done = { item: !!state.item, targets: state.targets.length > 0, craft: ui.plan && ui.plan.status === 'done' };
    $('steps').innerHTML = [['item', '装备'], ['targets', '目标'], ['craft', '跟着做']].map(([id, n], i) =>
      '<button class="step ' + (state.step === id ? 'on' : '') + ' ' + (done[id] && state.step !== id ? 'ok' : '') + '" data-act="go" data-v="' + id + '" type="button" '
      + ((id === 'targets' && !state.item) || (id === 'craft' && (!state.item || !state.targets.length)) ? 'disabled' : '') + '><i>' + (i + 1) + '</i>' + n + '</button>').join('');
    renderSide();
    /* 整块重画会把输入框换成新的，所以要先把「焦点在哪个框、光标在第几个字」记下来，
     * 画完按原位放回去。以前一律放到末尾，在中间删字会直接被弹到行尾。 */
    const active = document.activeElement;
    const keep = active && active.dataset ? active.dataset.bind : null;
    let caret = null;
    if (keep) {
      try { caret = [active.selectionStart, active.selectionEnd]; } catch (e) { caret = null; /* number 输入框不支持 */ }
    }
    $('stage').innerHTML = state.step === 'targets' && state.item ? stepTargets() : state.step === 'craft' && state.item ? stepCraft() : stepItem();
    if (keep) {
      const el = document.querySelector('[data-bind="' + keep + '"]');
      if (el) {
        el.focus();
        try {
          if (caret && caret[0] != null) {
            /* 值可能因为渲染期间的变化而变短，夹在合法范围里 */
            const n = el.value.length;
            const a = Math.min(caret[0], n);
            const b = Math.min(caret[1] == null ? a : caret[1], n);
            el.setSelectionRange(a, b);
          } else {
            const n = el.value.length;
            el.setSelectionRange(n, n);
          }
        } catch (e) { /* number 输入框不支持选区 */ }
      }
    }
  }

  /* ------------------------------------------------------------------ 事件 */
  const acts = {
    go: (v) => go(v),
    slot: (v) => { state.slot = v; state.q = ''; ui.more = 60; save(); render(); },
    wcls: (v) => { state.wcls = v; ui.more = 60; save(); render(); },
    'more-bases': () => { ui.more += 60; render(); },
    'pick-base': (v) => { setItem(R.newItem(v, { ilvl: state.ilvl }), '选了白底：' + baseName(R.base(v))); state.history = []; go('targets'); },
    'paste-parse': () => parsePaste(),
    'paste-pick': (v) => parsePaste({ base: v }),
    'toggle-paste': () => { ui.paste = !ui.paste; ui.report = null; if (state.step !== 'craft') go('item'); else render(); },
    'toggle-edit': () => { ui.edit = !ui.edit; render(); },
    'edit-remove': (v, el) => { const it = R.clone(state.item); const a = it.affixes.splice(Number(el.dataset.i), 1)[0]; if (!it.affixes.length) it.rarity = 'normal'; commit(it, '手动移除「' + affixText(a) + '」'); render(); },
    'edit-add': () => { ui.report = buildReport(state.item, null, true); state.step = 'craft'; advanceReport(); },
    undo: () => {
      if (!state.history.length) return;
      const e = state.history.pop();
      const it = e && e.item ? e.item : e;
      if (!it || !R.base(it.base)) return;
      state.item = it;
      if (e && Array.isArray(e.targets)) state.targets = e.targets;   // 目标也一起回退
      state.log.push('撤销了上一步');
      ui.report = null; ui.paste = false;
      save(); replan(); render();
    },
    'add-target': (v, el) => {
      const base = R.baseOf(state.item);
      const type = el.dataset.type;
      const pool = el.dataset.pool;
      const at = state.targets.findIndex((t) => t.type === type && t.pool === pool);
      pushHistory();
      if (at >= 0) state.targets.splice(at, 1);
      else {
        const rows = R.ladder(base, type, pool);
        state.targets.push({ type, pool, tier: defaultTier(rows, state.item.ilvl), name: shortName(rowText(rows[0])) });
      }
      save(); replan(); render();
    },
    'del-target': (v, el) => { pushHistory(); state.targets.splice(Number(el.dataset.i), 1); save(); replan(); render(); },
    'copy-mod': (v, el) => copyToTarget(Number(el.dataset.i)),
    tier: (v, el) => {
      const t = state.targets[Number(el.dataset.i)];
      const n = R.ladder(R.baseOf(state.item), t.type, t.pool).length;
      pushHistory();
      t.tier = Math.max(1, Math.min(n, (t.tier || 1) + Number(el.dataset.d)));
      save(); replan(); render();
    },
    'set-ilvl': (v) => { const it = R.clone(state.item); it.ilvl = Number(v); state.ilvl = Number(v); commit(it, '物品等级改为 ' + v); render(); },
    report: () => { ui.report = buildReport(state.item, ui.plan.next.action); advanceReport(); },
    /* 手动用某个通货：确定性的（品质 / 巧匠石）直接记账，其余进回报向导 */
    manual: (v) => {
      const kind = R.actionKind({ cur: v });
      if (kind === 'artificer' || kind === 'quality') {
        const res = R.apply(state.item, { cur: v }, Math.random);
        if (res.error) return toast(res.error);
        commit(res.item, curName({ cur: v }, state.item) + (kind === 'artificer' ? '：多了一个插槽' : '：品质 +' + R.qualityGain(state.item.ilvl) + '%'));
        toast(kind === 'artificer' ? '记下了：多一个插槽' : '记下了：品质提高了');
        return;
      }
      ui.folds.manual = false;
      ui.report = buildReport(state.item, { cur: v });
      ui.paste = false;
      state.step = 'craft';
      advanceReport();
    },
    'report-cancel': () => { ui.report = null; render(); },
    /* 答错了（比如点错「被移除的是哪一条」）不用从头选装备，重开这套问题就行 */
    'report-restart': () => {
      const rep = ui.report;
      if (!rep) return;
      ui.report = buildReport(state.item, rep.kind === 'manual' ? null : rep.action, rep.kind === 'manual');
      advanceReport();
    },
    'report-remove': (v, el) => { const rep = ui.report; const a = rep.draft.affixes[Number(el.dataset.i)]; rep.notes.push('移除「' + affixText(a) + '」'); rep.draft.affixes.splice(Number(el.dataset.i), 1); rep.idx++; advanceReport(); },
    'report-side': (v) => { const rep = ui.report; rep.steps[rep.idx].picked = v; advanceReport(); },
    'report-type': (v) => { ui.report.type = v || null; render(); },
    'report-row': (v) => {
      const rep = ui.report;
      const row = R.row(v);
      const step = rep.steps[rep.idx];
      if (step.t === 'reveal') {
        const res = R.apply(rep.draft, { cur: 'reveal', pick: row.id, values: midValues(row) }, () => 0.5);
        if (res.error) return toast(res.error);
        rep.draft = res.item;
        rep.notes.push('揭露为「' + rowText(row) + '」');
      } else {
        rep.draft.affixes.push(R.makeAffix(row, () => 0.5, { values: midValues(row), approxValues: true }));
        rep.notes.push('出了「' + shortName(rowText(row)) + '」');
      }
      rep.type = null; rep.q = ''; rep.idx++;
      advanceReport();
    },
    'report-junk': (v) => {
      const rep = ui.report;
      rep.draft.affixes.push({ row: null, type: 'unknown', fam: [], gen: v, lvl: 1, tags: [], values: [], text: '（没用的' + sideName(v) + '，没细选）', unknown: true });
      rep.notes.push('出了没用的' + sideName(v));
      rep.idx++;
      advanceReport();
    },
    simulate: () => simulate(),
    restart: () => { commit(R.newItem(state.item.base, { ilvl: state.item.ilvl }), '换了一个新底子'); render(); },
    'new-item': () => { state.targets = []; state.item = null; state.history = []; save(); ui.plan = null; go('item'); },
    /* 一键清理：清掉之前先留一份，提示条上可以撤销 */
    'clear-targets': () => {
      if (!state.targets.length) return;
      ui.cleared = { targets: state.targets, step: state.step };
      const n = state.targets.length;
      state.targets = [];
      ui.report = null;
      save(); replan();
      if (state.step === 'craft') go('targets'); else render();
      toast('已清空 ' + n + ' 条目标', { act: 'undo-clear', label: '撤销' });
    },
    'clear-all': () => {
      if (!state.item && !state.targets.length) return toast('已经是空的了');
      ui.cleared = { targets: state.targets, item: state.item, history: state.history, log: state.log, step: state.step, all: true };
      state.targets = []; state.item = null; state.history = []; state.log = []; state.q = ''; state.tq = '';
      ui.plan = null; ui.planKey = ''; ui.report = null; ui.paste = false; ui.edit = false;
      save();
      go('item');
      toast('装备和目标都清空了', { act: 'undo-clear', label: '撤销' });
    },
    'reset-all': () => { try { localStorage.removeItem(KEY); } catch (e) { /* 隐私模式存不了 */ } location.reload(); },
    'toast-close': () => { $('toast').hidden = true; },
    'undo-clear': () => {
      const c = ui.cleared;
      if (!c) return;
      ui.cleared = null;
      state.targets = c.targets;
      if (c.all) { state.item = c.item; state.history = c.history; state.log = c.log; }
      save();
      $('toast').hidden = true;
      go(c.step);
    },
    sens: () => {
      ui.sensBusy = true; ui.sensProgress = null; render();
      const key = ui.planKey;
      const opts = solverOpts();
      if (ui.plan && ui.plan.cost && ui.plan.status === 'ok') opts.baseMean = ui.plan.cost.mean;
      sensLane.run('sensitivity', state.item, state.targets, opts, (p) => {
        if (key !== ui.planKey) return;
        ui.sensProgress = p;
        render();
      }).then((out) => { if (key !== ui.planKey || out === STALE) return; ui.sens = out || []; ui.sensBusy = false; ui.sensProgress = null; render(); });
    },
    'sens-cancel': () => {
      if (!ui.sensBusy) return;
      sensLane.cancel();
      ui.sensBusy = false; ui.sensProgress = null; ui.sens = null;
      render();
      toast('已取消');
    },
    'open-settings': () => openSheet(true),
    'close-settings': () => openSheet(false),
    theme: (v) => { state.theme = v; save(); render(); renderSheet(); },
    lang: (v) => { state.lang = v; state.targets.forEach((t) => { const rows = R.ladder(R.baseOf(state.item), t.type, t.pool); if (rows.length) t.name = shortName(rowText(rows[0])); }); save(); ui.planKey = ''; replan(); render(); renderSheet(); },
    'side-model': (v) => { state.sideModel = v; save(); replan(); render(); renderSheet(); },
    'reset-prices': () => { state.prices = {}; save(); replan(); render(); renderSheet(); },
  };
  document.addEventListener('click', (e) => {
    if (e.target.id === 'sheetBackdrop') return openSheet(false);
    const el = e.target.closest('[data-act]');
    if (!el || el.disabled) return;
    const fn = acts[el.dataset.act];
    if (fn) fn(el.dataset.v, el);
  });
  document.addEventListener('input', (e) => {
    const el = e.target;
    /* 输入法正在组字（拼音没上屏）时先别重画：重画会把输入法状态一起冲掉。
     * 组字结束后由下面的 compositionend 补一次。 */
    const composing = e.isComposing || e.keyCode === 229;
    if (el.dataset.bind === 'q') { state.q = el.value; ui.more = 60; save(); if (!composing) render(); }
    else if (el.dataset.bind === 'tq') { state.tq = el.value; if (!composing) render(); }
    else if (el.dataset.bind === 'paste') { ui.pasteText = el.value; }   // 只记住，不重画：重画会把输入框里的文本冲掉
    else if (el.dataset.bind === 'rq' && ui.report) { ui.report.q = el.value; if (!composing) render(); }
  });
  /* 组字结束后补一次重画（有些浏览器不再补发 input） */
  document.addEventListener('compositionend', (e) => {
    const b = e.target && e.target.dataset ? e.target.dataset.bind : null;
    if (b === 'q' || b === 'tq' || b === 'rq') render();
  });
  document.addEventListener('change', (e) => {
    const el = e.target;
    if (el.dataset.bind === 'ilvl') { state.ilvl = Math.max(1, Math.min(100, Number(el.value) || 82)); if (state.item && !state.item.affixes.length) state.item.ilvl = state.ilvl; save(); replan(); render(); }
    else if (el.dataset.bind === 'itemIlvl' && state.item) {
      const v = Math.max(1, Math.min(100, Number(el.value) || state.item.ilvl));
      if (v !== state.item.ilvl) { const it = R.clone(state.item); it.ilvl = v; state.ilvl = v; commit(it, '物品等级改为 ' + v); }
      else render();
    }
    else if (el.dataset.bind === 'basePrice') { state.basePrice = Math.max(0, Number(el.value) || 0); save(); replan(); render(); }
    else if (el.dataset.off) { state.off[el.dataset.off] = el.checked; save(); replan(); render(); }
    else if (el.dataset.price) { state.prices[el.dataset.price] = Math.max(0, Number(el.value) || 0); save(); replan(); render(); }
  });
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') { if (!$('sheet').hidden) openSheet(false); else if (ui.report || ui.paste) { ui.report = null; ui.paste = false; render(); } }
    if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !/INPUT|TEXTAREA/.test(document.activeElement.tagName)) { e.preventDefault(); acts.undo(); }
  });
  /* toggle 不冒泡，用捕获阶段记住每个折叠块是开着还是关着 */
  document.addEventListener('toggle', (e) => {
    const el = e.target;
    if (el && el.dataset && el.dataset.fold) ui.folds[el.dataset.fold] = !!el.open;
  }, true);

  try {
    if (state.step === 'craft') replan();
    render();
  } catch (e) { fatal(e); }
  /* 后台线程提前起好：拼脚本要把 1.5 MB 数据序列化一遍，放在空闲时做，免得第一次点「开始做装」时顿一下 */
  setTimeout(() => planLane.warm(), 600);
})();


