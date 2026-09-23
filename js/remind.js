/* ═══════════ 任务提醒：应用内到点通知 + 重复滚动 + 手机日历(.ics)导出 ═══════════ */
const Reminders = (() => {
  const p2 = n => String(n).padStart(2, '0');
  const REPEAT_CN = { daily: '每天', weekly: '每周', monthly: '每月', yearly: '每年' };

  /* —— 调度 —— */
  let timer = null;

  function start() {
    stop();
    check();
    timer = setInterval(check, 30 * 1000);
    document.addEventListener('visibilitychange', () => { if (!document.hidden) check(); });
  }
  function stop() { if (timer) clearInterval(timer); timer = null; }

  /** 扫描到期提醒：通知一次；重复任务自动滚到下一个周期（下周期到点会再次提醒） */
  function check() {
    const now = Date.now();
    let dirty = false;
    (Store.s ? Store.s.tasks : []).forEach(t => {
      if (!t.remindAt || t.status === 'done') return;
      const at = new Date(t.remindAt).getTime();
      if (Number.isNaN(at) || at > now) return;
      if (t.lastFired === t.remindAt) return; // 这一次已经提醒过
      notify(t, now - at > 5 * 60e3); // 应用没开着时迟到的提醒加个标记
      t.lastFired = t.remindAt;
      dirty = true;
      if (t.repeat) {
        let next = t.remindAt;
        while (new Date(next).getTime() <= now) next = Store.nextOccurrence(next, t.repeat); // 错过的周期直接补进到未来
        t.remindAt = next;
        t.date = next.slice(0, 10);
        t.lastFired = '';
      }
    });
    if (dirty) { Store.save(); UI.refreshAll(); }
  }

  /** 到点通知：优先系统通知（Service Worker / Notification API），保底应用内 toast + 提示音 */
  function notify(t, missed) {
    const title = `⏰${missed ? '（已错过）' : ''} ${t.title}`;
    const body = `提醒时间 ${(t.remindAt || '').slice(11) || '--:--'}${t.repeat ? ' · ' + REPEAT_CN[t.repeat] : ''}`;
    if ('Notification' in window && Notification.permission === 'granted') {
      try {
        if (navigator.serviceWorker && navigator.serviceWorker.ready) {
          navigator.serviceWorker.ready.then(reg => reg.showNotification(title, { body, tag: 'sq-' + t.id })).catch(() => {});
        } else {
          new Notification(title, { body });
        }
      } catch (e) { /* 部分环境禁止直接 new Notification，走 toast */ }
    }
    UI.toast(`${title}　${body}`);
    try { Audio2.chime(); } catch (e) {}
  }

  async function requestPermission() {
    if (!('Notification' in window)) return false;
    if (Notification.permission === 'granted') return true;
    if (Notification.permission === 'denied') return false;
    try { return (await Notification.requestPermission()) === 'granted'; } catch (e) { return false; }
  }

  /* —— 手机日历：.ics 生成与下载（导入后由系统日历负责到点提醒，应用没开也会响） —— */
  const icsEsc = s => String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
  const fmtUtc = d => `${d.getUTCFullYear()}${p2(d.getUTCMonth() + 1)}${p2(d.getUTCDate())}T${p2(d.getUTCHours())}${p2(d.getUTCMinutes())}${p2(d.getUTCSeconds())}Z`;
  const fmtLocal = d => `${d.getFullYear()}${p2(d.getMonth() + 1)}${p2(d.getDate())}T${p2(d.getHours())}${p2(d.getMinutes())}00`;
  const RRULE = { daily: 'FREQ=DAILY', weekly: 'FREQ=WEEKLY', monthly: 'FREQ=MONTHLY', yearly: 'FREQ=YEARLY' };

  /** 单个任务 → VEVENT 文本（提醒时间即开始时间，含重复规则和到点闹钟） */
  function taskToIcs(t) {
    const start = t.remindAt || `${t.date || Store.todayStr()}T09:00`;
    const end = fmtLocal(new Date(new Date(start).getTime() + 30 * 60e3));
    const lines = [
      'BEGIN:VEVENT',
      `UID:${t.id}@sidequest`,
      `DTSTAMP:${fmtUtc(new Date())}`,
      `DTSTART:${start.replace(/-/g, '').replace(':', '')}00`,
      `DTEND:${end}`,
    ];
    if (t.repeat) lines.push(`RRULE:${RRULE[t.repeat]}`);
    lines.push(
      `SUMMARY:${icsEsc(t.title)}`,
      `DESCRIPTION:${icsEsc(t.notes || '')}`,
      'BEGIN:VALARM', 'TRIGGER:PT0S', 'ACTION:DISPLAY', `DESCRIPTION:${icsEsc(t.title)}`, 'END:VALARM',
      'END:VEVENT'
    );
    return lines.join('\r\n');
  }

  function downloadIcs(filename, events) {
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//SideQuest//Tasks//CN', 'CALSCALE:GREGORIAN']
      .concat(events, ['END:VCALENDAR']).join('\r\n');
    const blob = new Blob(['\ufeff' + ics], { type: 'text/calendar;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = filename.replace(/[\\/:*?"<>|]/g, '_');
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 5000);
  }

  /** 任务弹窗「添加到手机日历」：下载单任务 .ics，手机点开即导入 */
  function downloadTaskIcs(t) {
    if (!t) return;
    downloadIcs(`${t.title || '任务'}.ics`, [taskToIcs(t)]);
    UI.toast('📅 已生成日历文件，打开它即可导入手机日历');
  }

  /** 设置页：全部带日期/提醒的任务导出为一个日历文件 */
  function exportAllIcs() {
    const tasks = Store.s.tasks.filter(t => t.date || t.remindAt);
    if (!tasks.length) { UI.toast('还没有带日期或提醒的任务'); return; }
    downloadIcs(`sidequest-日历-${Store.todayStr()}.ics`, tasks.map(taskToIcs));
    UI.toast(`📅 已导出 ${tasks.length} 条任务到日历文件`);
  }

  return { start, stop, check, notify, requestPermission, taskToIcs, downloadTaskIcs, exportAllIcs };
})();
