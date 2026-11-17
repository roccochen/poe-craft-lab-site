/* 流放之路 2 做装台 · 价格
 *
 * 价格有三层，后面的覆盖前面的：
 *   1. 内置默认表（rules.js 的 DEFAULT_PRICES）——离线也能用，带一个快照时间
 *   2. 线上行情（可选的 Cloudflare Worker，见 backend/）——按联赛实时抓
 *   3. 玩家在设置里手改的价——永远最高优先
 *
 * 线上行情抓不到就安静地退回默认表，不影响使用。
 */
(function (global) {
  'use strict';

  const R = global.CraftRules || (typeof require !== 'undefined' ? require('./rules.js') : null);

  /* 线上行情抓不到就安静地退回默认表，不影响使用。
   *
   * 三条价格防线（AGENTS.md 第 7 条：「绝不能留 0 价」）：
   *   1. 0 价会让求解器白送这个通货——所以合并层就把 0 丢掉；
   *   2. 某档精华全都没有行情时，后端给的是 null——null 参与加法等于加 0，
   *      所以档位表里只保留「有限且大于 0」的值，缺的那档整档丢掉；
   *   3. 玩家手改的价格同样要过这道闸（见 solverPrices）。
   * 剩下的兜底在 rules.js 的 cost()：那里还有最后一道防线。 */
  const positive = (v) => typeof v === 'number' && Number.isFinite(v) && v > 0;

  /* 后端返回的 config → 扁平的价格表
   * config = { league, fetchedAt, prices, essenceTier, essences, omens, bones } */
  function flatten(cfg) {
    const out = {};
    if (!cfg || typeof cfg !== 'object') return out;
    for (const [k, v] of Object.entries(cfg.prices || {})) {
      if (positive(v)) out[k] = v;
    }
    for (const [k, v] of Object.entries(cfg.omens || {})) {
      if (positive(v)) out[k] = v;
    }
    for (const [k, v] of Object.entries(cfg.bones || {})) {
      if (positive(v)) out[k] = v;
    }
    /* 精华按 id 定价：同一档里价格能差几十倍，按档位一个价会把便宜的精华算贵 */
    for (const [k, v] of Object.entries(cfg.essences || {})) {
      if (positive(v)) out[k] = v;
    }
    if (Array.isArray(cfg.essenceTier)) {
      /* 缺的那一档给 null——它不是 0 价，是「这一档没行情」。
       * 规则引擎会跳过它去用别档的价，绝不会当成免费。 */
      const tier = cfg.essenceTier.map((v) => (positive(v) ? v : null));
      if (tier.length) out.essenceTier = tier;
    }
    return out;
  }

  /* 合并三层价格。manual 是玩家手改的，永远最高。 */
  function merge(live, manual) {
    const out = Object.assign({}, R ? R.DEFAULT_PRICES : {});
    Object.assign(out, live || {});
    Object.assign(out, manual || {});
    return out;
  }

  /* 只留求解器真正会用到的价格：
   * 求解器不会建议的通货（神圣石 / 瓦尔 / 破裂石 / 巧匠石 / 品质类）改了也不影响建议，
   * 带着它们只会白白让缓存失效、触发重算。 */
  function solverPrices(live, manual) {
    const out = {};
    const notInSolver = (R && R.NOT_IN_SOLVER) || {};
    for (const [k, v] of Object.entries(merge(live, manual))) {
      if (k === 'essenceTier') { out.essenceTier = v; continue; }
      if (notInSolver[k]) continue;
      if (positive(v)) out[k] = v;
    }
    return out;
  }

  /* 抓一份行情。失败返回 null（调用方安静地退回默认表）。 */
  async function fetchConfig(url, opts) {
    const o = opts || {};
    if (!url) return null;
    const ctrl = typeof AbortController !== 'undefined' ? new AbortController() : null;
    const timer = ctrl ? setTimeout(() => ctrl.abort(), o.timeout || 12000) : null;
    try {
      const res = await fetch(url, {
        headers: { accept: 'application/json' },
        signal: ctrl ? ctrl.signal : undefined,
      });
      if (!res.ok) throw new Error('HTTP ' + res.status);
      const json = await res.json();
      if (!json || json.schema !== 1) throw new Error('不认识的价格配置格式');
      return json;
    } catch (e) {
      if (o.onError) o.onError(e);
      return null;
    } finally {
      if (timer) clearTimeout(timer);
    }
  }

  const api = { flatten, merge, solverPrices, fetchConfig };
  global.CraftPrices = api;
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
})(typeof window !== 'undefined' ? window : globalThis);
