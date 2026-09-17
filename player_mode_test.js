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

let manualMatches=0,knockoutManualMatches=0,phaseTwoMatches=0,byeMatches=0,phaseThreeMatches=0,animationChecks=0,menuChecks=0,resultPresentationChecks=0,finalFourChecks=0,awardCeremonyChecks=0,captainPresentationChecks=0,exitChecks=0,simultaneousDecisionChecks=0;

function playCurrentPlayerMatch(){
  player.startNextPlayerMatch();
  assert(player.getState().screen==="BATTLE","玩家比赛没有进入专门战斗界面");
  let openingBattle=player.getState().battle;
  const opponentOpening=openingBattle.playerSide==="A"?openingBattle.teamB:openingBattle.teamA;
  const openingHtml=nodes.get("#cup-content").innerHTML;
  opponentOpening.members.filter(name=>name!==opponentOpening.captainName).forEach(name=>assert(!openingHtml.includes(name),`开战前泄露非队长电脑武将：${name}`));
  assert(openingHtml.includes(`${opponentOpening.captainName}队`),"比赛界面未使用队长姓名命名电脑球队");
  assert((openingHtml.match(/opponent-card-back/g)||[]).length===4,"开战前不是4张电脑卡背");
  assert(openingHtml.includes("battle-menu-button"),"战斗界面缺少菜单按钮");
  player.openPauseMenu();
  let pauseHtml=nodes.get("#cup-content").innerHTML;
  assert(player.getState().pauseMenuOpen&&pauseHtml.includes("继续游戏")&&pauseHtml.includes("重新开始本局")&&pauseHtml.includes("返回主菜单")&&pauseHtml.includes("退出当前对战"),"暂停菜单内容不完整");
  player.closePauseMenu();
  assert(!player.getState().pauseMenuOpen&&!nodes.get("#cup-content").innerHTML.includes("battle-pause-backdrop"),"暂停菜单无法正常关闭");
  if(exitChecks===0){
    player.exitBattle();
    assert(player.getState().screen==="DASHBOARD"&&player.getState().battle===null,"选择阶段退出比赛造成状态错误");
    player.startNextPlayerMatch();
    assert(player.getState().screen==="BATTLE"&&player.getState().battle.pendingAIChoice,"退出后无法重新进入同一场待赛比赛");
    exitChecks+=1;
  }
  menuChecks+=1;
  while(player.getState().screen==="BATTLE"){
    const battle=player.getState().battle;
    if(battle.pendingRecord){
      const resultHtml=nodes.get("#cup-content").innerHTML;
      assert(resultHtml.includes("battle-result-announcement")&&(resultHtml.includes("胜利")||resultHtml.includes("战败")||resultHtml.includes("团灭")||resultHtml.includes("全军覆没")||resultHtml.includes("同归于尽")),"战斗结束缺少胜败播报");
      resultPresentationChecks+=1;
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
    const opponentTeam=battle.playerSide==="A"?battle.teamB:battle.teamA;
    const hiddenBefore=[...phase[opponentKey]].filter(name=>!battle.revealedOpponent.has(name)&&name!==opponentTeam.captainName);
    const committedAI={...battle.pendingAIChoice};
    assert(committedAI.name&&committedAI.committedBeforePlayerSelection,"AI未在玩家选将之前锁定本回合人选");
    player.choosePlayerFighter(chosen);
    let html=nodes.get("#cup-content").innerHTML;
    assert(html.includes("确认出战"),"选择武将后没有确认步骤");
    assert(player.getState().battle.pendingAIChoice.name===committedAI.name,"玩家选将后AI更换了已锁定人选");
    hiddenBefore.forEach(name=>assert(!html.includes(name),`确认前泄露电脑武将：${name}`));
    assert(!player.getState().battle.lastDuel,"玩家选择后AI提前完成出牌");
    simultaneousDecisionChecks+=1;
    player.confirmPlayerFighter();
    html=nodes.get("#cup-content").innerHTML;
    const lastDuel=player.getState().battle.lastDuel;
    const characterA=context.window.CHARACTERS.find(character=>character.name===lastDuel.fighterA.name);
    const characterB=context.window.CHARACTERS.find(character=>character.name===lastDuel.fighterB.name);
    assert(lastDuel.fighterA.normalBattlePower===context.window.calculateBattlePower(characterA,characterB),"玩家比赛A方未使用统一正常战力");
    assert(lastDuel.fighterB.normalBattlePower===context.window.calculateBattlePower(characterB,characterA),"玩家比赛B方未使用统一正常战力");
    if(lastDuel.winner)assert(lastDuel.winner.battlePower>lastDuel.eliminated[0].battlePower,"玩家比赛未按实际战力决定胜负");
    const resultClasses=lastDuel.mutualDestruction
      ? (html.match(/is-loser/g)||[]).length>=2
      : html.includes("is-winner")&&html.includes("is-loser");
    assert(html.includes("duel-arena")&&html.includes("from-left")&&html.includes("from-right")&&resultClasses,"对战动画状态缺失");
    assert(html.includes("battle-callout")&&html.includes("fighter-health-fill")&&html.includes("damage-float"),"攻击播报、血条或伤害飘字缺失");
    assert(html.includes("matchup-reveal")&&html.includes("battle-scoreboard")&&html.includes("当前总比分"),"双方亮将、回合或比分信息缺失");
    assert(html.includes("属性克制")||html.includes("受到克制")||html.includes("同类型"),"对战界面未显示属性克制状态");
    assert(html.includes(player.getState().battle.lastDuel[battle.playerSide==="A"?"fighterB":"fighterA"].name),"翻牌后没有揭晓电脑武将");
    const captainInDuel=[lastDuel.fighterA.name,lastDuel.fighterB.name].some(name=>name===battle.teamA.captainName||name===battle.teamB.captainName);
    if(captainInDuel){
      assert(html.includes("队长出战")&&(html.includes("队长拿下一胜")||html.includes("主将被击破")),"队长出战或胜负播报缺失");
      captainPresentationChecks+=1;
    }
    animationChecks+=1;
    player.continueBattle();
  }
  assert(player.getState().screen==="POST_MATCH","玩家比赛后没有进入赛后总结");
  assert(nodes.get("#cup-content").innerHTML.includes("post-match-emblem"),"赛后总结缺少胜败徽记");
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
for(let edition=1;edition<=12;edition+=1){
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
    }else if(screen==="FINAL_FOUR"){
      const ceremonyHtml=nodes.get("#cup-content").innerHTML;
      assert(ceremonyHtml.includes("final-four-ceremony")&&ceremonyHtml.includes("成功晋级四强")&&ceremonyHtml.includes("继续进入半决赛")&&ceremonyHtml.includes("队长")&&ceremonyHtml.includes("当前战绩"),"晋级四强过场缺少球队、队长或战绩信息");
      player.continueFromFinalFour();
      assert(player.getState().screen==="DASHBOARD","四强过场无法继续进入半决赛");
      finalFourChecks+=1;
    }else{
      throw new Error(`无法推进的玩家界面状态：${screen}`);
    }
  }
  assert(safety>0&&state.tournament.stage==="COMPLETED","玩家模式未能完成整届世界杯");
  assert(player.getState().screen==="COMPLETED","赛事结束后没有完成页面");
  const podium=Object.values(state.tournament.podium);
  assert(new Set(podium).size===4,"玩家模式赛事前四名重复");
  const ceremonyHtml=nodes.get("#cup-content").innerHTML;
  assert(ceremonyHtml.includes("award-ceremony")&&ceremonyHtml.includes("再来一届")&&ceremonyHtml.includes("返回主菜单")&&ceremonyHtml.includes("award-team-roster")&&ceremonyHtml.includes("最终战绩"),"赛事结束缺少队伍、战绩、颁奖界面或重新开始操作");
  if(state.tournament.podium.championTeamId===assigned.id)assert(ceremonyHtml.includes("champion-ceremony")&&ceremonyHtml.includes("冠军！"),"玩家夺冠后缺少冠军颁奖界面");
  if(state.tournament.podium.thirdTeamId===assigned.id)assert(ceremonyHtml.includes("third-place-ceremony")&&ceremonyHtml.includes("荣获季军"),"玩家季军时缺少独立季军结算界面");
  if(state.tournament.podium.fourthTeamId===assigned.id)assert(ceremonyHtml.includes("final-four-exit")&&ceremonyHtml.includes("止步四强"),"玩家第四名时缺少止步四强界面");
  awardCeremonyChecks+=1;
  editionReports.push({edition,playerTeam:assigned.id,playerMatches:state.tournament.groupStage.matches.filter(m=>[m.teamAId,m.teamBId].includes(assigned.id)&&m.status==="completed").length,podium});
}

