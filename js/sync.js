/* ═══════════ WebDAV 云同步：手机电脑数据保持一致（最后写入胜出） ═══════════ */
const Sync = (() => {
  const $ = id => document.getElementById(id);
  const KEY = 'sidequest.v1';
  let mode = null; // 'direct' | 'proxy'（自动探测并记住）

  const cfg = () => {
    const s = Store.s.settings;
    if (!s.sync) s.sync = { url: 'https://dav.jianguoyun.com/dav/', user: '', pass: '', path: 'sidequest/data.json', auto: false, lastSync: 0 };
    return s.sync;
  };
  function fullUrl() {
    const c = cfg();
    const base = (c.url || '').trim().replace(/\/+$/, '');
    const p = (c.path || 'sidequest/data.json').replace(/^\/+|\/+$/g, '');
    return base + '/' + p;
  }
  function auth() { const c = cfg(); return 'Basic ' + btoa((c.user || '') + ':' + (c.pass || '')); }

  /* —— 请求（自动探测直连/代理） —— */
  async function dav(method, body, urlOverride) {
    const url = urlOverride || fullUrl();
    const doFetch = async (via) => {
      if (via === 'proxy') {
        return fetch('/dav-proxy', {
          method,
          headers: { 'Authorization': auth(), 'Content-Type': 'application/json', 'X-Dav-Url': url },
          body,
        });
      }
      return fetch(url, {
        method,
        headers: { 'Authorization': auth(), 'Content-Type': 'application/json' },
        body,
      });
    };
    const order = mode ? [mode] : ['direct', 'proxy'];
    let lastErr = null;
    for (const via of order) {
      try {
        const ctrl = new AbortController();
        const timer = setTimeout(() => ctrl.abort(), 20000);
        const res = await doFetch(via);
        clearTimeout(timer);
        mode = via;
        return res;
      } catch (e) { lastErr = e; }
    }
    throw new Error(location.protocol === 'file:'
      ? 'file:// 方式无法联网同步，请用 node server.js 或线上托管地址打开'
      : '网络请求失败（可能是跨域限制）：' + (lastErr?.message || ''));
  }

  async function getRemote() {
    const res = await dav('GET');
    if (res.status === 404) return null;
    if (res.status === 401) throw new Error('账号或密码不对（401）——账号填坚果云登录邮箱，密码填「应用密码」（网页版生成的随机密码，不是登录密码）');
    if (!res.ok) throw new Error('读取云端失败：HTTP ' + res.status);
    const text = await res.text();
    try { return JSON.parse(text); } catch (e) { throw new Error('云端文件不是有效 JSON'); }
  }
  async function putRemote(data) {
    // 先确保目录存在：MKCOL 必须指向【目录】而不是文件路径（指向文件路径会误建同名文件夹，导致后续 PUT 405）
    const c = cfg();
    const base = (c.url || '').trim().replace(/\/+$/, '');
    const dir = fullUrl().replace(/\/[^/]+$/, '');
    if (dir && dir !== base) { try { await dav('MKCOL', undefined, dir); } catch (e) {} }
    const res = await dav('PUT', JSON.stringify(data));
    if (!res.ok) {
      if (res.status === 405) throw new Error('路径被同名文件夹占用（405）——去坚果云网页版，把「远端文件路径」对应位置里同名的文件夹删掉，再重试');
      if (res.status === 404) throw new Error('云端文件夹不存在（404）——坚果云不支持自动建目录，请先在坚果云里手动建好路径里的文件夹（如 myworktable）');
      if (res.status === 401) throw new Error('账号或密码不对（401）——账号填坚果云登录邮箱，密码填「应用密码」');
      throw new Error('上传失败：HTTP ' + res.status);
    }
  }

  /** 7 天滚动备份：把云端当前数据存到 data-backup-{1..7}.json，槽位按日期轮转，旧的自动被覆盖 */
  async function backupRemote(cur) {
    if (!cur) return;
    try {
      const c = cfg();
      const base = (c.url || '').trim().replace(/\/+$/, '');
      const p = c.path || 'sidequest-data.json';
      const dot = p.lastIndexOf('.');
      const backupPath = (dot > p.lastIndexOf('/') ? p.slice(0, dot) : p) + `-backup-${(Math.floor(Date.now() / 86400000) % 7) + 1}.json`;
      await dav('PUT', JSON.stringify(cur), base + '/' + backupPath);
    } catch (e) { /* 备份失败不阻塞主流程 */ }
  }

  function fmtTime(ts) { return ts ? new Date(ts).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }) : '——'; }

  function status(msg, ok) {
    const el = $('syncStatus');
    if (el) { el.textContent = msg; el.style.color = ok === false ? 'var(--red)' : ok === true ? 'var(--green)' : 'var(--muted)'; }
  }
  function touchLast() { cfg().lastSync = Date.now(); Store.saveSoon(); updateLastSync(); }
  function updateLastSync() {
    const el = $('syncLast');
    if (el) el.textContent = fmtTime(cfg().lastSync);
  }

  /* —— 三个动作 —— */
  async function smartSync({ silent } = {}) {
    if (!cfg().user) { if (!silent) status('请先填写 WebDAV 账号', false); return; }
    try {
      if (!silent) status('同步中…');
      const remote = await getRemote();
      if (!remote) {
        await putRemote(Store.s);
        touchLast();
        status('✅ 首次上传完成 ' + fmtTime(Date.now()), true);
        if (!silent) UI.toast('☁️ 数据已上传到云端');
        return;
      }
      const rT = remote.updatedAt || 0, lT = Store.s.updatedAt || 0;
      if (Math.abs(rT - lT) < 3000) {
        touchLast();
        status('✅ 已是最新 ' + fmtTime(Date.now()), true);
        return;
      }
      if (rT > lT) {
        if (!confirm(`云端数据更新（${fmtTime(rT)}），比本地新。下载并覆盖本机数据？\n（页面会刷新一次）`)) { status('已取消'); return; }
        await applyRemote(remote);
      } else {
        if (!confirm(`本地数据更新（${fmtTime(lT)}），比云端新。上传并覆盖云端？\n（云端当前数据会先存入 7 天滚动备份）`)) { status('已取消'); return; }
        await backupRemote(remote);
        await putRemote(Store.s);
        touchLast();
        status('✅ 已上传 ' + fmtTime(Date.now()), true);
        if (!silent) UI.toast('☁️ 本地数据已备份到云端');
      }
    } catch (e) {
      status('⚠️ ' + e.message, false);
      if (!silent) UI.toast('⚠️ 同步失败：' + e.message);
    }
  }
  async function uploadForce() {
    if (!confirm('确定用本机数据覆盖云端？\n（云端当前数据会先存入 7 天滚动备份）')) return;
    try {
      status('上传中…');
      const remote = await getRemote();
      await backupRemote(remote);
      await putRemote(Store.s);
      touchLast();
      status('✅ 已上传覆盖云端 ' + fmtTime(Date.now()), true);
      UI.toast('☁️ 已上传');
    } catch (e) { status('⚠️ ' + e.message, false); UI.toast('⚠️ 上传失败：' + e.message); }
  }
  async function downloadForce() {
    try {
      status('读取云端…');
      const remote = await getRemote();
      if (!remote) { status('云端还没有数据', false); return; }
      if (!confirm(`确定用云端数据（${fmtTime(remote.updatedAt)}）覆盖本机？本机现有内容将被替换，页面会刷新。`)) return;
      await applyRemote(remote);
    } catch (e) { status('⚠️ ' + e.message, false); UI.toast('⚠️ 恢复失败：' + e.message); }
  }
  async function applyRemote(data) {
    localStorage.setItem(KEY, JSON.stringify(data));
    localStorage.removeItem('sidequest.timer.v1'); // 计时状态以数据为准，避免残留
    UI.toast('☁️ 已拉取云端数据，正在刷新…');
    setTimeout(() => location.reload(), 600);
  }

  /* —— 绑定设置页 —— */
  function renderCfg() {
    const c = cfg();
    $('setSyncUrl').value = c.url; $('setSyncUser').value = c.user;
    $('setSyncPass').value = c.pass; $('setSyncPath').value = c.path;
    $('setSyncAuto').checked = !!c.auto;
    updateLastSync();
  }
  function bind() {
    const saveCfg = () => {
      const c = cfg();
      c.url = $('setSyncUrl').value.trim() || 'https://dav.jianguoyun.com/dav/';
      c.user = $('setSyncUser').value.trim();
      c.pass = $('setSyncPass').value;
      c.path = $('setSyncPath').value.trim() || 'sidequest/data.json';
      const wasAuto = c.auto;
      c.auto = $('setSyncAuto').checked;
      Store.saveSoon();
      if (c.auto && !wasAuto) { smartSync({ silent: false }); startAuto(); }
    };
    ['setSyncUrl', 'setSyncUser', 'setSyncPass', 'setSyncPath', 'setSyncAuto'].forEach(id => $(id).addEventListener('input', saveCfg));
    $('setSyncAuto').addEventListener('change', saveCfg);
    $('btnSyncSmart').onclick = () => smartSync({ silent: false });
    $('btnSyncUp').onclick = uploadForce;
    $('btnSyncDown').onclick = downloadForce;
    if (cfg().auto) startAuto();
    renderCfg();
  }
  let autoTimer = null;
  function startAuto() {
    clearInterval(autoTimer);
    autoTimer = setInterval(() => { if (cfg().user && navigator.onLine) smartSync({ silent: true }); }, 24 * 60 * 60 * 1000); // 每天一次
    setTimeout(() => { if (cfg().user && navigator.onLine) smartSync({ silent: true }); }, 4000);
  }

  return { bind };
})();
