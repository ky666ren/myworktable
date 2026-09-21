/* ═══════════ 灵感画布 v3：工具互斥 / 节点详情 / Markdown 便签 / 标签+双链 / 卡片流 ═══════════ */

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
    if (ends('feishu.cn') || ends('larksuite.com')) return { kind: 'blocked', title: '飞书文档' };
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
  let arrowFrom = null;
  let spaceHeld = false, panning = null, dragging = null, resizing = null;
  let undoStack = [];
  let inImmersive = false;
  let viewMode = 'canvas';      // canvas | gallery
  let galleryFilter = null;     // 标签字符串或 null
  let pendingSymbol = '⭐';     // emoji 字符串或 {src: dataURL}
  let detailId = null;          // 详情面板当前节点

  const wrapEl = () => document.getElementById('canvasWrap');
  const worldEl = () => document.getElementById('world');
  const arrowLayerEl = () => document.getElementById('arrowLayer');

  function data() { return Store.activeCanvas(); }
  const uid = Store.uid;

  /* ═════════ Markdown 渲染 ═════════ */
  function escHtml(s) { const d = document.createElement('div'); d.textContent = s ?? ''; return d.innerHTML; }
  function mdToHtml(text) {
    let h = escHtml(text || '');
    h = h.replace(/^###\s+(.+)$/gm, '<h5>$1</h5>').replace(/^##\s+(.+)$/gm, '<h4>$1</h4>').replace(/^#\s+(.+)$/gm, '<h4>$1</h4>');
    h = h.replace(/\*\*([^*]+)\*\*/g, '<b>$1</b>');
    h = h.replace(/\*([^*\n]+)\*/g, '<i>$1</i>');
    h = h.replace(/==([^=]+)==/g, '<mark>$1</mark>');
    h = h.replace(/~~([^~]+)~~/g, '<s>$1</s>');
    h = h.replace(/`([^`\n]+)`/g, '<code>$1</code>');
    h = h.replace(/\[\[([^\]]+)\]\]/g, (m, t) => `<span class="wikilink" data-target="${escAttr(t)}">🔗${escHtml(t)}</span>`);
    h = h.replace(/(^|[\s（(【])#([\w\u4e00-\u9fa5\/\-]{1,40})/g, (m, p, tag) => `${p}<span class="ntag" data-tag="${escAttr(tag)}">#${escHtml(tag)}</span>`);
    h = h.replace(/\n/g, '<br>');
    return h;
  }
  const escAttr = s => String(s ?? '').replace(/"/g, '&quot;');
  function stickyTitle(n) {
    const first = (n.text || '').split('\n')[0] || '';
    return first
      .replace(/^[\p{Extended_Pictographic}\s#=\*`~>-]+/u, '')  // 剥离 emoji/空白/Markdown 前缀
      .replace(/[*`~=]/g, '')
      .trim().slice(0, 40);
  }
  function parseTagsOf(text) {
    const out = new Set();
    String(text || '').replace(/(^|[\s（(【])#([\w\u4e00-\u9fa5\/\-]{1,40})/g, (m, p, t) => { out.add(t); return p; });
    return [...out];
  }
  function parseWikiLinks(text) {
    return [...String(text || '').matchAll(/\[\[([^\]]+)\]\]/g)].map(m => m[1].trim()).filter(Boolean);
  }

  /* ═════════ 基础 ═════════ */
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
    clearTimeout(camSaveT);
    camSaveT = setTimeout(() => { const c = data(); if (c) { c.cam = { ...cam }; Store.saveSoon(); } }, 500);
  }
  function saveCam() { clearTimeout(camSaveT); const c = data(); if (c) { c.cam = { ...cam }; Store.saveSoon(); } }

  /* ═════════ 渲染 ═════════ */
  function render() {
    const world = worldEl();
    const keep = new Map();
    world.querySelectorAll('.node').forEach(el => {
      const t = data().nodes.find(n => n.id === el.dataset.id);
      if (t && t.type === 'video' && el.querySelector('iframe') && el.querySelector('iframe').dataset.src === (t.embed || '')) keep.set(t.id, el);
    });
    world.innerHTML = '';
    arrowLayerEl().innerHTML = '';
    for (const n of data().nodes) {
      if (keep.has(n.id)) { world.appendChild(keep.get(n.id)); continue; }
      world.appendChild(buildNode(n));
    }
    drawArrows();
    applyCam();
    applyToolPE();
    if (detailId && !data().nodes.find(n => n.id === detailId)) closeDetail();
  }

  function buildNode(n) {
    const el = document.createElement('div');
    el.className = `node node-${n.type}` + (n.id === selectedId ? ' selected' : '');
    el.dataset.id = n.id;
    el.style.left = n.x + 'px'; el.style.top = n.y + 'px';
    if (n.w) el.style.width = n.w + 'px';
    if (n.h) el.style.height = n.h + 'px';
    el.style.zIndex = n.z || 1;

    if (n.type === 'sticky' || n.type === 'text') {
      const d = document.createElement('div');
      d.className = 'node-sticky md-body';
      d.style.background = n.type === 'sticky' ? (n.color || '#ffe58a') : 'transparent';
      if (n.type === 'text') { d.style.color = 'var(--text)'; d.style.boxShadow = 'none'; d.style.background = 'transparent'; if (n.fontSize) d.style.fontSize = n.fontSize + 'px'; }
      d.innerHTML = mdToHtml(n.text);
      el.appendChild(d);
    } else if (n.type === 'symbol') {
      if (n.src) {
        const img = document.createElement('img');
        img.src = n.src; img.draggable = false; img.style.width = '100%'; img.style.height = '100%';
        el.appendChild(img);
      } else {
        const d = document.createElement('div');
        d.className = 'node-symbol'; d.textContent = n.symbol || '⭐';
        el.appendChild(d);
      }
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
        bar.innerHTML = `<span style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap">🎬 ${escHtml(n.title || '视频')}</span><span class="v-more" title="详情">⋯</span>`;
        el.appendChild(bar);
        const f = document.createElement('iframe');
        f.dataset.src = embed;
        f.src = embed; f.allowFullscreen = true;
        f.allow = 'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture';
        f.setAttribute('referrerpolicy', 'no-referrer');
        el.appendChild(f);
      } else {
        n.type = 'link';
        el.className = 'node node-link';
        el.innerHTML = `<div class="nl-head"><span class="fav">🔗</span><span>视频链接</span></div><div class="nl-body"><a class="nl-open" href="${escAttr(n.url)}" target="_blank" rel="noopener">↗ 打开</a></div>`;
      }
    } else if (n.type === 'link') {
      let fav = '🔗', host = '';
      try { host = new URL(n.url).hostname.replace(/^www\./, ''); } catch (e) {}
      const dm = detectMedia(n.url);
      if (dm.title) fav = dm.title.includes('抖音') ? '🎵' : dm.title.includes('小红书') ? '📕' : dm.title.includes('飞书') ? '📘' : '🔗';
      el.innerHTML = `
        <div class="nl-head"><span class="fav">${fav}</span><span style="overflow:hidden;text-overflow:ellipsis">${escHtml(n.title || host)}</span></div>
        <div class="nl-body">
          <div style="flex:1;overflow:hidden">${escHtml(n.note || host)}</div>
          <a class="nl-open" href="${escAttr(n.url)}" target="_blank" rel="noopener">↗ 打开</a>
        </div>`;
    }
    if (n.id === selectedId && ['sticky', 'text', 'image', 'video', 'link'].includes(n.type)) {
      const h = document.createElement('div');
      h.className = 'handle'; h.dataset.id = n.id;
      el.appendChild(h);
    }
    return el;
  }

  /** 工具互斥：非「移动」工具时，iframe 不吃点击（箭头能连到视频节点、符号能盖上去） */
  function applyToolPE() {
    const pe = tool === 'select' ? '' : 'none';
    worldEl().querySelectorAll('iframe').forEach(f => f.style.pointerEvents = pe);
  }

  /* ═════════ 箭头 ═════════ */
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
      const ang = Math.atan2(p2.y - my, p2.x - mx);
      const L = 11;
      const head = document.createElementNS(NS, 'polygon');
      const hx = p2.x, hy = p2.y;
      head.setAttribute('points', `${hx},${hy} ${hx - L * Math.cos(ang - 0.42)},${hy - L * Math.sin(ang - 0.42)} ${hx - L * Math.cos(ang + 0.42)},${hy - L * Math.sin(ang + 0.42)}`);
      head.setAttribute('fill', color);
      svg.appendChild(head);
      const hit = document.createElementNS(NS, 'path');
      hit.setAttribute('d', d); hit.setAttribute('fill', 'none');
      hit.setAttribute('stroke', 'transparent'); hit.setAttribute('stroke-width', 14);
      hit.setAttribute('class', 'arrow-hit'); hit.dataset.arrowId = a.id;
      svg.appendChild(hit);
    }
  }

  /* ═════════ 节点操作 ═════════ */
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
    const nodes = data().nodes;
    data().nodes = nodes.filter(n => n.id !== id);
    data().arrows = data().arrows.filter(a => a.from !== id && a.to !== id);
    if (selectedId === id) selectedId = null;
    if (detailId === id) closeDetail();
    Store.saveSoon(); render();
  }
  function select(id) {
    selectedId = id; arrowFrom = null;
    document.querySelectorAll('.node').forEach(e => e.classList.toggle('selected', e.dataset.id === id));
  }
  function bringFront(n) { n.z = maxZ() + 1; Store.saveSoon(); render(); }
  function moveNodeTo(n, targetId) {
    const target = Store.s.canvases.find(c => c.id === targetId);
    if (!target || targetId === data().id) return;
    snapshot();
    data().nodes = data().nodes.filter(x => x.id !== n.id);
    data().arrows = data().arrows.filter(a => a.from !== n.id && a.to !== n.id);
    const c = target.cam || { x: 300, y: 120, z: 1 };
    n.x = (target.nodes.length % 5) * 40 - c.x / c.z + 200;
    n.y = (Math.floor(target.nodes.length / 5)) * 60 - c.y / c.z + 160;
    target.nodes.push(n);
    closeDetail(); Store.saveSoon(); render();
    UI.toast(`📦 已移动到「${target.name}」`);
  }

  /* ═════════ 节点详情面板 ═════════ */
  const nd = () => document.getElementById('nodeDetail');
  function closeDetail() { detailId = null; nd().classList.add('hidden'); }
  function openDetail(id, { edit } = {}) {
    const n = data().nodes.find(x => x.id === id);
    if (!n) return;
    detailId = id;
    select(id);
    const panel = nd();
    panel.classList.remove('hidden');
    renderDetail(n, { edit: edit && (n.type === 'sticky' || n.type === 'text') });
  }
  function renderDetail(n, { edit } = {}) {
    const panel = nd();
    const TYPE_NAME = { sticky: '🗒 便签', text: '📝 文字', image: '🖼 图片', video: '🎬 视频', link: '🔗 链接', symbol: '⭐ 符号' };
    panel.innerHTML = `
      <div class="nd-head">
        <span>${TYPE_NAME[n.type] || '节点'}</span>
        <span class="nd-canvas">🖼 ${escHtml(data().name)}</span>
        <button class="icon-btn" data-x>✕</button>
      </div>
      <div class="nd-body"></div>`;
    panel.querySelector('[data-x]').onclick = closeDetail;
    const body = panel.querySelector('.nd-body');

    if (n.type === 'sticky' || n.type === 'text') {
      if (edit) {
        body.appendChild(stickyEditor(n));
      } else {
        const pv = document.createElement('div');
        pv.className = 'md-body nd-preview';
        pv.innerHTML = mdToHtml(n.text) || '<span style="color:var(--muted)">（空便签，点下方编辑）</span>';
        body.appendChild(pv);
        const eb = document.createElement('button');
        eb.className = 'btn-secondary'; eb.style.marginBottom = '12px'; eb.textContent = '✏️ 编辑内容（Markdown）';
        eb.onclick = () => renderDetail(n, { edit: true });
        body.appendChild(eb);
        // 标签
        body.appendChild(ndSection('🏷 标签'));
        body.appendChild(tagEditor(n));
        // 双链
        const bl = backlinksOf(n);
        if (bl.out.length || bl.in.length) {
          body.appendChild(ndSection('🔗 双向链接'));
          body.appendChild(backlinksHtml(bl));
        }
        body.appendChild(ndSection('🎨 颜色'));
        const colors = document.createElement('div');
        colors.className = 'nd-colors';
        STICKY_COLORS.forEach(c => {
          const b = document.createElement('button');
          b.className = 'c-dot' + (n.color === c ? ' sel' : '');
          b.style.background = c;
          b.onclick = () => { n.color = c; Store.saveSoon(); render(); renderDetail(n, {}); };
          colors.appendChild(b);
        });
        body.appendChild(colors);
      }
    } else if (n.type === 'video' || n.type === 'link') {
      const t = document.createElement('input');
      t.className = 'nd-input'; t.value = n.title || ''; t.placeholder = '标题';
      t.addEventListener('input', () => { n.title = t.value; Store.saveSoon(); const bar = document.querySelector(`.node[data-id="${n.id}"] .v-drag span`); if (bar) bar.textContent = '🎬 ' + (t.value || '视频'); });
      body.appendChild(t);
      const u = document.createElement('div');
      u.className = 'nd-url'; u.textContent = n.url || '';
      body.appendChild(u);
      const ob = document.createElement('button');
      ob.className = 'btn-secondary'; ob.style.marginBottom = '12px'; ob.textContent = '↗ 在新标签页打开';
      ob.onclick = () => window.open(n.url, '_blank');
      body.appendChild(ob);
      body.appendChild(ndSection('🏷 标签'));
      body.appendChild(tagEditor(n));
    } else if (n.type === 'image') {
      const img = document.createElement('img');
      img.src = n.src; img.style.cssText = 'width:100%;border-radius:8px;margin-bottom:10px;max-height:180px;object-fit:cover;';
      body.appendChild(img);
      body.appendChild(ndSection('🏷 标签'));
      body.appendChild(tagEditor(n));
    } else if (n.type === 'symbol') {
      if (!n.src) {
        const b = document.createElement('button');
        b.className = 'btn-secondary'; b.style.marginBottom = '12px'; b.textContent = '🔁 换个符号';
        b.onclick = () => {
          const all = SYMBOLS.concat(Store.s.settings.customEmojis || []);
          n.symbol = all[(all.indexOf(n.symbol) + 1) % all.length];
          Store.saveSoon(); render(); renderDetail(n, {});
        };
        body.appendChild(b);
      }
      body.appendChild(ndSection('🏷 标签'));
      body.appendChild(tagEditor(n));
    }

    // 移动到画布
    body.appendChild(ndSection('📦 移动到画布'));
    const mv = document.createElement('select');
    mv.className = 'nd-input';
    mv.innerHTML = Store.s.canvases.map(c => `<option value="${c.id}" ${c.id === data().id ? 'selected' : ''}>${escHtml(c.name)}</option>`).join('');
    mv.onchange = () => moveNodeTo(n, mv.value);
    body.appendChild(mv);

    // 底部操作
    const foot = document.createElement('div');
    foot.className = 'nd-foot';
    const del = document.createElement('button');
    del.className = 'btn-danger'; del.textContent = '🗑 删除';
    del.onclick = () => { if (confirm('删除这个节点？')) { delNode(n.id); UI.toast('已删除'); } };
    foot.appendChild(del);
    body.appendChild(foot);
  }

  function ndSection(t) { const d = document.createElement('div'); d.className = 'nd-sec'; d.textContent = t; return d; }

  /** Markdown 编辑器（textarea + 工具栏） */
  function stickyEditor(n) {
    const wrap = document.createElement('div');
    wrap.className = 'nd-editor';
    const bar = document.createElement('div');
    bar.className = 'md-toolbar';
    const BTNS = [
      ['B', '**', '**', '加粗'], ['I', '*', '*', '斜体'], ['H', '==', '==', '高亮'],
      ['`', '`', '`', '代码'], ['S', '~~', '~~', '删除线'], ['H1', '# ', '', '标题'],
      ['#', '#', '', '标签'], ['[[', '[[', ']]', '双向链接'],
    ];
    const ta = document.createElement('textarea');
    ta.rows = 7; ta.value = n.text || ''; ta.className = 'nd-input';
    ta.style.resize = 'vertical';
    const wrapSel = (pre, suf) => {
      const s = ta.selectionStart, e = ta.selectionEnd;
      const sel = ta.value.slice(s, e) || '文字';
      ta.value = ta.value.slice(0, s) + pre + sel + suf + ta.value.slice(e);
      ta.selectionStart = s + pre.length; ta.selectionEnd = s + pre.length + sel.length;
      ta.focus(); save();
    };
    BTNS.forEach(([label, pre, suf, tip]) => {
      const b = document.createElement('button');
      b.className = 'md-btn'; b.textContent = label; b.title = tip;
      if (label === 'B') b.style.fontWeight = '800';
      if (label === 'I') b.style.fontStyle = 'italic';
      if (label === 'H') b.style.background = 'var(--yellow)';
      b.onclick = () => wrapSel(pre, suf);
      bar.appendChild(b);
    });
    const save = () => { n.text = ta.value; n.tags = parseTagsOf(ta.value); Store.saveSoon(); };
    ta.addEventListener('input', save);
    wrap.appendChild(bar); wrap.appendChild(ta);
    const done = document.createElement('button');
    done.className = 'btn-primary'; done.textContent = '✅ 完成，退出编辑';
    done.onclick = () => { save(); render(); renderDetail(n, {}); };
    wrap.appendChild(done);
    setTimeout(() => ta.focus(), 60);
    return wrap;
  }

  /** 标签编辑器（多级：#父/子） */
  function tagEditor(n) {
    if (!Array.isArray(n.tags)) n.tags = parseTagsOf(n.text);
    const box = document.createElement('div');
    box.className = 'nd-tags';
    const renderChips = () => {
      box.querySelectorAll('.nd-tag').forEach(e => e.remove());
      n.tags.forEach((t, i) => {
        const chip = document.createElement('span');
        chip.className = 'nd-tag';
        chip.innerHTML = `#${escHtml(t)} <b>×</b>`;
        chip.querySelector('b').onclick = () => { n.tags.splice(i, 1); Store.saveSoon(); renderChips(); if (viewMode === 'gallery') renderGallery(); };
        box.appendChild(chip);
      });
    };
    renderChips();
    const inp = document.createElement('input');
    inp.className = 'nd-input'; inp.placeholder = '#标签/子标签（回车添加）';
    inp.addEventListener('keydown', e => {
      if (e.key === 'Enter') {
        const v = inp.value.trim().replace(/^#/, '');
        if (v && !n.tags.includes(v)) { n.tags.push(v); Store.saveSoon(); inp.value = ''; renderChips(); if (viewMode === 'gallery') renderGallery(); }
        e.preventDefault();
      }
    });
    box.appendChild(inp);
    return box;
  }

  /** 便签双向链接 */
  function backlinksOf(n) {
    const title = stickyTitle(n);
    const outTitles = parseWikiLinks(n.text);
    const out = [], incoming = [];
    Store.s.canvases.forEach(c => (c.nodes || []).forEach(m => {
      if (m.type !== 'sticky' && m.type !== 'text') return;
      const mt = stickyTitle(m);
      if (m.id !== n.id && outTitles.includes(mt)) out.push({ c, n: m });
      if (m.id !== n.id && title && parseWikiLinks(m.text).includes(title)) incoming.push({ c, n: m });
    }));
    return { out, in: incoming };
  }
  function backlinksHtml(bl) {
    const box = document.createElement('div');
    box.className = 'nd-links';
    if (bl.out.length) box.innerHTML += `<div class="nd-link-h">→ 引用了</div>`;
    bl.out.forEach(({ c, n }) => {
      const a = document.createElement('div');
      a.className = 'nd-link'; a.textContent = `🔗 ${stickyTitle(n) || '（无标题）'} · ${c.name}`;
      a.onclick = () => jumpTo(c.id, n.id);
      box.appendChild(a);
    });
    if (bl.in.length) box.innerHTML += `<div class="nd-link-h">↩ 被引用</div>`;
    bl.in.forEach(({ c, n }) => {
      const a = document.createElement('div');
      a.className = 'nd-link'; a.textContent = `↩ ${stickyTitle(n) || '（无标题）'} · ${c.name}`;
      a.onclick = () => jumpTo(c.id, n.id);
      box.appendChild(a);
    });
    return box;
  }
  function jumpToTitle(title) {
    for (const c of Store.s.canvases) {
      const m = (c.nodes || []).find(n => (n.type === 'sticky' || n.type === 'text') && stickyTitle(n) === title);
      if (m) return jumpTo(c.id, m.id);
    }
    UI.toast(`没有找到「${title}」对应的便签`);
  }
  function jumpTo(canvasId, nodeId) {
    setViewMode('canvas');
    if (canvasId !== data().id) switchTo(canvasId);
    const n = Store.s.canvases.find(c => c.id === canvasId)?.nodes.find(x => x.id === nodeId);
    if (!n) return;
    const r = wrapEl().getBoundingClientRect();
    cam.x = r.width / 2 - (n.x + (n.w || 100) / 2) * cam.z;
    cam.y = r.height / 2 - (n.y + (n.h || 60) / 2) * cam.z;
    applyCam();
    select(nodeId);
    setTimeout(() => openDetail(nodeId), 120);
  }

  /* ═════════ 卡片流视图 ═════════ */
  function setViewMode(m) {
    viewMode = m;
    document.getElementById('viewTabCanvas').classList.toggle('active', m === 'canvas');
    document.getElementById('viewTabGallery').classList.toggle('active', m === 'gallery');
    document.getElementById('galleryView').classList.toggle('hidden', m !== 'gallery');
    document.querySelector('.canvas-switcher').style.display = m === 'canvas' ? '' : 'none';
    if (m === 'gallery') renderGallery();
  }
  function allTagSet() {
    const set = new Set();
    Store.s.canvases.forEach(c => (c.nodes || []).forEach(n => {
      (n.tags || (n.tags = parseTagsOf(n.text))).forEach(t => {
        set.add(t);
        const parts = t.split('/');
        for (let i = 1; i < parts.length; i++) set.add(parts.slice(0, i).join('/')); // 父级标签
      });
    }));
    return [...set].sort();
  }
  function nodeMatchTag(n, tag) {
    if (!tag) return true;
    return (n.tags || []).some(t => t === tag || t.startsWith(tag + '/'));
  }
  function relTime(ts) {
    if (!ts) return '';
    const d = Date.now() - ts;
    if (d < 3600e3) return Math.max(1, Math.round(d / 60e3)) + '分前';
    if (d < 86400e3) return Math.round(d / 3600e3) + '时前';
    return Store.todayStr(new Date(ts)).slice(5);
  }
  function renderGallery() {
    const bar = document.getElementById('tagBar');
    const grid = document.getElementById('galleryGrid');
    const tags = allTagSet();
    bar.innerHTML = `<button class="tag-chip ${!galleryFilter ? 'on' : ''}">全部</button>` +
      tags.map(t => `<button class="tag-chip ${galleryFilter === t ? 'on' : ''}" data-tag="${escAttr(t)}">${escHtml(t)} <i>${tagCount(t)}</i></button>`).join('');
    bar.querySelectorAll('.tag-chip[data-tag]').forEach(b => b.onclick = () => { galleryFilter = b.dataset.tag; renderGallery(); });
    bar.querySelector('.tag-chip:not([data-tag])').onclick = () => { galleryFilter = null; renderGallery(); };

    const items = [];
    Store.s.canvases.forEach(c => (c.nodes || []).forEach(n => {
      if (['sticky', 'text', 'image', 'video', 'link', 'symbol'].includes(n.type) && nodeMatchTag(n, galleryFilter)) items.push({ c, n });
    }));
    items.sort((a, b) => (b.n.createdAt || 0) - (a.n.createdAt || 0));
    grid.innerHTML = items.length ? '' : '<div class="task-empty" style="grid-column:1/-1">没有内容。去画布上双击空白建一张便签，或换个标签看看。</div>';
    items.forEach(({ c, n }) => grid.appendChild(galleryCard(c, n)));
  }
  function tagCount(tag) {
    let k = 0;
    Store.s.canvases.forEach(c => (c.nodes || []).forEach(n => { if (nodeMatchTag(n, tag)) k++; }));
    return k;
  }
  function galleryCard(c, n) {
    const card = document.createElement('div');
    card.className = 'g-card';
    const tags = (n.tags || []).map(t => `<span class="g-tag" data-tag="${escAttr(t)}">${escHtml(t)}</span>`).join('');
    const meta = `<div class="g-meta"><span>🖼 ${escHtml(c.name)}</span><span>${relTime(n.createdAt)}</span></div>`;
    if (n.type === 'sticky' || n.type === 'text') {
      card.innerHTML = `<div class="md-body g-text">${mdToHtml((n.text || '').split('\n').slice(0, 6).join('\n'))}</div>${tags}${meta}`;
      card.style.borderLeft = `4px solid ${n.color || '#ffe58a'}`;
    } else if (n.type === 'image') {
      card.innerHTML = `<img class="g-img" src="${escAttr(n.src)}" draggable="false">${tags}${meta}`;
    } else if (n.type === 'video') {
      card.innerHTML = `<div class="g-video">🎬 ${escHtml(n.title || '视频')}</div>${tags}${meta}`;
    } else if (n.type === 'link') {
      card.innerHTML = `<div class="g-video" style="background:var(--card2)">🔗 ${escHtml(n.title || n.url || '链接')}</div>${tags}${meta}`;
    } else if (n.type === 'symbol') {
      card.innerHTML = `<div class="g-video" style="background:var(--card2);font-size:34px">${n.src ? `<img src="${escAttr(n.src)}" style="width:44px;height:44px">` : escHtml(n.symbol)}</div>${tags}${meta}`;
    }
    card.querySelectorAll('.g-tag').forEach(t => { t.onclick = e => { e.stopPropagation(); galleryFilter = t.dataset.tag; renderGallery(); }; });
    card.onclick = () => jumpTo(c.id, n.id);
    return card;
  }

  /* ═════════ 工具 ═════════ */
  function setTool(t) {
    tool = t; arrowFrom = null;
    document.querySelectorAll('.tool-btn[data-tool]').forEach(b => b.classList.toggle('active', b.dataset.tool === t));
    const sp = document.getElementById('symbolPalette');
    if (t === 'symbol') { renderSymbolPalette(); sp.classList.remove('hidden'); }
    else sp.classList.add('hidden');
    wrapEl().style.cursor = t === 'select' ? 'default' : 'crosshair';
    applyToolPE();
  }
  function renderSymbolPalette() {
    const sp = document.getElementById('symbolPalette');
    sp.innerHTML = '';
    const all = SYMBOLS.concat(Store.s.settings.customEmojis || []);
    all.forEach(s => {
      const b = document.createElement('button');
      b.textContent = s;
      b.className = pendingSymbol === s ? 'on' : '';
      b.onclick = () => { pendingSymbol = s; UI.toast(`已选 ${s}，点击画布放置`); renderSymbolPalette(); };
      sp.appendChild(b);
    });
    (Store.s.settings.customSymbols || []).forEach(src => {
      const b = document.createElement('button');
      b.className = 'sym-img' + (pendingSymbol && pendingSymbol.src === src ? ' on' : '');
      const img = document.createElement('img'); img.src = src;
      b.appendChild(img);
      b.onclick = () => { pendingSymbol = { src }; UI.toast('已选自定义符号，点击画布放置'); renderSymbolPalette(); };
      sp.appendChild(b);
    });
    // 自定义 emoji
    const add = document.createElement('div');
    add.className = 'sym-add';
    add.innerHTML = `<input placeholder="加个 emoji" maxlength="4"><button>＋</button>`;
    add.querySelector('button').onclick = () => {
      const v = add.querySelector('input').value.trim();
      if (v && !(Store.s.settings.customEmojis || []).includes(v)) {
        Store.s.settings.customEmojis = [...(Store.s.settings.customEmojis || []), v];
        Store.save(); renderSymbolPalette(); UI.toast(`已添加 ${v}`);
      }
    };
    sp.appendChild(add);
    const up = document.createElement('button');
    up.className = 'sym-upload'; up.textContent = '📤 上传图片符号';
    up.onclick = () => document.getElementById('symFileInput').click();
    sp.appendChild(up);
  }

  function fileToDataUrl(file, max, cb) {
    const r = new FileReader();
    r.onload = () => {
      const img = new Image();
      img.onload = () => {
        const s = Math.min(1, max / Math.max(img.width, img.height));
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.round(img.width * s)); cv.height = Math.max(1, Math.round(img.height * s));
        cv.getContext('2d').drawImage(img, 0, 0, cv.width, cv.height);
        cb(cv.toDataURL('image/png'));
      };
      img.src = r.result;
    };
    r.readAsDataURL(file);
  }

  /* ═════════ 事件（鼠标） ═════════ */
  function bindEvents() {
    const wrap = wrapEl();

    wrap.addEventListener('wheel', e => {
      e.preventDefault();
      const r = wrap.getBoundingClientRect();
      const mx = e.clientX - r.left, my = e.clientY - r.top;
      const factor = Math.exp(-e.deltaY * 0.0016);
      const nz = Math.min(2.5, Math.max(0.2, cam.z * factor));
      cam.x = mx - (mx - cam.x) * (nz / cam.z);
      cam.y = my - (my - cam.y) * (nz / cam.z);
      cam.z = nz;
      applyCam();
    }, { passive: false });

    wrap.addEventListener('mousedown', e => {
      if (e.target.closest('.node-detail') || e.target.closest('.canvas-toolbar') || e.target.closest('.zoom-ctrl') || e.target.closest('.canvas-switcher') || e.target.closest('.symbol-palette') || e.target.closest('.insp-toggle')) return;
      if (e.button === 1 || spaceHeld || (e.button === 0 && tool === 'select' && !e.target.closest('.node'))) {
        panning = { sx: e.clientX, sy: e.clientY, cx: cam.x, cy: cam.y };
        wrap.style.cursor = 'grabbing';
        closeDetail();
        e.preventDefault();
        return;
      }
      if (tool !== 'select') {
        // 非移动工具：点空白＝各自动作（便签创建 / 箭头取消 / 符号放置）
        if (e.target.closest('.node')) {
          const n = data().nodes.find(x => x.id === e.target.closest('.node').dataset.id);
          if (n && tool === 'arrow') connectArrow(n);
          return;
        }
        return; // click 事件里处理空白动作
      }
      const handle = e.target.closest('.handle');
      if (handle) {
        const n = data().nodes.find(x => x.id === handle.dataset.id);
        resizing = { n, sx: e.clientX, sy: e.clientY, w: n.w, h: n.h };
        setIframesPE('none');
        e.preventDefault(); return;
      }
      const nodeEl = e.target.closest('.node');
      if (!nodeEl) return;
      const n = data().nodes.find(x => x.id === nodeEl.dataset.id);
      if (!n) return;
      if (selectedId !== n.id) select(n.id);
      dragging = { n, sx: e.clientX, sy: e.clientY, ox: n.x, oy: n.y, moved: false, isBar: !!e.target.closest('.v-drag') };
      setIframesPE('none');
      e.preventDefault();
    });

    document.addEventListener('mousemove', e => {
      if (panning) {
        cam.x = panning.cx + (e.clientX - panning.sx);
        cam.y = panning.cy + (e.clientY - panning.sy);
        applyCam();
      } else if (dragging) {
        const dx = (e.clientX - dragging.sx) / cam.z, dy = (e.clientY - dragging.sy) / cam.z;
        if (Math.abs(dx) + Math.abs(dy) > 2) dragging.moved = true;
        if (dragging.moved) {
          dragging.n.x = dragging.ox + dx; dragging.n.y = dragging.oy + dy;
          const el = document.querySelector(`.node[data-id="${dragging.n.id}"]`);
          if (el) { el.style.left = dragging.n.x + 'px'; el.style.top = dragging.n.y + 'px'; }
          drawArrows();
        }
      } else if (resizing) {
        resizing.n.w = Math.max(60, resizing.w + (e.clientX - resizing.sx) / cam.z);
        resizing.n.h = Math.max(40, resizing.h + (e.clientY - resizing.sy) / cam.z);
        const el = document.querySelector(`.node[data-id="${resizing.n.id}"]`);
        if (el) { el.style.width = resizing.n.w + 'px'; el.style.height = resizing.n.h + 'px'; }
      }
    });

    document.addEventListener('mouseup', () => {
      if (panning) { panning = null; wrap.style.cursor = tool === 'select' ? 'default' : 'crosshair'; saveCam(); }
      if (dragging) {
        const d = dragging; dragging = null; setIframesPE('');
        if (d.moved) Store.saveSoon();
        else openDetail(d.n.id); // 点击（未拖动）＝查看详情
      }
      if (resizing) { resizing = null; Store.saveSoon(); setIframesPE(''); }
    });

    // 空白点击（非 select 工具的动作：建便签 / 放符号）
    wrap.addEventListener('click', e => {
      if (e.target.closest('.node') || e.target.closest('.node-detail') || e.target.closest('.canvas-toolbar') || e.target.closest('.zoom-ctrl') || e.target.closest('.canvas-switcher') || e.target.closest('.symbol-palette') || e.target.closest('.insp-toggle')) return;
      const p = toWorld(e.clientX, e.clientY);
      if (tool === 'sticky') {
        const n = addNode({ type: 'sticky', x: p.x - 90, y: p.y - 20, w: 190, h: 140, color: STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)], text: '', tags: [] });
        openDetail(n.id, { edit: true });
      } else if (tool === 'symbol') {
        placeSymbol(p.x - 28, p.y - 28);
      } else if (tool === 'arrow') {
        if (arrowFrom) { arrowFrom = null; UI.toast('已取消连线起点'); }
      }
    });

    // 双击：空白建便签并编辑；便签直接进编辑
    wrap.addEventListener('dblclick', e => {
      e.preventDefault();
      if (e.target.closest('.node-detail') || e.target.closest('.canvas-toolbar') || e.target.closest('.zoom-ctrl') || e.target.closest('.canvas-switcher') || e.target.closest('.symbol-palette') || e.target.closest('.insp-toggle')) return;
      const nodeEl = e.target.closest('.node');
      if (!nodeEl) {
        if (tool !== 'select') return;
        const p = toWorld(e.clientX, e.clientY);
        const n = addNode({ type: 'sticky', x: p.x - 90, y: p.y - 20, w: 190, h: 140, color: STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)], text: '', tags: [] });
        openDetail(n.id, { edit: true });
        return;
      }
      const n = data().nodes.find(x => x.id === nodeEl.dataset.id);
      if (!n) return;
      if (n.type === 'sticky' || n.type === 'text') openDetail(n.id, { edit: true });
      else if (n.type === 'link') window.open(n.url, '_blank');
      else openDetail(n.id);
    });

    // 画布内 markdown 元素交互：双链跳转 / 标签开卡片流
    worldEl().addEventListener('click', e => {
      const wl = e.target.closest('.wikilink');
      if (wl) { e.stopPropagation(); jumpToTitle(wl.dataset.target); return; }
      const tg = e.target.closest('.ntag');
      if (tg) { e.stopPropagation(); galleryFilter = tg.dataset.tag; setViewMode('gallery'); return; }
    });

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
      if (e.key === 'Escape') { if (detailId) closeDetail(); else { select(null); setTool('select'); } }
      if (e.key === 'Delete' || e.key === 'Backspace') { if (selectedId && !detailId) delNode(selectedId); }
      if (e.key === 'v' || e.key === 'V') setTool('select');
      if (e.key === 'n' || e.key === 'N') setTool('sticky');
      if (e.key === 'a' || e.key === 'A') setTool('arrow');
      if (e.key === 's' || e.key === 'S') setTool('symbol');
      if ((e.ctrlKey || e.metaKey) && (e.key === 'z' || e.key === 'Z')) { e.preventDefault(); undo(); }
    });
    document.addEventListener('keyup', e => {
      if (e.code === 'Space') { spaceHeld = false; if (UI.currentPage() === 'canvas') wrap.style.cursor = tool === 'select' ? 'default' : 'crosshair'; }
    });

    document.getElementById('imgFileInput').addEventListener('change', e => {
      [...e.target.files].forEach(f => addImageFile(f));
      e.target.value = '';
    });
    document.getElementById('symFileInput').addEventListener('change', e => {
      const f = e.target.files[0];
      if (f) fileToDataUrl(f, 72, dataUrl => {
        Store.s.settings.customSymbols = [...(Store.s.settings.customSymbols || []), dataUrl];
        Store.save();
        pendingSymbol = { src: dataUrl };
        renderSymbolPalette();
        UI.toast('已上传，点击画布放置');
      });
      e.target.value = '';
    });

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

    document.addEventListener('paste', e => {
      if (UI.currentPage() !== 'canvas' || inImmersive) return;
      if (e.target.matches('input,textarea,[contenteditable="true"]')) return;
      const items = [...(e.clipboardData?.items || [])];
      const imgItem = items.find(i => i.type.startsWith('image/'));
      if (imgItem) { addImageFile(imgItem.getAsFile(), viewCenter()); e.preventDefault(); return; }
      const text = e.clipboardData?.getData('text/plain');
      if (text && text.trim()) {
        const p = viewCenter();
        addNode({ type: 'sticky', x: p.x, y: p.y, w: 190, h: 140, color: STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)], text: text.trim().slice(0, 500), tags: parseTagsOf(text) });
        UI.toast('📋 已粘贴成便签');
        e.preventDefault();
      }
    });

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

    // 视图切换
    document.getElementById('viewTabCanvas').onclick = () => setViewMode('canvas');
    document.getElementById('viewTabGallery').onclick = () => setViewMode('gallery');
  }

  function connectArrow(n) {
    if (!arrowFrom) { arrowFrom = n.id; UI.toast('已选起点，再点一个节点连箭头（点空白取消）'); return; }
    if (arrowFrom === n.id) { arrowFrom = null; return; }
    if (data().arrows.some(a => (a.from === arrowFrom && a.to === n.id))) { arrowFrom = null; UI.toast('这两个节点已经连过了'); return; }
    snapshot();
    data().arrows.push({ id: uid(), from: arrowFrom, to: n.id, color: '#7c5cff' });
    arrowFrom = null; Store.saveSoon(); render();
    UI.toast('➡ 已连接');
  }
  function placeSymbol(x, y) {
    const base = typeof pendingSymbol === 'string'
      ? { type: 'symbol', symbol: pendingSymbol }
      : { type: 'symbol', src: pendingSymbol.src };
    addNode({ ...base, x, y, w: 56, h: 56, tags: [] });
    UI.toast(`${typeof pendingSymbol === 'string' ? pendingSymbol : '自定义符号'} 放好啦`);
  }
  function setIframesPE(v) { worldEl().querySelectorAll('iframe').forEach(f => f.style.pointerEvents = v); }

  function zoomBy(f) {
    const r = wrapEl().getBoundingClientRect();
    const mx = r.width / 2, my = r.height / 2;
    const nz = Math.min(2.5, Math.max(0.2, cam.z * f));
    cam.x = mx - (mx - cam.x) * (nz / cam.z);
    cam.y = my - (my - cam.y) * (nz / cam.z);
    cam.z = nz; applyCam();
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
        addNode({ type: 'image', x: p.x, y: p.y, w: Math.round(img.width * scale), h: Math.round(img.height * scale), src: reader.result, tags: [] });
        UI.toast('🖼 图片已放上画布');
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  }
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
      addNode({ type: 'video', x: p.x, y: p.y, w: 420, h: 260, url, embed: dm.embed, title: dm.title, tags: [] });
      UI.toast('🎬 视频已内嵌到画布');
    } else if (dm.kind === 'image') {
      const img = new Image();
      img.onload = () => {
        const scale = Math.min(1, 320 / Math.max(img.width, 1));
        addNode({ type: 'image', x: p.x, y: p.y, w: Math.round(img.width * scale), h: Math.round(img.height * scale), src: url, tags: [] });
      };
      img.onerror = () => { addNode({ type: 'link', x: p.x, y: p.y, w: 230, h: 130, url, title: '图片', note: '', tags: [] }); };
      img.src = url;
    } else {
      let host = url; try { host = new URL(url).hostname.replace(/^www\./, ''); } catch (e) {}
      const label = dm.title ? `${dm.title} · ${host}` : host;
      addNode({ type: 'link', x: p.x, y: p.y, w: 230, h: 130, url, title: label, note: '', tags: [] });
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
    if (t && t.cam && t.cam.z >= 0.2) { cam = { ...t.cam }; applyCam(); }
    else fitView();
  }

  /* ═════════ 触控 ═════════ */
  let touchLastTap = { t: 0, x: 0, y: 0 };
  function bindTouch() {
    const wrap = wrapEl();
    let ts = null;
    const hitNode = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return el ? el.closest('#canvasWrap .node') : null;
    };
    const uiEl = (x, y) => {
      const el = document.elementFromPoint(x, y);
      return el ? el.closest('.canvas-toolbar, .zoom-ctrl, .symbol-palette, a, input, textarea, [contenteditable="true"], .node-detail, .canvas-switcher, .insp-toggle') : null;
    };
    wrap.addEventListener('touchstart', e => {
      if (e.touches.length === 2) {
        const [a, b] = e.touches;
        ts = { mode: 'pinch', d: Math.hypot(a.clientX - b.clientX, a.clientY - b.clientY), cx: (a.clientX + b.clientX) / 2, cy: (a.clientY + b.clientY) / 2, cam: { ...cam } };
        e.preventDefault(); return;
      }
      if (e.touches.length !== 1) return;
      const t = e.touches[0];
      if (uiEl(t.clientX, t.clientY)) return;
      const nodeEl = hitNode(t.clientX, t.clientY);
      if (nodeEl) {
        const n = data().nodes.find(x => x.id === nodeEl.dataset.id);
        if (!n) return;
        if (tool === 'arrow') { connectArrow(n); e.preventDefault(); return; }
        if (tool !== 'select') return;
        if (!nodeEl.querySelector('iframe')) {
          ts = { mode: 'node', sx: t.clientX, sy: t.clientY, n, ox: n.x, oy: n.y, moved: false };
          e.preventDefault();
        } else {
          // 视频节点：iframe 区域留给播放，仅拖动条可操作
          if (nodeEl.querySelector('.v-drag').contains(document.elementFromPoint(t.clientX, t.clientY))) {
            ts = { mode: 'node', sx: t.clientX, sy: t.clientY, n, ox: n.x, oy: n.y, moved: false };
            e.preventDefault();
          }
        }
        return;
      }
      if (tool === 'select') {
        ts = { mode: 'pan', sx: t.clientX, sy: t.clientY, cx: cam.x, cy: cam.y, moved: false };
        closeDetail();
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
          applyCam();
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
            drawArrows();
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
        if (st.mode === 'node') { Store.saveSoon(); setIframesPE(''); }
        else saveCam();
        return;
      }
      const now = Date.now();
      const isDouble = now - touchLastTap.t < 350 && Math.hypot(touchLastTap.x - st.sx, touchLastTap.y - st.sy) < 32;
      touchLastTap = { t: now, x: st.sx, y: st.sy };
      if (isDouble) {
        touchLastTap = { t: 0, x: 0, y: 0 };
        const nodeEl = hitNode(st.sx, st.sy);
        const n = nodeEl ? data().nodes.find(x => x.id === nodeEl.dataset.id) : null;
        if (n && (n.type === 'sticky' || n.type === 'text')) openDetail(n.id, { edit: true });
        else if (n) openDetail(n.id);
        else if (tool === 'select') {
          const p = toWorld(st.sx, st.sy);
          const nn = addNode({ type: 'sticky', x: p.x - 90, y: p.y - 20, w: 190, h: 140, color: STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)], text: '', tags: [] });
          openDetail(nn.id, { edit: true });
        }
        return;
      }
      if (st.mode === 'node') openDetail(st.n.id); // 轻点＝详情
      else if (tool === 'sticky') {
        const p = toWorld(st.sx, st.sy);
        const nn = addNode({ type: 'sticky', x: p.x - 90, y: p.y - 20, w: 190, h: 140, color: STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)], text: '', tags: [] });
        openDetail(nn.id, { edit: true });
      } else if (tool === 'symbol') {
        const p = toWorld(st.sx, st.sy);
        placeSymbol(p.x - 28, p.y - 28);
      }
    });
  }

  /* ═════════ 多画布切换 ═════════ */
  function switchTo(id) {
    closeDetail();
    const target = Store.s.canvases.find(c => c.id === id);
    if (!target) return;
    const cur = data();
    if (cur) cur.cam = { ...cam };
    Store.s.activeCanvasId = id; Store.save();
    undoStack = []; selectedId = null; arrowFrom = null;
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
    addNode, addSticky: (text, color) => addNode({ type: 'sticky', x: 200 + Math.random() * 300, y: 200 + Math.random() * 200, w: 190, h: 140, color: color || STICKY_COLORS[Math.floor(Math.random() * STICKY_COLORS.length)], text, tags: parseTagsOf(text) }),
    select: id => select(id), commitEdits: () => { closeDetail(); render(); }, fit: fitView,
    setInImmersive: v => { inImmersive = v; },
    cam: () => ({ ...cam }),
    switchTo, current: () => data(),
    openDetail, setViewMode, get viewMode() { return viewMode; },
    jumpTo, jumpToTitle, setGalleryFilter: t => { galleryFilter = t; },
  };
})();
