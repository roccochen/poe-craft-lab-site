/* 运行时配置：
 * - 本地 file:// / localhost / 127.0.0.1：使用 data/config*.json；
 * - 生产且已填 Worker 地址：使用 Worker 的两条路由；
 * - 生产但仍未填 Worker：自动退回同源静态配置，保证 GitHub Pages 可直接打开。
 */
(function () {
  'use strict';
  const host = location.hostname;
  const local = location.protocol === 'file:' || host === 'localhost' || host === '127.0.0.1';
  const worker1 = 'https://YOUR-WORKER.workers.dev/api/config';
  const worker2 = 'https://YOUR-WORKER.workers.dev/api/poe2/config';
  const hasWorker = !/YOUR-WORKER/.test(worker1);
  const useStatic = local || !hasWorker;
  window.POE_RUNTIME = {
    // 填好 Worker 后，生产环境切到后端；本地仍使用同源静态 JSON。
    configUrl: useStatic ? 'data/config.json' : worker1,
    poe2ConfigUrl: useStatic ? 'data/config-poe2.json' : worker2,
    cooldownSeconds: 300,
    autoSync: true,
  };
})();
