/* ═══════════ UI v2：今日概览 / 月历计划 / 复盘日记 / 反向OKR / 画布切换 ═══════════ */
const UI = (() => {
  const $ = id => document.getElementById(id);
  let currentLinkRows = [], currentStepRows = [], editingTaskId = null;
  let pomodoroJustDone = false;
  const esc = s => { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; };

  const WEEK = '日一二三四五六';
  function cnDate(d) { return `${d.getFullYear()}年${d.getMonth() + 1}月${d.getDate()}日`; }

  /* —— 视图切换 —— */
  function switchPage(p) {
    Store.s.ui.page = p; Store.saveSoon();
    document.querySelectorAll('.page').forEach(s => s.classList.remove('active'));
    $(`page-${p}`).classList.add('active');
    document.querySelectorAll('.nav-item').forEach(b => b.classList.toggle('active', b.dataset.page === p));
    if (p === 'home') renderHome();
    if (p === 'focus') renderFocusPage();
    if (p === 'tasks') renderTasks();
    if (p === 'goals') renderGoals();
    if (p === 'stats') renderStats();
    if (p === 'settings') renderSettings();
    if (p === 'canvas') renderCanvasSwitcher();
  }
  const currentPage = () => Store.s.ui.page;
  const currentTaskId = () => Store.s.ui.focusTaskId;

  /* ═════════ 今日概览 ═════════ */
  function renderHome() {
    const h = new Date().getHours();
    $('greeting').textContent = h < 5 ? '夜深了 🌙' : h < 11 ? '早上好 ☀️' : h < 13 ? '中午好 🍚' : h < 18 ? '下午好 🫖' : '晚上好 🌆';
    const d = new Date();
    $('dateLine').textContent = `${cnDate(d)} · 星期${WEEK[d.getDay()]}`;
    $('streakNum').textContent = Store.streak();
    $('todayMinutes').textContent = Store.todayMinutes();
    renderCalendar();
    renderTodayTodos();
    renderReviewCard();
    renderInspiration();
    // 专注统计
    $('tileMinutes').textContent = Store.todayMinutes();
    $('tilePomos').textContent = Store.todayPomos();
    $('tileTasks').textContent = Store.s.tasks.filter(t => t.status === 'done').length;
    renderBars($('weekBars'), Store.lastNDays(7), true);
  }

  /* —— 月历 —— */
  function renderCalendar() {
    const ui = Store.s.ui;
    if (!ui.calMonth) ui.calMonth = Store.monthStr();
    const [y, m] = ui.calMonth.split('-').map(Number);
    $('calTitle').textContent = `${y}年${m}月`;
    const first = new Date(y, m - 1, 1);
    const startPad = (first.getDay() + 6) % 7; // 周一开头
    const daysInMonth = new Date(y, m, 0).getDate();
    const today = Store.todayStr();
    const grid = $('calGrid');
    grid.innerHTML = '';
    // 任务/复盘/专注 数据
    const taskCount = {}, reviewMark = {};
    Store.s.tasks.forEach(t => { if (t.date) taskCount[t.date] = (taskCount[t.date] || 0) + 1; });
    Object.keys(Store.s.reviews).forEach(d => { if (Store.reviewFilledCount(Store.s.reviews[d]) > 0) reviewMark[d] = true; });
    const maxMin = Math.max(10, ...Store.lastNDays(90).map(x => x.min));
    const minOn = d => Store.recordsOn(d).reduce((s, r) => s + r.minutes, 0);

    for (let i = 0; i < startPad; i++) grid.appendChild(Object.assign(document.createElement('div'), { className: 'cal-cell dim' }));
    for (let day = 1; day <= daysInMonth; day++) {
      const ds = `${y}-${Store.pad(m)}-${Store.pad(day)}`;
      const cell = document.createElement('div');
      cell.className = 'cal-cell' + (ds === today ? ' today' : '') + (ds === ui.selectedDate ? ' sel' : '');
      const min = minOn(ds);
      if (min > 0) {
        const heat = document.createElement('i');
        heat.className = 'heat';
        heat.style.height = Math.max(12, Math.round(min / maxMin * 100)) + '%';
        heat.style.opacity = String(0.15 + 0.5 * (min / maxMin));
        cell.appendChild(heat);
      }
      const num = document.createElement('span');
      num.textContent = day;
      cell.appendChild(num);
      const dots = document.createElement('span');
      dots.className = 'dots';
      if (taskCount[ds]) dots.appendChild(Object.assign(document.createElement('i'), { title: '有任务' }));
      if (reviewMark[ds]) dots.appendChild(Object.assign(document.createElement('i'), { className: 'rv', title: '已复盘' }));
      if (dots.children.length) cell.appendChild(dots);
      cell.onclick = () => { ui.selectedDate = ds; Store.saveSoon(); renderCalendar(); };
      grid.appendChild(cell);
    }
    fillPlans();
  }
  function fillPlans() {
    const ui = Store.s.ui, s = Store.s;
    const ds = ui.selectedDate || Store.todayStr();
    const wk = Store.weekStr(new Date(ds + 'T00:00:00'));
    const mo = ds.slice(0, 7);
    $('planDayLabel').textContent = `日计划 · ${ds === Store.todayStr() ? '今天' : ds.slice(5)}`;
    if (document.activeElement !== $('planDay')) $('planDay').value = Store.planOf('day', ds);
    if (document.activeElement !== $('planWeek')) $('planWeek').value = Store.planOf('week', wk);
    if (document.activeElement !== $('planMonth')) $('planMonth').value = Store.planOf('month', mo);
    // 当日任务
    const box = $('calDayTasks');
    const list = s.tasks.filter(t => t.date === ds);
    box.innerHTML = list.length
      ? `<b style="font-weight:600;color:var(--text2)">${ds === Store.todayStr() ? '今天' : ds.slice(5)}的任务（${list.length}）：</b>` + list.map(t =>
        `<div class="cdt"><span class="st">${t.status === 'done' ? '✅' : t.status === 'doing' ? '🟡' : '⚪'}</span><span style="${t.status === 'done' ? 'text-decoration:line-through;opacity:.6' : ''}">${esc(t.title)}</span></div>`).join('')
      : `<span style="color:var(--muted)">${ds} 暂无任务，在下方输入框加一个吧</span>`;
  }
  function bindPlans() {
    const save = (kind, keyOf) => {
      const ds = Store.s.ui.selectedDate || Store.todayStr();
      Store.setPlan(kind, keyOf(ds), $(`plan${kind[0].toUpperCase() + kind.slice(1)}`).value);
    };
    const deb = (fn) => { let t; return e => { if (document.activeElement !== e.target && e.type !== 'change') return; clearTimeout(t); t = setTimeout(fn, 500); }; };
    $('planDay').addEventListener('input', () => { clearTimeout(bindPlans._d); bindPlans._d = setTimeout(() => Store.setPlan('day', Store.s.ui.selectedDate || Store.todayStr(), $('planDay').value), 500); });
    $('planWeek').addEventListener('input', () => { clearTimeout(bindPlans._w); bindPlans._w = setTimeout(() => Store.setPlan('week', Store.weekStr(new Date((Store.s.ui.selectedDate || Store.todayStr()) + 'T00:00:00')), $('planWeek').value), 500); });
    $('planMonth').addEventListener('input', () => { clearTimeout(bindPlans._m); bindPlans._m = setTimeout(() => Store.setPlan('month', (Store.s.ui.selectedDate || Store.todayStr()).slice(0, 7), $('planMonth').value), 500); });
    $('calPrev').onclick = () => shiftMonth(-1);
    $('calNext').onclick = () => shiftMonth(1);
    $('calToday').onclick = () => {
      Store.s.ui.calMonth = Store.monthStr(); Store.s.ui.selectedDate = Store.todayStr();
      Store.saveSoon(); renderCalendar();
    };
    function shiftMonth(n) {
      const [y, m] = Store.s.ui.calMonth.split('-').map(Number);
      const d = new Date(y, m - 1 + n, 1);
      Store.s.ui.calMonth = `${d.getFullYear()}-${Store.pad(d.getMonth() + 1)}`;
      Store.saveSoon(); renderCalendar();
    }
  }

  /* —— 今日待办（含逾期） —— */
  function renderTodayTodos() {
    const today = Store.todayStr();
    const open = Store.s.tasks.filter(t => t.status !== 'done');
    const todays = open.filter(t => t.date === today);
    const overdue = open.filter(t => t.date && t.date < today);
    const undated = open.filter(t => !t.date);
    const list = $('todayTasks');
    list.innerHTML = '';
    if (!todays.length && !overdue.length && !undated.length) list.innerHTML = '<div class="task-empty">今天还没有任务，先扔一个进来 👆</div>';
    todays.forEach(t => list.appendChild(taskRow(t, { compact: true })));
    if (overdue.length) {
      const h = document.createElement('div');
      h.className = 'task-empty'; h.style.textAlign = 'left'; h.style.padding = '4px 2px';
      h.textContent = `⏰ 逾期 ${overdue.length} 项（改期还是干脆做掉？）`;
      list.appendChild(h);
      overdue.slice(0, 4).forEach(t => list.appendChild(taskRow(t, { compact: true })));
    }
    if (undated.length) {
      const h = document.createElement('div');
      h.className = 'task-empty'; h.style.textAlign = 'left'; h.style.padding = '4px 2px';
      h.textContent = '📥 待安排';
      list.appendChild(h);
      undated.slice(0, 4).forEach(t => list.appendChild(taskRow(t, { compact: true })));
    }
  }

  function renderBars(container, days, weekLabels) {
    const max = Math.max(10, ...days.map(d => d.min));
    container.innerHTML = days.map((d, i) => {
      const hh = Math.max(2, Math.round(d.min / max * 100));
      const isToday = i === days.length - 1;
      const lbl = weekLabels ? WEEK[new Date(d.date + 'T00:00:00').getDay()] : d.date.slice(5);
      return `<div class="wbar ${isToday ? 'today' : ''}" title="${d.date}：${d.min} 分钟"><i style="height:${hh}%"></i><span>${lbl}</span></div>`;
    }).join('');
  }

  /* —— 任务行（含删除） —— */
  function taskRow(t, { compact } = {}) {
    const row = document.createElement('div');
    row.className = 'task-row' + (t.status === 'done' ? ' done' : '');
    const stepsDone = (t.steps || []).filter(s => s.done).length;
    const meta = compact
      ? `${t.links?.length ? '🔗' + t.links.length : ''}${t.links?.length && t.est ? ' · ' : ''}${t.est ? '🍅' + t.est : ''}`
      : `${t.links?.length ? `🔗${t.links.length} ` : ''}🍅${t.est || 0}${t.steps?.length ? ` · 🪜${stepsDone}/${t.steps.length}` : ''}${t.date ? ` · ${t.date.slice(5)}` : ''}`;
    row.innerHTML = `
      <span class="task-dot ${t.status}"></span>
      <span class="task-title" title="点击编辑">${esc(t.title)}</span>
      <span class="task-meta">${meta}</span>
      <span class="task-acts">
        <button data-act="imm" title="进入沉浸模式">🚀</button>
        <button data-act="done" title="${t.status === 'done' ? '标记未完成' : '完成'}">${t.status === 'done' ? '↩' : '✓'}</button>
        <button data-act="del" class="del-btn" title="删除">🗑</button>
      </span>`;
    row.querySelector('.task-title').onclick = () => openTaskModal(t.id);
    row.querySelector('[data-act="imm"]').onclick = e => { e.stopPropagation(); enterImmersive(t.id); };
    row.querySelector('[data-act="done"]').onclick = e => {
      e.stopPropagation();
      if (t.status === 'done') { t.status = 'doing'; t.doneAt = null; }
      else {
        t.status = 'done'; t.doneAt = Date.now();
        confetti(); Audio2.chime(); toast('🎉 完成一个支线任务！');
      }
      Store.save(); refreshAll();
    };
    row.querySelector('[data-act="del"]').onclick = e => {
      e.stopPropagation();
      if (confirm(`删除任务「${t.title}」？`)) { Store.delTask(t.id); toast('已删除'); refreshAll(); }
    };
    return row;
  }

  /* ═════════ 复盘（马伯庸日记） ═════════ */
  const WEATHERS = ['☀️', '🌤️', '☁️', '🌧️', '⛈️', '❄️'];
  function renderReviewCard() {
    const today = Store.todayStr();
    const r = Store.reviewOf(today);
    const filled = Store.reviewFilledCount(r);
    $('reviewState').textContent = filled >= 6 ? '✅ 已完成' : filled > 0 ? `已填 ${filled}/6 节` : '还没开始';
    const pv = $('reviewPreview');
    if (!r || !filled) { pv.innerHTML = '<div class="rp"><span style="color:var(--muted)">花 3 分钟备份一下今天的大脑吧</span></div>'; return; }
    const firstTextLine = v => String(v || '').split('\n').filter(l => l.trim() && !l.trim().startsWith('!['))[0] || '';
    const rows = [
      ['📍', '要事', r.action], ['🍱', '生活', r.life], ['📚', '书账', r.books],
      ['⚡', '灵感', r.spark], ['🧠', '新知', r.knowledge],
    ].filter(x => (x[2] || '').trim());
    pv.innerHTML = rows.map(([e, k, v]) => `<div class="rp"><b>${e} ${k}</b><span>${esc(firstTextLine(v))}</span></div>`).join('') +
      (r.sleepStart ? `<div class="rp"><b>💤 睡眠</b><span>${esc(r.sleepStart)} → ${esc(r.sleepEnd || '?')} ${r.sleepScore ? '· ' + '⭐'.repeat(r.sleepScore) : ''}</span></div>` : '');
  }

  function openReview() {
    const ds = Store.todayStr();
    const r = Store.reviewEditor(ds);
    const d = new Date(ds + 'T00:00:00');
    $('rvTitle').textContent = '📅 每日复盘';
    $('rvDateLine').textContent = `${cnDate(d)} 星期${WEEK[d.getDay()]}`;
    const wx = $('rvWeathers');
    wx.innerHTML = '';
    WEATHERS.forEach(w => {
      const b = document.createElement('button');
      b.textContent = w; b.className = w === r.weather ? 'on' : '';
      b.onclick = () => { r.weather = w; Store.saveSoon(); wx.querySelectorAll('button').forEach(x => x.classList.remove('on')); b.classList.add('on'); };
      wx.appendChild(b);
    });
    $('rvAction').value = r.action || ''; $('rvLife').value = r.life || '';
    $('rvBooks').value = r.books || ''; $('rvSpark').value = r.spark || '';
    $('rvKnowledge').value = r.knowledge || '';
    $('rvSleepStart').value = r.sleepStart || ''; $('rvSleepEnd').value = r.sleepEnd || '';
    renderStars(r.sleepScore || 0);
    $('rvSaved').textContent = '自动保存已开启';
    $('reviewModal').classList.remove('hidden');
  }
  function renderStars(n) {
    const box = $('rvScoreStars');
    box.innerHTML = '';
    for (let i = 1; i <= 5; i++) {
      const s = document.createElement('span');
      s.textContent = '⭐'; if (i <= n) s.classList.add('on');
      s.onclick = () => {
        const r = Store.reviewEditor(Store.todayStr());
        r.sleepScore = i; Store.saveSoon(); renderStars(i);
      };
      box.appendChild(s);
    }
  }
  function bindReview() {
    const FIELDS = [['rvAction', 'action'], ['rvLife', 'life'], ['rvBooks', 'books'], ['rvSpark', 'spark'], ['rvKnowledge', 'knowledge']];
    let t = null;
    const saveAll = () => {
      const r = Store.reviewEditor(Store.todayStr());
      FIELDS.forEach(([id, key]) => r[key] = $(id).value);
      r.updatedAt = Date.now();
      Store.saveSoon();
      $('rvSaved').textContent = '已自动保存 ✓';
    };
    FIELDS.forEach(([id]) => {
      $(id).addEventListener('input', () => { clearTimeout(t); t = setTimeout(saveAll, 600); });
      // 📷 插入图片按钮：压缩后以 Markdown 图片语法写入光标处
      const ta = $(id);
      const row = document.createElement('div');
      row.className = 'img-row';
      const btn = document.createElement('button');
      btn.type = 'button'; btn.textContent = '📷 插入图片';
      btn.onclick = () => {
        const inp = document.createElement('input');
        inp.type = 'file'; inp.accept = 'image/*';
        inp.onchange = () => {
          const f = inp.files[0];
          if (!f) return;
          const r = new FileReader();
          r.onload = () => {
            const img = new Image();
            img.onload = () => {
              // 压缩到最长边 800px
              const s = Math.min(1, 800 / Math.max(img.width, img.height));
              const cv = document.createElement('canvas');
              cv.width = Math.max(1, Math.round(img.width * s));
              cv.height = Math.max(1, Math.round(img.height * s));
              cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
              const url = cv.toDataURL('image/jpeg', 0.82);
              const pos = ta.selectionStart ?? ta.value.length;
              const insert = `\n![图片](${url})\n`;
              ta.value = ta.value.slice(0, pos) + insert + ta.value.slice(pos);
              ta.selectionStart = ta.selectionEnd = pos + insert.length;
              saveAll(); ta.focus();
              toast('🖼 图片已插入');
            };
            img.src = r.result;
          };
          r.readAsDataURL(f);
        };
        inp.click();
      };
      row.appendChild(btn);
      ta.parentElement.insertBefore(row, ta);
    });
    $('rvSleepStart').addEventListener('change', () => { Store.reviewEditor(Store.todayStr()).sleepStart = $('rvSleepStart').value; Store.saveSoon(); });
    $('rvSleepEnd').addEventListener('change', () => { Store.reviewEditor(Store.todayStr()).sleepEnd = $('rvSleepEnd').value; Store.saveSoon(); });
    $('rvClose').onclick = $('rvDone').onclick = () => { clearTimeout(t); saveAll(); $('reviewModal').classList.add('hidden'); refreshAll(); };
    $('rvThrowSpark').onclick = () => {
      const spark = $('rvSpark').value.trim();
      if (!spark) { toast('先写点灵感 ✍️'); return; }
      CanvasApi.addSticky(spark);
      toast('🎨 灵感已扔到画布上');
    };
    $('btnOpenReview').onclick = openReview;
  }

  /* —— 灵感回顾 —— */
  function relTime(ts) {
    if (!ts) return '';
    const diff = Date.now() - ts;
    if (diff < 3600e3) return Math.max(1, Math.round(diff / 60e3)) + ' 分钟前';
    if (diff < 86400e3) return Math.round(diff / 3600e3) + ' 小时前';
    if (diff < 172800e3) return '昨天';
    return Store.todayStr(new Date(ts)).slice(5);
  }
  function renderInspiration() {
    const box = $('inspList');
    const items = [];
    Store.s.canvases.forEach(c => {
      (c.nodes || []).forEach(n => {
        if (n.type === 'sticky' && String(n.text || '').trim()) items.push({ c, n });
      });
    });
    items.sort((a, b) => (b.n.createdAt || 0) - (a.n.createdAt || 0));
    box.innerHTML = items.length ? '' : '<div class="insp-empty">画布上还没有便签，双击画布空白处创建第一张 🎨</div>';
    items.slice(0, 6).forEach(({ c, n }) => {
      const it = document.createElement('div');
      it.className = 'insp-item';
      it.innerHTML = `<span class="ii-color" style="background:${n.color || '#ffe58a'}"></span><span class="ii-text">${esc(String(n.text).split('\n')[0])}</span><span class="ii-meta">${esc(c.name)} · ${relTime(n.createdAt)}</span>`;
      it.onclick = () => {
        switchPage('canvas');
        CanvasApi.switchTo(c.id);
        setTimeout(() => { CanvasApi.select(n.id); }, 120);
      };
      box.appendChild(it);
    });
  }

  /* ═════════ 专注页 ═════════ */
  function renderFocusPage() {
    const sel = $('focusTaskSelect');
    const open = Store.s.tasks.filter(t => t.status !== 'done');
    sel.innerHTML = '<option value="">🎈 随便专注（不绑定任务）</option>' +
      open.map(t => `<option value="${t.id}" ${t.id === Store.s.ui.focusTaskId ? 'selected' : ''}>${esc(t.title)}</option>`).join('');
  }

  /* ═════════ 任务页 ═════════ */
  function renderTasks() {
    const f = Store.s.ui.filter || 'all';
    const list = $('allTasks');
    const tasks = Store.s.tasks.filter(t =>
      f === 'all' ? true : f === 'done' ? t.status === 'done' : t.status !== 'done');
    list.innerHTML = tasks.length ? '' : '<div class="task-empty">空空如也，点右上角「新任务」开一条支线</div>';
    tasks.forEach(t => list.appendChild(taskRow(t, { compact: false })));
  }

  /* ═════════ 目标页（反向 OKR） ═════════ */
  function renderGoals() {
    const growBox = $('goalsGrowing');
    const clusters = OKR.discover();
    // 已生成过目标的行为簇不再重复出现（按 bigram 相似度判断）
    const autoGoals = Store.s.goals.filter(g => g.auto && g.sig?.length);
    const candidates = clusters.filter(c =>
      !autoGoals.some(g => c.bigrams.filter(b => g.sig.includes(b)).length >= 2));
    growBox.innerHTML = candidates.length ? '' :
      '<div class="growing-empty">还没有可生长的行为。去打几个番茄、做几件小事、在复盘里记几行要事——重复 ≥3 次且跨 ≥2 天的行为会自动浮出 🌱</div>';
    candidates.slice(0, 6).forEach(c => {
      const card = document.createElement('div');
      card.className = 'grow-card';
      const recent = c.days.slice(-6);
      card.innerHTML = `
        <div class="grow-head">
          <span class="grow-keyword">「${esc(c.keyword)}」</span>
          <span class="grow-stats">出现 <b>${c.count}</b> 次 · 覆盖 <b>${c.days.length}</b> 天 · 共 <b>${c.minutes}</b> 分钟</span>
        </div>
        <div class="grow-days">${recent.map(d => `<i>${d.slice(5)}</i>`).join('')}${c.days.length > 6 ? `<i>…</i>` : ''}</div>
        <div class="grow-evidence">${esc(c.events.slice(-4).map(e => `${e.date.slice(5)} ${e.text}`).join(' ｜ '))}</div>`;
      const btn = document.createElement('button');
      btn.className = 'btn-primary';
      btn.textContent = '🌱 生长成 OKR';
      btn.onclick = () => {
        const g = OKR.growGoal(c);
        confetti(); toast(`🎯 目标已生成：「${g.title}」`);
        renderGoals();
      };
      card.appendChild(btn);
      growBox.appendChild(card);
    });

    const listBox = $('goalsList');
    listBox.innerHTML = Store.s.goals.length ? '' : '<div class="goals-empty">还没有目标。上面发现重复行为后点「生长成 OKR」，或右上角手动创建。</div>';
    Store.s.goals.forEach(g => {
      if (g.auto) {
        const doneNow = OKR.refreshProgress(g);
        if (doneNow === 'done') { Store.save(); confetti(); toast(`🏆 目标达成：「${g.title}」`); }
      }
      const card = document.createElement('div');
      card.className = 'goal-card' + (g.status === 'done' ? ' done' : '');
      const badge = g.status === 'done' ? '<span class="goal-badge done">✅ 已达成</span>' : g.status === 'dropped' ? '<span class="goal-badge" style="background:var(--card);color:var(--muted)">💤 已放下</span>' : '<span class="goal-badge">🌱 生长中</span>';
      card.innerHTML = `
        <div class="goal-head">
          <span class="goal-title">${esc(g.title)}</span>${badge}
        </div>
        ${g.source?.length ? `<div class="goal-source">长自：${esc([...new Set(g.source)].slice(0, 3).join('、'))}${g.source.length > 3 ? ' 等' : ''}</div>` : ''}`;
      const krBox = document.createElement('div');
      krBox.className = 'goal-kr';
      g.kr.forEach(k => {
        const cur = g.auto ? (k.current || 0) : (k.current || 0);
        const pct = Math.min(100, Math.round(cur / Math.max(1, k.target) * 100));
        const row = document.createElement('div');
        row.className = 'gkr' + (cur >= k.target ? ' full' : '');
        row.innerHTML = `
          <div class="gkr-top"><span>${esc(k.text)}</span><b>${cur}/${k.target} ${esc(k.unit || '')}</b></div>
          <div class="gkr-bar"><i style="width:${pct}%"></i></div>`;
        krBox.appendChild(row);
      });
      card.appendChild(krBox);
      const acts = document.createElement('div');
      acts.className = 'goal-acts';
      if (g.status === 'growing') {
        const doneB = mkBtn('✅ 标记达成', 'btn-secondary', () => { g.status = 'done'; Store.save(); confetti(); toast('🏆 干得漂亮！'); renderGoals(); });
        acts.appendChild(doneB);
        if (g.auto && (Store.s.settings.api?.key)) {
          const ai = mkBtn('✨ AI 润色', 'btn-ghost', async () => {
            ai.disabled = true; ai.textContent = '✨ 润色中…';
            try { await OKR.aiPolish(g); toast('✨ 已优化措辞'); renderGoals(); }
            catch (e) { toast('⚠️ 润色失败：' + e.message); ai.disabled = false; ai.textContent = '✨ AI 润色'; }
          });
          acts.appendChild(ai);
        }
      }
      if (g.status === 'growing' || g.status === 'done') {
        acts.appendChild(mkBtn('💤 放下', 'btn-ghost', () => { g.status = 'dropped'; Store.save(); renderGoals(); }));
      } else {
        acts.appendChild(mkBtn('🌱 重新生长', 'btn-ghost', () => { g.status = 'growing'; Store.save(); renderGoals(); }));
      }
      acts.appendChild(mkBtn('🗑 删除', 'btn-danger', () => {
        if (confirm(`删除目标「${g.title}」？`)) {
          Store.s.goals = Store.s.goals.filter(x => x.id !== g.id); Store.save(); renderGoals();
        }
      }));
      card.appendChild(acts);
      listBox.appendChild(card);
    });

    function mkBtn(text, cls, fn) { const b = document.createElement('button'); b.className = cls; b.textContent = text; b.onclick = fn; return b; }
  }
  function openGoalModal() {
    ['gmTitle', 'gmKr1t', 'gmKr1n', 'gmKr2t', 'gmKr2n', 'gmKr3t', 'gmKr3n'].forEach(id => $(id).value = '');
    $('goalModal').classList.remove('hidden');
    setTimeout(() => $('gmTitle').focus(), 50);
  }
  function bindGoalModal() {
    $('btnNewGoal').onclick = openGoalModal;
    $('gmClose').onclick = $('gmCancel').onclick = () => $('goalModal').classList.add('hidden');
    $('gmSave').onclick = () => {
      const title = $('gmTitle').value.trim();
      if (!title) { toast('先给目标起个名字 🌱'); return; }
      const krs = [];
      [['gmKr1t', 'gmKr1n'], ['gmKr2t', 'gmKr2n'], ['gmKr3t', 'gmKr3n']].forEach(([t, n]) => {
        if ($(t).value.trim()) krs.push({ text: $(t).value.trim(), target: +$(n).value || 1, unit: '次' });
      });
      if (!krs.length) { toast('至少写一条可量化的 KR'); return; }
      OKR.addManualGoal(title, krs);
      $('goalModal').classList.add('hidden');
      toast('🌱 目标已创建');
      renderGoals();
    };
  }

  /* ═════════ 统计 / 设置 ═════════ */
  function renderStats() {
    const recs = Store.s.records;
    $('stTotalMin').textContent = Math.round(recs.reduce((s, r) => s + r.minutes, 0));
    $('stTotalPomos').textContent = recs.length;
    $('stStreak').textContent = Store.streak();
    $('stDoneTasks').textContent = Store.s.tasks.filter(t => t.status === 'done').length;
    renderBars($('chart14'), Store.lastNDays(14), false);
    const byTask = {};
    recs.forEach(r => { if (r.taskId) byTask[r.taskId] = (byTask[r.taskId] || 0) + r.minutes; });
    const entries = Object.entries(byTask).map(([id, min]) => ({ min, name: Store.getTask(id)?.title || '（已删除任务）' })).sort((a, b) => b.min - a.min).slice(0, 6);
    const max = Math.max(1, ...entries.map(e => e.min));
    $('topTasks').innerHTML = entries.length
      ? entries.map(e => `<div class="top-task"><span class="tt-name">${esc(e.name)}</span><div class="tt-bar-wrap"><div class="tt-bar" style="width:${Math.round(e.min / max * 100)}%"></div></div><span class="tt-min">${e.min} 分钟</span></div>`).join('')
      : '<div class="task-empty">还没有专注记录，先来一个 25 分钟 🍅</div>';
  }
  function renderSettings() {
    const s = Store.s.settings;
    $('appVersion').textContent = '版本 ' + (window.APP_VERSION || '?');
    $('setFocusMin').value = s.focusMin; $('setShortMin').value = s.shortMin;
    $('setLongMin').value = s.longMin; $('setLongEvery').value = s.longEvery;
    $('setNoise').value = s.noise; $('setVolume').value = Math.round(s.volume * 100);
    $('setChime').value = s.chime; $('setTheme').value = s.theme;
    $('setApiUrl').value = s.api?.url || ''; $('setApiKey').value = s.api?.key || ''; $('setApiModel').value = s.api?.model || '';
  }
  function bindSettings() {
    const s = Store.s.settings;
    const num = (id, key, min, max) => {
      $(id).addEventListener('change', e => {
        let v = parseInt(e.target.value) || min;
        v = Math.max(min, Math.min(max, v)); e.target.value = v;
        s[key] = v; Store.save(); updateTimerText();
      });
    };
    num('setFocusMin', 'focusMin', 1, 120);
    num('setShortMin', 'shortMin', 1, 30);
    num('setLongMin', 'longMin', 1, 60);
    num('setLongEvery', 'longEvery', 2, 10);
    $('setNoise').addEventListener('change', e => { s.noise = e.target.value; Store.save(); setNoiseChips(e.target.value); Audio2.set(e.target.value); });
    $('setVolume').addEventListener('input', e => { s.volume = e.target.value / 100; Audio2.setVolume(s.volume); Store.saveSoon(); });
    $('setChime').addEventListener('change', e => { s.chime = +e.target.value; Store.save(); });
    $('setTheme').addEventListener('change', e => { s.theme = e.target.value; document.documentElement.dataset.theme = s.theme; Store.save(); });
    const apiSave = () => { s.api = s.api || {}; s.api.url = $('setApiUrl').value.trim() || 'https://open.bigmodel.cn/api/paas/v4/chat/completions'; s.api.key = $('setApiKey').value.trim(); s.api.model = $('setApiModel').value.trim() || 'glm-4-flash'; Store.saveSoon(); };
    ['setApiUrl', 'setApiKey', 'setApiModel'].forEach(id => $(id).addEventListener('input', apiSave));
    $('btnExport').onclick = exportData;
    $('btnImport').onclick = () => $('importFile').click();
    $('importFile').addEventListener('change', e => {
      const f = e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const o = JSON.parse(r.result);
          if (!Array.isArray(o.tasks)) throw 0;
          localStorage.setItem('sidequest.v1', JSON.stringify(o));
          Store.load(); applyTheme(); refreshAll(); toast('✅ 导入成功');
        } catch (err) { toast('⚠️ 文件格式不对'); }
      };
      r.readAsText(f); e.target.value = '';
    });
    $('btnSeed').onclick = () => { if (confirm('将覆盖当前数据，恢复示例数据？')) { Store.seed(); applyTheme(); refreshAll(); toast('已恢复示例数据'); } };
    $('btnWipe').onclick = () => { if (confirm('确定清空全部数据？此操作不可恢复。')) { Store.wipe(); applyTheme(); refreshAll(); toast('已清空'); } };
  }
  function applyTheme() { document.documentElement.dataset.theme = Store.s.settings.theme || 'dark'; }

  function exportData() {
    const blob = new Blob([JSON.stringify(Store.s, null, 2)], { type: 'application/json' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `sidequest-backup-${Store.todayStr()}.json`;
    a.click(); URL.revokeObjectURL(a.href);
    toast('💾 已导出备份');
  }

  /* ═════════ 任务弹窗 ═════════ */
  function openTaskModal(taskId) {
    editingTaskId = taskId;
    const t = taskId ? Store.getTask(taskId) : null;
    currentLinkRows = t ? JSON.parse(JSON.stringify(t.links || [])) : [{ id: Store.uid(), name: '', url: '' }];
    currentStepRows = t ? JSON.parse(JSON.stringify(t.steps || [])) : [];
    $('tmTitle').textContent = t ? '编辑任务' : '新任务';
    $('tmName').value = t ? t.title : '';
    $('tmDate').value = t ? (t.date || Store.todayStr()) : Store.todayStr();
    $('tmNotes').value = t ? t.notes : '';
    $('tmEst').value = t ? (t.est || 1) : 1;
    $('tmStatus').value = t ? t.status : 'todo';
    renderLinkRows(); renderStepRows();
    $('taskModal').classList.remove('hidden');
    setTimeout(() => $('tmName').focus(), 50);
  }
  function renderLinkRows() {
    const box = $('tmLinks');
    box.innerHTML = '';
    currentLinkRows.forEach((l, i) => {
      const row = document.createElement('div');
      row.className = 'tm-link-row';
      row.innerHTML = `<input class="lk-name" placeholder="名称" value="${esc(l.name)}"><input class="lk-url" placeholder="https://…" value="${esc(l.url)}"><button class="lk-del">✕</button>`;
      row.querySelector('.lk-name').addEventListener('input', e => l.name = e.target.value);
      row.querySelector('.lk-url').addEventListener('input', e => l.url = e.target.value);
      row.querySelector('.lk-del').onclick = () => { currentLinkRows.splice(i, 1); renderLinkRows(); };
      box.appendChild(row);
    });
  }
  function renderStepRows() {
    const box = $('tmSteps');
    box.innerHTML = '';
    currentStepRows.forEach((s, i) => {
      const row = document.createElement('div');
      row.className = 'tm-step-row' + (s.done ? ' done' : '');
      row.innerHTML = `<input type="checkbox" ${s.done ? 'checked' : ''}><span>${esc(s.text)}</span><button class="st-del">✕</button>`;
      row.querySelector('input').addEventListener('change', e => { s.done = e.target.checked; row.classList.toggle('done', s.done); });
      row.querySelector('.st-del').onclick = () => { currentStepRows.splice(i, 1); renderStepRows(); };
      box.appendChild(row);
    });
  }
  function saveTaskFromModal() {
    const name = $('tmName').value.trim();
    if (!name) { toast('任务名称不能为空哦'); return null; }
    let t = editingTaskId ? Store.getTask(editingTaskId) : null;
    if (!t) { t = Store.addTask(name, $('tmDate').value || Store.todayStr()); editingTaskId = t.id; }
    t.title = name; t.date = $('tmDate').value || null;
    t.notes = $('tmNotes').value;
    t.est = +$('tmEst').value || 1;
    const st = $('tmStatus').value;
    if (st === 'done' && t.status !== 'done') t.doneAt = Date.now();
    if (st !== 'done') t.doneAt = null;
    t.status = st;
    t.links = currentLinkRows.filter(l => l.url.trim());
    t.steps = currentStepRows.filter(s => s.text.trim()).map(s => ({ ...s, text: s.text.trim() }));
    Store.save();
    return t;
  }
  function bindTaskModal() {
    $('btnNewTask').onclick = () => openTaskModal(null);
    $('tmClose').onclick = $('tmCancel').onclick = () => { $('taskModal').classList.add('hidden'); refreshAll(); };
    $('tmAddLink').onclick = () => { currentLinkRows.push({ id: Store.uid(), name: '', url: '' }); renderLinkRows(); };
    $('tmAddStep').onclick = addStep;
    $('tmStepInput').addEventListener('keydown', e => { if (e.key === 'Enter') addStep(); });
    function addStep() {
      const v = $('tmStepInput').value.trim();
      if (!v) return;
      currentStepRows.push({ id: Store.uid(), text: v, done: false });
      $('tmStepInput').value = ''; renderStepRows();
    }
    $('tmSave').onclick = () => { if (saveTaskFromModal()) { toast('✅ 已保存'); $('taskModal').classList.add('hidden'); refreshAll(); } };
    $('tmDelete').onclick = () => {
      if (!editingTaskId) return;
      const t = Store.getTask(editingTaskId);
      if (t && confirm(`删除任务「${t.title}」？`)) { Store.delTask(editingTaskId); $('taskModal').classList.add('hidden'); refreshAll(); toast('已删除'); }
    };
    $('tmImmersive').onclick = () => {
      const t = saveTaskFromModal();
      if (t) { $('taskModal').classList.add('hidden'); enterImmersive(t.id); }
    };
  }

  /* ═════════ 沉浸模式 ═════════ */
  let immTaskId = null;
  function enterImmersive(taskId) {
    const t = Store.getTask(taskId);
    if (!t) return;
    immTaskId = taskId;
    Store.s.ui.focusTaskId = taskId; Timer.setTask(taskId); Store.saveSoon();
    CanvasApi.commitEdits();
    CanvasApi.setInImmersive(true);

    // 画布搬进沉浸层当背景（须先完成搬移再定位视角，否则量不到尺寸）
    const wrap = $('canvasWrap');
    $('immCanvasSlot').appendChild(wrap);
    $('immersive').classList.remove('hidden');
    $('immTaskName').textContent = t.title;
    CanvasApi.loadCamForTask(taskId);

    // 简报
    $('immNotes').textContent = t.notes || '（这个任务还没写备注）';
    const stepsBox = $('immSteps');
    stepsBox.innerHTML = (t.steps || []).length ? '' : '<div class="task-empty" style="padding:6px 0">还没有微步骤</div>';
    (t.steps || []).forEach(s => {
      const row = document.createElement('div');
      row.className = 'imm-step';
      row.innerHTML = `<input type="checkbox" ${s.done ? 'checked' : ''}><span style="${s.done ? 'text-decoration:line-through;color:var(--muted)' : ''}">${esc(s.text)}</span>`;
      row.querySelector('input').addEventListener('change', e => {
        s.done = e.target.checked;
        row.querySelector('span').style.textDecoration = s.done ? 'line-through' : '';
        row.querySelector('span').style.color = s.done ? 'var(--muted)' : '';
        Store.save();
        if ((t.steps || []).every(x => x.done) && t.steps.length) { confetti(); toast('🪜 微步骤全部完成！'); }
      });
      stepsBox.appendChild(row);
    });
    const listBox = $('immLinkList');
    listBox.innerHTML = (t.links || []).length ? '' : '<div class="task-empty" style="padding:6px 0">任务还没有链接材料</div>';
    (t.links || []).forEach(l => {
      const a = document.createElement('div');
      a.className = 'imm-link';
      a.textContent = `↗ ${l.name || l.url}`;
      a.onclick = () => window.open(l.url, '_blank');
      listBox.appendChild(a);
    });

    // 铺开窗口 + 同一手势里弹出新标签页（浏览器允许）
    const popNeeded = ImmWindows.openForTask(t);
    if (popNeeded.length) {
      const popped = popNeeded.map(l => window.open(l.url, '_blank')).filter(Boolean).length;
      if (popped < popNeeded.length) {
        const hint = $('immHint');
        hint.classList.remove('hidden');
        hint.innerHTML = `⚠️ 浏览器拦下了 ${popNeeded.length - popped} 个新标签页 <button class="btn-secondary" style="margin-left:8px">手动打开</button>`;
        hint.querySelector('button').onclick = () => { ImmWindows.popOpen(popNeeded); hint.classList.add('hidden'); };
        setTimeout(() => hint.classList.add('hidden'), 12000);
      }
    } else if (!(t.links || []).length) {
      const hint = $('immHint');
      hint.classList.remove('hidden');
      hint.textContent = '💡 在任务里添加链接，进来就会全部铺开；背景画布可以直接记灵感';
      setTimeout(() => hint.classList.add('hidden'), 6000);
    }

    // 自动开始专注
    if (!Timer.isRunning()) { Timer.start(); }
    Audio2.ensure();
    setNoiseChips(Store.s.settings.noise);
    Audio2.set(Store.s.settings.noise);
    updateTimerText();
    if (document.documentElement.requestFullscreen) document.documentElement.requestFullscreen().catch(() => {});
    toast('🚀 沉浸模式：材料已就位，开干！');
  }

  function exitImmersive() {
    $('immersive').classList.add('hidden');
    ImmWindows.clear();
    const wrap = $('canvasWrap');
    $('page-canvas').appendChild(wrap);
    CanvasApi.setInImmersive(false);
    CanvasApi.render();
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    refreshAll();
  }

  function bindImmersive() {
    $('immExit').onclick = exitImmersive;
    $('immToggle').onclick = () => Timer.toggle();
    $('immOpenAll').onclick = () => {
      const t = Store.getTask(immTaskId);
      if (t) { ImmWindows.popOpen(t.links || []); toast('⚡ 已在新标签页打开全部链接'); }
    };
    $('immBrief').onclick = () => $('immBriefPanel').classList.toggle('hidden');
    $('immFullscreen').onclick = () => {
      if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
      else document.documentElement.requestFullscreen().catch(() => {});
    };
    document.addEventListener('keydown', e => {
      if (e.key === 'Escape' && !$('immersive').classList.contains('hidden')) exitImmersive();
    });
  }

  /* ═════════ 画布切换器 ═════════ */
  function renderCanvasSwitcher() {
    $('csName').textContent = Store.activeCanvas().name;
    const panel = $('csPanel');
    panel.innerHTML = '';
    Store.s.canvases.forEach(c => {
      const it = document.createElement('div');
      it.className = 'cs-item' + (c.id === Store.s.activeCanvasId ? ' active' : '');
      it.innerHTML = `<span class="cs-n">${esc(c.name)}</span><span class="cs-cnt">${(c.nodes || []).length}</span>
        <button data-a="ren" title="重命名">✏️</button><button data-a="del" class="cs-del" title="删除">🗑</button>`;
      it.onclick = e => {
        if (e.target.closest('button')) return;
        CanvasApi.switchTo(c.id);
        panel.classList.add('hidden');
        $('csName').textContent = c.name;
      };
      it.querySelector('[data-a="ren"]').onclick = () => {
        textPrompt('重命名画布', '画布名称', c.name, v => {
          if (!v.trim()) return;
          c.name = v.trim(); Store.save();
          $('csName').textContent = c.name;
          renderCanvasSwitcher();
        });
      };
      it.querySelector('[data-a="del"]').onclick = () => {
        if (!confirm(`删除画布「${c.name}」及其全部内容？`)) return;
        if (Store.delCanvas(c.id)) {
          CanvasApi.switchTo(Store.s.activeCanvasId);
          renderCanvasSwitcher();
          toast('画布已删除');
        } else toast('至少保留一张画布');
      };
      panel.appendChild(it);
    });
    const add = document.createElement('button');
    add.className = 'cs-add';
    add.textContent = '＋ 新建画布';
    add.onclick = () => {
      textPrompt('新建画布', '画布名称', '', v => {
        const c = CanvasApi.switchTo(Store.addCanvas(v?.trim() || undefined).id);
        renderCanvasSwitcher();
        toast('🎨 新画布已就绪');
      });
    };
    panel.appendChild(add);
  }
  function bindCanvasSwitcher() {
    $('csBtn').onclick = e => {
      e.stopPropagation();
      $('csPanel').classList.toggle('hidden');
      renderCanvasSwitcher();
    };
    document.addEventListener('click', e => {
      if (!e.target.closest('.canvas-switcher')) $('csPanel').classList.add('hidden');
    });
  }

  /* ═════════ 计时器同步 ═════════ */
  const RING_LEN = 2 * Math.PI * 88;
  function updateTimerText() {
    const st = Timer.state;
    const isFocus = st.phase === 'focus';
    const remain = Timer.remain;
    const timeText = st.mode === 'flow' ? Timer.fmt(st.elapsedSec) : Timer.fmt(remain ?? 0);
    $('bigTime').textContent = timeText;
    $('phaseChip').textContent = st.mode === 'flow' ? (isFocus ? '🌊 正计时' : '休息') : (isFocus ? '🍅 专注' : (st.phase === 'short' ? '☕ 短休' : '🛋 长休'));
    $('phaseChip').classList.toggle('break', !isFocus);
    const task = Store.getTask(st.taskId);
    $('bigTask').textContent = task ? task.title : (st.mode === 'flow' ? '正计时中，做就完了' : '选择一个任务开始');
    const ring = $('ringFg');
    ring.classList.toggle('break', !isFocus);
    let frac = 0;
    if (st.mode === 'pomodoro') frac = Math.min(1, st.elapsedSec / Timer.phaseSec());
    else frac = (st.elapsedSec % (25 * 60)) / (25 * 60);
    ring.style.strokeDashoffset = RING_LEN * (1 - frac);
    const startBtn = $('btnStart');
    if (st.running) {
      startBtn.textContent = '⏸ 暂停';
      $('btnSkip').textContent = st.mode === 'flow' ? '✅ 完成并记录' : '⏭ 跳过';
    } else {
      const inProgress = st.elapsedSec > 0;
      startBtn.textContent = (st.mode === 'flow' && inProgress) ? '▶ 继续' : (isFocus ? '▶ 开始专注' : '▶ 开始休息');
      $('btnSkip').textContent = '⏭ 跳过';
    }
    $('miniTime').textContent = timeText;
    $('miniPhase').textContent = st.mode === 'flow' ? (isFocus ? '🌊 正计时' : '休息') : (isFocus ? '专注' : '休息');
    $('miniTask').textContent = task ? task.title : '未选择任务';
    $('miniTimer').classList.toggle('running', st.running);
    document.body.classList.toggle('timer-running', st.running);
    $('miniToggle').textContent = st.running ? '⏸' : '▶';
    $('immTimer').textContent = timeText;
  }

  function timerTick() {
    updateTimerText();
    if (Timer.focusDone() && !pomodoroJustDone) {
      pomodoroJustDone = true;
      const mins = Timer.finishFocus();
      if (Store.s.settings.chime) Audio2.chime();
      confetti();
      toast(`🍅 专注 ${mins} 分钟完成！休息一下`);
      refreshAll();
      setTimeout(() => { pomodoroJustDone = false; }, 800);
    }
  }

  function bindTimerUI() {
    $('btnStart').onclick = () => {
      if (Timer.isRunning()) Timer.pause();
      else {
        const wasIdle = Timer.state.elapsedSec === 0;
        Timer.start();
        Audio2.ensure();
        setNoiseChips(Store.s.settings.noise);
        Audio2.set(Store.s.settings.noise);
        if (wasIdle && Timer.state.mode === 'flow') toast('🌊 正计时开始，做就完了');
      }
      updateTimerText();
    };
    $('btnReset').onclick = () => { Timer.reset(); updateTimerText(); };
    $('btnSkip').onclick = () => {
      if (Timer.isRunning() && Timer.state.mode === 'flow') {
        const mins = Timer.finishFocus();
        if (Store.s.settings.chime) Audio2.chime();
        confetti(); toast(`⏱ 已记录 ${mins} 分钟，休息一下！`);
        refreshAll();
      } else { Timer.skip(); }
      updateTimerText();
    };
    $('miniToggle').onclick = e => { e.stopPropagation(); Timer.toggle(); updateTimerText(); };
    $('miniReset').onclick = e => { e.stopPropagation(); Timer.reset(); updateTimerText(); };
    $('miniTimer').onclick = () => { if (!immersiveOpen()) switchPage('home'); };
    $('tabPomodoro').onclick = () => setMode('pomodoro');
    $('tabFlow').onclick = () => setMode('flow');
    function setMode(m) {
      Timer.setMode(m); Store.s.settings.mode = m; Store.save();
      $('tabPomodoro').classList.toggle('active', m === 'pomodoro');
      $('tabFlow').classList.toggle('active', m === 'flow');
      updateTimerText();
    }
    document.querySelectorAll('.noise-chip').forEach(c => {
      c.onclick = () => {
        const n = c.dataset.noise;
        Store.s.settings.noise = n; Store.save();
        setNoiseChips(n);
        Audio2.ensure(); Audio2.set(n);
      };
    });
    Timer.setOnFocusComplete(() => {
      refreshAll();
    });
  }
  function setNoiseChips(n) {
    document.querySelectorAll('.noise-chip').forEach(c => c.classList.toggle('on', c.dataset.noise === n));
    $('miniNoise').textContent = { off: '', brown: '🟤', rain: '🌧', drizzle: '🌦', white: '⚪' }[n] || '';
  }

  /* ═════════ 反馈 ═════════ */
  function toast(msg) {
    const t = document.createElement('div');
    t.className = 'toast'; t.textContent = msg;
    $('toastWrap').appendChild(t);
    setTimeout(() => { t.style.opacity = '0'; t.style.transition = 'opacity .4s'; }, 2600);
    setTimeout(() => t.remove(), 3100);
  }
  function confetti() {
    const colors = ['#7c5cff', '#3ecf8e', '#ffc94d', '#ff6b6b', '#4da3ff', '#ff6bd6'];
    for (let i = 0; i < 50; i++) {
      const c = document.createElement('div');
      c.className = 'confetti';
      c.style.left = Math.random() * 100 + 'vw';
      c.style.background = colors[Math.floor(Math.random() * colors.length)];
      c.style.animationDuration = (2 + Math.random() * 1.6) + 's';
      c.style.animationDelay = (Math.random() * 0.5) + 's';
      c.style.transform = `rotate(${Math.random() * 360}deg)`;
      $('confettiWrap').appendChild(c);
      setTimeout(() => c.remove(), 4500);
    }
  }

  /* —— 通用文本输入弹窗（画布/重命名用） —— */
  function textPrompt(title, placeholder, value, cb) {
    const mask = document.createElement('div');
    mask.className = 'modal-mask';
    mask.style.zIndex = 1000;
    mask.innerHTML = `<div class="modal" style="width:min(440px,92vw)">
      <div class="modal-head"><h2>${esc(title)}</h2><button class="icon-btn" data-x>✕</button></div>
      <div class="modal-body"><input id="tpInput" placeholder="${esc(placeholder || '')}" value="${esc(value || '')}" style="background:var(--card2);border:1px solid var(--border);border-radius:9px;padding:10px 12px;font-size:13px;outline:none;color:var(--text)"></div>
      <div class="modal-foot"><span class="spacer"></span><button class="btn-ghost" data-x>取消</button><button class="btn-primary" data-ok>确定</button></div>
    </div>`;
    document.body.appendChild(mask);
    const input = mask.querySelector('#tpInput');
    setTimeout(() => { input.focus(); input.select(); }, 40);
    const close = () => mask.remove();
    mask.querySelectorAll('[data-x]').forEach(b => b.onclick = close);
    mask.addEventListener('click', e => { if (e.target === mask) close(); });
    const ok = () => { const v = input.value.trim(); close(); cb(v); };
    mask.querySelector('[data-ok]').onclick = ok;
    input.addEventListener('keydown', e => { if (e.key === 'Enter') ok(); });
  }
  const urlPrompt = (placeholder, cb) => textPrompt('🔗 添加链接', placeholder, '', cb);

  const immersiveOpen = () => !$('immersive').classList.contains('hidden');

  function refreshAll() {
    const p = Store.s.ui.page;
    if (p === 'home') renderHome();
    else if (p === 'tasks') renderTasks();
    else if (p === 'stats') renderStats();
    else if (p === 'goals') renderGoals();
    else if (p === 'focus') renderFocusPage();
  }

  return {
    switchPage, currentPage, currentTaskId,
    renderHome, renderTasks, renderStats, renderSettings, renderFocusPage, renderGoals,
    bindSettings, bindPlans, bindReview, bindGoalModal, bindCanvasSwitcher, applyTheme,
    bindTaskModal, bindImmersive, bindTimerUI,
    enterImmersive, exitImmersive, updateTimerText, timerTick,
    toast, confetti, textPrompt, urlPrompt, refreshAll, setNoiseChips,
    immersiveOpen,
  };
})();
