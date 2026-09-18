"use strict";

// 战术只保存于单场玩家比赛状态中；这里不修改任何人物的永久属性。
window.TACTICS = Object.freeze([
  Object.freeze({ name: "全军振奋", description: "开战时原始四将各获临时综合战力 +2，持续整场。", timing: "开战自动发动" }),
  Object.freeze({ name: "背水一战", description: "己方幸存人数落后时，所选武将本次单挑战力 +6。", timing: "单挑前" }),
  Object.freeze({ name: "侦察", description: "随机揭示一名尚未公开的存活敌将；不泄露本轮人选。", timing: "单挑前" }),
  Object.freeze({ name: "闪避", description: "己方将败且双方基础战力差不超过 5 时，本次双方均存活。", timing: "翻牌后" }),
  Object.freeze({ name: "军心振奋", description: "最后一轮己方战力 +6；单挑加给出战武将，合击加给己方总战力。", timing: "第三阶段" }),
  Object.freeze({ name: "奇兵突袭", description: "先声明使用；翻牌后若基础战力差不超过 5，本次己方战力 +5。", timing: "单挑前" })
]);

window.drawTactics = function drawTactics(random = Math.random) {
  const pool = [...window.TACTICS];
  for (let index = pool.length - 1; index > 0; index -= 1) {
    const swap = Math.floor(random() * (index + 1));
    [pool[index], pool[swap]] = [pool[swap], pool[index]];
  }
  return pool.slice(0, 3);
};

