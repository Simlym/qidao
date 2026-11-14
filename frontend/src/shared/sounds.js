// 木质与三套象棋主题使用随包采样，采样不可用时使用 Web Audio 合成。
// 浏览器要求首次播放前有用户手势；棋类场景里走子本身就是点击，天然满足。

let ctx = null;
let noiseBuf = null;
let soundSequence = 0;
let outputUsers = 0;
let outputSignal = null;

function stopOutputSignal() {
  if (!outputSignal) return;
  outputSignal.oscillator.stop();
  outputSignal.oscillator.disconnect();
  outputSignal.gain.disconnect();
  outputSignal = null;
}

function syncOutputSignal() {
  const enabled = outputUsers > 0 && soundKeepAlive() && !soundMuted() && document.visibilityState !== "hidden";
  if (!enabled) { stopOutputSignal(); return; }
  if (!ctx || ctx.state !== "running" || outputSignal) return;
  try {
    // 数字音频接收设备可能在全静音后关闭输出，running 状态也不能避免吞掉下一段短音。
    // 仅在用户开启兼容选项且对局页面可见时，发送很轻的低频信号保持输出。
    const oscillator = ctx.createOscillator();
    const gain = ctx.createGain();
    oscillator.frequency.value = 20;
    gain.gain.value = 0.001;
    oscillator.connect(gain).connect(ctx.destination);
    oscillator.start();
    outputSignal = { oscillator, gain };
  } catch (error) { traceSound("保持输出失败", { error: String(error) }); }
}

function refreshOutputSignal() {
  if (outputUsers > 0 && soundKeepAlive() && !soundMuted() && document.visibilityState !== "hidden") prepareSounds();
  else syncOutputSignal();
}

// 引用计数兼容多个棋盘；最后一个对局离开后释放音频，不在其他页面持续输出。
export function retainSoundOutput() {
  outputUsers++;
  if (outputUsers === 1) {
    document.addEventListener("visibilitychange", refreshOutputSignal);
    window.addEventListener("storage", refreshOutputSignal);
    window.addEventListener("pagehide", stopOutputSignal);
    window.addEventListener("pageshow", refreshOutputSignal);
  }
  refreshOutputSignal();
  let released = false;
  return () => {
    if (released) return;
    released = true;
    outputUsers--;
    if (outputUsers === 0) {
      document.removeEventListener("visibilitychange", refreshOutputSignal);
      window.removeEventListener("storage", refreshOutputSignal);
      window.removeEventListener("pagehide", stopOutputSignal);
      window.removeEventListener("pageshow", refreshOutputSignal);
    }
    syncOutputSignal();
  };
}

if (import.meta.hot) import.meta.hot.dispose(stopOutputSignal);

function traceSound(event, details) {
  if (import.meta.env?.DEV) console.info(`[对弈音效] ${event} ${JSON.stringify(details)}`);
}
const samples = {
  move: new URL("./audio/move.wav", import.meta.url),
  capture: new URL("./audio/capture.wav", import.meta.url),
  check: new URL("./audio/check.wav", import.meta.url),
  win: new URL("./audio/win.wav", import.meta.url),
  lose: new URL("./audio/lose.wav", import.meta.url),
  draw: new URL("./audio/draw.wav", import.meta.url),
};
const wizardSamples = {
  move: new URL("./audio/auditions/xqwlight/move.wav", import.meta.url),
  capture: new URL("./audio/auditions/xqwlight/capture.wav", import.meta.url),
  check: new URL("./audio/auditions/xqwlight/check.wav", import.meta.url),
  win: new URL("./audio/auditions/xqwlight/win.wav", import.meta.url),
  lose: new URL("./audio/auditions/xqwlight/loss.wav", import.meta.url),
  draw: new URL("./audio/auditions/xqwlight/draw.wav", import.meta.url),
};
// 缺少的终局提示沿用象棋巫师，避免不同胜负事件落回通用电子音。
const SAMPLED_THEMES = {
  wood: samples,
  xqwlight: wizardSamples,
  gmchess: {
    ...wizardSamples,
    move: new URL("./audio/auditions/gmchess/move.wav", import.meta.url),
    capture: new URL("./audio/auditions/gmchess/eat.wav", import.meta.url),
    check: new URL("./audio/auditions/gmchess/check.wav", import.meta.url),
    win: new URL("./audio/auditions/gmchess/win.wav", import.meta.url),
    lose: new URL("./audio/auditions/gmchess/loss.wav", import.meta.url),
  },
  stevenbaby: {
    ...wizardSamples,
    move: new URL("./audio/auditions/stevenbaby/move.wav", import.meta.url),
    capture: new URL("./audio/auditions/stevenbaby/capture.wav", import.meta.url),
    check: new URL("./audio/auditions/stevenbaby/check.wav", import.meta.url),
  },
};
const sampleBuffers = new Map();
const loadingSamples = new Map();

