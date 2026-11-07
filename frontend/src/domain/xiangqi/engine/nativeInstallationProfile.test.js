import test from "node:test";
import assert from "node:assert/strict";
import { nativeInstallationProfile } from "./nativeInstallationProfile.js";

test("ZIP 安装将程序与匹配权重一起启用", () => {
  const profile = nativeInstallationProfile({ package: { variant: "jieqi" }, enginePath: "jieqi.exe", nnuePath: "jieqi.nnue" }, "jieqi", { threads: 2, hashMb: 128 });
  assert.equal(profile.path, "jieqi.exe");
  assert.equal(profile.nnuePath, "jieqi.nnue");
  assert.equal(profile.useNnue, true);
  assert.equal(profile.uciVariant, null);
});

test("禁止将象棋安装结果写入揭棋配置，也拒绝缺失权重的引擎包", () => {
  assert.throws(() => nativeInstallationProfile({ package: { variant: "xiangqi" }, enginePath: "x.exe", nnuePath: "x.nnue" }, "jieqi", {}), /棋种不匹配/);
  assert.throws(() => nativeInstallationProfile({ package: { variant: "xiangqi", networkPath: "x.nnue" }, enginePath: "x.exe" }, "xiangqi", {}), /匹配权重/);
});

test("传统揭棋包无需权重并关闭 NNUE 配置", () => {
  const profile = nativeInstallationProfile({ package: { variant: "jieqi", networkPath: null }, enginePath: "jieqi.exe", nnuePath: "" }, "jieqi", { threads: 2, hashMb: 128 });
  assert.equal(profile.nnuePath, null);
  assert.equal(profile.useNnue, false);
});

test("旧版 Fairy 安装仍保留坐标协议和关闭 NNUE 的参数", () => {
  const profile = nativeInstallationProfile({ receipt: { uciVariant: "xiangqi", uciProtocol: "ucicyclone", useNnue: false }, enginePath: "fairy.exe" }, "xiangqi", { threads: 2, hashMb: 256 });
  assert.equal(profile.uciProtocol, "ucicyclone");
  assert.equal(profile.useNnue, false);
  assert.equal(profile.nnuePath, null);
});

test("Fairy NNUE 引擎包保留棋种、坐标协议和指定网络", () => {
  const profile = nativeInstallationProfile({ package: { variant: "xiangqi", uciVariant: "xiangqi", uciProtocol: "ucicyclone" }, enginePath: "stockfish.exe", nnuePath: "xiangqi-c07.nnue" }, "xiangqi", { threads: 2, hashMb: 128 });
  assert.equal(profile.uciVariant, "xiangqi");
  assert.equal(profile.uciProtocol, "ucicyclone");
  assert.equal(profile.nnuePath, "xiangqi-c07.nnue");
  assert.equal(profile.useNnue, true);
});
