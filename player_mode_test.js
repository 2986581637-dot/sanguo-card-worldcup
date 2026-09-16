"use strict";

const fs=require("fs"),path=require("path"),vm=require("vm");
const listeners={},nodes=new Map(),consoleErrors=[];
function classList(){const values=new Set();return{add(...v){v.forEach(x=>values.add(x));},remove(...v){v.forEach(x=>values.delete(x));},toggle(v,f){if(f)values.add(v);else values.delete(v);},contains:v=>values.has(v)};}
function node(){const children={span:{textContent:""},b:{textContent:""}};return{dataset:{},hidden:false,disabled:false,innerHTML:"",textContent:"",value:"rank",offsetTop:0,attributes:{},classList:classList(),querySelector:s=>children[s]||node(),addEventListener(t,f){listeners[`node:${t}`]=f;},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},showModal(){this.attributes.open="";},close(){delete this.attributes.open;}};}
const document={querySelector(s){if(!nodes.has(s))nodes.set(s,node());return nodes.get(s);},querySelectorAll(){return[];},addEventListener(t,f){listeners[`document:${t}:${Object.keys(listeners).length}`]=f;}};
let seed=942731;
function random(){seed=(seed*1664525+1013904223)>>>0;return seed/4294967296;}
const testMath=Object.create(Math);testMath.random=random;
const context=vm.createContext({window:{clearTimeout(){},setTimeout(){return 1;},scrollTo(){}},document,console:{log(){},error(...a){consoleErrors.push(a);}},Math:testMath,Set,Map,Object,Array,Number,String,TypeError,RangeError});
for(const file of["characters.js","game.js","playerMode.js"])vm.runInContext(fs.readFileSync(path.join(__dirname,file),"utf8"),context,{filename:file});
const app=context.window.sanguoApp,player=context.window.playerMode;
function assert(v,m){if(!v)throw new Error(m);}

let manualMatches=0,knockoutManualMatches=0,phaseTwoMatches=0,byeMatches=0,phaseThreeMatches=0,animationChecks=0;

function playCurrentPlayerMatch(){
  player.startNextPlayerMatch();
  assert(player.getState().screen==="BATTLE","玩家比赛没有进入专门战斗界面");
  let openingBattle=player.getState().battle;
  const opponentOpening=openingBattle.playerSide==="A"?openingBattle.teamB:openingBattle.teamA;
  const openingHtml=nodes.get("#cup-content").innerHTML;
  opponentOpening.members.forEach(name=>assert(!openingHtml.includes(name),`开战前泄露电脑武将：${name}`));
  assert((openingHtml.match(/opponent-card-back/g)||[]).length===4,"开战前不是4张电脑卡背");
  while(player.getState().screen==="BATTLE"){
    const battle=player.getState().battle;
    if(battle.pendingRecord){
      if(!battle.pendingRecord.phaseTwo.skipped){
        phaseTwoMatches+=1;
        if(battle.pendingRecord.phaseTwo.byes.A.length||battle.pendingRecord.phaseTwo.byes.B.length)byeMatches+=1;
      }
      if(!battle.pendingRecord.phaseThree.skipped){
        phaseThreeMatches+=1;
        const a=battle.pendingRecord.phaseThree.survivors.A.members.reduce((s,f)=>s+f.power,0);
        const b=battle.pendingRecord.phaseThree.survivors.B.members.reduce((s,f)=>s+f.power,0);
        assert(a===battle.pendingRecord.phaseThree.finalPower.A&&b===battle.pendingRecord.phaseThree.finalPower.B,"第三阶段总战力错误");
      }
      player.confirmBattleResult();
      break;
    }
    const phase=battle.phase==="PHASE_ONE"?battle.phaseOne:battle.phaseTwo;
    const key=battle.playerSide==="A"?"availableA":"availableB";
    assert(phase[key].length>0,"玩家没有可选武将");
    const chosen=phase[key][0];
    const opponentKey=battle.playerSide==="A"?"availableB":"availableA";
    const hiddenBefore=[...phase[opponentKey]].filter(name=>!battle.revealedOpponent.has(name));
    player.choosePlayerFighter(chosen);
    let html=nodes.get("#cup-content").innerHTML;
    assert(html.includes("确认出战"),"选择武将后没有确认步骤");
    hiddenBefore.forEach(name=>assert(!html.includes(name),`确认前泄露电脑武将：${name}`));
    assert(!player.getState().battle.lastDuel,"玩家选择后AI提前完成出牌");
    player.confirmPlayerFighter();
    html=nodes.get("#cup-content").innerHTML;
    const lastDuel=player.getState().battle.lastDuel;
    const resultClasses=lastDuel.mutualDestruction
      ? (html.match(/is-loser/g)||[]).length>=2
      : html.includes("is-winner")&&html.includes("is-loser");
    assert(html.includes("duel-arena")&&html.includes("from-left")&&html.includes("from-right")&&resultClasses,"对战动画状态缺失");
    assert(html.includes(player.getState().battle.lastDuel[battle.playerSide==="A"?"fighterB":"fighterA"].name),"翻牌后没有揭晓电脑武将");
    animationChecks+=1;
    player.continueBattle();
  }
  assert(player.getState().screen==="POST_MATCH","玩家比赛后没有进入赛后总结");
  const record=player.getState().battle.match.battleRecord;
  assert(record.phaseOne.duels.length===4,"玩家比赛第一阶段不是4场");
  assert(new Set(record.phaseOne.duels.map(d=>d.fighterA.name)).size===4,"A队第一阶段重复出战");
  assert(new Set(record.phaseOne.duels.map(d=>d.fighterB.name)).size===4,"B队第一阶段重复出战");
  record.phaseOne.duels.forEach(d=>assert(d.fighterA.side==="A"&&d.fighterB.side==="B","玩家比赛出现同队战斗"));
  manualMatches+=1;
  if(record.teams&&player.getState().battle.match.stage!=="GROUP_STAGE")knockoutManualMatches+=1;
  return player.getState().battle.match;
}