function preloadSamples(c, key = soundTheme()) {
  for (const url of Object.values(SAMPLED_THEMES[key] || {})) {
    if (sampleBuffers.has(url.href) || loadingSamples.has(url.href)) continue;
    const request = (async () => {
      try {
        const response = await fetch(url);
        if (!response.ok) return;
        sampleBuffers.set(url.href, await c.decodeAudioData(await response.arrayBuffer()));
      } catch { /* 下载或解码失败时保留合成音，不延迟补播 */ }
    })();
    loadingSamples.set(url.href, request);
    request.finally(() => loadingSamples.delete(url.href));
  }
}

function audioCtx() {
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return null;
  if (!ctx) ctx = new AC();
  return ctx;
}

// 在选子或开局的用户手势中提前唤醒，避免第一步短音在恢复音频时丢失。
export function prepareSounds() {
  if (soundMuted()) return;
  try {
    const c = audioCtx();
    if (c) preloadSamples(c);
    if (c && c.state !== "running") c.resume().then(syncOutputSignal).catch(() => {});
    else syncOutputSignal();
  } catch { /* 音频不可用不影响走棋 */ }
}

const MUTE_KEY = "xq_sound_muted";
const THEME_KEY = "xq_sound_theme";
const KEEP_ALIVE_KEY = "xq_sound_keep_alive";
const preferenceListeners = new Set();

export function subscribeSoundPreferences(listener) {
  preferenceListeners.add(listener);
  return () => preferenceListeners.delete(listener);
}

function notifyPreferences() {
  preferenceListeners.forEach((listener) => listener());
}

export const SOUND_THEMES = [
  { key: "xqwlight", label: "象棋巫师" },
  { key: "gmchess", label: "GMChess" },
  { key: "stevenbaby", label: "StevenBaby 象棋" },
  { key: "wood", label: "木质" },
  { key: "crisp", label: "清脆" },
  { key: "beep", label: "电子" },
  { key: "clear", label: "清晰" },
  { key: "arcade", label: "街机" },
  { key: "bubble", label: "泡泡" },
  { key: "soft", label: "轻触" },
];
const ALL_SOUND_KEYS = [...SOUND_THEMES.map((item) => item.key), "temple"];
const SOUND_LABELS = {
  xqwlight: "象棋巫师", gmchess: "GMChess", stevenbaby: "StevenBaby 象棋",
  wood: "木质", crisp: "清脆", beep: "电子", temple: "古寺梵音",
  clear: "清晰提示", arcade: "街机脉冲", bubble: "泡泡音符", soft: "轻触音",
};

export function soundThemeLabel(key) {
  return SOUND_LABELS[key] || "木质";
}

export function soundMuted() {
  try {
    return localStorage.getItem(MUTE_KEY) === "1";
  } catch {
    return false;
  }
}

export function setSoundMuted(muted) {
  try {
    localStorage.setItem(MUTE_KEY, muted ? "1" : "0");
  } catch { /* 隐私模式等存不了就算了 */ }
  refreshOutputSignal();
  notifyPreferences();
}

