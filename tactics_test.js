"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");
const listeners = {};
const nodes = new Map();
const errors = [];
function node() {
  return { innerHTML: "", textContent: "", value: "rank", hidden: false, disabled: false,
    dataset: {}, classList: { add() {}, remove() {}, toggle() {}, contains() { return false; } },
    querySelector() { return node(); }, addEventListener() {}, setAttribute() {}, removeAttribute() {},
    showModal() {}, close() {} };
}
const document = { querySelector(key) { if (!nodes.has(key)) nodes.set(key, node()); return nodes.get(key); },
  querySelectorAll() { return []; }, addEventListener(type, fn) { listeners[type] = fn; } };
let seed = 99117;
const random = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 4294967296);
const testMath = Object.create(Math);
testMath.random = random;
const context = vm.createContext({ window: { clearTimeout() {}, setTimeout() { return 1; }, scrollTo() {} }, document,
  console: { log() {}, error(...args) { errors.push(args); } }, Math: testMath, Set, Map, Object, Array, Number, String, TypeError, RangeError });
for (const file of ["characters.js", "tactics.js", "game.js", "playerMode.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, file), "utf8"), context, { filename: file });
}
const app = context.window.sanguoApp;
const player = context.window.playerMode;
const characters = context.window.CHARACTERS;
const byName = (name) => characters.find((character) => character.name === name);
function assert(condition, message) { if (!condition) throw new Error(message); }
function start(tactic) {
  app.runNewDraw();
  player.startNextPlayerMatch();
  const options = player.getState().tacticOptions;
  assert(options.length === 3 && new Set(options.map((item) => item.name)).size === 3, "赛前三选一有重复");
  assert(player.getState().screen === "TACTIC_SELECT" && !player.getState().battle, "战术选择前已开始战斗");
  player.getState().tacticOptions = [context.window.TACTICS.find((item) => item.name === tactic)];
  player.chooseTactic(tactic);
  const battle = player.getState().battle;
  assert(battle.selectedTactic === tactic && player.getState().screen === "BATTLE", "战术选择无效");
  player.chooseTactic("全军振奋");
  assert(battle.selectedTactic === tactic, "一场比赛选中了多张战术");
  player.getState().random = () => 0.999;
  return battle;
}
function sides(battle) {
  const side = battle.playerSide;
  return { side, playerTeam: side === "A" ? battle.teamA : battle.teamB,
    enemyTeam: side === "A" ? battle.teamB : battle.teamA,
    ownKey: side === "A" ? "availableA" : "availableB",
    enemyKey: side === "A" ? "availableB" : "availableA" };
}
function playOne(battle, ownName, enemyName) {
  const s = sides(battle);
  battle.pendingAIChoice.name = enemyName;
  assert(battle.phaseOne[s.enemyKey].includes(enemyName) || battle.phaseTwo?.[s.enemyKey].includes(enemyName), "测试敌将未处于可选名单");
  player.choosePlayerFighter(ownName);
  player.confirmPlayerFighter();
}

// 全军振奋：四人从开局到决胜都只临时 +2，不污染人物池。
{
  const battle = start("全军振奋");
  const s = sides(battle);
  assert(battle.tacticUsed && battle.tacticEvents[0].members.length === 4, "全军振奋没有开局生效");
  assert(battle.tacticEvents[0].members.every((item) => item.effectivePower === item.originalPower + 2), "全军振奋不是逐将 +2");
  playOne(battle, s.playerTeam.members[0], s.enemyTeam.members[0]);
  const fighter = battle.lastDuel[s.side === "A" ? "fighterA" : "fighterB"];
  assert(fighter.effectivePower === fighter.power + 2, "全军振奋未作用于单挑");
  assert(byName(fighter.name).power === fighter.power, "全军振奋污染永久战力");
  const record = battle.tacticEvents.length;
  player.useTacticBeforeDuel();
  assert(battle.tacticEvents.length === record, "全军振奋重复发动");
}

// 背水一战：非落后不可发动，落后时只为本次出战者 +6。
{
  const battle = start("背水一战");
  const s = sides(battle);
  const own = s.playerTeam.members[0], enemy = s.enemyTeam.members[0];
  player.choosePlayerFighter(own);
  player.useTacticBeforeDuel();
  assert(!battle.tacticArmed && !battle.tacticUsed, "人数未落后却发动背水一战");
  battle.eliminated.add(s.playerTeam.members[3]);
  player.useTacticBeforeDuel();
  assert(battle.tacticArmed, "落后时无法准备背水一战");
  battle.pendingAIChoice.name = enemy;
  player.confirmPlayerFighter();
  const fighter = battle.lastDuel[s.side === "A" ? "fighterA" : "fighterB"];
  assert(fighter.effectivePower === fighter.power + 6 && battle.tacticUsed, "背水一战未临时 +6");
  assert(byName(own).power === fighter.power, "背水一战污染永久战力");
}

// 侦察：公开的目标不能是电脑已秘密锁定的本轮出场者。
{
  const battle = start("侦察");
  const locked = battle.pendingAIChoice.name;
  player.useTacticBeforeDuel();
  assert(battle.tacticUsed && battle.tacticEvents.length === 1, "侦察未消耗");
  const found = battle.tacticEvents[0].character;
  assert(found !== locked && battle.revealedOpponent.has(found), "侦察泄露电脑本轮暗牌");
  assert(nodes.get("#cup-content").innerHTML.includes(found), "侦察没有翻开敌将");
  player.useTacticBeforeDuel();
  assert(battle.tacticEvents.length === 1, "侦察重复发动");
}

// 闪避：真实将败且差距 <=5 后先等待玩家决策，发动后双方都进入幸存名单。
{
  const pair = characters.flatMap((weak) => characters.filter((strong) =>
    strong.name !== weak.name && strong.power > weak.power && strong.power - weak.power <= 5
    && context.window.getBattleType(strong) === context.window.getBattleType(weak)
  ).map((strong) => [weak, strong]))[0];
  assert(pair, "找不到闪避测试人物对");
  const battle = start("闪避");
  const s = sides(battle);
  const used = new Set(pair.map((person) => person.name));
  const extras = characters.filter((person) => !used.has(person.name)).slice(0, 6).map((person) => person.name);
  s.playerTeam.members.splice(0, 4, pair[0].name, ...extras.slice(0, 3));
  s.enemyTeam.members.splice(0, 4, pair[1].name, ...extras.slice(3, 6));
  battle.phaseOne.availableA = [...battle.teamA.members];
  battle.phaseOne.availableB = [...battle.teamB.members];
  battle.pendingAIChoice.name = pair[1].name;
  player.choosePlayerFighter(pair[0].name);
  player.confirmPlayerFighter();
  assert(battle.pendingEvade && !battle.awaitingContinue && battle.phaseOne.duels.length === 0, "闪避选择前就提交了阵亡结果");
  player.resolveEvade(true);
  assert(battle.tacticUsed && battle.lastDuel.evaded && battle.lastDuel.eliminated.length === 0, "闪避后仍有人阵亡");
  assert(!battle.eliminated.has(pair[0].name) && !battle.eliminated.has(pair[1].name), "闪避未保留双方");
  for (let index = 0; index < 3; index += 1) {
    player.continueBattle();
    const phase = battle.phaseOne;
    playOne(battle, phase[s.ownKey][0], phase[s.enemyKey][0]);
  }
  player.continueBattle();
  assert(battle.phaseOne.survivorsA.length + battle.phaseOne.survivorsB.length === 5, "闪避后第一阶段不是 5 人存活");
  assert(battle.phaseTwo && battle.phaseTwo.duelCount === Math.min(battle.phaseOne.survivorsA.length, battle.phaseOne.survivorsB.length), "第二阶段未按实际幸存人数配对");
}

// 军心振奋：只加球队最终总战力，不修改单兵战力。
{
  const battle = start("军心振奋");
  const s = sides(battle);
  player.useMoraleTactic();
  assert(!battle.tacticUsed, "军心振奋在第一阶段发动");
  battle.phaseOne.survivorsA = [battle.teamA.members[0]];
  battle.phaseOne.survivorsB = [battle.teamB.members[0]];
  battle.phaseTwo = { duelCount: 0, availableA: [...battle.phaseOne.survivorsA], availableB: [...battle.phaseOne.survivorsB], participantsA: [], participantsB: [], byesA: [], byesB: [], duels: [],
    survivorsA: battle.phaseOne.survivorsA, survivorsB: battle.phaseOne.survivorsB };
  battle.phase = "PHASE_TWO";
  // 经现有阶段收尾路径构建完整战报。
  player.getState().battle.awaitingContinue = true;
  player.continueBattle();
  assert(battle.phase === "PHASE_THREE", "测试未进入第三阶段");
  const before = battle.pendingRecord.phaseThree.finalPower[s.side];
  player.useMoraleTactic();
  assert(battle.tacticUsed && battle.pendingRecord.phaseThree.duel.fighterA, "军心振奋后未重算最终单挑");
  const finalFighter=s.side==="A"?battle.pendingRecord.phaseThree.duel.fighterA:battle.pendingRecord.phaseThree.duel.fighterB;
  assert(finalFighter.effectivePower===finalFighter.power+6, "军心振奋未加入最终单挑有效战力");
}

// 奇兵突袭：不符合差距不消耗；下次符合时才 +5。
{
  const battle = start("奇兵突袭");
  const s = sides(battle);
  const distant = characters.find((person) => Math.abs(person.power - byName(s.playerTeam.members[0]).power) > 5
    && !s.playerTeam.members.includes(person.name));
  const close = characters.find((person) => Math.abs(person.power - byName(s.playerTeam.members[1]).power) <= 5
    && !s.playerTeam.members.includes(person.name) && person.name !== distant.name);
  assert(distant && close, "找不到奇兵突袭测试人物对");
  s.enemyTeam.members.splice(0, 2, distant.name, close.name);
  battle.phaseOne[s.enemyKey] = [...s.enemyTeam.members];
  battle.pendingAIChoice.name = distant.name;
  player.choosePlayerFighter(s.playerTeam.members[0]);
  player.useTacticBeforeDuel();
  player.confirmPlayerFighter();
  assert(!battle.tacticUsed && battle.tacticEvents.length === 0, "奇兵失败却消耗战术");
  player.continueBattle();
  battle.pendingAIChoice.name = close.name;
  player.choosePlayerFighter(s.playerTeam.members[1]);
  player.useTacticBeforeDuel();
  player.confirmPlayerFighter();
  const fighter = battle.lastDuel[s.side === "A" ? "fighterA" : "fighterB"];
  assert(battle.tacticUsed && fighter.effectivePower === fighter.power + 5, "奇兵满足条件时没有 +5");
  assert(byName(fighter.name).power === fighter.power, "奇兵污染永久数据");
}

assert(errors.length === 0, "Console 有错误");
console.log(JSON.stringify({ tactics: context.window.TACTICS.map((item) => item.name), checks: ["赛前三选一", "不可重复携带", "全军振奋", "背水一战", "侦察保密", "闪避五人幸存", "军心振奋", "奇兵失败重试", "永久数据不变"], consoleErrors: errors.length, allPassed: true }, null, 2));
