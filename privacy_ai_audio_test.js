"use strict";

const fs=require("fs"),path=require("path"),vm=require("vm");
function assert(value,message){if(!value)throw new Error(message);}
function seededRandom(seed){let value=seed>>>0;return()=>{value=(value*1664525+1013904223)>>>0;return value/4294967296;};}

function genericNode(){return{dataset:{},hidden:false,disabled:false,innerHTML:"",textContent:"",value:"rank",offsetTop:0,attributes:{},classList:{add(){},remove(){},toggle(){}},querySelector:()=>({textContent:""}),addEventListener(){},setAttribute(k,v){this.attributes[k]=v;},removeAttribute(k){delete this.attributes[k];},showModal(){},close(){}};}
const nodes=new Map();
const documentStub={querySelector(s){if(!nodes.has(s))nodes.set(s,genericNode());return nodes.get(s);},querySelectorAll(){return[];},addEventListener(){}};
const context=vm.createContext({window:{clearTimeout(){},setTimeout(){return 1;},scrollTo(){}},document:documentStub,console,Math,Set,Map,Object,Array,Number,String,TypeError,RangeError});
for(const file of["characters.js","game.js","playerMode.js"])vm.runInContext(fs.readFileSync(path.join(__dirname,file),"utf8"),context,{filename:file});
const player=context.window.playerMode,roster=context.window.CHARACTERS;
const aiPool=[roster[0].name,roster[49].name,roster[99].name,roster[149].name];
const aiRandom=seededRandom(778899);
const counts=Object.fromEntries(aiPool.map(name=>[name,0]));
for(let run=0;run<3000;run+=1){
  const choice=player.chooseAICharacter(aiPool,{matchStage:"SEMI_FINALS",combatPhase:"PHASE_TWO",duelIndex:2,aiSurvivorCount:2,opponentSurvivorCount:3},aiRandom);
  counts[choice.name]+=1;
}
assert(Object.values(counts).filter(count=>count>0).length>=3,"AI相同局面没有多种选择");
assert(counts[aiPool[0]]<3000,"AI永远选择最高武力");
assert(counts[aiPool[0]]>counts[aiPool[3]],"AI劣势关键阶段没有体现强攻权重");
assert(!player.chooseAICharacter.toString().includes("playerSelected"),"AI函数读取了玩家隐藏选择");

async function testAudio(playSucceeds){
  const eventListeners={};
  let playCalls=0,pauseCalls=0;
  const audio={dataset:{src:"assets/audio/bgm.mp3"},src:"",loop:false,volume:1,paused:true,currentTime:0,
    play(){playCalls+=1;if(playSucceeds){this.paused=false;return Promise.resolve();}return Promise.reject(new Error("missing audio"));},
    pause(){pauseCalls+=1;this.paused=true;},addEventListener(type,listener){eventListeners[`audio:${type}`]=listener;}};
  const toggle={textContent:"",attributes:{},addEventListener(type,listener){eventListeners[`toggle:${type}`]=listener;},setAttribute(k,v){this.attributes[k]=v;}};
  const volume={value:"30",addEventListener(type,listener){eventListeners[`volume:${type}`]=listener;}};
  const document={querySelector(selector){return selector==="#background-music"?audio:selector==="#music-toggle"?toggle:volume;},addEventListener(type,listener){eventListeners[`document:${type}`]=listener;}};
  const audioContext=vm.createContext({window:{},document,console});
  vm.runInContext(fs.readFileSync(path.join(__dirname,"audioManager.js"),"utf8"),audioContext,{filename:"audioManager.js"});
  const manager=audioContext.window.audioManager;
  assert(audio.loop===true&&audio.volume===0.3,"BGM默认循环或音量错误");
  if(playSucceeds){
    eventListeners["document:click"]({target:{closest:()=>({dataset:{action:"start-game"}})}});
    await Promise.resolve();
    assert(playCalls===1&&!audio.paused,"首次开始世界杯没有播放音乐");
    audio.currentTime=42;
    eventListeners["document:click"]({target:{closest:()=>({dataset:{action:"open-gallery"}})}});
    assert(playCalls===1&&audio.currentTime===42,"页面切换导致BGM重新播放");
    manager.setVolume(65);
    assert(audio.volume===0.65,"音量控制失败");
    manager.pause();
    assert(audio.paused&&pauseCalls===1,"静音控制失败");
  }else{
    const result=await manager.play();
    assert(result===false&&manager.getState().unavailable===true,"缺少音频文件时没有安全降级");
  }
  return{playCalls,pauseCalls,unavailable:manager.getState().unavailable};
}

(async()=>{
  const installed=await testAudio(true);
  const missing=await testAudio(false);
  console.log(JSON.stringify({aiCounts:counts,aiVariety:true,aiDoesNotReadPlayerSelection:true,audioInstalled:installed,audioMissing:missing,allPassed:true},null,2));
})().catch(error=>{console.error(error);process.exitCode=1;});
