/* Cloudflare Worker：坚果云 WebDAV 跨域代理
   ── 手机端同步用：坚果云不允许浏览器跨域直连，需要一个代理中转 ──

   部署步骤（纯网页操作，约 2 分钟）：
   1. 打开 dash.cloudflare.com → 左侧「Workers 和 Pages」→ 创建 → 「创建 Worker」
   2. 部署一个示例后点「编辑代码」，全选删除，粘贴本文件全部内容 → 保存并部署
   3. 复制你的 Worker 地址（形如 https://sidequest-proxy.你的子域.workers.dev）
   4. 填进工作台「设置 → ☁️ 云同步 → 同步代理（手机端需要）」
   5. 手机端同步即自动走此代理（电脑端本地 server.js 会优先用自带代理，此地址作为兜底）
*/
export default {
  async fetch(request) {
    // 预检请求
    if (request.method === 'OPTIONS') {
      return new Response(null, { headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET, PUT, DELETE, MKCOL, PROPFIND, OPTIONS',
        'Access-Control-Allow-Headers': 'Authorization, Content-Type, Depth',
      }});
    }
    const u = new URL(request.url);
    const target = u.searchParams.get('url');
    // 只允许代理到坚果云，防止被滥用为开放代理
    if (!target || !target.startsWith('https://dav.jianguoyun.com/')) {
      return new Response('缺少或非法的 url 参数', { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    const headers = new Headers();
    for (const h of ['Authorization', 'Content-Type', 'Depth']) {
      const v = request.headers.get(h);
      if (v) headers.set(h, v);
    }
    const hasBody = !['GET', 'HEAD', 'OPTIONS'].includes(request.method);
    const body = hasBody ? await request.text() : undefined;
    let res;
    try {
      res = await fetch(target, { method: request.method, headers, body });
    } catch (e) {
      return new Response('代理请求失败: ' + e.message, { status: 502, headers: { 'Access-Control-Allow-Origin': '*' } });
    }
    return new Response(res.body, { status: res.status, headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': res.headers.get('Content-Type') || 'application/json',
    }});
  },
};
