"use strict";

const fs = require("fs");
const path = require("path");
const vm = require("vm");

function element() {
  return { dataset:{}, hidden:false, disabled:false, innerHTML:"", textContent:"", value:"rank", offsetTop:0,
    classList:{add(){},remove(){},toggle(){}}, querySelector:()=>({textContent:""}),
    addEventListener(){}, setAttribute(){}, removeAttribute(){}, showModal(){}, close(){} };
}
const elements = new Map();
const document = {
  querySelector(selector) { if (!elements.has(selector)) elements.set(selector, element()); return elements.get(selector); },
  querySelectorAll() { return []; }, addEventListener() {}
};
const context = vm.createContext({
  window:{clearTimeout(){},setTimeout(){return 1;},scrollTo(){}}, document, console,
  Math, Set, Map, Object, Array, Number, String, TypeError, RangeError
});
for (const file of ["characters.js", "game.js"]) {
  vm.runInContext(fs.readFileSync(path.join(__dirname, file), "utf8"), context, { filename:file });
}
const app = context.window.sanguoApp;
const characters = context.window.CHARACTERS;
let mutualDestructionDuels = 0;
let multiTeamPointTies = 0;

function assert(value, message) { if (!value) throw new Error(message); }
const tiedCaptainCandidates = characters.filter((character) => character.power === 100).slice(0, 2);
const tiedCaptain = app.selectTeamCaptain([tiedCaptainCandidates[1], tiedCaptainCandidates[0], characters[20], characters[30]]);
assert(tiedCaptain.rank === Math.min(...tiedCaptainCandidates.map((character) => character.rank)), "同综合战力队长没有按固定rank决定");
function validateAdjustedPowers(duel, phaseLabel) {
  const characterA = characters.find((character) => character.name === duel.fighterA.name);
  const characterB = characters.find((character) => character.name === duel.fighterB.name);
  const normalA = app.calculateBattlePower(characterA, characterB);
  const normalB = app.calculateBattlePower(characterB, characterA);
  assert(duel.fighterA.normalBattlePower === normalA && duel.fighterB.normalBattlePower === normalB, `${phaseLabel}未保存统一正常战力`);
  const boostA = duel.upset.upsetTriggered && duel.upset.underdogSide === "A" ? 1.15 : 1;
  const boostB = duel.upset.upsetTriggered && duel.upset.underdogSide === "B" ? 1.15 : 1;
  assert(duel.fighterA.battlePower === Number((normalA * boostA).toFixed(2)), `${phaseLabel}A方最终战力错误`);
  assert(duel.fighterB.battlePower === Number((normalB * boostB).toFixed(2)), `${phaseLabel}B方最终战力错误`);
}
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

const aiRandom = seededRandom(20260918);
const aiCandidates = characters.slice(0, 4);
let reasonedChoices = 0;
for (let index = 0; index < 10000; index += 1) {
  const before = aiCandidates.map((character) => character.name).join("|");
  const choice = app.selectAICombatant(aiCandidates, { combatPhase:"PHASE_ONE", duelIndex:1, scoreFor:0, scoreAgainst:0 }, aiRandom);
  assert(aiCandidates.includes(choice.character), "AI选择了候选名单之外的武将");
  assert(aiCandidates.map((character) => character.name).join("|") === before, "AI选择函数修改了传入名单");
  reasonedChoices += Number(choice.reasoned);
}
const reasonedRate = reasonedChoices / 10000;
assert(reasonedRate > 0.63 && reasonedRate < 0.67, `AI合理选择比例偏离65%：${reasonedRate}`);

