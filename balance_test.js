"use strict";

global.window = global;
require("./characters.js");

const characters = global.CHARACTERS;
const calculateCombatPower = global.calculateCombatPower;

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

characters.forEach((character, index) => {
  const rank = index + 1;
  const [tier, subTier] = expectedGrade(rank);
  assert(character.rank === rank, `${character.name}的rank不是连续的1-150`);
  assert(calculateCombatPower(character) === Math.max(character.martial, character.intelligence), `${character.name}没有按武力/智力较高值计算战力`);
  assert(character.power === calculateCombatPower(character), `${character.name}的power与统一函数不一致`);
  assert(!("command" in character) && !("willpower" in character), `${character.name}仍包含统率或意志`);
  assert(character.tier === tier && character.subTier === subTier, `${character.name}的品阶与rank不符`);
  if (index > 0) assert(calculateCombatPower(characters[index - 1]) >= calculateCombatPower(character), `${character.name}未按综合战力降序排列`);
});

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