const editionReports=[];
for(let edition=1;edition<=5;edition+=1){
  app.runNewDraw();
  const state=app.getState();
  const assigned=player.getPlayerTeam();
  assert(assigned&&state.worldCup.teams.filter(t=>t.id===assigned.id).length===1,"没有唯一分配玩家球队");
  assert(assigned.members.length===4,"玩家球队不是4人");
  assert(nodes.get("#cup-content").innerHTML.includes("你的球队"),"玩家主界面没有突出你的球队");

  const firstMatch=playCurrentPlayerMatch();
  assert(firstMatch.matchDay===1,"第一场玩家比赛不是小组赛第1轮");
  player.continueTournament();
  const dayOneCompleted=state.tournament.groupStage.matches.filter(m=>m.matchDay===1&&m.status==="completed").length;
  assert(dayOneCompleted===16,"玩家首战后没有自动模拟同比赛日其余15场");

  let safety=30;
  while(state.tournament.stage!=="COMPLETED"&&safety>0){
    safety-=1;
    const screen=player.getState().screen;
    if(screen==="DASHBOARD"){
      playCurrentPlayerMatch();
      player.continueTournament();
    }else if(screen==="ELIMINATED"){
      player.autoWatchRemaining();
    }else if(screen==="POST_MATCH"){
      player.continueTournament();
    }else{
      throw new Error(`无法推进的玩家界面状态：${screen}`);
    }
  }
  assert(safety>0&&state.tournament.stage==="COMPLETED","玩家模式未能完成整届世界杯");
  assert(player.getState().screen==="COMPLETED","赛事结束后没有完成页面");
  const podium=Object.values(state.tournament.podium);
  assert(new Set(podium).size===4,"玩家模式赛事前四名重复");
  editionReports.push({edition,playerTeam:assigned.id,playerMatches:state.tournament.groupStage.matches.filter(m=>[m.teamAId,m.teamBId].includes(assigned.id)&&m.status==="completed").length,podium});
}

assert(phaseTwoMatches>0,"测试中从未进入第二阶段");
assert(byeMatches>0,"测试中从未验证第二阶段轮空");
assert(phaseThreeMatches>0,"测试中从未进入第三阶段");
assert(knockoutManualMatches>0,"测试中从未逐场进行玩家淘汰赛");
assert(new Set(editionReports.map(report=>report.playerTeam)).size>1,"多届测试没有体现随机分配玩家球队");
assert(consoleErrors.length===0,`Console错误：${consoleErrors.length}`);
console.log(JSON.stringify({editions:editionReports,manualMatches,knockoutManualMatches,phaseTwoMatches,byeMatches,phaseThreeMatches,animationChecks,consoleErrors:0,allPassed:true},null,2));
