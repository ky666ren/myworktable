/* ═══════════ 无限画布：便签/文字/箭头/图片/视频/符号/链接卡片 ═══════════ */

/* —— 链接类型识别（windows.js 也复用） —— */
function detectMedia(url) {
  try {
    const u = new URL(url);
    const h = u.hostname.replace(/^www\./, '');
    const ends = d => h === d || h.endsWith('.' + d);
    if (ends('bilibili.com')) {
      const bv = u.pathname.match(/\/video\/(BV[\w]+)/i);
      if (bv) return { kind: 'video', embed: `https://player.bilibili.com/player.html?bvid=${bv[1]}&autoplay=0&danmaku=0`, title: 'B站视频' };
      const av = u.pathname.match(/\/video\/av(\d+)/i);
      if (av) return { kind: 'video', embed: `https://player.bilibili.com/player.html?aid=${av[1]}&autoplay=0`, title: 'B站视频' };
      return { kind: 'blocked', title: 'B站' };
    }
    if (h === 'b23.tv') return { kind: 'blocked', title: 'B站短链' };
    if (ends('youtube.com')) {
      const v = u.searchParams.get('v');
      if (v) return { kind: 'video', embed: `https://www.youtube.com/embed/${v}`, title: 'YouTube 视频' };
      return { kind: 'blocked', title: 'YouTube' };
    }
    if (h === 'youtu.be' && u.pathname.length > 1)
      return { kind: 'video', embed: `https://www.youtube.com/embed/${u.pathname.slice(1)}`, title: 'YouTube 视频' };
    if (h === 'vimeo.com') {
      const m = u.pathname.match(/\/(\d+)/);
      if (m) return { kind: 'video', embed: `https://player.vimeo.com/video/${m[1]}`, title: 'Vimeo' };
    }
    if (ends('douyin.com')) return { kind: 'blocked', title: '抖音视频' };
    if (ends('xiaohongshu.com') || ends('xhslink.com')) return { kind: 'blocked', title: '小红书' };
    if (ends('feishu.cn') || ends('larksuite.com') || ends('feishu.cn')) return { kind: 'blocked', title: '飞书文档' };
    if (['weibo.com', 'zhihu.com', 'v.qq.com', 'iqiyi.com', 'youku.com', 'taobao.com', 'jd.com',
         'twitter.com', 'x.com', 'instagram.com', 'facebook.com', 'tiktok.com', 'notion.so', 'notion.site',
         'docs.qq.com', 'kdocs.cn', 'dingtalk.com'].some(ends)) return { kind: 'blocked', title: '' };
    if (/\.(mp4|webm|ogg|mov)(\?|$)/i.test(u.pathname)) return { kind: 'file-video', embed: url, title: '视频文件' };
    if (/\.(png|jpe?g|gif|webp|svg|bmp)(\?|$)/i.test(u.pathname)) return { kind: 'image', title: '图片' };
    return { kind: 'iframe-try', title: '网页' };
  } catch (e) { return { kind: 'iframe-try', title: '网页' }; }
}