assert(phaseTwoMatches>0,"测试中从未进入第二阶段");
assert(byeMatches>0,"测试中从未验证第二阶段轮空");
assert(phaseThreeMatches>0,"测试中从未进入第三阶段");
assert(knockoutManualMatches>0,"测试中从未逐场进行玩家淘汰赛");
assert(new Set(editionReports.map(report=>report.playerTeam)).size>1,"多届测试没有体现随机分配玩家球队");
assert(consoleErrors.length===0,`Console错误：${consoleErrors.length}`);
assert(menuChecks===manualMatches&&resultPresentationChecks===manualMatches,"菜单或结算播报没有覆盖所有玩家比赛");
assert(finalFourChecks>0,"测试中没有验证四强晋级过场");
assert(captainPresentationChecks>0,"测试中没有验证队长出战与胜负播报");
assert(exitChecks===1,"测试中没有验证选择阶段安全退出与重进");
assert(simultaneousDecisionChecks===animationChecks,"AI同时决策检查未覆盖每次玩家出战");
assert(awardCeremonyChecks===editionReports.length,"颁奖界面没有覆盖所有测试届次");
console.log(JSON.stringify({editions:editionReports,manualMatches,knockoutManualMatches,phaseTwoMatches,byeMatches,phaseThreeMatches,animationChecks,simultaneousDecisionChecks,captainPresentationChecks,menuChecks,exitChecks,resultPresentationChecks,finalFourChecks,awardCeremonyChecks,consoleErrors:0,allPassed:true},null,2));
