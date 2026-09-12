/* ═══════════ 番茄钟引擎：番茄钟 / 正计时(Flowtime)，刷新不丢计时 ═══════════ */
const Timer = (() => {
  const TKEY = 'sidequest.timer.v1';
  let st = {
    mode: 'pomodoro',       // pomodoro | flow
    phase: 'focus',         // focus | short | long
    running: false,
    cycle: 0,               // 完成的专注数（用于长休判断）
    taskId: null,
    // pomodoro: 目标秒数；flow: 累计秒数
    targetSec: 25 * 60,
    elapsedSec: 0,          // 已走秒数
    startedAt: null,        // 本次连续计时的起点戳
    accBefore: 0,           // 暂停前累计
  };
  let tick = null;
  const subs = [];

  function cfg() { return Store.s.settings; }
  function phaseSec() {
    const s = cfg();
    if (st.phase === 'focus') return s.focusMin * 60;
    if (st.phase === 'short') return s.shortMin * 60;
    return s.longMin * 60;
  }
  function remainSec() {
    if (st.mode === 'flow') return null;
    return Math.max(0, Math.round(phaseSec() - st.elapsedSec));
  }
  function fmt(sec) {
    sec = Math.max(0, Math.round(sec));
    const m = Math.floor(sec / 60), s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  }

  function persist() { localStorage.setItem(TKEY, JSON.stringify(st)); }
  function restore() {
    try {
      const raw = localStorage.getItem(TKEY);
      if (raw) { st = Object.assign(st, JSON.parse(raw)); }
      if (st.running && st.startedAt) {
        // 后台/刷新期间时间照走
        st.elapsedSec = st.accBefore + (Date.now() - st.startedAt) / 1000;
      }
    } catch (e) {}
  }

  function nowElapsed() {
    return st.running ? st.accBefore + (Date.now() - st.startedAt) / 1000 : st.accBefore;
  }

  function emit() { subs.forEach(fn => fn()); }

  function startLoop() {
    stopLoop();
    tick = setInterval(() => {
      if (!st.running) return;
      st.elapsedSec = nowElapsed();
      if (st.mode === 'pomodoro' && st.phase !== 'focus' && st.elapsedSec >= phaseSec()) {
        completeBreak();
      }
      // 专注阶段完成在 UI 层通过 remainSec<=0 检测，避免重复记录
      emit(); persist();
      document.title = (st.phase === 'focus' && st.running)
        ? `▶ ${fmt(remainSec() ?? st.elapsedSec)} · 支线工作台`
        : '支线工作台 SideQuest';
    }, 250);
  }
  function stopLoop() { if (tick) clearInterval(tick); tick = null; }

  let onFocusComplete = null; // 由 UI 注入：记录、庆祝、切阶段
  function completeBreak() {
    st.running = false; st.accBefore = 0; st.startedAt = null;
    nextPhase(); emit(); persist();
    UI.toast('休息结束，回来继续 🚀');
  }

  function nextPhase() {
    if (st.phase === 'focus') {
      st.cycle++;
      const s = cfg();
      st.phase = (st.cycle % s.longEvery === 0) ? 'long' : 'short';
    } else {
      st.phase = 'focus';
    }
    st.elapsedSec = 0; st.accBefore = 0; st.startedAt = null;
  }

  const api = {
    get state() { return st; },
    get remain() { return remainSec(); },
    fmt, phaseSec,
    subscribe(fn) { subs.push(fn); },
    setOnFocusComplete(fn) { onFocusComplete = fn; },

    restore,
    startLoop,

    isRunning: () => st.running,
    setMode(m) {
      st.mode = m; st.phase = 'focus'; st.elapsedSec = 0; st.accBefore = 0; st.startedAt = null; st.running = false;
      persist(); emit();
    },
    setTask(id) { st.taskId = id; persist(); emit(); },
    getTaskId: () => st.taskId,

    start() {
      if (st.running) return;
      if (st.mode === 'pomodoro') st.elapsedSec = 0, st.accBefore = 0; // 全新开始
      st.running = true; st.startedAt = Date.now();
      persist(); emit(); startLoop();
    },
    pause() {
      if (!st.running) return;
      st.accBefore = nowElapsed(); st.running = false; st.startedAt = null;
      persist(); emit();
    },
    toggle() { st.running ? api.pause() : api.start(); },
    reset() {
      st.running = false; st.elapsedSec = 0; st.accBefore = 0; st.startedAt = null;
      persist(); emit();
    },
    skip() { nextPhase(); persist(); emit(); },

    /** 完成一次专注（番茄钟走满 或 正计时手动结束）→ 记录并返回分钟数 */
    finishFocus() {
      const mins = Math.max(1, Math.round(nowElapsed() / 60));
      const rec = {
        id: Store.uid(), date: Store.todayStr(),
        start: Date.now() - nowElapsed() * 1000, end: Date.now(),
        minutes: mins, taskId: st.taskId, mode: st.mode,
      };
      Store.s.records.push(rec); Store.save();
      st.running = false; st.accBefore = 0; st.startedAt = null;
      nextPhase(); persist(); emit();
      if (onFocusComplete) onFocusComplete(mins, rec);
      return mins;
    },
    /** 专注是否已完成（番茄钟模式用） */
    focusDone() {
      return st.mode === 'pomodoro' && st.phase === 'focus' && st.elapsedSec >= phaseSec();
    },
    /** 正计时建议休息（>25分钟） */
    flowRestSuggest() {
      return st.mode === 'flow' && nowElapsed() > 25 * 60;
    },
  };
  return api;
})();
