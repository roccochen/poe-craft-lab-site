/* 流放之路 2 做装台 · 数据配置层
 * 负责：内置数据快照、配置包校验/应用、localStorage 缓存、远程配置读取。
 * 远程配置只更新已有条目的价格/成本/效果，不新增 id（引擎索引在启动时建立）。
 */
(function (global) {
  'use strict';

  const D = global.PoE2Data;
  const CACHE_KEY = 'poe2-craft-lab-config-v1';
  const SCHEMA = 1;
  const clone = (x) => JSON.parse(JSON.stringify(x));
  const isNum = (x) => typeof x === 'number' && Number.isFinite(x) && x >= 0;
  const isObj = (x) => !!x && typeof x === 'object' && !Array.isArray(x);

  const ESSENCE_FIELDS = ['cost', 'name', 'tierName', 'color', 'byCat', 'bySlot'];
  const FOSSIL_FIELDS = ['cost', 'name', 'more', 'fewer', 'block', 'desc', 'sanctified'];
  const BENCH_FIELDS = ['cost', 'name', 'text', 'v', 'tags', 'affix', 'group', 'slots', 'def'];
  const RUNE_FIELDS = ['cost', 'name', 'color', 'text', 'v', 'v2', 'tags', 'group', 'slots'];

  function allRunes() { return (D.runes || []).concat(D.soulCores || []); }

  function snapshot() {
    return {
      prices: clone(D.prices),
      essences: D.essences.map((e) => ({
        id: e.id, cost: e.cost, name: e.name, tierName: e.tierName, color: e.color,
        byCat: clone(e.byCat || {}), bySlot: clone(e.bySlot || {}),
      })),
      fossils: D.fossils.map((f) => clone(f)),
      bench: D.bench.map((b) => clone(b)),
      runes: allRunes().map((r) => clone(r)),
    };
  }
  const BUILTIN = snapshot();

  function apply(payload) {
    if (!isObj(payload)) throw new Error('配置必须是一个 JSON 对象');
    if (payload.schema != null && payload.schema !== SCHEMA) {
      throw new Error('不支持的配置格式版本：' + payload.schema);
    }
    const warnings = [];

    if (isObj(payload.prices)) {
      Object.keys(payload.prices).forEach((key) => {
        if (!(key in D.prices)) { warnings.push('未知价格字段：' + key); return; }
        const v = payload.prices[key];
        if (isNum(v)) D.prices[key] = v;
        else warnings.push('价格字段无效：' + key);
      });
    }

    if (isObj(payload.essences)) {
      Object.keys(payload.essences).forEach((id) => {
        const target = D.essences.find((e) => e.id === id);
        if (!target) { warnings.push('未知精华：' + id); return; }
        const patch = payload.essences[id];
        if (isNum(patch)) { target.cost = patch; return; }
        if (!isObj(patch)) { warnings.push('精华配置无效：' + id); return; }
        ESSENCE_FIELDS.forEach((field) => {
          if (patch[field] === undefined) return;
          if (field === 'cost') {
            if (isNum(patch.cost)) target.cost = patch.cost;
            else warnings.push('精华成本无效：' + id);
          } else if (field === 'byCat' || field === 'bySlot') {
            if (isObj(patch[field])) target[field] = clone(patch[field]);
            else warnings.push('精华槽位配置无效：' + id + '.' + field);
          } else {
            target[field] = clone(patch[field]);
          }
        });
      });
    }

    if (isObj(payload.fossils)) {
      Object.keys(payload.fossils).forEach((id) => {
        const target = D.fossils.find((f) => f.id === id);
        if (!target) { warnings.push('未知化石：' + id); return; }
        const patch = payload.fossils[id];
        if (isNum(patch)) { target.cost = patch; return; }
        if (!isObj(patch)) { warnings.push('化石配置无效：' + id); return; }
        FOSSIL_FIELDS.forEach((field) => {
          if (patch[field] === undefined) return;
          if (field === 'cost') {
            if (isNum(patch.cost)) target.cost = patch.cost;
            else warnings.push('化石成本无效：' + id);
          } else if (field === 'more' || field === 'fewer' || field === 'block') {
            if (Array.isArray(patch[field])) target[field] = clone(patch[field]);
            else warnings.push('化石标签无效：' + id + '.' + field);
          } else {
            target[field] = clone(patch[field]);
          }
        });
      });
    }

    if (isObj(payload.bench)) {
      Object.keys(payload.bench).forEach((id) => {
        const target = D.bench.find((b) => b.id === id);
        if (!target) { warnings.push('未知工艺：' + id); return; }
        const patch = payload.bench[id];
        if (isNum(patch)) { target.cost = patch; return; }
        if (!isObj(patch)) { warnings.push('工艺配置无效：' + id); return; }
        BENCH_FIELDS.forEach((field) => {
          if (patch[field] === undefined) return;
          if (field === 'cost') {
            if (isNum(patch.cost)) target.cost = patch.cost;
            else warnings.push('工艺成本无效：' + id);
          } else if (field === 'v' && !Array.isArray(patch.v)) {
            warnings.push('工艺数值无效：' + id);
          } else {
            target[field] = clone(patch[field]);
          }
        });
      });
    }

    if (isObj(payload.runes)) {
      Object.keys(payload.runes).forEach((id) => {
        const target = allRunes().find((r) => r.id === id);
        if (!target) { warnings.push('未知符文：' + id); return; }
        const patch = payload.runes[id];
        if (isNum(patch)) { target.cost = patch; return; }
        if (!isObj(patch)) { warnings.push('符文配置无效：' + id); return; }
        RUNE_FIELDS.forEach((field) => {
          if (patch[field] === undefined) return;
          if (field === 'cost') {
            if (isNum(patch.cost)) target.cost = patch.cost;
            else warnings.push('符文成本无效：' + id);
          } else if (field === 'v' || field === 'v2') {
            if (Array.isArray(patch[field])) target[field] = clone(patch[field]);
            else warnings.push('符文数值无效：' + id + '.' + field);
          } else {
            target[field] = clone(patch[field]);
          }
        });
      });
    }

    if (isObj(payload.settings)) {
      if (payload.settings.samples != null && !isNum(payload.settings.samples)) {
        warnings.push('样本数无效');
      }
    }

    return { warnings: warnings.slice(0, 30) };
  }

  function current(meta) {
    meta = meta || {};
    return {
      schema: SCHEMA,
      dataVersion: D.version,
      version: meta.version || 'local',
      updatedAt: meta.updatedAt || new Date().toISOString(),
      source: meta.source || 'local',
      prices: clone(D.prices),
      essences: Object.fromEntries(D.essences.map((e) => [e.id, {
        cost: e.cost, byCat: clone(e.byCat || {}), bySlot: clone(e.bySlot || {}),
      }])),
      fossils: Object.fromEntries(D.fossils.map((f) => [f.id, clone(f)])),
      bench: Object.fromEntries(D.bench.map((b) => [b.id, clone(b)])),
      runes: Object.fromEntries(allRunes().map((r) => [r.id, clone(r)])),
      settings: { samples: meta.samples || 160 },
    };
  }

  function restoreBuiltIn() {
    Object.keys(D.prices).forEach((key) => { delete D.prices[key]; });
    Object.assign(D.prices, clone(BUILTIN.prices));
    BUILTIN.essences.forEach((src) => {
      const target = D.essences.find((e) => e.id === src.id);
      if (!target) return;
      Object.keys(target).forEach((key) => { delete target[key]; });
      Object.assign(target, clone(src));
    });
    BUILTIN.fossils.forEach((src) => {
      const target = D.fossils.find((f) => f.id === src.id);
      if (!target) return;
      Object.keys(target).forEach((key) => { delete target[key]; });
      Object.assign(target, clone(src));
    });
    BUILTIN.bench.forEach((src) => {
      const target = D.bench.find((b) => b.id === src.id);
      if (!target) return;
      Object.keys(target).forEach((key) => { delete target[key]; });
      Object.assign(target, clone(src));
    });
    BUILTIN.runes.forEach((src) => {
      const target = allRunes().find((r) => r.id === src.id);
      if (!target) return;
      Object.keys(target).forEach((key) => { delete target[key]; });
      Object.assign(target, clone(src));
    });
  }

  function saveCache(config) {
    try { localStorage.setItem(CACHE_KEY, JSON.stringify(config)); } catch (e) { /* 忽略存储失败 */ }
  }
  function loadCache() {
    try {
      const raw = localStorage.getItem(CACHE_KEY);
      if (!raw) return null;
      const parsed = JSON.parse(raw);
      return isObj(parsed) ? parsed : null;
    } catch (e) { return null; }
  }
  function clearCache() {
    try { localStorage.removeItem(CACHE_KEY); } catch (e) { /* 忽略 */ }
  }

  async function fetchRemote(url) {
    if (!url) throw new Error('没有配置地址');
    const u = url + (url.indexOf('?') === -1 ? '?' : '&') + '_=' + Date.now();
    const res = await fetch(u, { cache: 'no-store' });
    if (!res.ok) throw new Error('HTTP ' + res.status);
    const json = await res.json();
    if (!isObj(json)) throw new Error('返回内容不是 JSON 对象');
    return json;
  }

  global.PoE2Config = {
    schema: SCHEMA,
    cacheKey: CACHE_KEY,
    apply,
    current,
    restoreBuiltIn,
    saveCache,
    loadCache,
    clearCache,
    fetchRemote,
    builtIn: BUILTIN,
  };
})(typeof window !== 'undefined' ? window : globalThis);
