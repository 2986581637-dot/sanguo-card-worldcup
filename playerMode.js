"use strict";

(() => {
  const app = window.sanguoApp;
  const characters = window.CHARACTERS;
  const content = document.querySelector("#cup-content");
  const mode = {
    playerTeamId: null,
    screen: "DASHBOARD",
    battle: null,
    recentResults: [],
    random: Math.random,
    journeyEnded: false
  };

  const STAGE_NAMES = Object.freeze({
    GROUP_STAGE: "小组赛",
    ROUND_OF_16: "16强",
    QUARTER_FINALS: "8强",
    SEMI_FINALS: "半决赛",
    THIRD_PLACE: "季军赛",
    FINAL: "决赛",
    COMPLETED: "赛事结束"
  });

  const ROUND_KEYS = Object.freeze({
    ROUND_OF_16: "roundOf16",
    QUARTER_FINALS: "quarterFinals",
    SEMI_FINALS: "semiFinals",
    THIRD_PLACE: "thirdPlace",
    FINAL: "final"
  });

  function gameState() {
    return app.getState();
  }

  function getCharacter(name) {
    return characters.find((character) => character.name === name);
  }

  function getPlayerTeam() {
    const { worldCup } = gameState();
    return worldCup?.teams.find((team) => team.id === mode.playerTeamId);
  }

  function getPlayerGroup() {
    const { worldCup } = gameState();
    return worldCup?.groups.find((group) => group.teams.some((team) => team.id === mode.playerTeamId));
  }

  function randomIndex(length) {
    return Math.floor(mode.random() * length);
  }

  function startNewEdition(draw, tournament, random = Math.random) {
    mode.random = random;
    mode.playerTeamId = draw.teams[randomIndex(draw.teams.length)].id;
    mode.screen = "DASHBOARD";
    mode.battle = null;
    mode.recentResults = [];
    mode.journeyEnded = false;
    return mode.playerTeamId;
  }

  function allMatches(tournament) {
    const knockout = ["roundOf16", "quarterFinals", "semiFinals", "thirdPlace", "final"]
      .map((key) => tournament.knockout[key])
      .filter(Boolean)
      .flatMap((round) => round.matches);
    return [...tournament.groupStage.matches, ...knockout];
  }

  function playerMatchInCurrentStage() {
    const { tournament } = gameState();
    if (!tournament || tournament.stage === "COMPLETED") return null;
    if (tournament.stage === "GROUP_STAGE") {
      return tournament.groupStage.matches.find((match) => (
        match.status === "pending"
        && [match.teamAId, match.teamBId].includes(mode.playerTeamId)
      )) || null;
    }
    const round = tournament.knockout[ROUND_KEYS[tournament.stage]];
    return round?.matches.find((match) => (
      match.status === "pending"
      && [match.teamAId, match.teamBId].includes(mode.playerTeamId)
    )) || null;
  }

  function stageLabelForMatch(match) {
    return match.stage === "GROUP_STAGE"
      ? `小组赛第${match.matchDay}轮`
      : STAGE_NAMES[match.stage];
  }

  function fighterSnapshot(character, team, side) {
    return { teamId: team.id, teamName: team.name, side, name: character.name, martial: character.martial };
  }

  function survivorSummary(team, side, names) {
    return {
      teamId: team.id,
      teamName: team.name,
      side,
      count: names.length,
      members: names.map((name) => fighterSnapshot(getCharacter(name), team, side))
    };
  }

  function createBattle(match) {
    const { worldCup } = gameState();
    const teamA = app.getTeamById(worldCup, match.teamAId);
    const teamB = app.getTeamById(worldCup, match.teamBId);
    return {
      match,
      teamA,
      teamB,
      playerSide: teamA.id === mode.playerTeamId ? "A" : "B",
      phase: "PHASE_ONE",
      awaitingContinue: false,
      playerSelection: null,
      lastDuel: null,
      eliminated: new Set(),
      revealedOpponent: new Set(),
      phaseOne: {
        availableA: [...teamA.members],
        availableB: [...teamB.members],
        duels: [],
        survivorsA: [],
        survivorsB: []
      },
      phaseTwo: null,
      pendingRecord: null
    };
  }

  function startNextPlayerMatch() {
    const match = playerMatchInCurrentStage();
    if (!match) return;
    mode.battle = createBattle(match);
    mode.screen = "BATTLE";
    render();
  }

  function resolveDuel(nameA, nameB, battle, duelNumber) {
    const characterA = getCharacter(nameA);
    const characterB = getCharacter(nameB);
    const fighterA = fighterSnapshot(characterA, battle.teamA, "A");
    const fighterB = fighterSnapshot(characterB, battle.teamB, "B");
    const aWins = characterA.martial > characterB.martial;
    const duel = {
      duelNumber,
      fighterA,
      fighterB,
      winner: aWins ? fighterA : fighterB,
      eliminated: aWins ? fighterB : fighterA
    };
    battle.eliminated.add(duel.eliminated.name);
    return duel;
  }

  function choosePlayerFighter(name) {
    const battle = mode.battle;
    if (!battle || battle.awaitingContinue || !["PHASE_ONE", "PHASE_TWO"].includes(battle.phase)) return;
    const phase = battle.phase === "PHASE_ONE" ? battle.phaseOne : battle.phaseTwo;
    const playerKey = battle.playerSide === "A" ? "availableA" : "availableB";
    if (!phase[playerKey].includes(name)) return;
    battle.playerSelection = name;
    render();
  }

  function weightedChoice(options, weightFor, random = mode.random) {
    const weighted = options.map((option, index) => ({ option, weight: Math.max(0.01, weightFor(option, index)) }));
    const total = weighted.reduce((sum, item) => sum + item.weight, 0);
    let roll = random() * total;
    for (const item of weighted) {
      roll -= item.weight;
      if (roll <= 0) return item.option;
    }
    return weighted[weighted.length - 1].option;
  }

  function chooseAICharacter(availableNames, situation, random = mode.random) {
    if (!Array.isArray(availableNames) || !availableNames.length) throw new RangeError("AI没有可出战武将");
    const ordered = [...availableNames].sort((left, right) => getCharacter(right).martial - getCharacter(left).martial);
    const knockout = situation.matchStage !== "GROUP_STAGE";
    const behind = situation.aiSurvivorCount < situation.opponentSurvivorCount;
    const lateCombat = situation.combatPhase === "PHASE_TWO" || situation.duelIndex >= 3;
    const strategyWeights = {
      assault: 24 + (knockout ? 12 : 0) + (behind ? 20 : 0) + (lateCombat ? 10 : 0),
      preserve: 22 + (!behind ? 9 : 0),
      probe: 16 + (situation.combatPhase === "PHASE_ONE" && situation.duelIndex <= 2 ? 13 : 0),
      balanced: 38
    };
    const strategy = weightedChoice(Object.keys(strategyWeights), (name) => strategyWeights[name], random);
    const maxIndex = Math.max(1, ordered.length - 1);
    const selected = weightedChoice(ordered, (name, index) => {
      const strength = 1 - index / maxIndex;
      if (strategy === "assault") return 1 + strength * strength * 6;
      if (strategy === "preserve") return index === 0 && ordered.length > 1 ? 0.45 : 1.5 + (1 - Math.abs(strength - 0.52)) * 2.5;
      if (strategy === "probe") return 1 + (1 - strength) * 4.5;
      return 1.2 + strength * 3.2;
    }, random);
    return { name: selected, strategy };
  }

  function confirmPlayerFighter() {
    const battle = mode.battle;
    if (!battle?.playerSelection || battle.awaitingContinue) return;
    const phase = battle.phase === "PHASE_ONE" ? battle.phaseOne : battle.phaseTwo;
    const playerKey = battle.playerSide === "A" ? "availableA" : "availableB";
    const opponentKey = battle.playerSide === "A" ? "availableB" : "availableA";
    const aiChoice = chooseAICharacter([...phase[opponentKey]], {
      matchStage: battle.match.stage,
      combatPhase: battle.phase,
      duelIndex: phase.duels.length + 1,
      aiSurvivorCount: phase[opponentKey].length,
      opponentSurvivorCount: phase[playerKey].length
    }, mode.random);
    const playerName = battle.playerSelection;
    const opponentName = aiChoice.name;
    phase[playerKey].splice(phase[playerKey].indexOf(playerName), 1);
    phase[opponentKey].splice(phase[opponentKey].indexOf(opponentName), 1);
    const nameA = battle.playerSide === "A" ? playerName : opponentName;
    const nameB = battle.playerSide === "B" ? playerName : opponentName;
    const duel = resolveDuel(nameA, nameB, battle, phase.duels.length + 1);
    phase.duels.push(duel);
    battle.revealedOpponent.add(opponentName);
    battle.playerSelection = null;
    battle.lastAIStrategy = aiChoice.strategy;
    battle.lastDuel = duel;
    battle.awaitingContinue = true;
    render();
  }

  function finishPhaseOne() {
    const battle = mode.battle;
    battle.phaseOne.survivorsA = battle.phaseOne.duels.filter((duel) => duel.winner.side === "A").map((duel) => duel.winner.name);
    battle.phaseOne.survivorsB = battle.phaseOne.duels.filter((duel) => duel.winner.side === "B").map((duel) => duel.winner.name);
    if (!battle.phaseOne.survivorsA.length || !battle.phaseOne.survivorsB.length) {
      prepareBattleResult("phase-one", battle.phaseOne.survivorsA, battle.phaseOne.survivorsB);
      return;
    }
    const duelCount = Math.min(battle.phaseOne.survivorsA.length, battle.phaseOne.survivorsB.length);
    battle.phaseTwo = {
      duelCount,
      availableA: [...battle.phaseOne.survivorsA],
      availableB: [...battle.phaseOne.survivorsB],
      duels: [],
      participantsA: [],
      participantsB: [],
      byesA: [],
      byesB: [],
      survivorsA: [],
      survivorsB: []
    };
    battle.phase = "PHASE_TWO";
    battle.lastDuel = null;
  }

  function finishPhaseTwo() {
    const battle = mode.battle;
    const phase = battle.phaseTwo;
    phase.participantsA = phase.duels.map((duel) => duel.fighterA);
    phase.participantsB = phase.duels.map((duel) => duel.fighterB);
    phase.byesA = [...phase.availableA];
    phase.byesB = [...phase.availableB];
    phase.survivorsA = [
      ...phase.byesA,
      ...phase.duels.filter((duel) => duel.winner.side === "A").map((duel) => duel.winner.name)
    ];
    phase.survivorsB = [
      ...phase.byesB,
      ...phase.duels.filter((duel) => duel.winner.side === "B").map((duel) => duel.winner.name)
    ];
    prepareBattleResult("phase-two", phase.survivorsA, phase.survivorsB);
  }

  function continueBattle() {
    const battle = mode.battle;
    if (!battle?.awaitingContinue) return;
    battle.awaitingContinue = false;
    if (battle.phase === "PHASE_ONE") {
      if (battle.phaseOne.duels.length === 4) finishPhaseOne();
      else battle.lastDuel = null;
    } else if (battle.phase === "PHASE_TWO") {
      if (battle.phaseTwo.duels.length === battle.phaseTwo.duelCount) finishPhaseTwo();
      else battle.lastDuel = null;
    }
    render();
  }

  function decideWinner(teamA, teamB, survivorsA, survivorsB) {
    const totalA = survivorsA.reduce((sum, name) => sum + getCharacter(name).martial, 0);
    const totalB = survivorsB.reduce((sum, name) => sum + getCharacter(name).martial, 0);
    const highA = survivorsA.length ? Math.max(...survivorsA.map((name) => getCharacter(name).martial)) : 0;
    const highB = survivorsB.length ? Math.max(...survivorsB.map((name) => getCharacter(name).martial)) : 0;
    if (!survivorsA.length) return { winningTeam: teamB, decision: "opponent-eliminated", totalA, totalB, highA, highB };
    if (!survivorsB.length) return { winningTeam: teamA, decision: "opponent-eliminated", totalA, totalB, highA, highB };
    if (totalA !== totalB) return { winningTeam: totalA > totalB ? teamA : teamB, decision: "final-power", totalA, totalB, highA, highB };
    if (highA !== highB) return { winningTeam: highA > highB ? teamA : teamB, decision: "highest-survivor-martial", totalA, totalB, highA, highB };
    return { winningTeam: mode.random() < 0.5 ? teamA : teamB, decision: "random-50-percent", totalA, totalB, highA, highB };
  }

  function prepareBattleResult(endedAfter, survivorsA, survivorsB) {
    const battle = mode.battle;
    const outcome = decideWinner(battle.teamA, battle.teamB, survivorsA, survivorsB);
    const phaseOneRecord = {
      skipped: false,
      duelCount: 4,
      duels: battle.phaseOne.duels,
      survivors: {
        A: survivorSummary(battle.teamA, "A", battle.phaseOne.survivorsA),
        B: survivorSummary(battle.teamB, "B", battle.phaseOne.survivorsB)
      }
    };
    const phaseTwoRecord = endedAfter === "phase-one"
      ? { skipped: true, reason: "第一阶段后一方已全灭" }
      : {
          skipped: false,
          duelCount: battle.phaseTwo.duelCount,
          participants: { A: battle.phaseTwo.participantsA, B: battle.phaseTwo.participantsB },
          byes: {
            A: battle.phaseTwo.byesA.map((name) => fighterSnapshot(getCharacter(name), battle.teamA, "A")),
            B: battle.phaseTwo.byesB.map((name) => fighterSnapshot(getCharacter(name), battle.teamB, "B"))
          },
          duels: battle.phaseTwo.duels,
          survivors: {
            A: survivorSummary(battle.teamA, "A", survivorsA),
            B: survivorSummary(battle.teamB, "B", survivorsB)
          }
        };
    const bothAlive = survivorsA.length > 0 && survivorsB.length > 0;
    const phaseThreeRecord = bothAlive
      ? {
          skipped: false,
          survivors: {
            A: survivorSummary(battle.teamA, "A", survivorsA),
            B: survivorSummary(battle.teamB, "B", survivorsB)
          },
          finalPower: { A: outcome.totalA, B: outcome.totalB },
          highestMartial: { A: outcome.highA, B: outcome.highB },
          decision: outcome.decision
        }
      : { skipped: true, reason: `${endedAfter === "phase-one" ? "第一" : "第二"}阶段后一方已全灭` };
    battle.pendingRecord = {
      rulesVersion: app.matchRules.version,
      teams: { A: { id:battle.teamA.id, name:battle.teamA.name }, B: { id:battle.teamB.id, name:battle.teamB.name } },
      phaseOne: phaseOneRecord,
      phaseTwo: phaseTwoRecord,
      phaseThree: phaseThreeRecord,
      endedAfter: bothAlive ? "phase-three" : endedAfter,
      winner: { teamId:outcome.winningTeam.id, teamName:outcome.winningTeam.name, side:outcome.winningTeam.id === battle.teamA.id ? "A" : "B", reason:outcome.decision }
    };
    battle.phase = bothAlive ? "PHASE_THREE" : "MATCH_RESULT";
    battle.finalSurvivorsA = survivorsA;
    battle.finalSurvivorsB = survivorsB;
    battle.lastDuel = null;
  }

  function confirmBattleResult() {
    const battle = mode.battle;
    if (!battle?.pendingRecord) return;
    const { worldCup } = gameState();
    app.completeScheduledMatch(battle.match, worldCup, battle.pendingRecord);
    mode.recentResults.unshift(battle.match);
    mode.recentResults = mode.recentResults.slice(0, 8);
    mode.screen = "POST_MATCH";
    render();
  }

  function addRecent(matches) {
    mode.recentResults.unshift(...matches.filter((match) => match.status === "completed"));
    mode.recentResults = [...new Map(mode.recentResults.map((match) => [match.id, match])).values()].slice(0, 8);
  }

  function simulateOtherGroupMatches(matchDay) {
    const { worldCup, tournament } = gameState();
    const pending = tournament.groupStage.matches.filter((match) => match.matchDay === matchDay && match.status === "pending");
    pending.forEach((match) => app.playScheduledMatch(match, worldCup, mode.random));
    addRecent(pending);
    if (tournament.groupStage.matches.every((match) => match.status === "completed")) {
      app.finalizeGroupStage(tournament, worldCup, mode.random);
    }
  }

  function simulateOtherKnockoutMatches(stage) {
    const { worldCup, tournament } = gameState();
    const roundKey = ROUND_KEYS[stage];
    const round = tournament.knockout[roundKey];
    const pending = round.matches.filter((match) => match.status === "pending");
    pending.forEach((match) => app.playScheduledMatch(match, worldCup, mode.random));
    addRecent(pending);
    app.advanceKnockoutStage(tournament);
  }

  function playerQualifiedFromGroup() {
    const { tournament } = gameState();
    return tournament.groupStage.qualifiers.some((item) => item.teamId === mode.playerTeamId);
  }

  function autoAdvanceNonPlayerStage() {
    const { worldCup, tournament } = gameState();
    while (tournament.stage !== "COMPLETED" && !playerMatchInCurrentStage()) {
      if (mode.journeyEnded) return;
      const before = allMatches(tournament).filter((match) => match.status === "completed").length;
      app.simulateAllCurrentStage(tournament, worldCup, mode.random);
      const completed = allMatches(tournament).filter((match) => match.status === "completed").slice(before);
      addRecent(completed);
      if (tournament.stage === "COMPLETED") return;
    }
  }

  function continueTournament() {
    const battle = mode.battle;
    if (!battle || battle.match.status !== "completed") return;
    const playerWon = battle.match.winnerTeamId === mode.playerTeamId;
    if (battle.match.stage === "GROUP_STAGE") {
      simulateOtherGroupMatches(battle.match.matchDay);
      const { tournament } = gameState();
      if (tournament.stage !== "GROUP_STAGE" && !playerQualifiedFromGroup()) mode.journeyEnded = true;
    } else {
      const completedStage = battle.match.stage;
      simulateOtherKnockoutMatches(completedStage);
      if (!playerWon && ["ROUND_OF_16", "QUARTER_FINALS", "THIRD_PLACE"].includes(completedStage)) {
        mode.journeyEnded = true;
      }
      if (completedStage === "FINAL") mode.journeyEnded = true;
    }
    mode.battle = null;
    if (!mode.journeyEnded) autoAdvanceNonPlayerStage();
    const { tournament } = gameState();
    mode.screen = tournament.stage === "COMPLETED" ? "COMPLETED" : mode.journeyEnded ? "ELIMINATED" : "DASHBOARD";
    render();
  }

  function autoWatchRemaining() {
    const { worldCup, tournament } = gameState();
    while (tournament.stage !== "COMPLETED") {
      app.simulateAllCurrentStage(tournament, worldCup, mode.random);
    }
    mode.screen = "COMPLETED";
    render();
  }

  function endEdition() {
    mode.screen = "ENDED";
    render();
  }

  function playerRecord() {
    const { tournament } = gameState();
    const completed = allMatches(tournament).filter((match) => match.status === "completed" && [match.teamAId, match.teamBId].includes(mode.playerTeamId));
    const wins = completed.filter((match) => match.winnerTeamId === mode.playerTeamId).length;
    return { played:completed.length, wins, losses:completed.length - wins };
  }

  function miniCard(name, status, selectable, selected = false) {
    const character = getCharacter(name);
    return `<button type="button" class="player-fighter ${status.className} ${selected ? "is-selected" : ""}" ${selectable ? `data-player-fighter="${name}"` : "disabled"}>
      <span>${character.faction} · ${character.tier}${character.subTier}</span><strong>${name}</strong><b>武力 ${character.martial}</b><i>${status.label}</i></button>`;
  }

  function opponentCardMarkup(name, status, battle, index) {
    if (battle.revealedOpponent.has(name)) return miniCard(name, status, false);
    return `<div class="opponent-card-back ${status.className}" aria-label="电脑未揭晓武将${index + 1}"><span>三国</span><strong>武将</strong><i>${status.className === "is-bye" ? "轮空" : "未揭晓"}</i></div>`;
  }

  function fighterStatus(name, side, battle) {
    if (battle.eliminated.has(name)) return { label:"阵亡", className:"is-fallen" };
    if (battle.phase === "PHASE_ONE") {
      const available = side === "A" ? battle.phaseOne.availableA : battle.phaseOne.availableB;
      return available.includes(name) ? { label:"可出战", className:"is-available" } : { label:"存活", className:"is-survivor" };
    }
    if (battle.phase === "PHASE_TWO") {
      const available = side === "A" ? battle.phaseTwo.availableA : battle.phaseTwo.availableB;
      return available.includes(name) ? { label:"可出战", className:"is-available" } : { label:"存活", className:"is-survivor" };
    }
    const byes = battle.phaseTwo ? [...battle.phaseTwo.byesA, ...battle.phaseTwo.byesB] : [];
    if (byes.includes(name)) return { label:"轮空", className:"is-bye" };
    return { label:"存活", className:"is-survivor" };
  }

  function duelArenaMarkup(battle) {
    if (!battle.lastDuel) return `<div class="battle-waiting"><span>将</span><p>请选择一名武将出战</p><small>电脑会在确认后随机派出对手</small></div>`;
    const duel = battle.lastDuel;
    const card = (fighter, side) => `<div class="arena-fighter ${side} ${duel.winner.name === fighter.name ? "is-winner" : "is-loser"}"><small>${fighter.teamName}</small><strong>${fighter.name}</strong><b>${fighter.martial}</b><i>${duel.winner.name === fighter.name ? "胜" : "阵亡"}</i></div>`;
    return `<div class="duel-arena">${card(duel.fighterA,"from-left")}<span class="arena-vs">VS</span>${card(duel.fighterB,"from-right")}</div>`;
  }

  function renderBattle() {
    const battle = mode.battle;
    const playerTeam = battle.playerSide === "A" ? battle.teamA : battle.teamB;
    const opponentTeam = battle.playerSide === "A" ? battle.teamB : battle.teamA;
    const playerSide = battle.playerSide;
    const opponentSide = playerSide === "A" ? "B" : "A";
    if (["PHASE_THREE", "MATCH_RESULT"].includes(battle.phase)) {
      const record = battle.pendingRecord;
      const totalA = battle.finalSurvivorsA.reduce((sum,name)=>sum+getCharacter(name).martial,0);
      const totalB = battle.finalSurvivorsB.reduce((sum,name)=>sum+getCharacter(name).martial,0);
      const playerWon = record.winner.teamId === mode.playerTeamId;
      const byeA = battle.phaseTwo?.byesA || [];
      const byeB = battle.phaseTwo?.byesB || [];
      content.innerHTML = `<div class="player-battle-view"><div class="battle-stage-line">${stageLabelForMatch(battle.match)} · ${battle.phase === "PHASE_THREE" ? "第三阶段" : "全灭判定"}</div>
        <h2>${playerWon ? "你的球队获胜！" : "你的球队落败！"}</h2>
        <div class="final-survivors"><section><h3>${battle.teamA.name}</h3><p>${battle.finalSurvivorsA.join("、") || "无幸存者"}</p><strong>${totalA}</strong><small>最终总武力</small></section><i>VS</i><section><h3>${battle.teamB.name}</h3><p>${battle.finalSurvivorsB.join("、") || "无幸存者"}</p><strong>${totalB}</strong><small>最终总武力</small></section></div>
        ${byeA.length || byeB.length ? `<p class="battle-bye-summary">第二阶段轮空：A队 ${byeA.join("、") || "无"}；B队 ${byeB.join("、") || "无"}</p>` : ""}
        <button class="battle-next-button" type="button" data-player-action="confirm-result">查看赛后总结</button></div>`;
      return;
    }

    const phase = battle.phase === "PHASE_ONE" ? battle.phaseOne : battle.phaseTwo;
    const phaseName = battle.phase === "PHASE_ONE" ? "第一阶段" : "第二阶段";
    const totalDuels = battle.phase === "PHASE_ONE" ? 4 : phase.duelCount;
    const currentDuel = Math.min(phase.duels.length + (battle.awaitingContinue ? 0 : 1), totalDuels);
    const playerAvailable = playerSide === "A" ? phase.availableA : phase.availableB;
    const opponentAvailable = opponentSide === "A" ? phase.availableA : phase.availableB;
    content.innerHTML = `<div class="player-battle-view">
      <div class="battle-stage-line">${stageLabelForMatch(battle.match)} · ${phaseName} · 第${currentDuel}场 / ${totalDuels}场</div>
      <div class="battle-title"><div><span>你的球队</span><h2>${playerTeam.name}</h2></div><i>对阵</i><div><span>电脑球队</span><h2>${opponentTeam.name}</h2></div></div>
      ${duelArenaMarkup(battle)}
      <div class="battle-status-line"><span>我方剩余 ${playerTeam.members.filter(name=>!battle.eliminated.has(name)).length} 人</span><span>对方剩余 ${opponentTeam.members.filter(name=>!battle.eliminated.has(name)).length} 人</span></div>
      <section class="fighter-selection"><h3>${battle.awaitingContinue ? "本轮结果" : battle.playerSelection ? "已锁定武将，请确认出战" : "选择你的出战武将"}</h3><div class="player-fighter-grid">${playerTeam.members.map((name) => miniCard(name, fighterStatus(name, playerSide, battle), !battle.awaitingContinue && playerAvailable.includes(name), battle.playerSelection === name)).join("")}</div></section>
      <section class="opponent-roster"><h3>对手暗牌 <small>当前可出战 ${opponentAvailable.length} 人 · 未出战身份保密</small></h3><div>${opponentTeam.members.map((name, index) => opponentCardMarkup(name, fighterStatus(name, opponentSide, battle), battle, index)).join("")}</div></section>
      ${battle.playerSelection && !battle.awaitingContinue ? `<button class="battle-confirm-button" type="button" data-player-action="confirm-fighter">确认出战</button>` : ""}
      ${battle.awaitingContinue ? `<button class="battle-next-button" type="button" data-player-action="continue-duel">${phase.duels.length === totalDuels ? "结束本阶段" : "进入下一场"}</button>` : ""}
    </div>`;
  }

  function groupStandingsMarkup(group, tournament) {
    const rows = app.getGroupStandings(group, tournament);
    return `<div class="player-standings">${rows.map((row,index)=>`<div class="${row.teamId===mode.playerTeamId?"is-player":""}"><span>${index+1}</span><b>${row.teamName}</b><small>${row.played}场 ${row.won}胜 ${row.points}分</small></div>`).join("")}</div>`;
  }

  function resultSummary(match) {
    const { worldCup } = gameState();
    const a = app.getTeamById(worldCup, match.teamAId);
    const b = app.getTeamById(worldCup, match.teamBId);
    return `<li><span>${a.name} VS ${b.name}</span><b>${app.getTeamById(worldCup,match.winnerTeamId).name}胜</b></li>`;
  }

  function renderDashboard() {
    const { worldCup, tournament } = gameState();
    const team = getPlayerTeam();
    const group = getPlayerGroup();
    const nextMatch = playerMatchInCurrentStage();
    const opponentId = nextMatch && (nextMatch.teamAId === team.id ? nextMatch.teamBId : nextMatch.teamAId);
    const opponent = opponentId ? app.getTeamById(worldCup, opponentId) : null;
    const record = playerRecord();
    content.innerHTML = `<div class="player-dashboard">
      <div class="player-hero"><div><p>你的球队</p><h2>${team.name}</h2><span>${group.name} · ${record.played}场 ${record.wins}胜 ${record.losses}负</span></div><strong>${STAGE_NAMES[tournament.stage]}</strong></div>
      <div class="team-roster player-team-roster">${team.members.map(getCharacter).map(app.cardMarkup).join("")}</div>
      <div class="player-dashboard-grid">
        <section><h3>下一场比赛</h3>${nextMatch ? `<p>${stageLabelForMatch(nextMatch)}</p><div class="next-opponent"><span>${team.name}</span><i>VS</i><strong>${opponent.name}</strong></div><button type="button" data-player-action="enter-match">进入下一场</button>` : `<p>当前没有待进行的玩家比赛。</p>`}</section>
        <section><h3>我的小组 · ${group.name}</h3>${groupStandingsMarkup(group,tournament)}<button type="button" data-cup-page="group-stage">查看完整积分与赛程</button></section>
        <section><h3>最近比赛简报</h3><ul class="recent-results">${mode.recentResults.length ? mode.recentResults.slice(0,5).map(resultSummary).join("") : "<li>赛事尚未开始</li>"}</ul></section>
      </div></div>`;
  }

  function renderPostMatch() {
    const { worldCup } = gameState();
    const match = mode.battle.match;
    const opponentId = match.teamAId === mode.playerTeamId ? match.teamBId : match.teamAId;
    const opponent = app.getTeamById(worldCup, opponentId);
    const won = match.winnerTeamId === mode.playerTeamId;
    const record = match.battleRecord;
    content.innerHTML = `<div class="post-match-view"><span>${stageLabelForMatch(match)} · 赛后总结</span><h2>${won ? "此战告捷" : "此战落败"}</h2><p>对手：${opponent.name}</p><div class="post-result"><b>${record.endedAfter === "phase-three" ? "三阶段决胜" : `${record.endedAfter === "phase-one" ? "第一" : "第二"}阶段全灭判定`}</b><strong>${app.getTeamById(worldCup,match.winnerTeamId).name}获胜</strong></div><p>继续后，电脑将自动模拟本轮其他比赛并更新积分或晋级结果。</p><button type="button" data-player-action="continue-tournament">继续赛事</button></div>`;
  }

  function renderEliminated() {
    const team = getPlayerTeam();
    content.innerHTML = `<div class="journey-end"><span>我的世界杯征程</span><h2>${team.name}已结束争夺</h2><p>你可以结束本届，或让电脑自动完成剩余比赛并查看最终冠军。</p><div><button type="button" data-player-action="end-edition">结束本届</button><button type="button" data-player-action="auto-watch">继续自动观看</button></div></div>`;
  }

  function renderCompleted() {
    const { worldCup, tournament } = gameState();
    const champion = app.getTeamById(worldCup, tournament.podium.championTeamId);
    const playerPlace = tournament.podium.championTeamId===mode.playerTeamId?"冠军":tournament.podium.runnerUpTeamId===mode.playerTeamId?"亚军":tournament.podium.thirdTeamId===mode.playerTeamId?"季军":tournament.podium.fourthTeamId===mode.playerTeamId?"第四名":"未进入前四";
    content.innerHTML = `<div class="journey-end is-complete"><span>本届世界杯结束</span><h2>冠军：${champion.name}</h2><p>你的球队最终成绩：${playerPlace}</p><div><button type="button" data-cup-page="champion">查看完整领奖台</button><button type="button" data-action="new-draw">开始新一届世界杯</button></div></div>`;
  }

  function renderEnded() {
    content.innerHTML = `<div class="journey-end"><span>本届征程已结束</span><h2>${getPlayerTeam().name}</h2><p>可以立即开始新一届，重新抽取128名武将并随机获得一支球队。</p><div><button type="button" data-action="new-draw">开始新一届世界杯</button></div></div>`;
  }

  function render() {
    if (!mode.playerTeamId || !gameState().worldCup) return;
    app.refreshCupNavigation?.();
    if (mode.screen === "BATTLE") renderBattle();
    else if (mode.screen === "POST_MATCH") renderPostMatch();
    else if (mode.screen === "ELIMINATED") renderEliminated();
    else if (mode.screen === "COMPLETED") renderCompleted();
    else if (mode.screen === "ENDED") renderEnded();
    else renderDashboard();
  }

  document.addEventListener("click", (event) => {
    const fighter = event.target.closest("[data-player-fighter]");
    if (fighter && !fighter.disabled) {
      choosePlayerFighter(fighter.dataset.playerFighter);
      return;
    }
    const action = event.target.closest("[data-player-action]")?.dataset.playerAction;
    if (action === "enter-match") startNextPlayerMatch();
    else if (action === "confirm-fighter") confirmPlayerFighter();
    else if (action === "continue-duel") continueBattle();
    else if (action === "confirm-result") confirmBattleResult();
    else if (action === "continue-tournament") continueTournament();
    else if (action === "auto-watch") autoWatchRemaining();
    else if (action === "end-edition") endEdition();
  });

  window.playerMode = Object.freeze({
    startNewEdition,
    render,
    startNextPlayerMatch,
    choosePlayerFighter,
    confirmPlayerFighter,
    chooseAICharacter,
    continueBattle,
    confirmBattleResult,
    continueTournament,
    autoWatchRemaining,
    isBattleActive: () => mode.screen === "BATTLE",
    getState: () => mode,
    getPlayerTeam
  });
})();
