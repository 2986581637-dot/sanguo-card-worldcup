"use strict";
const fs = require("fs"), path = require("path"), vm = require("vm");
const project = __dirname;
const nodes = new Map();
function node() { return { innerHTML:"", textContent:"", value:"rank", dataset:{}, classList:{add(){},remove(){},toggle(){}}, querySelector(){return node()}, addEventListener(){}, setAttribute(){}, removeAttribute(){} }; }
const document = { querySelector(key) { if (!nodes.has(key)) nodes.set(key,node()); return nodes.get(key); }, querySelectorAll(){return[]}, addEventListener(){} };
const context = vm.createContext({ window:{clearTimeout(){},setTimeout(){return 1},scrollTo(){}}, document, console, Math, Set, Map, Object, Array, Number, String, TypeError, RangeError });
for (const file of ["characters.js","tactics.js","game.js"]) vm.runInContext(fs.readFileSync(path.join(project,file),"utf8"),context,{filename:file});
let playerSource = fs.readFileSync(path.join(project,"playerMode.js"),"utf8");
playerSource = playerSource.replace("  window.playerMode = Object.freeze({", "  window.__testDecideWinner = decideWinner;\n  window.playerMode = Object.freeze({");
vm.runInContext(playerSource,context,{filename:"playerMode.js"});
const app=context.window.sanguoApp, player=context.window.playerMode;
function assert(value,message){if(!value)throw new Error(message)}
const shapes=[[1,1],[2,1],[1,2],[2,2],[3,1],[1,3]];
let checked=0;
for(const [countA,countB] of shapes){
  app.runNewDraw();
  player.startNextPlayerMatch();
  player.chooseTactic(player.getState().tacticOptions[0].name);
  const battle=player.getState().battle;
  player.getState().random=()=>0.99;
  battle.selectedTactic="全军振奋";
  battle.tacticUsed=true;
  const a=battle.teamA.members.slice(0,countA), b=battle.teamB.members.slice(0,countB);
  const result=context.window.__testDecideWinner(battle.teamA,battle.teamB,a,b);
  const power=(names,side)=>names.reduce((sum,name)=>sum+context.window.CHARACTERS.find(item=>item.name===name).power+(side===battle.playerSide?2:0),0);
  assert(result.decision===(countA===1&&countB===1?"normal-duel":"combined-power"),`${countA}v${countB}判定路径错误`);
  if(countA===1&&countB===1){
    assert(result.duel&&result.totalA===result.duel.fighterA.battlePower&&result.totalB===result.duel.fighterB.battlePower,"1v1没有复用单挑");
    assert(result.duel.fighterA.effectivePower===power(a,"A")&&result.duel.fighterB.effectivePower===power(b,"B"),"1v1战术加成未进入有效战力");
  }else{
    assert(result.totalA===power(a,"A")&&result.totalB===power(b,"B"),`${countA}v${countB}未使用有效战力合计`);
    assert(result.winningTeam.id===(result.totalA>result.totalB?battle.teamA.id:result.totalB>result.totalA?battle.teamB.id:result.highA>result.highB?battle.teamA.id:result.highB>result.highA?battle.teamB.id:result.winningTeam.id),`${countA}v${countB}胜方错误`);
  }
  checked++;
}
app.runNewDraw();player.startNextPlayerMatch();player.chooseTactic(player.getState().tacticOptions[0].name);
const battle=player.getState().battle; battle.selectedTactic="军心振奋";battle.tacticUsed=true;
const a=battle.teamA.members.slice(0,2),b=battle.teamB.members.slice(0,1);
const result=context.window.__testDecideWinner(battle.teamA,battle.teamB,a,b);
const base=(names)=>names.reduce((sum,name)=>sum+context.window.CHARACTERS.find(item=>item.name===name).power,0);
assert(result.totalA===base(a)+(battle.playerSide==="A"?6:0)&&result.totalB===base(b)+(battle.playerSide==="B"?6:0),"军心振奋未加入合击总战力");
console.log(JSON.stringify({shapes:checked,wholeMatchBonus:true,finalMoraleBonus:true,allPassed:true}));

