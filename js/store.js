/* ═══════════ 数据层 v2：多画布 / 计划 / 复盘 / 目标 / localStorage ═══════════ */
const Store = (() => {
  const KEY = 'sidequest.v1';
  let state = null;

  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  const pad = n => String(n).padStart(2, '0');
  const todayStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const monthStr = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}`;
  /** ISO 周键：YYYY-Www（周四所在年份为该周年份） */
  function weekStr(d = new Date()) {
    const t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7)); // 移到本周周四
    const week1 = new Date(t.getFullYear(), 0, 4);
    const w = 1 + Math.round(((t - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7);
    return `${t.getFullYear()}-W${pad(w)}`;
  }
  const dayOffset = (dateStr, n) => { const d = new Date(dateStr + 'T00:00:00'); d.setDate(d.getDate() + n); return todayStr(d); };

  function freshCanvas(name) {
    return { id: uid(), name: name || '我的画布', nodes: [], arrows: [], cam: null, createdAt: Date.now() };
  }

  function seed() {
    const t1 = uid(), t2 = uid(), t3 = uid();
    const nWelcome = uid(), nIdea = uid();
    const c = freshCanvas('我的画布');
    c.nodes = [
      { id: nWelcome, type: 'sticky', x: 420, y: 160, w: 200, h: 150, color: '#ffe58a', text: '👋 欢迎来到你的支线工作台！\n\n双击空白处＝新建便签\n滚轮/双指＝缩放，拖空白＝平移', createdAt: Date.now() },
      { id: nIdea, type: 'sticky', x: 720, y: 300, w: 190, h: 130, color: '#a7f3d0', text: '💡 灵感：把选题库搬上画布，箭头连出内容矩阵', createdAt: Date.now() },
      { id: uid(), type: 'text', x: 300, y: 60, w: 260, h: 40, text: '🚀 我的灵感画布', fontSize: 24, createdAt: Date.now() },
      { id: uid(), type: 'symbol', x: 960, y: 150, w: 56, h: 56, symbol: '🔥', createdAt: Date.now() },
      { id: uid(), type: 'video', x: 430, y: 400, w: 420, h: 260, url: 'https://www.bilibili.com/video/BV1GJ411x7h7', embed: 'https://player.bilibili.com/player.html?bvid=BV1GJ411x7h7&autoplay=0&danmaku=0', title: 'B站视频示例（自动内嵌）', createdAt: Date.now() },
    ];
    c.arrows = [{ id: uid(), from: nWelcome, to: nIdea, color: '#7c5cff' }];
    // 演示：跨天的重复行为（供目标页的行为发现引擎展示）
    const tWord = uid();
    const taskWord = { id: tWord, title: '背 20 个单词', status: 'doing', est: 1, date: todayStr(), notes: '小到不可能失败的一步：先背 1 个。', links: [], steps: [], createdAt: Date.now() - 4 * 86400000, doneAt: null };
    const mkRec = (off, min) => ({ id: uid(), date: dayOffset(todayStr(), off), start: Date.now() - (off + 1) * 86400000, end: Date.now() - (off + 1) * 86400000 + min * 60000, minutes: min, taskId: tWord, mode: 'pomodoro' });
    // 另一组行为：新媒体选题（尚未生长成目标 → 出现在"正在生长"候选区）
    const tXhs = t1;
    const mkRec2 = (off, min) => ({ id: uid(), date: dayOffset(todayStr(), off), start: Date.now() - (off + 1) * 86400000, end: Date.now() - (off + 1) * 86400000 + min * 60000, minutes: min, taskId: tXhs, mode: 'pomodoro' });
    return {
      tasks: [
        { id: t1, title: '完成小红书新媒体笔记', status: 'doing', est: 4, date: todayStr(),
          notes: '目标：一篇种草笔记。先看参考视频找感觉，素材都放在飞书文档里，灵感直接记到画布上。',
          links: [
            { id: uid(), name: '飞书文档（素材库）', url: 'https://feishu.cn/docx/example' },
            { id: uid(), name: '参考视频（小红书）', url: 'https://www.xiaohongshu.com/explore/example123' },
            { id: uid(), name: '参考网页：爆款标题公式', url: 'https://example.com/title-formula' },
            { id: uid(), name: 'B站教程：封面设计', url: 'https://www.bilibili.com/video/BV1GJ411x7h7' },
          ],
          steps: [
            { id: uid(), text: '看参考视频，摘 3 个亮点', done: false },
            { id: uid(), text: '只写 1 行标题', done: false },
            { id: uid(), text: '配图 + 排版', done: false },
          ],
          createdAt: Date.now() - 86400000, doneAt: null },
        { id: t2, title: 'Q4 内容规划（画布头脑风暴）', status: 'todo', est: 3, date: todayStr(),
          notes: '把想法都扔到画布上，用箭头连出结构。', links: [], steps: [],
          createdAt: Date.now() - 86400000, doneAt: null },
        taskWord,
      ],
      canvases: [c],
      activeCanvasId: c.id,
      records: [mkRec2(-3, 25), mkRec2(-2, 30), mkRec2(0, 25), mkRec(-4, 20), mkRec(-2, 25), mkRec(-1, 30)],
      plans: { day: {}, week: {}, month: {} },
      reviews: {
        [dayOffset(todayStr(), -1)]: {
          weather: '🌤️',
          action: '* 21:00 用 APP 背了 20 个单词\n* 22:30 整理了小红书选题素材',
          life: '* 晚饭点了新开的那家米粉，汤底很鲜',
          books: '', spark: '', knowledge: '',
          sleepStart: '23:30', sleepEnd: '07:10', sleepScore: 4, updatedAt: Date.now() - 86400000,
        },
      },
      goals: [
        { id: uid(), auto: true, status: 'growing', createdAt: Date.now() - 2 * 86400000,
          title: '把「背个单词」养成稳定节奏',
          source: ['背 20 个单词', '用 APP 背了 20 个单词'],
          sig: ['背单', '单词', '个单', '背个', '词打'],
          kr: [
            { text: '30 天内「背个单词」相关行动 ≥ 8 次', unit: '次', target: 8, current: 3 },
            { text: '每周至少 3 天有「背个单词」动作', unit: '天/周', target: 3, current: 2 },
            { text: '累计投入 ≥ 100 分钟', unit: '分钟', target: 100, current: 75 },
          ] },
      ],
      settings: { focusMin: 25, shortMin: 5, longMin: 15, longEvery: 4, noise: 'off', volume: 45, chime: 1, theme: 'dark', mode: 'pomodoro', api: { url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', key: '', model: 'glm-4-flash' } },
      ui: { page: 'home', focusTaskId: null, filter: 'all', calMonth: monthStr(), selectedDate: todayStr(), activeCanvasId: c.id },
    };
  }

  /** 旧数据迁移：单画布 → 多画布；补齐新字段 */
  function migrate(s) {
    let dirty = false;
    if (!s.canvases) {
      const c = freshCanvas('我的画布');
      if (s.canvas) { c.nodes = s.canvas.nodes || []; c.arrows = s.canvas.arrows || []; }
      s.canvases = [c]; s.activeCanvasId = c.id; delete s.canvas; dirty = true;
    }
    if (!s.activeCanvasId || !s.canvases.find(c => c.id === s.activeCanvasId)) {
      s.activeCanvasId = s.canvases[0]?.id; dirty = true;
    }
    s.canvases.forEach(c => {
      if (!c.name) { c.name = '我的画布'; dirty = true; }
      (c.nodes || []).forEach(n => { if (!n.createdAt) { n.createdAt = Date.now(); dirty = true; } });
    });
    if (!s.plans) { s.plans = { day: {}, week: {}, month: {} }; dirty = true; }
    if (!s.reviews) { s.reviews = {}; dirty = true; }
    if (!s.goals) { s.goals = []; dirty = true; }
    (s.tasks || []).forEach(t => { if (t.date === undefined) { t.date = null; dirty = true; } });
    if (!s.ui) { s.ui = {}; dirty = true; }
    if (!s.ui.calMonth) { s.ui.calMonth = monthStr(); dirty = true; }
    if (!s.ui.selectedDate) { s.ui.selectedDate = todayStr(); dirty = true; }
    if (!s.settings.api) { s.settings.api = { url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions', key: '', model: 'glm-4-flash' }; dirty = true; }
    if (!s.settings.customEmojis) { s.settings.customEmojis = []; dirty = true; }
    if (!s.settings.customSymbols) { s.settings.customSymbols = []; dirty = true; }
    if (s.settings.theme === undefined) { s.settings.theme = 'dark'; dirty = true; }
    if (dirty) save();
  }

  function load() {
    try {
      const raw = localStorage.getItem(KEY);
      state = raw ? JSON.parse(raw) : seed();
      if (!raw) save();
    } catch (e) { state = seed(); }
    migrate(state);
    if (!state.updatedAt) { state.updatedAt = Date.now(); save(); }
    return state;
  }
  function save() { state.updatedAt = Date.now(); localStorage.setItem(KEY, JSON.stringify(state)); }
  let saveTimer = null;
  function saveSoon() { clearTimeout(saveTimer); saveTimer = setTimeout(save, 400); }

  /* —— 画布 —— */
  const activeCanvas = () => state.canvases.find(c => c.id === state.activeCanvasId) || state.canvases[0];
  function addCanvas(name) {
    const c = freshCanvas(name || `画布 ${state.canvases.length + 1}`);
    state.canvases.push(c); state.activeCanvasId = c.id; saveSoon(); return c;
  }
  function delCanvas(id) {
    if (state.canvases.length <= 1) return false;
    state.canvases = state.canvases.filter(c => c.id !== id);
    if (state.activeCanvasId === id) state.activeCanvasId = state.canvases[0].id;
    saveSoon(); return true;
  }

  /* —— 任务 —— */
  const getTask = id => state.tasks.find(t => t.id === id);
  const addTask = (title, date) => {
    const t = { id: uid(), title, status: 'todo', est: 1, date: date || todayStr(), notes: '', links: [], steps: [], createdAt: Date.now(), doneAt: null };
    state.tasks.unshift(t); saveSoon(); return t;
  };
  const delTask = id => {
    state.tasks = state.tasks.filter(t => t.id !== id);
    state.records = state.records.filter(r => r.taskId !== id); // 联动清理计时记录
    if (state.ui.focusTaskId === id) state.ui.focusTaskId = null;
    saveSoon();
  };

  /* —— 计划 / 复盘 —— */
  const planOf = (kind, key) => state.plans[kind][key] || '';
  const setPlan = (kind, key, text) => { state.plans[kind][key] = text; saveSoon(); };
  const reviewOf = date => state.reviews[date] || null;
  function reviewEditor(date) {
    if (!state.reviews[date]) state.reviews[date] = { weather: '🌤️', action: '', life: '', books: '', spark: '', knowledge: '', sleepStart: '', sleepEnd: '', sleepScore: 0 };
    return state.reviews[date];
  }
  function reviewFilledCount(r) {
    if (!r) return 0;
    return ['action', 'life', 'books', 'spark', 'knowledge'].filter(k => (r[k] || '').trim()).length + ((r.sleepStart && r.sleepEnd) ? 1 : 0);
  }

  /* —— 统计 —— */
  function recordsOn(dateStr) { return state.records.filter(r => r.date === dateStr); }
  function todayMinutes() { return Math.round(recordsOn(todayStr()).reduce((s, r) => s + r.minutes, 0)); }
  function todayPomos() { return recordsOn(todayStr()).length; }
  function streak() {
    let n = 0; const d = new Date();
    if (!recordsOn(todayStr()).length) d.setDate(d.getDate() - 1);
    while (recordsOn(todayStr(d)).length) { n++; d.setDate(d.getDate() - 1); }
    return n;
  }
  function lastNDays(n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = todayStr(d);
      out.push({ date: key, min: Math.round(state.records.filter(r => r.date === key).reduce((s, r) => s + r.minutes, 0)) });
    }
    return out;
  }

  return {
    get s() { return state; }, uid, todayStr, monthStr, weekStr, dayOffset, pad,
    load, save, saveSoon,
    seed: () => { state = seed(); save(); },
    wipe: () => { state = seed(); state.tasks = []; state.records = []; state.canvases = [freshCanvas('我的画布')]; state.activeCanvasId = state.canvases[0].id; state.reviews = {}; state.goals = []; state.plans = { day: {}, week: {}, month: {} }; save(); },
    activeCanvas, addCanvas, delCanvas,
    getTask, addTask, delTask,
    planOf, setPlan, reviewOf, reviewEditor, reviewFilledCount,
    recordsOn, todayMinutes, todayPomos, streak, lastNDays,
  };
})();
