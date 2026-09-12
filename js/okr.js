/* ═══════════ 反向 OKR 引擎：从重复行为中「生长」出目标（本地规则 + 可选 AI 润色） ═══════════
   传统 OKR：先定 O 再拆 KR。这里反过来：先收集行为足迹（番茄记录/完成任务/日记今日要事），
   用中文 bigram 相似度聚类，重复出现（≥3 次、跨 ≥2 天）的行为浮出为「可生长的候选」，
   一键生成 O + 三条可量化 KR，进度随之后的行为记录自动更新。 */
const OKR = (() => {
  /* —— 文本工具 —— */
  const PUNCT = /[\s\d，。！？、；：""''「」（）()·\.\,\!\?\;\:!?#*+\-\/\\_—…✅☑→↳\[\]{}]/g;
  function norm(t) { return (t || '').replace(PUNCT, '').toLowerCase(); }
  function bigrams(t) {
    const s = norm(t), out = new Set();
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
    return out;
  }
  const STOP = new Set(['今天','明天','昨天','然后','但是','如果','所以','因为','或者','完成','进行','一个','一下','开始','继续','时候','自己','这个','那个','什么','没有','已经','就是','还是','可以','应该','需要','觉得','感觉','有点','一下','第一次','第二','每日','每天','上午','下午','晚上','中午','打算','准备','看看','一下']);
  function sharedBigrams(aSet, bSet) {
    let n = 0;
    aSet.forEach(b => { if (bSet.has(b) && !STOP.has(b)) n++; });
    return n;
  }
  /** 最长公共子串（做关键词） */
  function lcs(a, b) {
    const s1 = norm(a), s2 = norm(b);
    let best = '', prev = new Array(s2.length + 1).fill(0);
    for (let i = 1; i <= s1.length; i++) {
      const cur = new Array(s2.length + 1).fill(0);
      for (let j = 1; j <= s2.length; j++) {
        if (s1[i - 1] === s2[j - 1]) { cur[j] = prev[j - 1] + 1; if (cur[j] > best.length) best = s1.slice(i - cur[j], i); }
      }
      prev = cur;
    }
    return best;
  }

  /* —— 行为事件流 —— */
  function collectEvents() {
    const s = Store.s, out = [];
    (s.records || []).forEach(r => {
      const t = Store.getTask(r.taskId);
      out.push({ date: r.date, text: t ? t.title : (r.mode === 'flow' ? '自由正计时专注' : '自由番茄专注'), minutes: r.minutes || 0 });
    });
    (s.tasks || []).filter(t => t.status === 'done' && t.doneAt).forEach(t => {
      out.push({ date: Store.todayStr(new Date(t.doneAt)), text: `完成「${t.title}」`, minutes: 0 });
    });
    Object.entries(s.reviews || {}).forEach(([date, r]) => {
      (r.action || '').split('\n').forEach(line => {
        const t = line.replace(/^[\s\*\-\d\.、①②③④⑤⑥⑦⑧⑨⑩]+/, '').trim();
        if (norm(t).length >= 4) out.push({ date, text: t, minutes: 0, from: 'diary' });
      });
    });
    return out.sort((a, b) => a.date < b.date ? -1 : 1);
  }

  /* —— 聚类发现 —— */
  function discover() {
    const events = collectEvents().filter(e => e.date >= Store.dayOffset(Store.todayStr(), -60));
    const sets = events.map(e => bigrams(e.text));
    const parent = events.map((_, i) => i);
    const find = i => parent[i] === i ? i : (parent[i] = find(parent[i]));
    for (let i = 0; i < events.length; i++)
      for (let j = i + 1; j < events.length; j++)
        if (sharedBigrams(sets[i], sets[j]) >= 2) parent[find(i)] = find(j);
    const groups = {};
    events.forEach((e, i) => { const r = find(i); (groups[r] = groups[r] || []).push(e); });
    const clusters = Object.values(groups)
      .map(evs => {
        const days = [...new Set(evs.map(e => e.date))];
        const minutes = evs.reduce((s, e) => s + e.minutes, 0);
        return { events: evs, days: days.sort(), minutes, count: evs.length };
      })
      .filter(c => c.count >= 3 && c.days.length >= 2)
      .map(c => ({ ...c, keyword: keywordOf(c.events), bigrams: topBigrams(c.events) }))
      .sort((a, b) => b.count - a.count);
    return clusters;
  }
  function topBigrams(evs) {
    const freq = {};
    evs.forEach(e => bigrams(e.text).forEach(b => { if (!STOP.has(b)) freq[b] = (freq[b] || 0) + 1; }));
    return Object.entries(freq).sort((a, b) => b[1] - a[1]).slice(0, 8).map(x => x[0]);
  }
  function keywordOf(evs) {
    let best = '';
    for (let i = 0; i < Math.min(evs.length, 6); i++)
      for (let j = i + 1; j < Math.min(evs.length, 6); j++) {
        const c = lcs(evs[i].text, evs[j].text);
        if (c.length > best.length && !STOP.has(c)) best = c;
      }
    if (best.length >= 2) return best;
    const t = topBigrams(evs);
    return t[0] || evs[0].text.slice(0, 4);
  }
  const matchEvent = (sig, text) => sharedBigrams(new Set(sig), bigrams(text)) >= 2;

  /* —— 生长成目标 —— */
  function growGoal(cluster) {
    const kw = cluster.keyword;
    const now = Store.todayStr();
    const d30 = Store.dayOffset(now, -30);
    const recent = cluster.events.filter(e => e.date >= d30);
    const n30 = Math.max(3, recent.length);
    const weeks = [...new Set(cluster.days.map(d => Store.weekStr(new Date(d + 'T00:00:00'))))];
    const perWeek = Math.max(1, Math.round(cluster.days.length / weeks.length + 0.5));
    const minutes = Math.max(10, Math.round((cluster.minutes || 0) * 1.5 / 10) * 10);
    const goal = {
      id: Store.uid(), auto: true, status: 'growing', createdAt: Date.now(),
      title: `把「${kw}」养成稳定节奏`,
      source: cluster.events.map(e => e.text).slice(0, 5),
      sig: cluster.bigrams,
      kr: [
        { text: `30 天内「${kw}」相关行动 ≥ ${Math.ceil(n30 * 1.5)} 次`, unit: '次', target: Math.ceil(n30 * 1.5), current: n30 },
        { text: `每周至少 ${perWeek} 天有「${kw}」动作`, unit: '天/周', target: perWeek, current: 0 },
        { text: `累计投入 ≥ ${minutes} 分钟`, unit: '分钟', target: minutes, current: cluster.minutes || 0 },
      ],
    };
    // KR2 当前值：最近 7 天覆盖天数
    const d7 = Store.dayOffset(now, -7);
    goal.kr[1].current = new Set(cluster.events.filter(e => e.date >= d7).map(e => e.date)).size;
    Store.s.goals.unshift(goal); Store.save();
    return goal;
  }
  function addManualGoal(title, krs) {
    const goal = { id: Store.uid(), auto: false, status: 'growing', createdAt: Date.now(), title, source: [], sig: [], kr: krs.map(k => ({ text: k.text, unit: k.unit || '次', target: +k.target || 1, current: 0 })) };
    Store.s.goals.unshift(goal); Store.save(); return goal;
  }
  /** 重算自动目标的实时进度（近 30 天滚动窗口） */
  function refreshProgress(goal) {
    if (!goal.auto || !goal.sig?.length) return;
    const d30 = Store.dayOffset(Store.todayStr(), -30);
    const matched = collectEvents().filter(e => e.date >= d30 && matchEvent(goal.sig, e.text));
    goal.kr[0].current = matched.length;
    goal.kr[1].current = new Set(matched.map(e => e.date)).size; // 近7天覆盖天数
    goal.kr[2].current = matched.reduce((s, e) => s + e.minutes, 0);
    if (goal.status === 'growing' && goal.kr.every(k => k.current >= k.target)) {
      goal.status = 'done';
      return 'done';
    }
    return null;
  }

  /* —— 可选 AI 润色 —— */
  async function aiPolish(goal) {
    const api = Store.s.settings.api || {};
    if (!api.key) throw new Error('未配置 API Key');
    const prompt = `你是目标管理教练。用户从自己的行为记录里生长出一个 OKR 草稿，请只优化措辞，让它更具体、可衡量、有吸引力，不要改变含义和数值。
当前目标：${goal.title}
关键结果：${goal.kr.map((k, i) => `${i + 1}. ${k.text}`).join('；')}
行为来源：${(goal.source || []).join('、')}
只输出 JSON：{"objective":"...","kr":["...","...","..."]}`;
    const res = await fetch(api.url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${api.key}` },
      body: JSON.stringify({ model: api.model || 'glm-4-flash', messages: [{ role: 'user', content: prompt }], temperature: 0.6 }),
    });
    if (!res.ok) throw new Error('API ' + res.status);
    const data = await res.json();
    const text = data.choices?.[0]?.message?.content || '';
    const m = text.match(/\{[\s\S]*\}/);
    if (!m) throw new Error('无法解析模型输出');
    const o = JSON.parse(m[0]);
    if (o.objective) goal.title = o.objective;
    if (Array.isArray(o.kr)) o.kr.forEach((t, i) => { if (goal.kr[i] && t) goal.kr[i].text = t; });
    Store.save();
    return goal;
  }

  return { collectEvents, discover, growGoal, addManualGoal, refreshProgress, aiPolish, matchEvent, lcs };
})();
