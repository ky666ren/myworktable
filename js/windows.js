/* ═══════════ 沉浸模式：多链接窗口（iframe 内嵌 / 卡片降级 / 拖拽缩放） ═══════════ */
const ImmWindows = (() => {
  let layer = null;
  let zTop = 100;
  let seq = 0;

  function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

  function faviconFor(url, dm) {
    try {
      const h = new URL(url).hostname.replace(/^www\./, '');
      if (dm.title?.includes('抖音')) return '🎵';
      if (dm.title?.includes('小红书')) return '📕';
      if (dm.title?.includes('飞书')) return '📘';
      if (h.includes('bilibili')) return '📺';
      if (h.includes('youtube')) return '▶️';
      return '🌐';
    } catch (e) { return '🌐'; }
  }

  function shortName(link) {
    return link.name || (() => { try { return new URL(link.url).hostname.replace(/^www\./, ''); } catch (e) { return link.url.slice(0, 30); } })();
  }

  function clear() { if (layer) layer.innerHTML = ''; zTop = 100; seq = 0; }

  function createWindow(link, opts = {}) {
    if (!layer) return null;
    const dm = detectMedia(link.url);
    const win = document.createElement('div');
    win.className = 'imm-window';
    const W = opts.w || Math.min(620, Math.max(420, layer.clientWidth * 0.44));
    const H = opts.h || Math.min(460, Math.max(320, layer.clientHeight * 0.6));
    const off = (seq++) * 34;
    win.style.width = W + 'px'; win.style.height = H + 'px';
    win.style.left = Math.min(24 + off, Math.max(10, layer.clientWidth - W - 10)) + 'px';
    win.style.top = Math.min(16 + off, Math.max(10, layer.clientHeight - H - 10)) + 'px';
    win.style.zIndex = ++zTop;

    const fav = faviconFor(link.url, dm);
    const name = shortName(link);
    win.innerHTML = `
      <div class="iw-bar">
        <span class="iw-fav">${fav}</span>
        <span class="iw-name">${esc(name)}</span>
        <button class="iw-act" data-act="reload" title="刷新">⟳</button>
        <button class="iw-act" data-act="pop" title="在新标签页打开">↗</button>
        <button class="iw-act" data-act="close" title="关闭">✕</button>
      </div>
      <div class="iw-body"></div>
      <div class="iw-resize"></div>`;
    layer.appendChild(win);
    win.querySelector('[data-act="close"]').onclick = () => win.remove();
    win.querySelector('[data-act="pop"]').onclick = () => window.open(link.url, '_blank');
    win.querySelector('[data-act="reload"]').onclick = () => {
      const body = win.querySelector('.iw-body');
      const f = body.querySelector('iframe');
      if (f) f.src = f.src; else fillBody(win, link, dm);
    };

    fillBody(win, link, dm);

    // 拖拽 & 缩放 & 聚焦
    const bar = win.querySelector('.iw-bar');
    bar.addEventListener('mousedown', e => {
      if (e.target.closest('.iw-act')) return;
      focusWin(win);
      const sx = e.clientX, sy = e.clientY, ox = win.offsetLeft, oy = win.offsetTop;
      setIframePE(win, 'none');
      const mv = ev => {
        win.style.left = Math.max(-W + 120, Math.min(ox + ev.clientX - sx, layer.clientWidth - 80)) + 'px';
        win.style.top = Math.max(0, Math.min(oy + ev.clientY - sy, layer.clientHeight - 36)) + 'px';
      };
      const up = () => { setIframePE(win, ''); document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
      e.preventDefault();
    });
    win.addEventListener('mousedown', () => focusWin(win));
    const rz = win.querySelector('.iw-resize');
    rz.addEventListener('mousedown', e => {
      focusWin(win);
      const sx = e.clientX, sy = e.clientY, ow = win.offsetWidth, oh = win.offsetHeight;
      setIframePE(win, 'none');
      const mv = ev => {
        win.style.width = Math.max(260, ow + ev.clientX - sx) + 'px';
        win.style.height = Math.max(160, oh + ev.clientY - sy) + 'px';
      };
      const up = () => { setIframePE(win, ''); document.removeEventListener('mousemove', mv); document.removeEventListener('mouseup', up); };
      document.addEventListener('mousemove', mv); document.addEventListener('mouseup', up);
      e.preventDefault(); e.stopPropagation();
    });
    return win;
  }

  function setIframePE(win, v) { win.querySelectorAll('iframe').forEach(f => f.style.pointerEvents = v); }
  function focusWin(win) { win.style.zIndex = ++zTop; layer.querySelectorAll('.imm-window').forEach(w => w.classList.remove('focused')); win.classList.add('focused'); }

  function fillBody(win, link, dm) {
    const body = win.querySelector('.iw-body');
    body.innerHTML = '';
    if (dm.kind === 'video' || dm.kind === 'file-video') {
      const f = document.createElement('iframe');
      f.src = dm.embed; f.allowFullscreen = true; f.setAttribute('referrerpolicy', 'no-referrer');
      f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
      body.appendChild(f);
      return;
    }
    if (dm.kind === 'iframe-try') {
      const f = document.createElement('iframe');
      f.src = link.url; f.setAttribute('referrerpolicy', 'no-referrer');
      let loaded = false;
      f.addEventListener('load', () => { loaded = true; });
      body.appendChild(f);
      setTimeout(() => {
        if (!loaded && win.isConnected && body.contains(f)) showBlocked(body, link, dm, '这个网站不允许被内嵌到其他页面');
      }, 4200);
      return;
    }
    showBlocked(body, link, dm, dm.kind === 'blocked' ? `${dm.title || '该网站'}不允许被内嵌，点下面直达` : '无法内嵌');
  }

  function showBlocked(body, link, dm, msg) {
    const fav = faviconFor(link.url, dm);
    body.innerHTML = `
      <div class="iw-blocked">
        <div style="font-size:34px">${fav}</div>
        <div>${esc(msg)}</div>
        <button class="btn-primary" style="margin-top:4px">↗ 在新标签页打开</button>
      </div>`;
    body.querySelector('button').onclick = () => window.open(link.url, '_blank');
  }

  /** 进入沉浸模式：按任务链接铺开窗口。返回需要新标签页打开的链接列表 */
  function openForTask(task) {
    clear();
    const popNeeded = [];
    (task.links || []).forEach(l => {
      const dm = detectMedia(l.url);
      if (dm.kind === 'blocked') popNeeded.push(l);
      createWindow(l);
    });
    return popNeeded;
  }

  function popOpen(links) { links.forEach(l => window.open(l.url, '_blank')); }

  function init() { layer = document.getElementById('immWindows'); }

  return { init, clear, openForTask, popOpen, createWindow };
})();