export function soundKeepAlive() {
  try { return localStorage.getItem(KEEP_ALIVE_KEY) === "1"; }
  catch { return false; }
}

export function setSoundKeepAlive(enabled) {
  try { localStorage.setItem(KEEP_ALIVE_KEY, enabled ? "1" : "0"); }
  catch { /* 设备存储不可用时不影响走棋 */ }
  refreshOutputSignal();
  notifyPreferences();
}

export function soundTheme() {
  try {
    const t = localStorage.getItem(THEME_KEY);
    return ALL_SOUND_KEYS.includes(t) ? t : "wood";
  } catch {
    return "wood";
  }
}

export function setSoundTheme(key) {
  if (!ALL_SOUND_KEYS.includes(key)) return;
  try {
    localStorage.setItem(THEME_KEY, key);
  } catch { /* ignore */ }
  notifyPreferences();
}

// 播放一个包络衰减的单音。time 为相对当前的起始秒数，to 给出则做频率滑音。
function tone(c, { freq, to = freq, time = 0, dur = 0.1, type = "sine", gain = 0.2 }) {
  const o = c.createOscillator();
  const g = c.createGain();
  const t0 = c.currentTime + time;
  o.type = type;
  o.frequency.setValueAtTime(freq, t0);
  if (to !== freq) o.frequency.exponentialRampToValueAtTime(to, t0 + dur);
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  o.connect(g).connect(c.destination);
  o.start(t0);
  o.stop(t0 + dur + 0.02);
}

// 短促噪声敲击：带通滤波白噪声 + 指数衰减，是木质敲击声的主体。
// q 越大越接近梆子那种有音高的「笃」，q 小则是松散的「嗒」。
function knock(c, { time = 0, dur = 0.05, freq = 2000, q = 1, gain = 0.3 }) {
  if (!noiseBuf || noiseBuf.sampleRate !== c.sampleRate) {
    const len = Math.floor(c.sampleRate * 0.3);
    noiseBuf = c.createBuffer(1, len, c.sampleRate);
    const data = noiseBuf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
  }
  const src = c.createBufferSource();
  src.buffer = noiseBuf;
  const f = c.createBiquadFilter();
  f.type = "bandpass";
  f.frequency.value = freq;
  f.Q.value = q;
  const g = c.createGain();
  const t0 = c.currentTime + time;
  g.gain.setValueAtTime(gain, t0);
  g.gain.exponentialRampToValueAtTime(0.001, t0 + dur);
  src.connect(f).connect(g).connect(c.destination);
  src.start(t0);
  src.stop(t0 + dur + 0.02);
}