const CanvasApi = (() => {
  const STICKY_COLORS = ['#ffe58a', '#a7f3d0', '#bfdbfe', '#fbcfe8', '#ddd6fe', '#fed7aa'];
  const SYMBOLS = ['⭐', '❗', '✅', '🔥', '💡', '🚀', '⚠️', '❓', '❤️', '🎯', '📌', '👀'];
  let cam = { x: 300, y: 120, z: 1 };
  let tool = 'select';
  let selectedId = null;
  let arrowFrom = null;      // 箭头工具：第一个节点
  let spaceHeld = false, panning = null, dragging = null, resizing = null;
  let undoStack = [];
  let inImmersive = false;

  const wrapEl = () => document.getElementById('canvasWrap');
  const worldEl = () => document.getElementById('world');
  const arrowLayerEl = () => document.getElementById('arrowLayer');

  function data() { return Store.activeCanvas(); }
  const uid = Store.uid;

  function snapshot() {
    undoStack.push(JSON.stringify({ nodes: data().nodes, arrows: data().arrows }));
    if (undoStack.length > 60) undoStack.shift();
  }
  function undo() {
    const s = undoStack.pop();
    if (!s) { UI.toast('没有可撤销的了'); return; }
    const o = JSON.parse(s);
    data().nodes = o.nodes; data().arrows = o.arrows;
    selectedId = null; Store.save(); render(); UI.toast('↶ 已撤销');
  }

  /* —— 坐标变换 —— */
  function toWorld(cx, cy) {
    const r = wrapEl().getBoundingClientRect();
    return { x: (cx - r.left - cam.x) / cam.z, y: (cy - r.top - cam.y) / cam.z };
  }
  let camSaveT = null;
  function applyCam() {
    const tf = `translate(${cam.x}px, ${cam.y}px) scale(${cam.z})`;
    worldEl().style.transform = tf;
    const al = arrowLayerEl();
    if (al) al.style.transform = tf;
    const bg = document.getElementById('canvasBg');
    if (bg) bg.style.backgroundPosition = `${cam.x}px ${cam.y}px`, bg.style.backgroundSize = `${26 * cam.z}px ${26 * cam.z}px`;
    const zl = document.getElementById('zoomLabel');
    if (zl) zl.textContent = Math.round(cam.z * 100) + '%';
    // 相机归属当前画布，防抖保存
    clearTimeout(camSaveT);
    camSaveT = setTimeout(() => { const c = data(); if (c) { c.cam = { ...cam }; Store.saveSoon(); } }, 500);
  }
  function saveCam() { clearTimeout(camSaveT); const c = data(); if (c) { c.cam = { ...cam }; Store.saveSoon(); } }

  /* —— 渲染 —— */
  function render() {
    const world = worldEl();
    // 复用未变化的视频/图片节点，避免 iframe 被重载
    const keep = new Map();
    world.querySelectorAll('.node').forEach(el => {
      const t = data().nodes.find(n => n.id === el.dataset.id);
      if (t && (t.type === 'video') && el.querySelector('iframe') &&
          el.querySelector('iframe').src === (t.embed || '')) keep.set(t.id, el);
    });
    world.innerHTML = '';
    arrowLayerEl().innerHTML = '';
    for (const n of data().nodes) {
      if (keep.has(n.id)) { world.appendChild(keep.get(n.id)); continue; }
      world.appendChild(buildNode(n));
    }
    drawArrows();
    applyCam();
  }

  function esc(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }

  function buildNode(n) {
    const el = document.createElement('div');
    el.className = `node node-${n.type}` + (n.id === selectedId ? ' selected' : '');
    el.dataset.id = n.id;
    el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
    if (n.w) el.style.width = n.w + 'px';
    if (n.h) el.style.height = n.h + 'px';
    el.style.zIndex = n.z || 1;

    if (n.type === 'sticky') {
      const d = document.createElement('div');
      d.className = 'node-sticky'; d.style.background = n.color || '#ffe58a';
      d.textContent = n.text || '';
      if (n.editing) { d.classList.add('editing'); d.contentEditable = 'true'; el._editEl = d; setTimeout(() => { d.focus(); placeCaretEnd(d); }, 30); }
      el.appendChild(d);
    } else if (n.type === 'text') {
      const d = document.createElement('div');
      d.className = 'node-text'; d.textContent = n.text || '';
      if (n.fontSize) d.style.fontSize = n.fontSize + 'px';
      if (n.editing) { d.classList.add('editing'); d.contentEditable = 'true'; el._editEl = d; setTimeout(() => { d.focus(); placeCaretEnd(d); }, 30); }
      el.appendChild(d);
    } else if (n.type === 'symbol') {
      const d = document.createElement('div');
      d.className = 'node-symbol'; d.textContent = n.symbol || '⭐';
      el.appendChild(d);
    } else if (n.type === 'image') {
      const img = document.createElement('img');
      img.src = n.src; img.draggable = false;
      img.onerror = () => { img.style.minHeight = '60px'; img.alt = '图片加载失败'; };
      el.appendChild(img);
    } else if (n.type === 'video') {
      let embed = n.embed;
      if (!embed && n.url) { const dm = detectMedia(n.url); if (dm.embed) { embed = dm.embed; n.embed = embed; } }
      if (embed) {
        const bar = document.createElement('div');
        bar.className = 'v-drag';
        bar.innerHTML = `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🎬 ${esc(n.title || '视频')}</span>`;
        el.appendChild(bar);
        const f = document.createElement('iframe');
        f.src = embed; f.allowFullscreen = true;
        f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        f.setAttribute('referrerpolicy', 'no-referrer');
        el.appendChild(f);
      } else {
        n.type = 'link';
        el.className = 'node node-link';
        el.innerHTML = `<div class="nl-head"><span class="fav">🔗</span><span>视频链接</span></div><div class="nl-body"><a class="nl-open" href="${esc(n.url)}" target="_blank" rel="noopener">↗ 打开</a></div>`;
      }
    } else if (n.type === 'link') {
      let fav = '🔗', host = '';
      try { host = new URL(n.url).hostname.replace(/^www\./, ''); } catch (e) {}
      const dm = detectMedia(n.url);
      if (dm.title) fav = dm.title.includes('抖音') ? '🎵' : dm.title.includes('小红书') ? '📕' : dm.title.includes('飞书') ? '📘' : '🔗';
      el.innerHTML = `
        <div class="nl-head"><span class="fav">${fav}</span><span style="overflow:hidden;text-overflow:ellipsis">${esc(n.title || host)}</span></div>
        <div class="nl-body">
          <div style="flex:1;overflow:hidden">${esc(n.note || host)}</div>
          <a class="nl-open" href="${esc(n.url)}" target="_blank" rel="noopener">↗ 打开</a>
        </div>`;
    }

    if (n.id === selectedId && ['sticky', 'text', 'image', 'video', 'link'].includes(n.type)) {
      const h = document.createElement('div');
      h.className = 'handle'; h.dataset.id = n.id;
      el.appendChild(h);
    }
    return el;
  }

  function placeCaretEnd(d) {
    const r = document.createRange(); r.selectNodeContents(d); r.collapse(false);
    const s = getSelection(); s.removeAllRanges(); s.addRange(r);
  }

  /* —— 箭头 —— */
  function nodeCenter(n) { return { x: n.x + (n.w || 100) / 2, y: n.y + (n.h || 60) / 2 }; }
  function rectEdge(from, to) {
    const hw = (from.w || 100) / 2, hh = (from.h || 60) / 2;
    const c = nodeCenter(from), t = nodeCenter(to);
    let dx = t.x - c.x, dy = t.y - c.y;
    if (dx === 0 && dy === 0) return c;
    const sx = dx === 0 ? Infinity : hw / Math.abs(dx);
    const sy = dy === 0 ? Infinity : hh / Math.abs(dy);
    const s = Math.min(sx, sy);
    return { x: c.x + dx * s, y: c.y + dy * s };
  }
  function drawArrows() {
    const svg = arrowLayerEl();
    svg.innerHTML = '';
    const NS = 'http://www.w3.org/2000/svg';
    for (const a of data().arrows) {
      const A = data().nodes.find(n => n.id === a.from), B = data().nodes.find(n => n.id === a.to);
      if (!A || !B) continue;
      const p1 = rectEdge(A, B), p2 = rectEdge(B, A);
      const mx = (p1.x + p2.x) / 2, my = (p1.y + p2.y) / 2;
      const d = `M ${p1.x} ${p1.y} Q ${mx} ${my} ${p2.x} ${p2.y}`;
      const color = a.color || '#7c5cff';
      const path = document.createElementNS(NS, 'path');
      path.setAttribute('d', d); path.setAttribute('fill', 'none');
      path.setAttribute('stroke', color); path.setAttribute('stroke-width', 2.5);
      path.setAttribute('stroke-linecap', 'round');
      svg.appendChild(path);
      // 箭头头部
      const ang = Math.atan2(p2.y - my, p2.x - mx);
      const L = 11;
      const head = document.createElementNS(NS, 'polygon');
      const hx = p2.x, hy = p2.y;
      head.setAttribute('points', `${hx},${hy} ${hx - L * Math.cos(ang - 0.42)},${hy - L * Math.sin(ang - 0.42)} ${hx - L * Math.cos(ang + 0.42)},${hy - L * Math.sin(ang + 0.42)}`);
      head.setAttribute('fill', color);
      svg.appendChild(head);
      // 点击热区
      const hit = document.createElementNS(NS, 'path');
      hit.setAttribute('d', d); hit.setAttribute('fill', 'none');
      hit.setAttribute('stroke', 'transparent'); hit.setAttribute('stroke-width', 14);
      hit.setAttribute('class', 'arrow-hit'); hit.dataset.arrowId = a.id;
      svg.appendChild(hit);
    }
  }

  /* —— 节点操作 —— */
  function addNode(n, { silent } = {}) {
    snapshot();
    n.id = n.id || uid(); n.z = n.z || (maxZ() + 1); n.createdAt = Date.now();
    data().nodes.push(n); Store.saveSoon(); render();
    if (!silent) select(n.id);
    return n;
  }
  function maxZ() { return data().nodes.reduce((m, n) => Math.max(m, n.z || 1), 1); }
  function delNode(id) {
    snapshot();
    data().nodes = data().nodes.filter(n => n.id !== id);
    data().arrows = data().arrows.filter(a => a.from !== id && a.to !== id);
    if (selectedId === id) { selectedId = null; hideSelToolbar(); }
    Store.saveSoon(); render();
  }
  function select(id) {
    selectedId = id; arrowFrom = null;
    document.querySelectorAll('.node').forEach(e => e.classList.toggle('selected', e.dataset.id === id));
    const n = data().nodes.find(x => x.id === id);
    if (n) showSelToolbar(n); else hideSelToolbar();
  }
  function bringFront(n) { n.z = maxZ() + 1; Store.saveSoon(); render(); }

  /* —— 选中工具条 —— */
  function showSelToolbar(n) {
    const tb = document.getElementById('selToolbar');
    tb.innerHTML = '';
    if (n.type === 'sticky') {
      STICKY_COLORS.forEach(c => {
        const b = document.createElement('button');
        b.className = 'c-dot' + (n.color === c ? ' sel' : '');
        b.style.background = c;
        b.onclick = () => { n.color = c; Store.saveSoon(); render(); showSelToolbar(n); };
        tb.appendChild(b);
      });
      tb.appendChild(sep());
    }
    if (n.type === 'symbol') {
      const b = document.createElement('button'); b.textContent = '🔁';
      b.title = '换个符号';
      b.onclick = () => {
        const i = SYMBOLS.indexOf(n.symbol);
        n.symbol = SYMBOLS[(i + 1) % SYMBOLS.length]; Store.saveSoon(); render(); showSelToolbar(n);
      };
      tb.appendChild(b);
    }
    const front = document.createElement('button'); front.textContent = '⬆'; front.title = '置顶';
    front.onclick = () => bringFront(n);
    tb.appendChild(front);
    const del = document.createElement('button'); del.textContent = '🗑'; del.title = '删除';
    del.onclick = () => delNode(n.id);
    tb.appendChild(del);
    // 定位到节点上方（屏幕坐标）
    const r = wrapEl().getBoundingClientRect();
    tb.classList.remove('hidden');
    const sx = (n.x + (n.w || 100) / 2) * cam.z + cam.x + r.left;
    const sy = n.y * cam.z + cam.y + r.top - 46;
    tb.style.left = sx - tb.offsetWidth / 2 + 'px';
    tb.style.top = sy + 'px';
  }
  function sep() { const s = document.createElement('span'); s.className = 'tool-sep'; return s; }
  function hideSelToolbar() { document.getElementById('selToolbar').classList.add('hidden'); }

  /* —— 工具切换 —— */
  function setTool(t) {
    tool = t; arrowFrom = null;
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
    const sp = document.getElementById('symbolPalette');
    if (t === 'symbol') { renderSymbolPalette(); sp.classList.remove('hidden'); }
    else sp.classList.add('hidden');
    wrapEl().style.cursor = t === 'select' ? 'default' : 'crosshair';
  }
  function renderSymbolPalette() {
    const sp = document.getElementById('symbolPalette');
    sp.innerHTML = '';
    SYMBOLS.forEach(s => {
      const b = document.createElement('button'); b.textContent = s;
      b.onclick = () => { pendingSymbol = s; UI.toast(`已选 ${s}，点击画布放置`); };
      sp.appendChild(b);
    });
  }
  let pendingSymbol = '⭐';

  /* —— 事件 —— */
  function bindEvents() {
    const wrap = wrapEl();

    wrap.addEventListener('wheel', e => {
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      if (e.ctrlKey || !e.shiftKey) { // 缩放（跟随光标）
        const factor = Math.exp(-e.deltaY * 0.0016);
        const nz = Math.min(2.5, Math.max(0.2, cam.z * factor));
        cam.x = mx - (mx - cam.x) * (nz / cam.z);
        cam.y = my - (my - cam.y) * (nz / cam.z);
        cam.z = nz;
      } else { // shift+滚轮横向平移
        cam.x -= e.deltaY;
      }
      applyCam(); hideSelToolbar();
      if (selectedId) { const n = data().nodes.find(x => x.id === selectedId); if (n) showSelToolbar(n); }
    }, { passive: false });

    wrap.addEventListener('mousedown', e => {
      if (e.button === 1 || spaceHeld || (e.button === 0 && tool === 'select' && !e.target.closest('.node') && !e.target.closest('.canvas-toolbar') && !e.target.closest('.zoom-ctrl') && !e.target.closest('.sel-toolbar'))) {
        panning = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y };
        wrap.style.cursor = 'grabbing';
        e.preventDefault();
        return;
      }
      const handle = e.target.closest('.handle');
      if (handle) {
        const n = data().nodes.find(x => x.id === handle.dataset.id);
        resizing = { n, sx: e.clientX, sy: e.clientY, w: n.w, h: n.h };
        setIframesPE('none');
        e.preventDefault(); return;
      }
      const nodeEl = e.target.closest('.node');
      if (!nodeEl) {
        if (tool === 'select') { select(null); }
        return;
      }
      const n = data().nodes.find(x => x.id === nodeEl.dataset.id);
      if (!n) return;

      // 编辑中不拖拽
      if (nodeEl._editEl || (e.target.isContentEditable)) return;
      // 编辑收尾
      commitEdits();

      if (tool === 'select') {
        if (selectedId !== n.id) select(n.id);
        dragging = { n, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false };
        setIframesPE('none');
        e.preventDefault();
      } else if (tool === 'arrow') {
        if (!arrowFrom) { arrowFrom = n.id; UI.toast('已选起点，再点一个节点连箭头'); }
        else if (arrowFrom !== n.id) {
          snapshot();
          data().arrows.push({ id: uid(), from: arrowFrom, to: n.id, color: '#7c5cff' });
          arrowFrom = null; Store.saveSoon(); render();
          UI.toast('➡ 已连接');
        }
      } else if (tool === 'symbol') {
        snapshot();
        addNode({ type: 'symbol', x: n.x + (n.w || 100) + 14, y: n.y, w: 56, h: 56, symbol: pendingSymbol });
        UI.toast(`${pendingSymbol} 放好啦`);
      }
    });

    document.addEventListener('mousemove', e => {
      if (panning) {
        cam.x = panning.cx + (e.clientX - panning.sx);
        cam.y = panning.cy + (e.clientY - panning.sy);
        applyCam();
      } else if (dragging) {
        const dx = (e.clientX - dragging.sx) / cam.z, dy = (e.clientY - dragging.sy) / cam.z;
        if (Math.abs(dx) + Math.abs(dy) > 1) dragging.moved = true;
        dragging.n.x = dragging.ox + dx; dragging.n.y = dragging.oy + dy;
        const el = document.querySelector(`.node[data-id="${dragging.n.id}"]`);
        if (el) { el.style.left = dragging.n.x + 'px'; el.style.top = dragging.n.y + 'px'; }
        drawArrows(); hideSelToolbar();
      } else if (resizing) {
        resizing.n.w = Math.max(60, resizing.w + (e.clientX - resizing.sx) / cam.z);
        resizing.n.h = Math.max(40, resizing.h + (e.clientY - resizing.sy) / cam.z);
        const el = document.querySelector(`.node[data-id="${resizing.n.id}"]`);
        if (el) { el.style.width = resizing.n.w + 'px'; el.style.height = resizing.n.h + 'px'; }
      }
    });

  function setIframesPE(v) { worldEl().querySelectorAll('iframe').forEach(f => f.style.pointerEvents = v); }

  document.addEventListener('mouseup', () => {
    if (panning) { panning = null; wrap.style.cursor = tool === 'select' ? 'default' : 'crosshair'; saveCam(); }
    if (dragging) { if (dragging.moved) { Store.saveSoon(); const n = dragging.n; if (selectedId === n.id) showSelToolbar(n); } dragging = null; setIframesPE(''); }
    if (resizing) { resizing = null; Store.saveSoon(); setIframesPE(''); }
  });

    // 双击：空白→便签；节点→编辑（桌面鼠标）
    wrap.addEventListener('dblclick', e => {
      e.preventDefault();
      dblAction(e.clientX, e.clientY);
    });

    // 触屏双击
    bindTouch();

    // 编辑结束保存
    document.addEventListener('focusout', e => {
      if (e.target.isContentEditable) {
        setTimeout(() => {
          if (document.activeElement && document.activeElement.isContentEditable) return;
          commitEdits();
        }, 100);
      }
    }, true);

    // 符号工具：点空白直接放
    wrap.addEventListener('click', e => {
      if (tool !== 'symbol' || e.target.closest('.node') || e.target.closest('.canvas-toolbar')) return;
      const p = toWorld(e.clientX, e.clientY);
      snapshot();
      addNode({ type: 'symbol', x: p.x - 28, y: p.y - 28, w: 56, h: 56, symbol: pendingSymbol });
    });

    // 箭头热区点击删除
    arrowLayerEl().addEventListener('click', e => {
      const hit = e.target.closest('.arrow-hit');
      if (hit) {
        snapshot();
        data().arrows = data().arrows.filter(a => a.id !== hit.dataset.arrowId);
        Store.saveSoon(); render();
      }
    });

    // 键盘
    document.addEventListener('keydown', e => {
      const inField = e.target.matches('input,textarea,select,[contenteditable="true"]');
      if (e.code === 'Space' && !inField && UI.currentPage() === 'canvas' && !inImmersive) { spaceHeld = true; wrap.style.cursor = 'grab'; e.preventDefault(); }
      if (inField) return;
      if (UI.currentPage() !== 'canvas' || inImmersive) return;
      if (e.key === 'Delete' || e.key === 'Backspace') { if (selectedId) { delNode(selectedId); } }
      if (e.key === 'Escape') { select(null); setTool('select'); }
      if (e.key === 'v' || e.key === 'V') setTool('select');
      if (e.key === 'n' || e.key === 'N') setTool('sticky');
      if (e.key === 't' || e.key === 'T') setTool('text');
      if (e.key === 'a' || e.key === 'A') setTool('arrow');
      if (e.key === 's' || e.key === 'S') setTool('symbol');
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); }
    });
    document.addEventListener('keyup', e => {
      if (e.code === 'Space') { spaceHeld = false; if (UI.currentPage() === 'canvas') wrap.style.cursor = tool === 'select' ? 'default' : 'crosshair'; }
    });

    // 图片工具 → 文件选择
    document.getElementById('imgFileInput').addEventListener('change', e => {
      [...e.target.files].forEach(f => addImageFile(f));
      e.target.value = '';
    });

    // 拖拽图片文件进画布
    wrap.addEventListener('dragover', e => { e.preventDefault(); });
    wrap.addEventListener('drop', e => {
      e.preventDefault();
      const files = [...(e.dataTransfer.files || [])].filter(f => f.type.startsWith('image/'));
      const p = toWorld(e.clientX, e.clientY);
      files.forEach((f, i) => addImageFile(f, { x: p.x + i * 30, y: p.y + i * 30 }));
      const html = e.dataTransfer.getData('text/html');
      const url = e.dataTransfer.getData('text/uri-list');
      if (!files.length && (url || html)) {
        const m = (url || html).match(/https?:\/\/[^\s"'<>]+/);
        if (m) addLinkOrVideoFromUrl(m[0], p);
      }
    });

    // 粘贴：图片文件 → 图片节点；文本 → 便签
    document.addEventListener('paste', e => {
      if (UI.currentPage() !== 'canvas' || inImmersive) return;
      if (e.target.matches('input,textarea,[contenteditable="true"]')) return;
      const items = [...(e.clipboardData?.items || [])];
      const imgItem = items.find(i => i.type.startsWith('image/'));
      if (imgItem) {
        const f = imgItem.getAsFile();
        const p = viewCenter();
        addImageFile(f, p);
        e.preventDefault(); return;
      }
      const text = e.clipboardData?.getData('text/plain');
      if (text && text.trim()) {
        const p = viewCenter();
        snapshot();
        addNode({ type: 'sticky', x: p.x, y: p.y, w: 190, h: 140, color: STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)], text: text.trim().slice(0, 500) });
        UI.toast('📋 已粘贴成便签');
        e.preventDefault();
      }
    });

    // 缩放按钮
    document.getElementById('zoomIn').onclick = () => zoomBy(1.2);
    document.getElementById('zoomOut').onclick = () => zoomBy(1 / 1.2);
    document.getElementById('zoomFit').onclick = fitView;
    document.getElementById('btnUndo').onclick = undo;

    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => {
      b.onclick = () => {
        const t = b.dataset.tool;
        if (t === 'image') { document.getElementById('imgFileInput').click(); return; }
        if (t === 'link') { promptUrl(); return; }
        setTool(t);
      };
    });
  }

  function zoomBy(f) {
    const r = wrapEl().getBoundingClientRect();
    const mx = r.width / 2, my = r.height / 2;
    const nz = Math.min(2.5, Math.max(0.2, cam.z * f));
    cam.x = mx - (mx - cam.x) * (nz / cam.z);
    cam.y = my - (my - cam.y) * (nz / cam.z);
    cam.z = nz; applyCam();
  }

  function commitEdits() {
    let changed = false;
    document.querySelectorAll('.node [contenteditable="true"]').forEach(el => {
      const nodeEl = el.closest('.node');
      const n = data().nodes.find(x => x.id === nodeEl?.dataset.id);
      if (!n) return;
      const txt = el.innerText.replace(/\n{3,}/g, '\n\n').trimEnd();
      if (n.text !== txt) { snapshot(); n.text = txt; changed = true; }
      delete n.editing;
      // 记录自然尺寸（文字节点）
      nodeEl._editEl = null;
      if (n.type === 'text') { n.w = Math.max(30, el.offsetWidth); n.h = Math.max(22, el.offsetHeight); }
      if (n.type === 'sticky' && (!n.h || n.h < 80)) n.h = 100;
    });
    if (changed) Store.saveSoon();
    render();
  }

  function viewCenter() {
    const r = wrapEl().getBoundingClientRect();
    return toWorld(r.left + r.width / 2, r.top + r.height / 2);
  }

  function addImageFile(file, pos) {
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => {
        const p = pos || viewCenter();
        const scale = Math.min(1, 300 / Math.max(img.width, 1));
        snapshot();
        addNode({ type: 'image', x: p.x, y: p.y, w: Math.round(img.width * scale), h: Math.round(img.height * scale), src: reader.result });
        UI.toast('🖼 图片已放上画布');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }

  /** URL → 视频节点或链接卡片（含浮动输入条） */
  function promptUrl() {
    UI.urlPrompt('粘贴链接（B站/YouTube 自动内嵌播放，其他变成卡片）', url => {
      if (!url) return;
      addLinkOrVideoFromUrl(url, viewCenter());
    });
  }

  function addLinkOrVideoFromUrl(url, p) {
    url = url.trim();
    if (!/^https?:\/\//i.test(url)) url = 'https://' + url;
    const dm = detectMedia(url);
    snapshot();
    if (dm.kind === 'video') {
      addNode({ type: 'video', x: p.x, y: p.y, w: 420, h: 260, url, embed: dm.embed, title: dm.title });
      UI.toast('🎬 视频已内嵌到画布');
    } else if (dm.kind === 'image') {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 320 / Math.max(img.width, 1));
        addNode({ type: 'image', x: p.x, y: p.y, w: Math.round(img.width * scale), h: Math.round(img.height * scale), src: url });
      };
      img.onerror = () => { addNode({ type: 'link', x: p.x, y: p.y, w: 230, h: 130, url, title: '图片', note: url }); };
      img.src = url;
    } else {
      let host = url; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {}
      const label = dm.title ? `${dm.title} · ${host}` : host;
      addNode({ type: 'link', x: p.x, y: p.y, w: 230, h: 130, url, title: label, note: '' });
      UI.toast(dm.kind === 'blocked' ? '🔗 该站不允许内嵌，已做成卡片（点击打开）' : '🔗 链接已放上画布');
    }
  }

  function fitView() {
    const nodes = data().nodes;
    const r = wrapEl().getBoundingClientRect();
    const W = r.width > 50 ? r.width : window.innerWidth - 216;
    const H = r.height > 50 ? r.height : window.innerHeight;
    if (!nodes.length) { cam = { x: W / 2, y: H / 2, z: 1 }; applyCam(); return; }
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    nodes.forEach(n => {
      minX = Math.min(minX, n.x); minY = Math.min(minY, n.y);
      maxX = Math.max(maxX, n.x + (n.w || 100)); maxY = Math.max(maxY, n.y + (n.h || 80));
    });
    const pad = 80;
    const z = Math.min(1.4, Math.min(W / (maxX - minX + pad * 2), H / (maxY - minY + pad * 2)));
    cam.z = Math.max(0.2, z);
    cam.x = (W - (maxX + minX) * cam.z) / 2;
    cam.y = (H - (maxY + minY) * cam.z) / 2;
    applyCam(); saveCam();
  }

  function loadCamForTask(taskId) {
    const t = taskId ? Store.getTask(taskId) : null;
    if (t && t.cam) { cam = { ...t.cam }; applyCam(); }
    else fitView();
  }

  /** 双击/双触 的统一行为：空白→建便签；便签/文字→编辑；链接卡片→打开 */
  function dblAction(clientX, clientY) {
    const wrap = wrapEl();
    const el = document.elementFromPoint(clientX, clientY);
    const nodeEl = el ? el.closest('.node') : null;
    if (!nodeEl) {
      if (tool !== 'select') return;
      const p = toWorld(clientX, clientY);
      const n = addNode({ type: 'sticky', x: p.x - 90, y: p.y - 20, w: 190, h: 140, color: STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)], text: '' });
      n.editing = true; render();
      return;
    }
    const n = data().nodes.find(x => x.id === nodeEl.dataset.id);
    if (!n) return;
    if (n.type === 'sticky' || n.type === 'text') {
      commitEdits();
      n.editing = true; render();
    } else if (n.type === 'link') {
      window.open(n.url, '_blank');
    }
  }

  /* —— 触屏手势：单指拖节点/平移，双指捏合缩放，双击=双击 —— */
  let touchLastTap = { t: 0, x: 0, y: 0 };
  function bindTouch() {
    const wrap = wrapEl();
    let ts = null; // touch state

    const hitNode = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return el ? el.closest('#canvasWrap .node') : null;
    };
    const interactiveEl = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return el ? el.closest('.canvas-toolbar, .zoom-ctrl, .sel-toolbar, .symbol-palette, a, input, textarea, [contenteditable="true"]') : null;
    };

    wrap.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        const [a, b] = e.touches;
        ts = { mode: 'pinch', d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2, cam: { ...cam } };
        e.preventDefault(); return;
      }
      if (e.touches.length !== 1 || tool !== 'select') return;
      const t = e.touches[0];
      if (interactiveEl(t.clientX, t.clientY)) return;
      commitEdits();
      const nodeEl = hitNode(t.clientX, t.clientY);
      if (nodeEl && !nodeEl.querySelector('iframe')) {
        const n = data().nodes.find(x => x.id === nodeEl.dataset.id);
        if (n) { ts = { mode: 'node', sx: t.clientX, sy: t.clientY, n, ox: n.x, oy: n.y, t0: Date.now(), moved: false }; e.preventDefault(); return; }
      }
      if (!nodeEl) {
        ts = { mode: 'pan', sx: t.clientX, sy: t.clientY, cx: cam.x, cy: cam.y, t0: Date.now(), moved: false };
        e.preventDefault();
      }
    }, { passive: false });

    wrap.addEventListener('touchmove', e => {
      if (!ts) return;
      if (ts.mode === 'pinch') {
        if (e.touches.length >= 2) {
          const [a, b] = e.touches;
          const d = Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY);
          const cx = (a.clientX + b.clientX) / 2, cy = (a.clientY + b.clientY) / 2;
          const nz = Math.min(2.5, Math.max(0.2, ts.cam.z * (d / ts.d)));
          const r = wrap.getBoundingClientRect();
          const mx = cx - r.left, my = cy - r.top;
          cam.x = mx - (mx - ts.cam.x) * (nz / ts.cam.z) + (cx - ts.cx);
          cam.y = my - (my - ts.cam.y) * (nz / ts.cam.z) + (cy - ts.cy);
          cam.z = nz;
          applyCam(); hideSelToolbar();
        }
        e.preventDefault(); return;
      }
      if (e.touches.length === 1) {
        const t = e.touches[0];
        const dx = t.clientX - ts.sx, dy = t.clientY - ts.sy;
        if (!ts.moved && Math.hypot(dx, dy) > 8) {
          ts.moved = true;
          if (ts.mode === 'node') { select(ts.n.id); setIframesPE('none'); }
        }
        if (ts.moved) {
          if (ts.mode === 'node') {
            ts.n.x = ts.ox + dx / cam.z; ts.n.y = ts.oy + dy / cam.z;
            const el = document.querySelector(`.node[data-id="${ts.n.id}"]`);
            if (el) { el.style.left = ts.n.x + 'px'; el.style.top = ts.n.y + 'px'; }
            drawArrows(); hideSelToolbar();
          } else {
            cam.x = ts.cx + dx; cam.y = ts.cy + dy;
            applyCam();
          }
        }
        e.preventDefault();
      }
    }, { passive: false });

    wrap.addEventListener('touchend', e => {
      if (!ts) return;
      const st = ts; ts = null;
      if (st.mode === 'pinch') { saveCam(); return; }
      if (st.moved) {
        if (st.mode === 'node') { Store.saveSoon(); setIframesPE(''); if (selectedId === st.n.id) showSelToolbar(st.n); }
        else saveCam();
        return;
      }
      // 未移动 = 轻点：识别双击
      const now = Date.now();
      const isDouble = now - touchLastTap.t < 350 && Math.hypot(touchLastTap.x - st.sx, touchLastTap.y - st.sy) < 32;
      touchLastTap = { t: now, x: st.sx, y: st.sy };
      if (isDouble) {
        touchLastTap = { t: 0, x: 0, y: 0 };
        dblAction(st.sx, st.sy);
        return;
      }
      if (st.mode === 'node') select(st.n.id);
      else select(null);
    });
  }

  /* —— 多画布切换 —— */
  function switchTo(id) {
    commitEdits();
    const target = Store.s.canvases.find(c => c.id === id);
    if (!target) return;
    const cur = data();
    if (cur) cur.cam = { ...cam };
    Store.s.activeCanvasId = id; Store.save();
    undoStack = []; selectedId = null; arrowFrom = null; hideSelToolbar();
    cam = (target.cam && target.cam.z >= 0.2) ? { ...target.cam } : { x: 300, y: 120, z: 1 };
    render();
  }

  function init() {
    bindEvents();
    bindTouch();
    const c = data();
    if (c && c.cam && c.cam.z >= 0.2 && c.cam.z <= 2.5) cam = { ...c.cam };
    render();
  }

  return {
    init, render, setTool, fitView, undo, loadCamForTask,
    addNode, addSticky: (text, color) => addNode({ type: 'sticky', x: 200 + Math.random() * 300, y: 200 + Math.random() * 200, w: 190, h: 140, color: color || STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)], text }),
    select: id => select(id), commitEdits, fit: fitView,
    setInImmersive: v => { inImmersive = v; },
    cam: () => ({ ...cam }),
    switchTo, current: () => data(),
  };
})();
