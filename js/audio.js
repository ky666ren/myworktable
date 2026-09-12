/* ═══════════ 音频：WebAudio 实时合成噪音（无素材依赖）+ 提示音 ═══════════ */
const Audio2 = (() => {
  let ctx = null, src = null, gain = null, filter = null, lfo = null, lfoGain = null, current = 'off';
  let volume = 0.45;

  function ensure() {
    if (!ctx) {
      ctx = new (window.AudioContext || window.webkitAudioContext)();
      gain = ctx.createGain();
      gain.gain.value = volume * 0.9;
      gain.connect(ctx.destination);
    }
    if (ctx.state === 'suspended') ctx.resume();
  }

  function makeBufferSec(seconds = 2) {
    const len = ctx.sampleRate * seconds;
    return ctx.createBuffer(1, len, ctx.sampleRate);
  }

  function stop() {
    if (src) { try { src.stop(); } catch (e) {} src = null; }
    if (lfo) { try { lfo.stop(); } catch (e) {} lfo = null; }
    current = 'off';
  }

  function play(type) {
    stop();
    if (type === 'off') return;
    ensure();
    const buf = makeBufferSec(4);
    const data = buf.getChannelData(0);

    if (type === 'white' || type === 'drizzle') {
      for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    } else if (type === 'brown') {
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.02 * w) / 1.02;
        data[i] = last * 3.2;
      }
    } else if (type === 'rain') {
      let last = 0;
      for (let i = 0; i < data.length; i++) {
        const w = Math.random() * 2 - 1;
        last = (last + 0.04 * w) / 1.04;
        data[i] = last * 2.4;
      }
    }
    src = ctx.createBufferSource();
    src.buffer = buf; src.loop = true;
    filter = ctx.createBiquadFilter();
    if (type === 'rain') {
      filter.type = 'lowpass'; filter.frequency.value = 900; filter.Q.value = 0.6;
      src.connect(filter); filter.connect(gain);
    } else if (type === 'brown') {
      filter.type = 'lowpass'; filter.frequency.value = 2400;
      src.connect(filter); filter.connect(gain);
    } else if (type === 'drizzle') {
      // 小雨：高频白噪 + 慢速音量起伏，淅淅沥沥
      filter.type = 'lowpass'; filter.frequency.value = 3800; filter.Q.value = 0.4;
      src.connect(filter); filter.connect(gain);
      lfo = ctx.createOscillator(); lfoGain = ctx.createGain();
      lfo.type = 'sine'; lfo.frequency.value = 0.22;
      lfoGain.gain.value = volume * 0.25;
      lfo.connect(lfoGain); lfoGain.connect(gain.gain);
      lfo.start();
    } else {
      filter.type = 'lowpass'; filter.frequency.value = 6000;
      src.connect(filter); filter.connect(gain);
    }
    src.start();
    current = type;
  }

  function setVolume(v) {
    volume = Math.max(0, Math.min(1, v));
    if (gain) gain.gain.value = volume * 0.9;
  }
  function set(type) { if (type === current) return; play(type); }
  function get() { return current; }

  function chime() {
    try {
      ensure();
      const now = ctx.currentTime;
      [[659.25, 0], [880, 0.18], [1318.5, 0.36]].forEach(([f, dt]) => {
        const o = ctx.createOscillator(), g = ctx.createGain();
        o.type = 'sine'; o.frequency.value = f;
        g.gain.setValueAtTime(0.0001, now + dt);
        g.gain.exponentialRampToValueAtTime(0.28, now + dt + 0.03);
        g.gain.exponentialRampToValueAtTime(0.0001, now + dt + 1.1);
        o.connect(g); g.connect(ctx.destination);
        o.start(now + dt); o.stop(now + dt + 1.2);
      });
    } catch (e) {}
  }

  return { set, get, setVolume, chime, ensure };
})();
