"use strict";

global.window = global;
require("./characters.js");

const characters = global.CHARACTERS;
const resolveBattlePowerDuel = global.resolveBattlePowerDuel;
const getUpsetAnnouncement = global.getUpsetAnnouncement;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

// 语义测试：临时 +15% 的触发本身不是“爆冷”；只有弱者真的反超获胜才是。
const allTrigger = () => 0;
let completedUpset = null;
let boostOnly = null;
for (let indexA = 0; indexA < characters.length; indexA += 1) {
  for (let indexB = indexA + 1; indexB < characters.length; indexB += 1) {
    const outcome = resolveBattlePowerDuel(characters[indexA], characters[indexB], allTrigger);
    if (!outcome.underdogSide || !outcome.upsetTriggered) continue;
    if (outcome.winnerSide === outcome.underdogSide && !completedUpset) completedUpset = outcome;
    if (outcome.winnerSide !== outcome.underdogSide && !boostOnly) boostOnly = outcome;
  }
}
assert(completedUpset && boostOnly, "未找到用于验证爆冷播报语义的对战样本");
const completedAnnouncement = getUpsetAnnouncement(completedUpset);
const boostAnnouncement = getUpsetAnnouncement(boostOnly);
assert(completedAnnouncement.headline.includes("爆冷") && completedAnnouncement.result.includes("以弱胜强"), "真正爆冷应显示爆冷和以弱胜强");
assert(!boostAnnouncement.headline.includes("爆冷") && !boostAnnouncement.headline.includes("以弱胜强"), "仅爆发但未反超时不应显示爆冷或以弱胜强");
assert(boostAnnouncement.headline.includes("爆发") && boostAnnouncement.boost === "爆发 +15%", "仅爆发但未反超时应显示爆发 +15%");

function seededRandom(seed) {
  let value = seed >>> 0;
  return () => {
    value += 0x6D2B79F5;
    let result = value;
    result = Math.imul(result ^ (result >>> 15), result | 1);
    result ^= result + Math.imul(result ^ (result >>> 7), result | 61);
    return ((result ^ (result >>> 14)) >>> 0) / 4294967296;
  };
}

const random = seededRandom(20260917);
const ranges = [
  { label: "<=5%", max: 0.05, expectedChance: 0.12, duels: 0, triggers: 0, underdogWins: 0 },
  { label: ">5%-10%", max: 0.10, expectedChance: 0.08, duels: 0, triggers: 0, underdogWins: 0 },
  { label: ">10%-20%", max: 0.20, expectedChance: 0.04, duels: 0, triggers: 0, underdogWins: 0 },
  { label: ">20%", max: Infinity, expectedChance: 0.01, duels: 0, triggers: 0, underdogWins: 0 }
];

const targetDuels = 100000;
let completed = 0;
while (completed < targetDuels) {
  const characterA = characters[Math.floor(random() * characters.length)];
  let characterB = characters[Math.floor(random() * characters.length)];
  if (characterA === characterB) continue;
  const outcome = resolveBattlePowerDuel(characterA, characterB, random);
  if (!outcome.underdogSide) continue;
  const range = ranges.find((item) => outcome.gapRatio <= item.max);
  range.duels += 1;
  range.triggers += Number(outcome.upsetTriggered);
  range.underdogWins += Number(outcome.winnerSide === outcome.underdogSide);
  assert(outcome.upsetChance === range.expectedChance, `${range.label}爆冷概率配置错误`);
  completed += 1;
}

ranges.forEach((range) => {
  assert(range.duels > 0, `${range.label}没有模拟样本`);
  const triggerRate = range.triggers / range.duels;
  assert(Math.abs(triggerRate - range.expectedChance) < 0.015, `${range.label}触发率偏离配置过大`);
});

console.log(JSON.stringify({
  totalDuels: completed,
  ranges: ranges.map((range) => ({
    gap: range.label,
    duels: range.duels,
    configuredUpsetChance: `${range.expectedChance * 100}%`,
    triggered: range.triggers,
    triggerRate: `${(range.triggers / range.duels * 100).toFixed(2)}%`,
    underdogWins: range.underdogWins,
    underdogWinRate: `${(range.underdogWins / range.duels * 100).toFixed(2)}%`
  })),
  allPassed: true
}, null, 2));
