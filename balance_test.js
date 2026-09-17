"use strict";

global.window = global;
require("./characters.js");

const characters = global.CHARACTERS;
const calculateCombatPower = global.calculateCombatPower;
const getBattleType = global.getBattleType;
const getTypeMultiplier = global.getTypeMultiplier;
const calculateBattlePower = global.calculateBattlePower;
const resolveBattlePowerDuel = global.resolveBattlePowerDuel;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectedGrade(rank) {
  if (rank <= 30) return ["天", rank <= 10 ? "一" : rank <= 20 ? "二" : "三"];
  if (rank <= 60) return ["地", rank <= 40 ? "一" : rank <= 50 ? "二" : "三"];
  if (rank <= 90) return ["人", rank <= 70 ? "一" : rank <= 80 ? "二" : "三"];
  return ["凡", rank <= 110 ? "一" : rank <= 130 ? "二" : "三"];
}

assert(characters.length === 150, "人物总数必须是150");
assert(new Set(characters.map((character) => character.name)).size === 150, "人物姓名必须唯一");
assert(new Set(characters.map((character) => character.rank)).size === 150, "rank必须唯一");
assert(typeof getBattleType === "function", "缺少统一战斗属性函数");
assert(typeof getTypeMultiplier === "function" && typeof calculateBattlePower === "function", "缺少统一属性克制战力函数");
assert(typeof resolveBattlePowerDuel === "function", "缺少统一爆冷结算函数");

characters.forEach((character, index) => {
  const rank = index + 1;
  const [tier, subTier] = expectedGrade(rank);
  assert(character.rank === rank, `${character.name}的rank不是连续的1-150`);
  assert(calculateCombatPower(character) === Math.max(character.martial, character.intelligence), `${character.name}没有按武力/智力较高值计算战力`);
  assert(character.power === calculateCombatPower(character), `${character.name}的power与统一函数不一致`);
  assert(["强攻", "谋略", "防守"].includes(getBattleType(character)), `${character.name}的战斗属性无效`);
  assert(!("command" in character) && !("willpower" in character), `${character.name}仍包含统率或意志`);
  assert(character.tier === tier && character.subTier === subTier, `${character.name}的品阶与rank不符`);
  if (index > 0) assert(calculateCombatPower(characters[index - 1]) >= calculateCombatPower(character), `${character.name}未按综合战力降序排列`);
});

const battleTypes = Object.fromEntries(["强攻", "谋略", "防守"].map((type) => [
  type,
  characters.filter((character) => getBattleType(character) === type).map((character) => character.name)
]));
assert(battleTypes.强攻.length === 70, `强攻人数应为70，实际为${battleTypes.强攻.length}`);
assert(battleTypes.谋略.length === 53, `谋略人数应为53，实际为${battleTypes.谋略.length}`);
assert(battleTypes.防守.length === 27, `防守人数应为27，实际为${battleTypes.防守.length}`);
for (const name of ["郭淮", "于禁", "曹真"]) {
  assert(getBattleType(characters.find((character) => character.name === name)) === "防守", `${name}应为防守`);
}
assert(getBattleType(characters.find((character) => character.name === "李典")) === "强攻", "李典应保留强攻");

assert(getTypeMultiplier("谋略", "强攻") === 1.06 && getTypeMultiplier("强攻", "谋略") === 0.94, "谋略克强攻规则错误");
assert(getTypeMultiplier("强攻", "防守") === 1.06 && getTypeMultiplier("防守", "强攻") === 0.94, "强攻克防守规则错误");
assert(getTypeMultiplier("防守", "谋略") === 1.06 && getTypeMultiplier("谋略", "防守") === 0.94, "防守克谋略规则错误");
for (const type of ["强攻", "谋略", "防守"]) assert(getTypeMultiplier(type, type) === 1, `${type}同类型系数应为1`);

const characterByType = Object.fromEntries(["强攻", "谋略", "防守"].map((type) => [
  type,
  characters.find((character) => getBattleType(character) === type)
]));
for (const [attackerType, opponentType, multiplier] of [
  ["谋略", "强攻", 1.06], ["强攻", "防守", 1.06], ["防守", "谋略", 1.06], ["强攻", "强攻", 1]
]) {
  const attacker = characterByType[attackerType];
  const opponent = characterByType[opponentType];
  const expected = Number((calculateCombatPower(attacker) * multiplier).toFixed(2));
  assert(calculateBattlePower(attacker, opponent) === expected, `${attackerType}对${opponentType}实际战力计算错误`);
}

const strongPair = characters.filter((character) => getBattleType(character) === "强攻").slice(0, 2);
const forcedUpset = resolveBattlePowerDuel(strongPair[0], strongPair[1], () => 0);
assert(forcedUpset.normalPowerA !== forcedUpset.normalPowerB && forcedUpset.upsetTriggered, "弱者没有按配置触发爆冷");
const underdogFinal = forcedUpset.underdogSide === "A" ? forcedUpset.finalPowerA : forcedUpset.finalPowerB;
const underdogNormal = forcedUpset.underdogSide === "A" ? forcedUpset.normalPowerA : forcedUpset.normalPowerB;
assert(underdogFinal === Number((underdogNormal * 1.15).toFixed(2)), "爆冷倍率不是1.15");

const ranges = { "95-100":0, "90-94":0, "85-89":0, "80-84":0, "75-79":0, "70-74":0, "60-69":0, "1-59":0 };
for (const character of characters) {
  const power = calculateCombatPower(character);
  const range = power >= 95 ? "95-100"
    : power >= 90 ? "90-94"
    : power >= 85 ? "85-89"
    : power >= 80 ? "80-84"
    : power >= 75 ? "75-79"
    : power >= 70 ? "70-74"
    : power >= 60 ? "60-69" : "1-59";
  ranges[range] += 1;
}

console.log(JSON.stringify({
  count: characters.length,
  minimumPower: Math.min(...characters.map(calculateCombatPower)),
  maximumPower: Math.max(...characters.map(calculateCombatPower)),
  uniqueRanks: new Set(characters.map((character) => character.rank)).size,
  ranges,
  tiers: Object.fromEntries(["天", "地", "人", "凡"].map((tier) => [tier, characters.filter((character) => character.tier === tier).length])),
  battleTypes,
  top30: characters.slice(0, 30).map((character) => [character.rank, character.name, calculateCombatPower(character)]),
  allPassed: true
}, null, 2));

if (process.argv.includes("--full")) {
  console.log("\n| Rank | 姓名 | Martial | Intelligence | Power | Tier |");
  console.log("|---:|---|---:|---:|---:|---|");
  for (const character of characters) {
    console.log(`| ${character.rank} | ${character.name} | ${character.martial} | ${character.intelligence} | ${calculateCombatPower(character)} | ${character.tier}${character.subTier} |`);
  }
}
