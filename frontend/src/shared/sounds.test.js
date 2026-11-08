import assert from "node:assert/strict";
import test from "node:test";

let sequence = 0;
async function setup(t, { state = "running", theme = "beep", fetchFails = false } = {}) {
  const values = new Map([["xq_sound_theme", theme]]);
  const started = [];
  const playedUrls = [];
  let finishResume;
  class Context {
    state = state;
    currentTime = 0;
    sampleRate = 24000;
    destination = {};
    resume() { return new Promise((resolve) => { finishResume = () => { this.state = "running"; resolve(); }; }); }
    createOscillator() {
      return { frequency: { setValueAtTime() {}, exponentialRampToValueAtTime() {} },
        connect: () => ({ connect() {} }), start: () => started.push("tone"), stop() {} };
    }
    createGain() {
      return { gain: { setValueAtTime() {}, exponentialRampToValueAtTime() {} } };
    }
    createBuffer() { return { sampleRate: 24000, getChannelData: () => new Float32Array(7200) }; }
    createBiquadFilter() { return { frequency: {}, Q: {}, connect: () => ({ connect() {} }) }; }
    createBufferSource() {
      return { connect: () => ({ connect: () => ({ connect() {} }) }), start() { started.push("sample"); playedUrls.push(this.buffer?.url); }, stop() {} };
    }
    decodeAudioData(data) { return Promise.resolve({ decoded: true, url: data.url }); }
  }
  const previous = Object.fromEntries(["window", "localStorage", "fetch"].map((key) => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  globalThis.window = { AudioContext: Context };
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
  return { ...sounds, started, playedUrls, resume: () => finishResume(), flush: () => new Promise((resolve) => setImmediate(resolve)) };
}

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
