"use strict";

const fs = require("fs");
const path = require("path");

global.window = global;
require("./characters.js");

const expectedPortraitCount = 75;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const withPortrait = global.CHARACTERS.filter((character) => character.portrait);
assert(withPortrait.length === expectedPortraitCount, `应接入${expectedPortraitCount}张立绘，实际${withPortrait.length}张`);

const files = [];
for (const character of global.CHARACTERS) {
  if (!character.portrait) continue;
  assert(/^assets\/portraits\/[a-z0-9_]+\.webp$/.test(character.portrait), `${character.name}的立绘路径不符合相对snake_case WebP规则`);
  const filePath = path.join(__dirname, ...character.portrait.split("/"));
  assert(fs.existsSync(filePath), `${character.name}的立绘文件不存在`);
  const size = fs.statSync(filePath).size;
  assert(size >= 100 * 1024 && size <= 400 * 1024, `${character.name}的立绘大小不在100KB—400KB`);
  files.push({ name:character.name, path:character.portrait, kilobytes:Number((size / 1024).toFixed(1)) });
}

const gameSource = fs.readFileSync(path.join(__dirname, "game.js"), "utf8");
const cssSource = fs.readFileSync(path.join(__dirname, "style.css"), "utf8");
assert(gameSource.includes('onerror="this.remove()"'), "缺少立绘加载失败回退处理");
assert(gameSource.includes("portrait-fallback"), "缺少古风剪影回退结构");
assert(cssSource.includes("object-fit: cover"), "人物图片没有使用object-fit cover");
assert(cssSource.includes("object-position: center 8%"), "人物图片没有应用头顶安全位置");

console.log(JSON.stringify({ portraits:files.length, fallbackCharacters:150-files.length, files, allPassed:true }, null, 2));