// 每套主题实现同一组事件：move | capture | check | win | lose | draw
const THEMES = {
  // 木质：常规象棋 App 风格，实木棋子拍在木枰上的「啪嗒」
  wood: {
    move(c) {
      knock(c, { freq: 2300, q: 1.2, dur: 0.04, gain: 0.5 });
      tone(c, { freq: 190, to: 70, dur: 0.08, gain: 0.35 }); // 低频闷响给出“分量”
    },
    capture(c) {
      // 吃子更重：先重拍，再带一记被提走棋子的轻磕
      knock(c, { freq: 1600, q: 1, dur: 0.06, gain: 0.6 });
      tone(c, { freq: 150, to: 55, dur: 0.13, gain: 0.45 });
      knock(c, { freq: 2600, q: 1.5, dur: 0.035, gain: 0.3, time: 0.055 });
    },
    check(c) {
      // 将军：梆子连敲两声
      knock(c, { freq: 1150, q: 7, dur: 0.1, gain: 0.45 });
      knock(c, { freq: 1500, q: 7, dur: 0.14, gain: 0.45, time: 0.14 });
    },
    win(c) {
      [523, 659, 784, 1047].forEach((f, i) =>
        tone(c, { freq: f, dur: 0.18, time: i * 0.13, type: "triangle", gain: 0.16 })
      );
    },
    lose(c) {
      [330, 262, 196].forEach((f, i) =>
        tone(c, { freq: f, dur: 0.25, time: i * 0.17, type: "triangle", gain: 0.14 })
      );
    },
    draw(c) {
      knock(c, { freq: 1200, q: 5, dur: 0.1, gain: 0.35 });
      knock(c, { freq: 1200, q: 5, dur: 0.12, gain: 0.35, time: 0.16 });
    },
  },

  // 清脆：玉石/瓷子质感，高频短促
  crisp: {
    move(c) {
      tone(c, { freq: 1500, to: 950, dur: 0.05, gain: 0.22 });
      knock(c, { freq: 5500, q: 1, dur: 0.025, gain: 0.2 });
    },
    capture(c) {
      tone(c, { freq: 1200, to: 600, dur: 0.08, gain: 0.25 });
      tone(c, { freq: 420, to: 180, dur: 0.1, type: "square", gain: 0.1, time: 0.01 });
      knock(c, { freq: 4500, q: 1.5, dur: 0.04, gain: 0.22 });
    },
    check(c) {
      tone(c, { freq: 1318, dur: 0.09, gain: 0.2 });
      tone(c, { freq: 1760, dur: 0.14, time: 0.11, gain: 0.2 });
    },
    win(c) {
      [659, 784, 988, 1318].forEach((f, i) =>
        tone(c, { freq: f, dur: 0.16, time: i * 0.12, gain: 0.16 })
      );
    },
    lose(c) {
      [494, 415, 330].forEach((f, i) =>
        tone(c, { freq: f, dur: 0.22, time: i * 0.16, gain: 0.14 })
      );
    },
    draw(c) {
      tone(c, { freq: 880, dur: 0.12, gain: 0.15 });
      tone(c, { freq: 880, dur: 0.16, time: 0.16, gain: 0.15 });
    },
  },

  // 电子：纯振荡器合成的提示音
  beep: {
    move(c) {
      tone(c, { freq: 900, to: 320, dur: 0.07, type: "triangle", gain: 0.25 });
    },
    capture(c) {
      tone(c, { freq: 480, to: 140, dur: 0.13, type: "square", gain: 0.16 });
      tone(c, { freq: 1200, to: 600, dur: 0.05, time: 0.01, type: "triangle", gain: 0.16 });
    },
    check(c) {
      tone(c, { freq: 880, dur: 0.09, gain: 0.2 });
      tone(c, { freq: 1175, dur: 0.14, time: 0.11, gain: 0.2 });
    },
    win(c) {
      [523, 659, 784, 1047].forEach((f, i) =>
        tone(c, { freq: f, dur: 0.16, time: i * 0.12, gain: 0.18 })
      );
    },
    lose(c) {
      [392, 330, 262].forEach((f, i) =>
        tone(c, { freq: f, dur: 0.22, time: i * 0.16, gain: 0.16 })
      );
    },
    draw(c) {
      tone(c, { freq: 440, dur: 0.12, gain: 0.15 });
      tone(c, { freq: 440, dur: 0.16, time: 0.16, gain: 0.15 });
    },
  },
  // 古寺：低沉木鱼与钟磬，为商店买断音色。
  temple: {
    move(c) {
      knock(c, { freq: 760, q: 8, dur: 0.11, gain: 0.38 });
      tone(c, { freq: 196, to: 150, dur: 0.24, type: "sine", gain: 0.12 });
    },
    capture(c) {
      knock(c, { freq: 610, q: 7, dur: 0.16, gain: 0.48 });
      tone(c, { freq: 174, to: 95, dur: 0.32, type: "sine", gain: 0.16 });
    },
    check(c) {
      [523, 659].forEach((f, i) => tone(c, { freq: f, dur: 0.45, time: i * 0.16, gain: 0.11 }));
    },
    win(c) {
      [392, 523, 659, 784].forEach((f, i) => tone(c, { freq: f, dur: 0.4, time: i * 0.17, gain: 0.1 }));
    },
    lose(c) {
      [330, 247, 196].forEach((f, i) => tone(c, { freq: f, dur: 0.38, time: i * 0.2, gain: 0.1 }));
    },
    draw(c) {
      knock(c, { freq: 690, q: 9, dur: 0.16, gain: 0.34 });
      knock(c, { freq: 690, q: 9, dur: 0.16, gain: 0.34, time: 0.24 });
    },
  },
  // 清晰：控制低频与音量，用间隔更长的双音让提示容易分辨。
  clear: {
    move(c) {
      tone(c, { freq: 660, dur: 0.1, type: "triangle", gain: 0.16 });
      tone(c, { freq: 880, dur: 0.12, time: 0.1, type: "triangle", gain: 0.13 });
    },
    capture(c) {
      tone(c, { freq: 740, to: 370, dur: 0.18, type: "triangle", gain: 0.18 });
      knock(c, { freq: 1800, q: 3, dur: 0.08, gain: 0.2, time: 0.08 });
    },
    check(c) {
      [784, 988, 784].forEach((f, i) => tone(c, { freq: f, dur: 0.14, time: i * 0.15, gain: 0.15 }));
    },
    win(c) {
      [523, 659, 784].forEach((f, i) => tone(c, { freq: f, dur: 0.24, time: i * 0.2, type: "triangle", gain: 0.13 }));
    },
    lose(c) {
      [440, 349, 294].forEach((f, i) => tone(c, { freq: f, dur: 0.25, time: i * 0.21, type: "triangle", gain: 0.12 }));
    },
    draw(c) {
      tone(c, { freq: 587, dur: 0.18, gain: 0.13 });
      tone(c, { freq: 587, dur: 0.18, time: 0.24, gain: 0.13 });
    },
  },
  // 街机：方波与快速琶音，强调操作反馈。
  arcade: {
    move(c) {
      tone(c, { freq: 220, to: 880, dur: 0.08, type: "square", gain: 0.09 });
    },
    capture(c) {
      tone(c, { freq: 980, to: 140, dur: 0.16, type: "sawtooth", gain: 0.1 });
      tone(c, { freq: 1320, dur: 0.05, time: 0.12, type: "square", gain: 0.08 });
    },
    check(c) {
      [880, 1175, 1568].forEach((f, i) => tone(c, { freq: f, dur: 0.08, time: i * 0.09, type: "square", gain: 0.08 }));
    },
    win(c) {
      [523, 659, 784, 1047, 1318].forEach((f, i) => tone(c, { freq: f, dur: 0.12, time: i * 0.09, type: "square", gain: 0.07 }));
    },
    lose(c) {
      [392, 294, 196, 147].forEach((f, i) => tone(c, { freq: f, dur: 0.16, time: i * 0.12, type: "sawtooth", gain: 0.07 }));
    },
    draw(c) {
      [440, 440, 330].forEach((f, i) => tone(c, { freq: f, dur: 0.1, time: i * 0.13, type: "square", gain: 0.07 }));
    },
  },
  // 泡泡：正弦滑音模拟圆润的弹跳感。
  bubble: {
    move(c) { tone(c, { freq: 360, to: 720, dur: 0.12, gain: 0.17 }); },
    capture(c) {
      tone(c, { freq: 720, to: 260, dur: 0.17, gain: 0.18 });
      tone(c, { freq: 520, to: 880, dur: 0.12, time: 0.11, gain: 0.12 });
    },
    check(c) {
      [660, 880, 1100].forEach((f, i) => tone(c, { freq: f, to: f * 1.18, dur: 0.12, time: i * 0.11, gain: 0.12 }));
    },
    win(c) {
      [523, 659, 784, 988].forEach((f, i) => tone(c, { freq: f, to: f * 1.12, dur: 0.18, time: i * 0.13, gain: 0.12 }));
    },
    lose(c) {
      [523, 440, 349].forEach((f, i) => tone(c, { freq: f, to: f * 0.82, dur: 0.2, time: i * 0.16, gain: 0.11 }));
    },
    draw(c) {
      tone(c, { freq: 520, to: 650, dur: 0.16, gain: 0.12 });
      tone(c, { freq: 520, to: 650, dur: 0.16, time: 0.2, gain: 0.12 });
    },
  },
  // 轻触：短而克制，连续训练时尽量不打断思路。
  soft: {
    move(c) { knock(c, { freq: 2700, q: 1.4, dur: 0.025, gain: 0.12 }); },
    capture(c) {
      knock(c, { freq: 2100, q: 1.8, dur: 0.04, gain: 0.15 });
      tone(c, { freq: 280, to: 190, dur: 0.08, gain: 0.06 });
    },
    check(c) {
      tone(c, { freq: 740, dur: 0.07, gain: 0.08 });
      tone(c, { freq: 880, dur: 0.09, time: 0.1, gain: 0.08 });
    },
    win(c) {
      [523, 659, 784].forEach((f, i) => tone(c, { freq: f, dur: 0.13, time: i * 0.11, gain: 0.07 }));
    },
    lose(c) {
      [392, 330, 262].forEach((f, i) => tone(c, { freq: f, dur: 0.15, time: i * 0.12, gain: 0.065 }));
    },
    draw(c) {
      knock(c, { freq: 2400, q: 2, dur: 0.03, gain: 0.1 });
      knock(c, { freq: 2400, q: 2, dur: 0.03, gain: 0.1, time: 0.14 });
    },
  },
};

