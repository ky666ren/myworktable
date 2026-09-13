/* ═══════════ 启动 ═══════════ */
(() => {
  const $ = id => document.getElementById(id);
  window.APP_VERSION = 'v2.1.0'; // 版本号：设置页可见，用于确认设备缓存是否已更新
  Store.load();
  UI.applyTheme();

  // 恢复计时器状态并继续走
  Timer.restore();
  if (Store.s.settings.mode) Timer.setMode(Store.s.settings.mode);
  Audio2.setVolume(Store.s.settings.volume || 0.45);

  // 导航
  document.querySelectorAll('.nav-item').forEach(b => {
    b.onclick = () => { if (!UI.immersiveOpen()) UI.switchPage(b.dataset.page); };
  });
  $('btnGoTasks').onclick = () => UI.switchPage('tasks');
  $('btnGoFocus').onclick = () => UI.switchPage('focus');

  // 快速添加任务（归入今天）
  $('quickTaskInput').addEventListener('keydown', e => {
    if (e.key === 'Enter') {
      const v = e.target.value.trim();
      if (!v) return;
      Store.addTask(v, Store.todayStr());
      e.target.value = '';
      UI.toast('🎯 已加入今日待办');
      UI.refreshAll();
    }
  });

  // 灵感速记 → 当前画布便签
  $('btnThrowCanvas').onclick = () => {
    const v = $('quickCapture').value.trim();
    if (!v) { UI.toast('先写点想法 ✍️'); return; }
    CanvasApi.addSticky(v);
    $('quickCapture').value = '';
    UI.toast('🎨 已扔到画布上');
    if (Store.s.ui.page === 'canvas') CanvasApi.render();
  };

  // 画布 & 沉浸 & 弹窗 & 设置 & 计划 & 复盘 & 目标 & 云同步
  CanvasApi.init();
  ImmWindows.init();
  UI.bindTaskModal();
  UI.bindImmersive();
  UI.bindTimerUI();
  UI.bindSettings();
  UI.bindPlans();
  UI.bindReview();
  UI.bindGoalModal();
  UI.bindCanvasSwitcher();
  Sync.bind();

  // PWA：https / localhost 下注册 Service Worker（局域网 http 不支持，静默跳过）
  if ('serviceWorker' in navigator && (location.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(location.hostname))) {
    navigator.serviceWorker.register('sw.js').catch(() => {});
  }

  // 任务筛选
  document.querySelectorAll('#taskFilters .filter-chip').forEach(c => {
    c.onclick = () => {
      document.querySelectorAll('#taskFilters .filter-chip').forEach(x => x.classList.remove('active'));
      c.classList.add('active');
      Store.s.ui.filter = c.dataset.filter; Store.saveSoon();
      UI.renderTasks();
    };
  });

  // 计时器循环 + UI 同步
  Timer.restore();
  Timer.subscribe(UI.timerTick);
  Timer.startLoop();
  UI.updateTimerText();
  UI.setNoiseChips(Store.s.settings.noise);

  // 初始页面
  UI.switchPage(Store.s.ui.page || 'home');
})();