function validateBattle(record) {
  assert(record.phaseOne.duelCount === 4 && record.phaseOne.duels.length === 4, "第一阶段不是4场");
  const phaseOneA = record.phaseOne.duels.map((duel) => duel.fighterA.name);
  const phaseOneB = record.phaseOne.duels.map((duel) => duel.fighterB.name);
  assert(new Set(phaseOneA).size === 4 && new Set(phaseOneB).size === 4, "第一阶段有人重复出战");
  record.phaseOne.duels.forEach((duel) => {
    assert(duel.fighterA.side === "A" && duel.fighterB.side === "B", "第一阶段出现同队战斗");
    validateAdjustedPowers(duel, "第一阶段");
    if (duel.mutualDestruction) {
      mutualDestructionDuels += 1;
      assert(duel.winner === null && duel.fighterA.battlePower === duel.fighterB.battlePower && duel.eliminated.length === 2, "第一阶段同实际战力未同归于尽");
    } else {
      assert(duel.winner.battlePower > duel.eliminated[0].battlePower, "第一阶段未按属性修正后实际战力决定胜负");
    }
  });
  assert(record.phaseOne.survivors.A.count + record.phaseOne.survivors.B.count <= 4, "第一阶段幸存者数量错误");

  if (!record.phaseTwo.skipped) {
    const expectedDuels = Math.min(record.phaseOne.survivors.A.count, record.phaseOne.survivors.B.count);
    assert(record.phaseTwo.duelCount === expectedDuels, "第二阶段场数错误");
    assert(new Set(record.phaseTwo.participants.A.map((fighter) => fighter.name)).size === expectedDuels, "A队第二阶段重复出战");
    assert(new Set(record.phaseTwo.participants.B.map((fighter) => fighter.name)).size === expectedDuels, "B队第二阶段重复出战");
    record.phaseTwo.duels.forEach((duel) => {
      assert(duel.fighterA.side === "A" && duel.fighterB.side === "B", "第二阶段出现同队战斗");
      validateAdjustedPowers(duel, "第二阶段");
      if (duel.mutualDestruction) {
        mutualDestructionDuels += 1;
        assert(duel.winner === null && duel.fighterA.battlePower === duel.fighterB.battlePower && duel.eliminated.length === 2, "第二阶段同实际战力未同归于尽");
      } else {
        assert(duel.winner.battlePower > duel.eliminated[0].battlePower, "第二阶段未按属性修正后实际战力决定胜负");
      }
    });
  }

  if (!record.phaseThree.skipped) {
    const totalA = record.phaseThree.survivors.A.members.reduce((sum, fighter) => sum + fighter.power, 0);
    const totalB = record.phaseThree.survivors.B.members.reduce((sum, fighter) => sum + fighter.power, 0);
    assert(record.phaseThree.finalPower.A === totalA && record.phaseThree.finalPower.B === totalB, "第三阶段总战力计算错误");
  }
  assert(record.winner && record.winner.teamId, "比赛没有唯一胜者");
}

function validateRound(round, expectedMatches) {
  assert(round && round.matches.length === expectedMatches, `${round?.label || "未知轮次"}场数错误`);
  assert(round.matches.every((match) => match.status === "completed" && match.battleRecord), `${round.label}存在未完成比赛`);
  round.matches.forEach((match) => validateBattle(match.battleRecord));
}