// name: move | capture | check | win | lose | draw
export function playSound(name, source = "未标记") {
  playEventSound(name, false, source);
}

// 显式试听只绕过本次静音，不修改用户的对局音效开关。
export function previewSound(name = "move") {
  playEventSound(name, true, "音效试听");
}

function playEventSound(name, preview, source) {
  const id = ++soundSequence;
  const requestedAt = Date.now();
  const muted = soundMuted();
  const details = { id, source, name, theme: soundTheme(), muted };
  traceSound("收到请求", { ...details, time: new Date(requestedAt).toISOString(), state: ctx?.state || "未创建" });
  if (!preview && muted) { traceSound("已静音，跳过", details); return; }
  try {
    const c = audioCtx();
    if (!c) { traceSound("设备不支持音频", details); return; }
    const key = soundTheme();
    const fallback = (THEMES[key] || THEMES.wood)[name];
    if (!fallback) return;
    preloadSamples(c, key);
    const fn = () => {
      const url = SAMPLED_THEMES[key]?.[name];
      const buffer = url && sampleBuffers.get(url.href);
      traceSound("开始播放", { ...details, state: c.state, currentTime: c.currentTime,
        elapsedMs: Date.now() - requestedAt, mode: buffer ? "音效文件" : "合成音",
        duration: buffer?.duration, sampleRate: c.sampleRate,
        baseLatency: c.baseLatency, outputLatency: c.outputLatency, file: url?.pathname });
      if (!buffer) return fallback(c);
      const node = c.createBufferSource();
      node.buffer = buffer;
      node.connect(c.destination);
      node.onended = () => traceSound("播放结束", { ...details, state: c.state,
        currentTime: c.currentTime, elapsedMs: Date.now() - requestedAt });
      node.start();
    };
    if (c.state === "running") fn(c);
    else {
      traceSound("等待唤醒", { ...details, state: c.state });
      c.resume().then(() => {
        // 恢复失败、切换音色、静音或长时间挂起后，不补播旧局面的声音。
        const elapsedMs = Date.now() - requestedAt;
        if (c.state === "running" && elapsedMs < 250 && (preview || !soundMuted()) && soundTheme() === key) fn(c);
        else traceSound("唤醒后丢弃", { ...details, state: c.state, elapsedMs,
          currentMuted: soundMuted(), currentTheme: soundTheme() });
      }).catch((error) => traceSound("唤醒失败", { ...details, error: String(error) }));
    }
  } catch (error) { traceSound("播放异常", { ...details, error: String(error), stack: error?.stack }); }
}
