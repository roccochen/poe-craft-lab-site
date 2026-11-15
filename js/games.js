/* 游戏注册表：决定当前页面加载哪套数据 / 引擎 / 顾问 / 配置层。
 * 流放 1 入口已关闭：只有流放 1 的数据脚本真的加载了，才注册 poe1。 */
(function (global) {
  'use strict';
  const games = {};
  if (global.PoEData) {
    games.poe1 = {
      id: 'poe1',
      label: '流放之路 1',
      short: 'PoE1',
      data: global.PoEData,
      engine: global.PoEEngine,
      advisor: global.PoEAdvisor,
      config: global.PoEConfig,
      storageKey: 'poe1-craft-lab-v1',
      configKey: 'poe1ConfigUrl',
    };
  }
  games.poe2 = {
    id: 'poe2',
    label: '流放之路 2',
    short: 'PoE2',
    data: global.PoE2Data,
    engine: global.PoE2Engine,
    advisor: global.PoE2Advisor,
    config: global.PoE2Config,
    storageKey: 'poe2-craft-lab-v1',
    configKey: 'poe2ConfigUrl',
  };
  global.PoEGames = games;
})(window);