const reports = [];
for (let edition = 1; edition <= 5; edition += 1) {
  const random = seededRandom(20260915 + edition);
  const draw = app.createWorldCupDraw(random);
  assert(app.validateWorldCupDraw(draw).length === 0, `第${edition}届抽签无效`);
  draw.teams.forEach((team) => {
    const captain = app.selectTeamCaptain(team.members.map((name) => characters.find((character) => character.name === name)));
    assert(team.captainName === captain.name && team.name === `${captain.name}队`, `${team.id}没有按最高综合战力命名`);
  });
  const tournament = app.createTournament(draw, random);

  assert(tournament.groupStage.matches.length === 48, `第${edition}届小组赛不是48场`);
  const appearances = new Map(draw.teams.map((team) => [team.id, 0]));
  const pairs = new Set();
  tournament.groupStage.matches.forEach((match) => {
    appearances.set(match.teamAId, appearances.get(match.teamAId) + 1);
    appearances.set(match.teamBId, appearances.get(match.teamBId) + 1);
    pairs.add(`${match.groupId}:${[match.teamAId, match.teamBId].sort().join("|")}`);
  });
  assert([...appearances.values()].every((count) => count === 3), `第${edition}届并非每队3场`);
  assert(pairs.size === 48, `第${edition}届小组对阵有重复`);

  app.simulateAllGroupMatches(tournament, draw, random);
  assert(tournament.groupStage.matches.every((match) => match.status === "completed"), `第${edition}届小组赛未完成`);
  tournament.groupStage.matches.forEach((match) => validateBattle(match.battleRecord));
  draw.groups.forEach((group) => {
    const rows = app.getGroupStandings(group, tournament);
    assert(rows.length === 4 && rows.every((row) => row.played === 3), `${group.name}积分榜错误`);
    assert(rows.every((row) => row.won + row.lost === 3 && row.points === row.won * 3), `${group.name}积分计算错误`);
    const pointCounts = new Map();
    rows.forEach((row) => pointCounts.set(row.points, (pointCounts.get(row.points) || 0) + 1));
    if ([...pointCounts.values()].some((count) => count >= 3)) multiTeamPointTies += 1;
    rows.slice(1).forEach((row, index) => {
      const previous = rows[index];
      assert(previous.points >= row.points, `${group.name}没有优先按积分排序`);
      if (previous.points === row.points) {
        if (previous.headToHeadPoints !== row.headToHeadPoints) {
          assert(previous.headToHeadPoints > row.headToHeadPoints, `${group.name}没有优先按同分球队内部战绩排序`);
        } else if (previous.netSurvivorPower !== row.netSurvivorPower) {
          assert(previous.netSurvivorPower > row.netSurvivorPower, `${group.name}没有按净胜战力排序`);
        }
      }
    });
  });
  const qualifierIds = tournament.groupStage.qualifiers.map((item) => item.teamId);
  assert(qualifierIds.length === 16 && new Set(qualifierIds).size === 16, `第${edition}届晋级球队错误`);

  const roundOf16Ids = tournament.knockout.roundOf16.matches.flatMap((match) => [match.teamAId, match.teamBId]);
  assert(roundOf16Ids.length === 16 && new Set(roundOf16Ids).size === 16, `第${edition}届16强抽签重复`);
  assert(qualifierIds.every((id) => roundOf16Ids.includes(id)), `第${edition}届16强抽签遗漏晋级队`);

  app.simulateAllCurrentStage(tournament, draw, random);
  validateRound(tournament.knockout.roundOf16, 8);
  const r16Winners = tournament.knockout.roundOf16.matches.map((match) => match.winnerTeamId);
  const quarterIds = tournament.knockout.quarterFinals.matches.flatMap((match) => [match.teamAId, match.teamBId]);
  assert(JSON.stringify(quarterIds) === JSON.stringify(r16Winners), "8强未沿用16强对阵树");

  app.simulateAllCurrentStage(tournament, draw, random);
  validateRound(tournament.knockout.quarterFinals, 4);
  app.simulateAllCurrentStage(tournament, draw, random);
  validateRound(tournament.knockout.semiFinals, 2);
  assert(tournament.knockout.semiFinalWinners.length === 2 && tournament.knockout.semiFinalLosers.length === 2, "半决赛胜负队未保存");
  app.simulateAllCurrentStage(tournament, draw, random);
  validateRound(tournament.knockout.thirdPlace, 1);
  app.simulateAllCurrentStage(tournament, draw, random);
  validateRound(tournament.knockout.final, 1);

  assert(tournament.stage === app.tournamentStages.COMPLETED, `第${edition}届未完成`);
  const podiumIds = Object.values(tournament.podium);
  assert(podiumIds.length === 4 && new Set(podiumIds).size === 4, `第${edition}届前四名重复`);
  assert(podiumIds.every((id) => draw.teams.some((team) => team.id === id)), `第${edition}届前四名含未知球队`);

  reports.push({
    edition,
    groupMatches: tournament.groupStage.matches.length,
    qualifiers: qualifierIds.length,
    knockoutMatches: "8+4+2+1+1",
    podium: podiumIds
  });
}

assert(mutualDestructionDuels > 0, "五届赛事中没有触发同战力同归于尽");
assert(multiTeamPointTies > 0, "五届赛事中没有覆盖三队以上同分场景");
console.log(JSON.stringify({ editionsTested:5, aiReasonedRate:`${(reasonedRate*100).toFixed(2)}%`, mutualDestructionDuels, multiTeamPointTies, reports, allPassed:true }, null, 2));
