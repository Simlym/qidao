import assert from "node:assert/strict";
import test from "node:test";

let sequence = 0;
async function setup(t, { state = "running", theme = "beep", fetchFails = false } = {}) {
  const values = new Map([["xq_sound_theme", theme]]);
  const started = [];
  const playedUrls = [];
  const oscillators = [];
  const gains = [];
  let finishResume;
  class Context {
    state = state;
    currentTime = 0;
    sampleRate = 24000;
    destination = {};
    resume() { return new Promise((resolve) => { finishResume = () => { this.state = "running"; resolve(); }; }); }
    createOscillator() {
      const oscillator = { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect: () => ({ connect() {} }), start: () => started.push("tone"),
        stop() { this.stopped = true; }, disconnect() { this.disconnected = true; } };
      oscillators.push(oscillator);
      return oscillator;
    }
    createGain() {
      const gain = { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} }, disconnect() { this.disconnected = true; } };
      gains.push(gain);
      return gain;
    }
    createBuffer() { return { sampleRate: 24000, getChannelData: () => new Float32Array(7200) }; }
    createBiquadFilter() { return { frequency: {}, Q: {}, connect: () => ({ connect() {} }) }; }
    createBufferSource() {
      return { connect: () => ({ connect: () => ({ connect() {} }) }), start() { started.push("sample"); playedUrls.push(this.buffer?.url); }, stop() {} };
    }
    decodeAudioData(data) { return Promise.resolve({ decoded: true, url: data.url }); }
  }
  const previous = Object.fromEntries(["window", "document", "localStorage", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globalThis.window = Object.assign(new EventTarget(), { AudioContext: Context });
  globalThis.document = Object.assign(new EventTarget(), { visibilityState: "visible" });
  globalThis.localStorage = { getItem: (key) => values.get(key), setItem: (key, value) => values.set(key, value) };
  globalThis.fetch = async (url) => {
    if (fetchFails) throw new Error("离线");
    return { ok: true, arrayBuffer: async () => Object.assign(new ArrayBuffer(4), { url: url.href }) };
  };
  t.after(() => {
    for (const [key, descriptor] of Object.entries(previous)) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  });
  const sounds = await import(`./sounds.js?test=${sequence++}`);
  return { ...sounds, started, playedUrls, oscillators, gains, values,
    visibility(state) { document.visibilityState = state; document.dispatchEvent(new Event("visibilitychange")); },
    resume: () => finishResume(), flush: () => new Promise((resolve) => setImmediate(resolve)) };
}

test("外接音频兼容默认关闭，只在开启且对局活动时保持输出", async (t) => {
  const s = await setup(t);
  assert.equal(s.soundKeepAlive(), false);
  s.prepareSounds();
  assert.deepEqual(s.started, []);
  s.setSoundKeepAlive(true);
  assert.equal(s.soundKeepAlive(), true);
  assert.deepEqual(s.started, []);
  const release = s.retainSoundOutput();
  assert.deepEqual(s.started, ["tone"]);
  assert.equal(s.oscillators[0].frequency.value, 20);
  assert.equal(s.gains[0].gain.value, 0.001);
  s.prepareSounds();
  assert.equal(s.oscillators.length, 1);
  release();
  assert.equal(s.oscillators[0].stopped, true);
  assert.equal(s.oscillators[0].disconnected, true);
  assert.equal(s.gains[0].disconnected, true);
  release();
});

test("保持输出在静音、切后台和关闭选项时停止，再启用时恢复", async (t) => {
  const s = await setup(t);
  s.setSoundKeepAlive(true);
  const release = s.retainSoundOutput();
  s.setSoundMuted(true);
  assert.equal(s.oscillators[0].stopped, true);
  s.setSoundMuted(false);
  assert.equal(s.oscillators.length, 2);
  s.visibility("hidden");
  assert.equal(s.oscillators[1].stopped, true);
  s.prepareSounds();
  assert.equal(s.oscillators.length, 2);
  s.visibility("visible");
  assert.equal(s.oscillators.length, 3);
  s.setSoundKeepAlive(false);
  assert.equal(s.oscillators[2].stopped, true);
  s.setSoundKeepAlive(true);
  assert.equal(s.oscillators.length, 4);
  release();
});

test("多个棋盘共用一路保持输出，最后离开及迟到唤醒均不遗留信号", async (t) => {
  const s = await setup(t, { state: "suspended" });
  s.setSoundKeepAlive(true);
  const first = s.retainSoundOutput();
  const second = s.retainSoundOutput();
  first(); second();
  s.resume();
  await s.flush();
  assert.deepEqual(s.started, []);
  const third = s.retainSoundOutput();
  const fourth = s.retainSoundOutput();
  assert.equal(s.oscillators.length, 1);
  third();
  assert.equal(s.oscillators[0].stopped, undefined);
  fourth();
  assert.equal(s.oscillators[0].stopped, true);
});

test("其他标签页关闭兼容选项或页面离开时释放保持输出", async (t) => {
  const s = await setup(t);
  s.setSoundKeepAlive(true);
  const release = s.retainSoundOutput();
  s.values.set("xq_sound_keep_alive", "0");
  window.dispatchEvent(new Event("storage"));
  assert.equal(s.oscillators[0].stopped, true);
  s.setSoundKeepAlive(true);
  window.dispatchEvent(new Event("pagehide"));
  assert.equal(s.oscillators[1].stopped, true);
  window.dispatchEvent(new Event("pageshow"));
  assert.equal(s.oscillators.length, 3);
  release();
  window.dispatchEvent(new Event("pageshow"));
  assert.equal(s.oscillators.length, 3);
});

test("第一步等待音频恢复后才启动短音，避免首次落子丢声", async (t) => {
  const s = await setup(t, { state: "suspended" });
  s.playSound("move");
  assert.deepEqual(s.started, []);
  s.resume();
  await s.flush();
  assert.deepEqual(s.started, ["tone"]);
});

test("恢复音频期间静音后不补播旧声音", async (t) => {
  const s = await setup(t, { state: "suspended" });
  s.playSound("move");
  s.setSoundMuted(true);
  s.resume();
  await s.flush();
  assert.deepEqual(s.started, []);
});

test("恢复音频期间切换音色后不补播旧声音", async (t) => {
  const s = await setup(t, { state: "suspended" });
  s.playSound("move");
  s.setSoundTheme("crisp");
  s.resume();
  await s.flush();
  assert.deepEqual(s.started, []);
});

test("默认木质预热后使用采样覆盖全部棋局事件", async (t) => {
  const s = await setup(t, { theme: "wood" });
  s.prepareSounds();
  await s.flush();
  for (const name of ["move", "capture", "check", "win", "lose", "draw"]) s.playSound(name);
  assert.deepEqual(s.started, Array(6).fill("sample"));
});

for (const theme of ["xqwlight", "gmchess", "stevenbaby"]) {
  test(`${theme} 主题可持久保存并使用对应采样及终局补齐音效`, async (t) => {
    const s = await setup(t, { theme });
    assert.equal(s.soundTheme(), theme);
    assert.ok(s.SOUND_THEMES.some((item) => item.key === theme));
    s.prepareSounds();
    await s.flush();
    for (const name of ["move", "capture", "check", "win", "lose", "draw"]) s.playSound(name);
    assert.deepEqual(s.started, Array(6).fill("sample"));
    const own = (name) => `/auditions/${theme}/${name}.wav`;
    const wizard = (name) => `/auditions/xqwlight/${name}.wav`;
    const expected = [own("move"), own(theme === "gmchess" ? "eat" : "capture"), own("check"),
      theme === "stevenbaby" ? wizard("win") : own("win"),
      theme === "stevenbaby" ? wizard("loss") : own("loss"), wizard("draw")];
    s.playedUrls.forEach((url, i) => assert.ok(url.endsWith(expected[i]), url));
    s.setSoundTheme("wood");
    s.prepareSounds();
    await s.flush();
    s.playSound("move");
    assert.ok(s.playedUrls.at(-1).endsWith("/audio/move.wav"));
  });
}

test("采样下载失败时立即降级，不因离线丢失声音", async (t) => {
  const s = await setup(t, { theme: "wood", fetchFails: true });
  s.playSound("move");
  assert.ok(s.started.length > 0);
  await s.flush();
  const count = s.started.length;
  await s.flush();
  assert.equal(s.started.length, count);
});

test("静音时预热和走棋均不启动声音", async (t) => {
  const s = await setup(t);
  s.setSoundMuted(true);
  s.prepareSounds();
  s.playSound("move");
  assert.deepEqual(s.started, []);
});

test("设备拒绝创建音频时不影响走棋", async (t) => {
  const s = await setup(t);
  window.AudioContext = class { constructor() { throw new Error("设备不可用"); } };
  assert.doesNotThrow(() => s.prepareSounds());
  assert.doesNotThrow(() => s.playSound("move"));
});

test("静音时切换音色和显式试听不会解除静音或播放后续走子", async (t) => {
  const s = await setup(t);
  s.setSoundMuted(true);
  s.setSoundTheme("crisp");
  s.previewSound("move");
  assert.ok(s.started.length > 0);
  assert.equal(s.soundMuted(), true);
  assert.equal(s.soundTheme(), "crisp");
  const count = s.started.length;
  s.playSound("capture");
  assert.equal(s.started.length, count);
});

test("声音设置通知其他面板，退订后不再接收更新", async (t) => {
  const s = await setup(t);
  const updates = [];
  const unsubscribe = s.subscribeSoundPreferences(() => updates.push([s.soundMuted(), s.soundTheme()]));
  s.setSoundMuted(true);
  s.setSoundTheme("soft");
  assert.deepEqual(updates, [[true, "beep"], [true, "soft"]]);
  unsubscribe();
  s.setSoundMuted(false);
  assert.equal(updates.length, 2);
});

test("等待音频恢复的试听在切换音色后不补播旧音色", async (t) => {
  const s = await setup(t, { state: "suspended" });
  s.setSoundMuted(true);
  s.previewSound("move");
  s.setSoundTheme("soft");
  s.resume();
  await s.flush();
  assert.deepEqual(s.started, []);
  assert.equal(s.soundMuted(), true);
});
