"use strict";

(() => {
  const app = window.sanguoApp;
  const characters = window.CHARACTERS;
  const calculateCombatPower = window.calculateCombatPower;
  const getTypeMultiplier = window.getTypeMultiplier;
  const calculateBattlePower = window.calculateBattlePower;
  const resolveBattlePowerDuel = window.resolveBattlePowerDuel;
  const getUpsetAnnouncement = window.getUpsetAnnouncement;
  const selectAICombatant = app.selectAICombatant;
  const tactics = window.TACTICS;
  const content = document.querySelector("#cup-content");
  const mode = {
    playerTeamId: null,
    screen: "DASHBOARD",
    battle: null,
    recentResults: [],
    random: Math.random,
    journeyEnded: false,
    pauseMenuOpen: false,
    tacticOptions: []
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
    mode.pauseMenuOpen = false;
    mode.tacticOptions = [];
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

  function fighterSnapshot(character, team, side, opponent = null, duelPower = null, effectivePower = null) {
    const battleType = getBattleType(character);
    const typeMultiplier = opponent ? getTypeMultiplier(battleType, getBattleType(opponent)) : 1;
    return {
      teamId: team.id,
      teamName: team.name,
      side,
      name: character.name,
      martial: character.martial,
      intelligence: character.intelligence,
      power: calculateCombatPower(character),
      effectivePower: effectivePower ?? calculateCombatPower(character),
      battleType,
      typeMultiplier,
      normalBattlePower: opponent ? calculateBattlePower(character, opponent, effectivePower ?? calculateCombatPower(character)) : (effectivePower ?? calculateCombatPower(character)),
      battlePower: duelPower ?? (opponent ? calculateBattlePower(character, opponent, effectivePower ?? calculateCombatPower(character)) : (effectivePower ?? calculateCombatPower(character)))
    };
  }

  function survivorSummary(team, side, names, battle = null) {
    return {
      teamId: team.id,
      teamName: team.name,
      side,
      count: names.length,
      members: names.map((name) => fighterSnapshot(getCharacter(name), team, side, null, null, battle ? effectivePower(battle, name, side) : null))
    };
  }

  function effectivePower(battle, name, side, duelBonus = 0) {
    const original = calculateCombatPower(getCharacter(name));
    const wholeMatchBonus = battle.selectedTactic === "全军振奋" && side === battle.playerSide ? 2 : 0;
    return original + wholeMatchBonus + duelBonus;
  }

  function recordTactic(battle, event) {
    if (battle.tacticUsed) return false;
    battle.tacticUsed = true;
    battle.tacticEvents.push({ tactic: battle.selectedTactic, ...event });
    battle.tacticMessage = battle.selectedTactic;
    return true;
  }

  function createBattle(match, selectedTactic) {
    const { worldCup } = gameState();
    const teamA = app.getTeamById(worldCup, match.teamAId);
    const teamB = app.getTeamById(worldCup, match.teamBId);
    const battle = {
      match,
      teamA,
      teamB,
      playerSide: teamA.id === mode.playerTeamId ? "A" : "B",
      selectedTactic,
      tacticUsed: false,
      tacticEvents: [],
      tacticArmed: false,
      tacticMessage: "",
      pendingEvade: null,
      phase: "PHASE_ONE",
      awaitingContinue: false,
      playerSelection: null,
      lastDuel: null,
      presentedDuelKey: null,
      eliminated: new Set(),
      revealedOpponent: new Set(),
      pendingAIChoice: null,
      phaseOne: {
        availableA: [...teamA.members],
        availableB: [...teamB.members],
        duels: [],
        survivorsA: [],
        survivorsB: []
      },
      phaseTwo: null,
      phaseThreePresentation: null,
      pendingRecord: null
    };
    if (selectedTactic === "全军振奋") {
      const playerTeam = battle.playerSide === "A" ? teamA : teamB;
      recordTactic(battle, { phase: "MATCH_START", members: playerTeam.members.map((name) => ({ character: name, originalPower: getCharacter(name).power, effectivePower: getCharacter(name).power + 2 })) });
    }
    commitAISelection(battle);
    return battle;
  }

  function startNextPlayerMatch() {
    if (mode.screen === "TACTIC_SELECT" || mode.screen === "BATTLE") return;
    const match = playerMatchInCurrentStage();
    if (!match) return;
    mode.battle = null;
    mode.tacticOptions = window.drawTactics(mode.random);
    mode.screen = "TACTIC_SELECT";
    mode.pauseMenuOpen = false;
    render();
  }

  function chooseTactic(name) {
    if (mode.screen !== "TACTIC_SELECT" || !mode.tacticOptions.some((item) => item.name === name)) return;
    const match = playerMatchInCurrentStage();
    if (!match) return;
    mode.battle = createBattle(match, name);
    mode.tacticOptions = [];
    mode.screen = "BATTLE";
    render();
  }

  function openPauseMenu() {
    if (mode.screen !== "BATTLE" || !mode.battle) return;
    mode.pauseMenuOpen = true;
    render();
  }

  function closePauseMenu() {
    if (!mode.pauseMenuOpen) return;
    mode.pauseMenuOpen = false;
    render();
  }

  function restartBattle() {
    if (!mode.battle) return;
    mode.battle = createBattle(mode.battle.match, mode.battle.selectedTactic);
    mode.pauseMenuOpen = false;
    mode.screen = "BATTLE";
    render();
  }

  function returnToMainMenu() {
    mode.pauseMenuOpen = false;
    app.switchView?.("home");
  }

  function exitBattle() {
    if (!mode.battle) return;
    mode.battle = null;
    mode.pauseMenuOpen = false;
    mode.screen = "DASHBOARD";
    render();
  }

  function livingCount(battle, side) {
    const team = side === "A" ? battle.teamA : battle.teamB;
    return team.members.filter((name) => !battle.eliminated.has(name)).length;
  }

  function canUseBacksToWall(battle) {
    const enemySide = battle.playerSide === "A" ? "B" : "A";
    return battle.selectedTactic === "背水一战" && !battle.tacticUsed
      && livingCount(battle, battle.playerSide) < livingCount(battle, enemySide);
  }

  function useTacticBeforeDuel() {
    const battle = mode.battle;
    if (!battle || mode.pauseMenuOpen || battle.awaitingContinue || battle.pendingEvade || !["PHASE_ONE", "PHASE_TWO"].includes(battle.phase) || battle.tacticUsed) return;
    if (battle.selectedTactic === "侦察") {
      const opponent = battle.playerSide === "A" ? battle.teamB : battle.teamA;
      const candidates = opponent.members.filter((name) => !battle.eliminated.has(name)
        && !battle.revealedOpponent.has(name) && name !== battle.pendingAIChoice?.name);
      if (!candidates.length) return;
      const name = candidates[randomIndex(candidates.length)];
      battle.revealedOpponent.add(name);
      recordTactic(battle, { phase: battle.phase, character: name, originalPower: getCharacter(name).power, tier: `${getCharacter(name).tier}${getCharacter(name).subTier}` });
      battle.tacticMessage = `侦察成功：${name} · 战力 ${getCharacter(name).power} · ${getCharacter(name).tier}${getCharacter(name).subTier}`;
    } else if (battle.selectedTactic === "背水一战" && canUseBacksToWall(battle) && battle.playerSelection) {
      battle.tacticArmed = true;
      battle.tacticMessage = `背水一战待发动：${battle.playerSelection} +6`;
    } else if (battle.selectedTactic === "奇兵突袭" && battle.playerSelection) {
      battle.tacticArmed = true;
      battle.tacticMessage = "奇兵突袭已声明，翻牌后判断战力差距";
    }
    render();
  }

  function resolveDuel(nameA, nameB, battle, duelNumber, bonus = 0) {
    const characterA = getCharacter(nameA);
    const characterB = getCharacter(nameB);
    const powerA = effectivePower(battle, nameA, "A", battle.playerSide === "A" ? bonus : 0);
    const powerB = effectivePower(battle, nameB, "B", battle.playerSide === "B" ? bonus : 0);
    const outcome = resolveBattlePowerDuel(characterA, characterB, mode.random, { A: powerA, B: powerB });
    const fighterA = fighterSnapshot(characterA, battle.teamA, "A", characterB, outcome.finalPowerA, powerA);
    const fighterB = fighterSnapshot(characterB, battle.teamB, "B", characterA, outcome.finalPowerB, powerB);
    const tied = outcome.winnerSide === null;
    const aWins = outcome.winnerSide === "A";
    const duel = {
      duelNumber,
      fighterA,
      fighterB,
      winner: tied ? null : (aWins ? fighterA : fighterB),
      eliminated: tied ? [fighterA, fighterB] : [aWins ? fighterB : fighterA],
      mutualDestruction: tied,
      upset: outcome
    };
    return duel;
  }

  function commitDuel(battle, duel) {
    const phase = battle.phase === "PHASE_ONE" ? battle.phaseOne : battle.phaseTwo;
    phase.duels.push(duel);
    duel.eliminated.forEach((fighter) => battle.eliminated.add(fighter.name));
    battle.pendingEvade = null;
    battle.lastDuel = duel;
    battle.awaitingContinue = true;
  }

  function resolveEvade(useEvade) {
    const battle = mode.battle;
    const duel = battle?.pendingEvade;
    if (!duel || mode.pauseMenuOpen) return;
    if (useEvade) {
      const player = battle.playerSide === "A" ? duel.fighterA : duel.fighterB;
      const opponent = battle.playerSide === "A" ? duel.fighterB : duel.fighterA;
      recordTactic(battle, { phase: battle.phase, duelNumber: duel.duelNumber, character: player.name, opponent: opponent.name, originalPower: player.power, effectivePower: player.effectivePower, avoidedElimination: true });
      duel.evaded = true;
      duel.winner = null;
      duel.eliminated = [];
      duel.mutualDestruction = false;
      battle.tacticMessage = `闪避！${player.name}与${opponent.name}本场无人阵亡`;
    }
    commitDuel(battle, duel);
    render();
  }

  function choosePlayerFighter(name) {
    const battle = mode.battle;
    if (!battle || mode.pauseMenuOpen || battle.awaitingContinue || battle.pendingEvade || !["PHASE_ONE", "PHASE_TWO"].includes(battle.phase)) return;
    const phase = battle.phase === "PHASE_ONE" ? battle.phaseOne : battle.phaseTwo;
    const playerKey = battle.playerSide === "A" ? "availableA" : "availableB";
    if (!phase[playerKey].includes(name)) return;
    battle.playerSelection = name;
    if (battle.tacticArmed) battle.tacticMessage = `${battle.selectedTactic}已准备：${name}`;
    render();
  }

  function duelScore(battle) {
    const duels = [...battle.phaseOne.duels, ...(battle.phaseTwo?.duels || [])];
    return {
      A: duels.filter((duel) => duel.winner?.side === "A").length,
      B: duels.filter((duel) => duel.winner?.side === "B").length
    };
  }

  function commitAISelection(battle) {
    if (!battle || battle.awaitingContinue || !["PHASE_ONE", "PHASE_TWO"].includes(battle.phase)) return null;
    const phase = battle.phase === "PHASE_ONE" ? battle.phaseOne : battle.phaseTwo;
    const playerKey = battle.playerSide === "A" ? "availableA" : "availableB";
    const opponentKey = battle.playerSide === "A" ? "availableB" : "availableA";
    if (!phase?.[opponentKey]?.length) return null;
    const score = duelScore(battle);
    const aiSide = battle.playerSide === "A" ? "B" : "A";
    const playerSide = battle.playerSide;
    const choice = selectAICombatant([...phase[opponentKey]], {
      matchStage: battle.match.stage,
      combatPhase: battle.phase,
      duelIndex: phase.duels.length + 1,
      scoreFor: score[aiSide],
      scoreAgainst: score[playerSide],
      ownRemainingCount: phase[opponentKey].length,
      opponentRemainingCount: phase[playerKey].length
    }, mode.random);
    battle.pendingAIChoice = {
      name: choice.name,
      strategy: choice.strategy,
      reasoned: choice.reasoned,
      duelNumber: phase.duels.length + 1,
      committedBeforePlayerSelection: battle.playerSelection === null
    };
    return battle.pendingAIChoice;
  }

  function confirmPlayerFighter() {
    const battle = mode.battle;
    if (!battle?.playerSelection || mode.pauseMenuOpen || battle.awaitingContinue || battle.pendingEvade) return;
    const phase = battle.phase === "PHASE_ONE" ? battle.phaseOne : battle.phaseTwo;
    const playerKey = battle.playerSide === "A" ? "availableA" : "availableB";
    const opponentKey = battle.playerSide === "A" ? "availableB" : "availableA";
    const aiChoice = battle.pendingAIChoice;
    if (!aiChoice || aiChoice.duelNumber !== phase.duels.length + 1 || !phase[opponentKey].includes(aiChoice.name)) {
      throw new Error("电脑出场选择未在玩家选择前锁定");
    }
    const playerName = battle.playerSelection;
    const opponentName = aiChoice.name;
    phase[playerKey].splice(phase[playerKey].indexOf(playerName), 1);
    phase[opponentKey].splice(phase[opponentKey].indexOf(opponentName), 1);
    const nameA = battle.playerSide === "A" ? playerName : opponentName;
    const nameB = battle.playerSide === "B" ? playerName : opponentName;
    const baseGap = Math.abs(getCharacter(playerName).power - getCharacter(opponentName).power);
    let bonus = 0;
    if (battle.tacticArmed && !battle.tacticUsed && battle.selectedTactic === "背水一战" && canUseBacksToWall(battle)) bonus = 6;
    if (battle.tacticArmed && !battle.tacticUsed && battle.selectedTactic === "奇兵突袭" && baseGap <= 5) bonus = 5;
    if (bonus) {
      recordTactic(battle, { phase: battle.phase, duelNumber: phase.duels.length + 1, character: playerName, opponent: opponentName,
        originalPower: getCharacter(playerName).power, effectivePower: getCharacter(playerName).power + bonus });
      battle.tacticMessage = `${battle.selectedTactic}！${playerName} ${getCharacter(playerName).power} → ${getCharacter(playerName).power + bonus}`;
    } else if (battle.tacticArmed && battle.selectedTactic === "奇兵突袭") {
      battle.tacticMessage = `奇兵突袭未触发：基础战力差 ${baseGap} > 5，战术仍可使用`;
    }
    battle.tacticArmed = false;
    const duel = resolveDuel(nameA, nameB, battle, phase.duels.length + 1, bonus);
    battle.revealedOpponent.add(opponentName);
    battle.playerSelection = null;
    battle.lastAIStrategy = aiChoice.strategy;
    battle.pendingAIChoice = null;
    battle.lastDuel = duel;
    const playerLoses = duel.winner?.side !== battle.playerSide && duel.eliminated.some((fighter) => fighter.side === battle.playerSide);
    const canEvade = battle.selectedTactic === "闪避" && !battle.tacticUsed && playerLoses && baseGap <= 5;
    if (canEvade) battle.pendingEvade = duel;
    else commitDuel(battle, duel);
    render();
  }

  function finishPhaseOne() {
    const battle = mode.battle;
    battle.phaseOne.survivorsA = battle.phaseOne.duels.flatMap((duel) => duel.evaded ? [duel.fighterA.name] : duel.winner?.side === "A" ? [duel.winner.name] : []);
    battle.phaseOne.survivorsB = battle.phaseOne.duels.flatMap((duel) => duel.evaded ? [duel.fighterB.name] : duel.winner?.side === "B" ? [duel.winner.name] : []);
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
    commitAISelection(battle);
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
      ...phase.duels.flatMap((duel) => duel.evaded ? [duel.fighterA.name] : duel.winner?.side === "A" ? [duel.winner.name] : [])
    ];
    phase.survivorsB = [
      ...phase.byesB,
      ...phase.duels.flatMap((duel) => duel.evaded ? [duel.fighterB.name] : duel.winner?.side === "B" ? [duel.winner.name] : [])
    ];
    prepareBattleResult("phase-two", phase.survivorsA, phase.survivorsB);
  }

  function continueBattle() {
    const battle = mode.battle;
    if (!battle?.awaitingContinue) return;
    battle.awaitingContinue = false;
    if (battle.phase === "PHASE_ONE") {
      if (battle.phaseOne.duels.length === 4) finishPhaseOne();
      else {
        battle.lastDuel = null;
        commitAISelection(battle);
      }
    } else if (battle.phase === "PHASE_TWO") {
      if (battle.phaseTwo.duels.length === battle.phaseTwo.duelCount) finishPhaseTwo();
      else {
        battle.lastDuel = null;
        commitAISelection(battle);
      }
    }
    render();
  }

  function advancePhaseThree() {
    const battle = mode.battle;
    if (battle?.phase !== "PHASE_THREE" || mode.pauseMenuOpen) return;
    const presentation = battle.phaseThreePresentation;
    const multiple = battle.finalSurvivorsA.length > 1 || battle.finalSurvivorsB.length > 1;
    if (presentation.step === "ready") presentation.step = "lineup";
    else if (presentation.step === "lineup") presentation.step = "power";
    else if (presentation.step === "power") presentation.step = multiple ? "gather" : "clash";
    else if (presentation.step === "gather") presentation.step = "totals";
    else if (presentation.step === "totals") presentation.step = "clash";
    else if (presentation.step === "clash") presentation.step = "outcome";
    else if (presentation.step === "outcome") battle.phase = "MATCH_RESULT";
    render();
  }

  function decideWinner(teamA, teamB, survivorsA, survivorsB) {
    const battle = mode.battle;
    const bonus = battle.selectedTactic === "军心振奋" && battle.tacticUsed ? 6 : 0;
    const highA = survivorsA.length ? Math.max(...survivorsA.map((name) => effectivePower(battle, name, "A"))) : 0;
    const highB = survivorsB.length ? Math.max(...survivorsB.map((name) => effectivePower(battle, name, "B"))) : 0;
    if (survivorsA.length === 1 && survivorsB.length === 1) {
      const duel = resolveDuel(survivorsA[0], survivorsB[0], battle, 1, bonus);
      const winningTeam = duel.winner?.side === "A" ? teamA : duel.winner?.side === "B" ? teamB : mode.random() < 0.5 ? teamA : teamB;
      return { winningTeam, decision: "normal-duel", tieBreak: duel.winner ? null : "random-50-percent",
        totalA: duel.fighterA.battlePower, totalB: duel.fighterB.battlePower, highA, highB, duel };
    }
    const totalA = survivorsA.reduce((sum, name) => sum + effectivePower(battle, name, "A"), 0) + (battle.playerSide === "A" ? bonus : 0);
    const totalB = survivorsB.reduce((sum, name) => sum + effectivePower(battle, name, "B"), 0) + (battle.playerSide === "B" ? bonus : 0);
    if (!survivorsA.length && !survivorsB.length) return { winningTeam: mode.random() < 0.5 ? teamA : teamB, decision: "mutual-annihilation-random", totalA, totalB, highA, highB };
    if (!survivorsA.length) return { winningTeam: teamB, decision: "opponent-eliminated", totalA, totalB, highA, highB };
    if (!survivorsB.length) return { winningTeam: teamA, decision: "opponent-eliminated", totalA, totalB, highA, highB };
    if (totalA !== totalB) return { winningTeam: totalA > totalB ? teamA : teamB, decision: "combined-power", totalA, totalB, highA, highB, tieBreak: null };
    if (highA !== highB) return { winningTeam: highA > highB ? teamA : teamB, decision: "combined-power", totalA, totalB, highA, highB, tieBreak: "highest-survivor-combat-power" };
    return { winningTeam: mode.random() < 0.5 ? teamA : teamB, decision: "combined-power", totalA, totalB, highA, highB, tieBreak: "random-50-percent" };
  }

  function useMoraleTactic() {
    const battle = mode.battle;
    if (!battle || battle.phase !== "PHASE_THREE" || battle.selectedTactic !== "军心振奋" || battle.tacticUsed || mode.pauseMenuOpen) return;
    const names = battle.playerSide === "A" ? battle.finalSurvivorsA : battle.finalSurvivorsB;
    const originalPower = names.reduce((sum, name) => sum + getCharacter(name).power, 0);
    recordTactic(battle, { phase: "PHASE_THREE", originalPower, effectivePower: originalPower + 6, teamBonus: 6 });
    battle.tacticMessage = names.length === 1 && battle.finalSurvivorsA.length === 1 && battle.finalSurvivorsB.length === 1 ? `军心振奋！${names[0]} 战力 +6` : `军心振奋！${originalPower} + 战术 6 = ${originalPower + 6}`;
    const outcome = decideWinner(battle.teamA, battle.teamB, battle.finalSurvivorsA, battle.finalSurvivorsB);
    const phaseThree = battle.pendingRecord.phaseThree;
    phaseThree.finalPower = { A: outcome.totalA, B: outcome.totalB };
    phaseThree.teamAPower = outcome.totalA;
    phaseThree.teamBPower = outcome.totalB;
    phaseThree.finalPowerA = outcome.totalA;
    phaseThree.finalPowerB = outcome.totalB;
    phaseThree.winner = outcome.winningTeam.name;
    phaseThree.decision = outcome.decision;
    phaseThree.tieBreak = outcome.tieBreak ?? null;
    phaseThree.duel = outcome.duel ?? null;
    phaseThree.survivors = { A: survivorSummary(battle.teamA, "A", battle.finalSurvivorsA, battle), B: survivorSummary(battle.teamB, "B", battle.finalSurvivorsB, battle) };
    phaseThree.finalSurvivorsA = outcome.duel ? [outcome.duel.fighterA] : phaseThree.survivors.A.members;
    phaseThree.finalSurvivorsB = outcome.duel ? [outcome.duel.fighterB] : phaseThree.survivors.B.members;
    battle.pendingRecord.winner = { teamId: outcome.winningTeam.id, teamName: outcome.winningTeam.name,
      side: outcome.winningTeam.id === battle.teamA.id ? "A" : "B", reason: outcome.decision };
    battle.pendingRecord.tacticUsed = true;
    render();
  }

  function prepareBattleResult(endedAfter, survivorsA, survivorsB) {
    const battle = mode.battle;
    const outcome = decideWinner(battle.teamA, battle.teamB, survivorsA, survivorsB);
    const phaseOneRecord = {
      skipped: false,
      duelCount: 4,
      duels: battle.phaseOne.duels,
      survivors: {
        A: survivorSummary(battle.teamA, "A", battle.phaseOne.survivorsA, battle),
        B: survivorSummary(battle.teamB, "B", battle.phaseOne.survivorsB, battle)
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
            A: survivorSummary(battle.teamA, "A", survivorsA, battle),
            B: survivorSummary(battle.teamB, "B", survivorsB, battle)
          }
        };
    const bothAlive = survivorsA.length > 0 && survivorsB.length > 0;
    const phaseThreeRecord = bothAlive
      ? {
          skipped: false,
          survivors: {
            A: survivorSummary(battle.teamA, "A", survivorsA, battle),
            B: survivorSummary(battle.teamB, "B", survivorsB, battle)
          },
          finalPower: { A: outcome.totalA, B: outcome.totalB },
          highestPower: { A: outcome.highA, B: outcome.highB },
          teamAPower: outcome.totalA,
          teamBPower: outcome.totalB,
          teamACount: survivorsA.length,
          teamBCount: survivorsB.length,
          battleType: `${survivorsA.length}v${survivorsB.length}`,
           finalBattleType: `${survivorsA.length}v${survivorsB.length}`,
           finalSurvivorsA: outcome.duel ? [outcome.duel.fighterA] : survivorSummary(battle.teamA, "A", survivorsA, battle).members,
           finalSurvivorsB: outcome.duel ? [outcome.duel.fighterB] : survivorSummary(battle.teamB, "B", survivorsB, battle).members,
           finalPowerA: outcome.totalA,
           finalPowerB: outcome.totalB,
           duel: outcome.duel ?? null,
           tieBreak: outcome.tieBreak ?? null,
          winner: outcome.winningTeam.name,
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
      selectedTactic: battle.selectedTactic,
      tacticUsed: battle.tacticUsed,
      tacticEvents: battle.tacticEvents,
      winner: { teamId:outcome.winningTeam.id, teamName:outcome.winningTeam.name, side:outcome.winningTeam.id === battle.teamA.id ? "A" : "B", reason:outcome.decision }
    };
    battle.phase = bothAlive ? "PHASE_THREE" : "MATCH_RESULT";
    battle.phaseThreePresentation = bothAlive ? { step: "ready", revealedCount: 0 } : null;
    battle.finalSurvivorsA = survivorsA;
    battle.finalSurvivorsB = survivorsB;
    battle.lastDuel = null;
  }

  function confirmBattleResult() {
    const battle = mode.battle;
    if (!battle?.pendingRecord || battle.phase !== "MATCH_RESULT") return;
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

  function completeRemainingTournament() {
    const { worldCup, tournament } = gameState();
    while (tournament.stage !== "COMPLETED") {
      const before = allMatches(tournament).filter((match) => match.status === "completed").length;
      app.simulateAllCurrentStage(tournament, worldCup, mode.random);
      const completed = allMatches(tournament).filter((match) => match.status === "completed").slice(before);
      addRecent(completed);
    }
  }

  function continueTournament() {
    const battle = mode.battle;
    if (!battle || battle.match.status !== "completed") return;
    const playerWon = battle.match.winnerTeamId === mode.playerTeamId;
    let showFinalFourCeremony = false;
    if (battle.match.stage === "GROUP_STAGE") {
      simulateOtherGroupMatches(battle.match.matchDay);
      const { tournament } = gameState();
      if (tournament.stage !== "GROUP_STAGE" && !playerQualifiedFromGroup()) mode.journeyEnded = true;
    } else {
      const completedStage = battle.match.stage;
      simulateOtherKnockoutMatches(completedStage);
      showFinalFourCeremony = completedStage === "QUARTER_FINALS" && playerWon;
      if (!playerWon && ["ROUND_OF_16", "QUARTER_FINALS"].includes(completedStage)) {
        mode.journeyEnded = true;
      }
      if (completedStage === "THIRD_PLACE") {
        completeRemainingTournament();
        mode.journeyEnded = true;
      }
      if (completedStage === "FINAL") mode.journeyEnded = true;
    }
    mode.battle = null;
    if (showFinalFourCeremony) {
      mode.screen = "FINAL_FOUR";
      render();
      return;
    }
    if (!mode.journeyEnded) autoAdvanceNonPlayerStage();
    const { tournament } = gameState();
    mode.screen = tournament.stage === "COMPLETED" ? "COMPLETED" : mode.journeyEnded ? "ELIMINATED" : "DASHBOARD";
    render();
  }

  function continueFromFinalFour() {
    if (mode.screen !== "FINAL_FOUR") return;
    mode.screen = "DASHBOARD";
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

  function miniCard(name, status, selectable, selected = false, team = null) {
    const character = getCharacter(name);
    const battleType = getBattleType(character);
    const boosted = mode.battle?.selectedTactic === "全军振奋" && team?.id === mode.playerTeamId;
    return `<button type="button" class="player-fighter ${status.className} ${selected ? "is-selected" : ""} ${boosted ? "is-tactic-buffed" : ""}" ${boosted ? `style="--entry:${team.members.indexOf(name)}"` : ""} ${selectable ? `data-player-fighter="${name}"` : "disabled"}>
      ${team?.captainName === name ? `<em class="captain-badge">队长</em>` : ""}<span>${character.faction} · ${character.tier}${character.subTier} · ${BATTLE_TYPE_ICONS[battleType]} ${battleType}</span><strong>${name}</strong><b>综合战力 ${calculateCombatPower(character)}${boosted ? ` → ${calculateCombatPower(character) + 2}` : ""}</b><i>${status.label}</i></button>`;
  }

  function opponentCardMarkup(name, status, battle, team, index) {
    if (battle.revealedOpponent.has(name)) return miniCard(name, status, false, false, team);
    return `<div class="opponent-card-back ${status.className}" aria-label="电脑未揭晓武将${index + 1}">${team.captainName === name ? `<em class="captain-badge">队长</em>` : ""}<span>三国</span><strong>武将</strong><i>${status.className === "is-bye" ? "轮空" : status.className === "is-played" ? "已出战" : "未揭晓"}</i></div>`;
  }

  function fighterStatus(name, side, battle) {
    if (battle.eliminated.has(name)) return { label:"已出战 · 阵亡", className:"is-fallen is-played" };
    if (battle.phase === "PHASE_ONE") {
      const available = side === "A" ? battle.phaseOne.availableA : battle.phaseOne.availableB;
      return available.includes(name) ? { label:"可出战", className:"is-available" } : { label:"已出战 · 存活", className:"is-survivor is-played" };
    }
    if (battle.phase === "PHASE_TWO") {
      const available = side === "A" ? battle.phaseTwo.availableA : battle.phaseTwo.availableB;
      return available.includes(name) ? { label:"第二阶段可出战", className:"is-available" } : { label:"本阶段已出战", className:"is-survivor is-played" };
    }
    const byes = battle.phaseTwo ? [...battle.phaseTwo.byesA, ...battle.phaseTwo.byesB] : [];
    if (byes.includes(name)) return { label:"轮空", className:"is-bye" };
    return { label:"存活", className:"is-survivor" };
  }

  function portraitMarkupForBattle(fighter) {
    const character = getCharacter(fighter.name);
    const image = character?.portrait
      ? `<img src="${character.portrait}" alt="" loading="eager" decoding="async" onerror="this.remove()">`
      : "";
    return `<span class="arena-portrait">${image}<span aria-hidden="true">${fighter.name[0]}</span></span>`;
  }

  function duelPresentation(duel) {
    if (duel.evaded) return {
      attackerName: null, targetNames: new Set(), damageA: 0, damageB: 0,
      healthA: 100, healthB: 100, kind: "evade", critical: false,
      headline: "闪避！双方及时撤回！", result: "本场无人阵亡"
    };
    if (duel.mutualDestruction) {
      return {
        attackerName: null,
        targetNames: new Set([duel.fighterA.name, duel.fighterB.name]),
        damageA: Math.round(duel.fighterB.battlePower * 1.15),
        damageB: Math.round(duel.fighterA.battlePower * 1.15),
        healthA: 0,
        healthB: 0,
        kind: "clash",
        critical: false,
        headline: `${duel.fighterA.name}与${duel.fighterB.name}同归于尽！`,
        result: "同归于尽"
      };
    }
    const attacker = duel.winner;
    const target = duel.eliminated[0];
    const strategist = getBattleType(attacker) === "谋略";
    const critical = Math.abs(duel.fighterA.battlePower - duel.fighterB.battlePower) >= 8;
    const damage = Math.round(attacker.battlePower * (critical ? 1.35 : 1.08));
    const upsetAnnouncement = getUpsetAnnouncement(duel.upset);
    return {
      attackerName: attacker.name,
      targetNames: new Set([target.name]),
      damageA: duel.fighterA.name === target.name ? damage : 0,
      damageB: duel.fighterB.name === target.name ? damage : 0,
      healthA: duel.fighterA.name === target.name ? 0 : 100,
      healthB: duel.fighterB.name === target.name ? 0 : 100,
      kind: upsetAnnouncement?.completedUpset ? "upset" : upsetAnnouncement ? "surge" : strategist ? "strategy" : "strike",
      critical,
      headline: upsetAnnouncement
        ? upsetAnnouncement.headline
        : strategist ? `${attacker.name}施展计策！` : `${attacker.name}发动攻击！`,
      result: upsetAnnouncement?.result ?? (critical ? "暴击！击败！" : "击败！")
    };
  }

  function pauseMenuMarkup() {
    if (!mode.pauseMenuOpen) return "";
    return `<div class="battle-pause-backdrop" role="presentation">
      <section class="battle-pause-menu" role="dialog" aria-modal="true" aria-labelledby="pause-menu-title">
        <span class="pause-menu-seal" aria-hidden="true">令</span>
        <p>战局已暂停</p><h2 id="pause-menu-title">军令菜单</h2>
        <small>当前对战状态已保留，可以随时继续。</small>
        <div class="pause-menu-actions">
          <button type="button" data-player-action="resume-battle">继续游戏</button>
          <button type="button" data-player-action="restart-battle">重新开始本局</button>
          <button type="button" data-player-action="return-main-menu">返回主菜单</button>
          <button class="is-danger" type="button" data-player-action="exit-battle">退出当前对战</button>
        </div>
        <em>退出当前对战会清除本场手动进度，但不会判负，赛程仍保持待进行。</em>
      </section>
    </div>`;
  }

  function renderTacticSelect() {
    const match = playerMatchInCurrentStage();
    if (!match) { mode.screen = "DASHBOARD"; render(); return; }
    content.innerHTML = `<div class="tactic-select-view"><div class="battle-stage-line">${stageLabelForMatch(match)} · 赛前筹谋</div><h2>选择本场战术</h2><p>随机获得三张不同战术；只能携带一张，成功发动后本场不可再次使用。</p><div class="tactic-choice-grid">${mode.tacticOptions.map((item, index) => `<button type="button" class="tactic-choice" data-player-action="choose-tactic" data-tactic="${item.name}" style="--entry:${index}"><small>${item.timing}</small><strong>${item.name}</strong><span>${item.description}</span><em>选择此战术</em></button>`).join("")}</div><button type="button" class="tactic-return" data-player-action="leave-tactic-select">返回赛程</button></div>`;
  }

  function tacticPanel(battle) {
    const tactic = tactics.find((item) => item.name === battle.selectedTactic);
    if (!tactic) return "";
    const available = !battle.tacticUsed;
    const inDuel = ["PHASE_ONE", "PHASE_TWO"].includes(battle.phase) && !battle.awaitingContinue && !battle.pendingEvade;
    let button = "";
    if (available && inDuel && battle.selectedTactic === "侦察") {
      const opponent = battle.playerSide === "A" ? battle.teamB : battle.teamA;
      const eligible = opponent.members.some((name) => !battle.eliminated.has(name) && !battle.revealedOpponent.has(name) && name !== battle.pendingAIChoice?.name);
      button = `<button type="button" data-player-action="use-tactic" ${eligible ? "" : "disabled"}>发动侦察</button>`;
    } else if (available && inDuel && battle.selectedTactic === "背水一战") {
      button = `<button type="button" data-player-action="use-tactic" ${battle.playerSelection && canUseBacksToWall(battle) && !battle.tacticArmed ? "" : "disabled"}>${battle.tacticArmed ? "本轮已准备" : "发动背水一战"}</button>`;
    } else if (available && inDuel && battle.selectedTactic === "奇兵突袭") {
      button = `<button type="button" data-player-action="use-tactic" ${battle.playerSelection && !battle.tacticArmed ? "" : "disabled"}>${battle.tacticArmed ? "本轮已声明" : "声明奇兵突袭"}</button>`;
    } else if (available && battle.phase === "PHASE_THREE" && battle.selectedTactic === "军心振奋") {
      button = `<button type="button" data-player-action="use-morale">发动军心振奋 +6</button>`;
    }
    return `<section class="battle-tactic-panel ${available ? "is-available" : "is-used"}"><div><small>本场战术 · ${tactic.timing}</small><strong>${tactic.name}</strong><span>${tactic.description}</span></div><em>${available ? "可使用" : "已使用"}</em>${button}${battle.tacticMessage ? `<p class="tactic-broadcast" role="status">${battle.tacticMessage}</p>` : ""}</section>`;
  }

  function runBattlePresentation(battle, presentationKey) {
    if (typeof window.requestAnimationFrame !== "function") return;
    const arena = content.querySelector?.(`[data-presentation-key="${presentationKey}"]`);
    if (!arena || typeof arena.querySelectorAll !== "function") return;
    battle.presentedDuelKey = presentationKey;
    window.requestAnimationFrame(() => window.requestAnimationFrame(() => {
      arena.classList.add("is-resolving");
      arena.querySelectorAll(".fighter-health-fill").forEach((bar) => {
        bar.style.width = `${bar.dataset.targetHealth}%`;
      });
    }));
  }

  function duelArenaMarkup(battle) {
    if (!battle.lastDuel) return `<div class="battle-waiting"><span>将</span><p>请选择一名武将出战</p><small>电脑人选已秘密锁定，双方将在确认后同时亮将</small></div>`;
    const duel = battle.lastDuel;
    const presentation = duelPresentation(duel);
    const typeA = getBattleType(duel.fighterA);
    const typeB = getBattleType(duel.fighterB);
    const multiplierA = getTypeMultiplier(typeA, typeB);
    const counterText = multiplierA > 1
      ? `${duel.fighterA.name} 属性克制 ${duel.fighterB.name}`
      : multiplierA < 1 ? `${duel.fighterB.name} 属性克制 ${duel.fighterA.name}` : "双方属性相同，无克制";
    const captainMessages = [];
    if (duel.winner?.name === battle.teamA.captainName || duel.winner?.name === battle.teamB.captainName) captainMessages.push("队长拿下一胜！");
    if (duel.eliminated.some((fighter) => fighter.name === battle.teamA.captainName || fighter.name === battle.teamB.captainName)) captainMessages.push("主将被击破！");
    const presentationKey = `${battle.phase}-${duel.duelNumber}`;
    const alreadyPresented = battle.presentedDuelKey === presentationKey;
    const card = (fighter, side) => {
      const won = duel.winner?.name === fighter.name;
      const result = battle.pendingEvade ? "胜负待定" : duel.evaded ? "存活" : duel.mutualDestruction ? "同归于尽" : won ? "胜" : "阵亡";
      const isAttacker = presentation.attackerName === fighter.name;
      const isTarget = presentation.targetNames.has(fighter.name);
      const damage = battle.pendingEvade ? 0 : fighter.side === "A" ? presentation.damageA : presentation.damageB;
      const targetHealth = battle.pendingEvade ? 100 : fighter.side === "A" ? presentation.healthA : presentation.healthB;
      const battleType = getBattleType(fighter);
      const archetype = battleType === "谋略" ? "is-strategist" : battleType === "防守" ? "is-defender" : "is-warrior";
      const typeEffect = fighter.typeMultiplier > 1 ? "属性克制 +6%" : fighter.typeMultiplier < 1 ? "受到克制 -6%" : "同类型 ±0%";
      const upsetEffect = duel.upset?.upsetTriggered && fighter.side === duel.upset.underdogSide ? ` · ${getUpsetAnnouncement(duel.upset).boost}` : "";
      const initialWidth = alreadyPresented ? targetHealth : 100;
      const isCaptain = fighter.name === (fighter.side === "A" ? battle.teamA.captainName : battle.teamB.captainName);
      return `<div class="arena-fighter ${side} ${duel.evaded || battle.pendingEvade ? "is-survivor" : won ? "is-winner" : "is-loser"} ${isAttacker ? "is-attacker" : ""} ${isTarget ? "is-target" : ""} ${archetype}">
        <div class="fighter-shell">${isCaptain ? `<em class="arena-captain-mark">队长出战</em>` : ""}${portraitMarkupForBattle(fighter)}<small>${fighter.teamName}</small><strong>${fighter.name}</strong><em class="fighter-battle-type">${BATTLE_TYPE_ICONS[battleType]} ${battleType} · ${typeEffect}${upsetEffect}</em><b title="原综合战力 ${fighter.power}；正常战力 ${fighter.normalBattlePower}">最终 ${fighter.battlePower}</b><i>${result}</i>
          <div class="fighter-health" aria-label="${fighter.name}战斗状态"><span class="fighter-health-fill" data-target-health="${targetHealth}" style="width:${initialWidth}%"></span></div>
          ${damage ? `<span class="damage-float">-${damage}</span>` : ""}
        </div></div>`;
    };
    return `<div class="duel-presentation"><div class="matchup-reveal"><strong>${duel.fighterA.name} <small>[${typeA}]</small></strong><i>VS</i><strong>${duel.fighterB.name} <small>[${typeB}]</small></strong><span>${counterText}</span>${captainMessages.length && !battle.pendingEvade ? `<em>${captainMessages.join(" · ")}</em>` : ""}</div><div class="battle-callout ${battle.pendingEvade ? "evade-pending" : presentation.kind} ${presentation.critical ? "is-critical" : ""}" role="status"><span>${battle.pendingEvade ? "即将落败：是否发动闪避？" : battle.tacticMessage && ["全军振奋", "背水一战", "奇兵突袭", "闪避"].includes(battle.selectedTactic) ? battle.tacticMessage : presentation.headline}</span><strong>${battle.pendingEvade ? "双方基础战力差不超过 5，可让本场无人阵亡" : presentation.result}${captainMessages.length && !battle.pendingEvade ? ` · ${captainMessages.join(" · ")}` : ""}</strong></div>
      <div class="duel-arena ${alreadyPresented ? "is-resolved" : ""} effect-${presentation.kind}" data-presentation-key="${presentationKey}"><div class="battle-energy" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>${card(duel.fighterA,"from-left")}<span class="arena-vs">VS</span>${card(duel.fighterB,"from-right")}</div></div>`;
  }

  function renderPhaseThree(battle) {
    const record = battle.pendingRecord.phaseThree;
    const step = battle.phaseThreePresentation.step;
    const multiple = record.teamACount > 1 || record.teamBCount > 1;
    const revealPower = !["ready", "lineup"].includes(step);
    const showOutcome = step === "outcome";
    const teamCard = (member, side) => {
      const isCaptain = member.name === (side === "A" ? battle.teamA.captainName : battle.teamB.captainName);
      const status = showOutcome ? (battle.pendingRecord.winner.side === side ? "胜" : "败") : "";
      const type = member.battleType;
      const power = record.duel ? (side === "A" ? record.duel.fighterA.battlePower : record.duel.fighterB.battlePower) : member.effectivePower;
      return `<div class="arena-fighter ${side === "A" ? "from-left" : "from-right"} ${showOutcome ? (status === "胜" ? "is-winner" : "is-loser") : ""}"><div class="fighter-shell">${isCaptain ? `<em class="arena-captain-mark">队长出战</em>` : ""}${portraitMarkupForBattle(member)}<small>${member.teamName}</small><strong>${member.name}</strong><em class="fighter-battle-type">${BATTLE_TYPE_ICONS[type]} ${type}</em>${revealPower ? `<b>最终 ${power}</b>${record.duel && power !== member.effectivePower ? `<span class="fighter-effective-power">综合战力 ${member.effectivePower}</span>` : ""}` : ""}${status ? `<i>${status}</i>` : ""}</div></div>`;
    };
    const team = (members, side) => `<div class="final-battle-team ${side} ${members.length > 1 ? "is-multiple" : ""}">${members.map((member) => teamCard(member, side)).join("")}</div>`;
    const equation = (members, side) => {
      const bonus = battle.selectedTactic === "军心振奋" && battle.tacticUsed && side === battle.playerSide ? " + 战术 6" : "";
      return members.length > 1 || bonus ? `<span>${members.map((member) => member.effectivePower).join(" + ")}${bonus} = ${side === "A" ? record.finalPower.A : record.finalPower.B}</span>` : "";
    };
    const buttonLabel = { ready:"继续", lineup:"继续", power:"继续", gather:"继续", totals:"继续", clash:"继续", outcome:"查看比赛结果" }[step];
    content.innerHTML = `<div class="player-battle-view final-battle-view step-${step}"><button class="battle-menu-button" type="button" data-player-action="open-pause" aria-label="打开战斗菜单"><span>☰</span> 菜单</button>
      <div class="battle-stage-line">${stageLabelForMatch(battle.match)} · 最后一轮</div>
      <div class="battle-title"><div><span>你的球队</span><h2>${battle.playerSide === "A" ? battle.teamA.name : battle.teamB.name}</h2></div><i>对阵</i><div><span>电脑球队</span><h2>${battle.playerSide === "A" ? battle.teamB.name : battle.teamA.name}</h2></div></div>
      <div class="battle-scoreboard"><span>${battle.teamA.name}</span><strong>${record.teamACount} <i>VS</i> ${record.teamBCount}</strong><span>${battle.teamB.name}</span><em>最终幸存武将出战</em></div>
      ${tacticPanel(battle)}
      <div class="duel-presentation"><div class="matchup-reveal"><strong>${battle.teamA.name}</strong><i>VS</i><strong>${battle.teamB.name}</strong>${multiple ? `<span>${record.finalBattleType.replace("v", " VS ")} · 合击战</span>` : ""}</div>
      <div class="duel-arena final-duel-arena ${step === "clash" ? "is-resolving effect-clash" : ""} ${showOutcome ? "is-resolved" : ""}"><div class="battle-energy" aria-hidden="true"><i></i><i></i><i></i><i></i><i></i><i></i></div>${team(record.finalSurvivorsA, "A")}<span class="arena-vs">VS</span>${team(record.finalSurvivorsB, "B")}</div></div>
      ${multiple && ["gather", "totals", "clash", "outcome"].includes(step) ? `<div class="final-battle-equation">${equation(record.finalSurvivorsA, "A")}<i>VS</i>${equation(record.finalSurvivorsB, "B")}</div>` : ""}
      ${multiple && ["totals", "clash", "outcome"].includes(step) ? `<div class="final-battle-faceoff"><strong>${record.finalPower.A}</strong><i>VS</i><strong>${record.finalPower.B}</strong></div>` : ""}
      ${showOutcome ? `<p class="final-battle-outcome" role="status">${battle.pendingRecord.winner.side === battle.playerSide ? "本轮获胜！" : "本轮落败"}</p>` : ""}
      <button class="battle-next-button" type="button" data-player-action="advance-phase-three">${buttonLabel}</button>${pauseMenuMarkup()}</div>`;
  }

  function renderBattle() {
    const battle = mode.battle;
    if (battle.phase === "PHASE_THREE") {
      renderPhaseThree(battle);
      return;
    }
    const playerTeam = battle.playerSide === "A" ? battle.teamA : battle.teamB;
    const opponentTeam = battle.playerSide === "A" ? battle.teamB : battle.teamA;
    const playerSide = battle.playerSide;
    const opponentSide = playerSide === "A" ? "B" : "A";
    if (battle.phase === "MATCH_RESULT") {
      const record = battle.pendingRecord;
      const playerWon = record.winner.teamId === mode.playerTeamId;
      const playerSurvivors = playerSide === "A" ? battle.finalSurvivorsA : battle.finalSurvivorsB;
      const opponentSurvivors = playerSide === "A" ? battle.finalSurvivorsB : battle.finalSurvivorsA;
      const bothWiped = !playerSurvivors.length && !opponentSurvivors.length;
      const opponentWiped = playerWon && !opponentSurvivors.length && playerSurvivors.length;
      const playerWiped = !playerWon && !playerSurvivors.length && opponentSurvivors.length;
      const announcement = bothWiped
        ? { title:"同归于尽！", subtitle:playerWon ? "裁定获胜" : "裁定落败", className:"is-draw" }
        : opponentWiped
          ? { title:"团灭敌军！", subtitle:"完胜！", className:"is-victory is-wipeout" }
          : playerWiped
            ? { title:"全军覆没！", subtitle:"惨败！", className:"is-defeat is-wipeout" }
            : playerWon
              ? { title:"胜利！", subtitle:"你击败了敌方队伍！", className:"is-victory" }
              : { title:"战败！", subtitle:"此战未能取胜", className:"is-defeat" };
      const byeA = battle.phaseTwo?.byesA || [];
      const byeB = battle.phaseTwo?.byesB || [];
      content.innerHTML = `<div class="player-battle-view"><button class="battle-menu-button" type="button" data-player-action="open-pause" aria-label="打开战斗菜单"><span>☰</span> 菜单</button><div class="battle-stage-line">${stageLabelForMatch(battle.match)} · ${battle.pendingRecord.phaseThree.skipped ? "全灭判定" : "最后一轮"}</div>
        <div class="battle-result-announcement ${announcement.className}" role="status"><div class="result-rays" aria-hidden="true"></div><span>${announcement.subtitle}</span><h2>${announcement.title}</h2><p>${playerWon ? "你击败了敌方队伍！" : "整军再战，胜负尚未定论。"}</p></div>
        ${tacticPanel(battle)}
        ${record.phaseThree.skipped ? `<div class="final-survivors"><section><h3>${battle.teamA.name}</h3><p>${battle.finalSurvivorsA.join("、") || "无幸存者"}</p></section><i>VS</i><section><h3>${battle.teamB.name}</h3><p>${battle.finalSurvivorsB.join("、") || "无幸存者"}</p></section></div>` : ""}
        ${byeA.length || byeB.length ? `<p class="battle-bye-summary">第二阶段轮空：A队 ${byeA.join("、") || "无"}；B队 ${byeB.join("、") || "无"}</p>` : ""}
        <button class="battle-next-button" type="button" data-player-action="confirm-result">查看赛后总结</button>${pauseMenuMarkup()}</div>`;
      return;
    }

    const phase = battle.phase === "PHASE_ONE" ? battle.phaseOne : battle.phaseTwo;
    const phaseName = battle.phase === "PHASE_ONE" ? "第一阶段" : "第二阶段";
    const totalDuels = battle.phase === "PHASE_ONE" ? 4 : phase.duelCount;
    const currentDuel = Math.min(phase.duels.length + (battle.awaitingContinue ? 0 : 1), totalDuels);
    const playerAvailable = playerSide === "A" ? phase.availableA : phase.availableB;
    const opponentAvailable = opponentSide === "A" ? phase.availableA : phase.availableB;
    const score = duelScore(battle);
    const playerScore = score[playerSide];
    const opponentScore = score[opponentSide];
    const completedDuels = [...battle.phaseOne.duels, ...(battle.phaseTwo?.duels || [])];
    const playerPlayed = completedDuels.map((duel) => playerSide === "A" ? duel.fighterA.name : duel.fighterB.name);
    const opponentPlayed = completedDuels.map((duel) => opponentSide === "A" ? duel.fighterA.name : duel.fighterB.name);
    const presentationKey = battle.lastDuel ? `${battle.phase}-${battle.lastDuel.duelNumber}` : null;
    const needsPresentation = presentationKey && battle.presentedDuelKey !== presentationKey;
    content.innerHTML = `<div class="player-battle-view"><button class="battle-menu-button" type="button" data-player-action="open-pause" aria-label="打开战斗菜单"><span>☰</span> 菜单</button>
      <div class="battle-stage-line">${stageLabelForMatch(battle.match)} · ${phaseName} · 第${currentDuel}场 / ${totalDuels}场</div>
      <div class="battle-title"><div><span>你的球队</span><h2>${playerTeam.name}</h2></div><i>对阵</i><div><span>电脑球队</span><h2>${opponentTeam.name}</h2></div></div>
      <div class="battle-scoreboard"><span>${playerTeam.name}</span><strong>${playerScore} <i>:</i> ${opponentScore}</strong><span>${opponentTeam.name}</span><em>当前总比分 · 第${currentDuel}回合</em></div>
      ${tacticPanel(battle)}
      ${duelArenaMarkup(battle)}
      <div class="battle-status-line"><span>我方已出战 ${playerPlayed.length ? playerPlayed.join("、") : "暂无"}</span><span>对方已出战 ${opponentPlayed.length ? opponentPlayed.join("、") : "暂无"}</span><span>我方本阶段可选 ${playerAvailable.length} 人 · 对方 ${opponentAvailable.length} 人</span></div>
      <section class="fighter-selection"><h3>${battle.awaitingContinue ? "本轮结果" : battle.playerSelection ? "已锁定武将，请确认出战" : "选择你的出战武将"}</h3><div class="player-fighter-grid">${playerTeam.members.map((name) => miniCard(name, fighterStatus(name, playerSide, battle), !battle.awaitingContinue && playerAvailable.includes(name), battle.playerSelection === name, playerTeam)).join("")}</div></section>
      <section class="opponent-roster"><h3>对手情报 <small>已公开 ${battle.revealedOpponent.size} 人 · 尚有 ${opponentAvailable.length} 人可出战 · 本回合人选已由电脑秘密锁定</small></h3><div>${opponentTeam.members.map((name, index) => opponentCardMarkup(name, fighterStatus(name, opponentSide, battle), battle, opponentTeam, index)).join("")}</div></section>
      ${battle.playerSelection && !battle.awaitingContinue && !battle.pendingEvade ? `<button class="battle-confirm-button" type="button" data-player-action="confirm-fighter">确认出战</button>` : ""}
      ${battle.pendingEvade ? `<div class="evade-actions"><button type="button" data-player-action="use-evade">发动闪避 · 双方存活</button><button type="button" data-player-action="decline-evade">接受正常结果</button></div>` : ""}
      ${battle.awaitingContinue ? `<button class="battle-next-button" type="button" data-player-action="continue-duel">${phase.duels.length === totalDuels ? "结束本阶段" : "进入下一场"}</button>` : ""}${pauseMenuMarkup()}
    </div>`;
    if (needsPresentation) runBattlePresentation(battle, presentationKey);
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
    const playerSide = record.teams.A.id === mode.playerTeamId ? "A" : "B";
    const opponentSide = playerSide === "A" ? "B" : "A";
    const finalPhase = record.phaseThree.skipped ? (record.phaseTwo.skipped ? record.phaseOne : record.phaseTwo) : record.phaseThree;
    const playerCount = finalPhase.survivors?.[playerSide]?.count ?? 0;
    const opponentCount = finalPhase.survivors?.[opponentSide]?.count ?? 0;
    const wipeout = won && opponentCount === 0 && playerCount > 0;
    const wiped = !won && playerCount === 0 && opponentCount > 0;
    content.innerHTML = `<div class="post-match-view ${won ? "is-victory" : "is-defeat"}"><div class="post-match-emblem" aria-hidden="true">${won ? "胜" : "败"}</div><span>${stageLabelForMatch(match)} · 赛后总结</span><h2>${wipeout ? "完胜 · 团灭敌军" : wiped ? "惨败 · 全军覆没" : won ? "此战告捷" : "此战落败"}</h2><p>对手：${opponent.name}</p><div class="post-result"><b>${record.endedAfter === "phase-three" ? "三阶段决胜" : `${record.endedAfter === "phase-one" ? "第一" : "第二"}阶段全灭判定`}</b><strong>${app.getTeamById(worldCup,match.winnerTeamId).name}获胜</strong></div><p>继续后，电脑将自动模拟本轮其他比赛并更新积分或晋级结果。</p><button type="button" data-player-action="continue-tournament">继续赛事</button></div>`;
  }

  function renderEliminated() {
    const team = getPlayerTeam();
    content.innerHTML = `<div class="journey-end"><span>我的世界杯征程</span><h2>${team.name}已结束争夺</h2><p>你可以结束本届，或让电脑自动完成剩余比赛并查看最终冠军。</p><div><button type="button" data-player-action="end-edition">结束本届</button><button type="button" data-player-action="auto-watch">继续自动观看</button></div></div>`;
  }

  function renderFinalFour() {
    const { worldCup, tournament } = gameState();
    const team = getPlayerTeam();
    const semiFinals = tournament.knockout.semiFinals;
    const nextMatch = playerMatchInCurrentStage();
    const opponentId = nextMatch && (nextMatch.teamAId === team.id ? nextMatch.teamBId : nextMatch.teamAId);
    const opponent = opponentId ? app.getTeamById(worldCup, opponentId) : null;
    const finalists = semiFinals.matches.flatMap((match) => [match.teamAId, match.teamBId]);
    const record = playerRecord();
    content.innerHTML = `<div class="tournament-ceremony final-four-ceremony">
      <div class="ceremony-sparks" aria-hidden="true">${"<i></i>".repeat(12)}</div>
      <div class="ceremony-emblem" aria-hidden="true"><span>四</span></div>
      <p>群雄竞逐 · 半决赛席位确认</p><h2>成功晋级四强！</h2>
      <h3>${team.name}</h3><span class="ceremony-caption">队长 ${team.captainName} · 当前战绩 ${record.wins}胜 ${record.losses}负 · 距离冠军只剩两场决战</span>
      <div class="final-four-field">${finalists.map((teamId, index) => {
        const qualifiedTeam = app.getTeamById(worldCup, teamId);
        return `<div class="${teamId === mode.playerTeamId ? "is-player" : ""}"><small>TOP ${index + 1}</small><strong>${qualifiedTeam.name}</strong>${teamId === mode.playerTeamId ? "<em>你的球队</em>" : ""}</div>`;
      }).join("")}</div>
      <div class="ceremony-next"><small>半决赛对手</small><strong>${opponent?.name || "等待赛程确认"}</strong><span>${opponent ? `${team.name} VS ${opponent.name}` : "晋级对阵即将揭晓"}</span></div>
      <div class="ceremony-actions"><button class="is-primary" type="button" data-player-action="continue-final-four">继续进入半决赛</button><button type="button" data-action="home">返回主菜单</button></div>
    </div>`;
  }

  function renderCompleted() {
    const { worldCup, tournament } = gameState();
    const champion = app.getTeamById(worldCup, tournament.podium.championTeamId);
    const team = getPlayerTeam();
    const podium = tournament.podium;
    const playerPlace = podium.championTeamId === mode.playerTeamId
      ? "冠军"
      : podium.runnerUpTeamId === mode.playerTeamId
        ? "亚军"
        : podium.thirdTeamId === mode.playerTeamId
          ? "季军"
          : podium.fourthTeamId === mode.playerTeamId ? "第四名" : "未进入前四";
    const isChampion = playerPlace === "冠军";
    const isRunnerUp = playerPlace === "亚军";
    const isThird = playerPlace === "季军";
    const isFourth = playerPlace === "第四名";
    const stoppedInFinalFour = isThird || isFourth;
    const ceremonyClass = isChampion ? "champion-ceremony" : isThird ? "third-place-ceremony" : isFourth ? "final-four-exit" : isRunnerUp ? "runner-up-ceremony" : "journey-complete";
    const headline = isChampion ? "冠军！" : isThird ? "荣获季军" : isFourth ? "止步四强" : isRunnerUp ? "荣获亚军" : "本次征战结束";
    const caption = isChampion
      ? "问鼎天下 · 加冕王者"
      : isThird
        ? "季军之师 · 荣登领奖台"
        : isFourth
          ? "天下四强 · 征程落幕"
        : isRunnerUp ? "决赛惜败 · 距冠军一步" : `本届冠军：${champion.name}`;
    const description = isChampion
      ? `${team.name}击败群雄，捧起本届冠军奖杯！`
      : isThird
        ? `${team.name}赢下季军争夺战，以第三名完成本届征程。`
        : isFourth
          ? `${team.name}完成本届征程，四强之名已载入战报。`
        : isRunnerUp
          ? `${team.name}奋战至决赛，最终取得亚军。`
          : `${team.name}的本届世界杯征程已经结束。`;
    content.innerHTML = `<div class="tournament-ceremony award-ceremony ${ceremonyClass}">
      <div class="ceremony-sparks" aria-hidden="true">${"<i></i>".repeat(16)}</div>
      <div class="award-glow" aria-hidden="true"></div>
      <div class="ceremony-emblem award-trophy" aria-hidden="true">${isChampion ? "🏆" : isThird ? "铜" : isFourth ? "四" : isRunnerUp ? "银" : "终"}</div>
      <p>本届三国武将卡牌世界杯</p><h2>${headline}</h2><span class="ceremony-caption">${caption}</span>
      <h3>${team.name}</h3><span class="ceremony-caption">队长 ${team.captainName} · 最终战绩 ${playerRecord().wins}胜 ${playerRecord().losses}负</span><p class="ceremony-description">${description}</p>
      <div class="award-team-roster">${team.members.map((name) => `<span class="${name === team.captainName ? "is-captain" : ""}"><b>${name}</b><small>${name === team.captainName ? "队长" : `${BATTLE_TYPE_ICONS[getBattleType(getCharacter(name))]} ${getBattleType(getCharacter(name))}`}</small></span>`).join("")}</div>
      <div class="award-result"><span>你的最终名次<strong>${playerPlace}</strong></span><i></i><span>本届冠军<strong>${champion.name}</strong></span></div>
      <div class="ceremony-actions"><button class="is-primary" type="button" data-action="new-draw">再来一届</button><button type="button" data-action="home">返回主菜单</button><button type="button" data-cup-page="champion">查看完整领奖台</button></div>
    </div>`;
  }

  function renderEnded() {
    content.innerHTML = `<div class="journey-end"><span>本届征程已结束</span><h2>${getPlayerTeam().name}</h2><p>可以立即开始新一届，重新抽取128名武将并随机获得一支球队。</p><div><button type="button" data-action="new-draw">开始新一届世界杯</button></div></div>`;
  }

  function render() {
    if (!mode.playerTeamId || !gameState().worldCup) return;
    app.refreshCupNavigation?.();
    if (mode.screen === "TACTIC_SELECT") renderTacticSelect();
    else if (mode.screen === "BATTLE") renderBattle();
    else if (mode.screen === "POST_MATCH") renderPostMatch();
    else if (mode.screen === "FINAL_FOUR") renderFinalFour();
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
    const pauseActions = ["resume-battle", "restart-battle", "return-main-menu", "exit-battle"];
    if (mode.pauseMenuOpen && !pauseActions.includes(action)) return;
    if (action === "enter-match") startNextPlayerMatch();
    else if (action === "choose-tactic") chooseTactic(event.target.closest("[data-tactic]")?.dataset.tactic);
    else if (action === "leave-tactic-select") { mode.tacticOptions = []; mode.screen = "DASHBOARD"; render(); }
    else if (action === "confirm-fighter") confirmPlayerFighter();
    else if (action === "use-tactic") useTacticBeforeDuel();
    else if (action === "use-morale") useMoraleTactic();
    else if (action === "use-evade") resolveEvade(true);
    else if (action === "decline-evade") resolveEvade(false);
    else if (action === "continue-duel") continueBattle();
    else if (action === "advance-phase-three") advancePhaseThree();
    else if (action === "confirm-result") confirmBattleResult();
    else if (action === "continue-tournament") continueTournament();
    else if (action === "continue-final-four") continueFromFinalFour();
    else if (action === "auto-watch") autoWatchRemaining();
    else if (action === "end-edition") endEdition();
    else if (action === "open-pause") openPauseMenu();
    else if (action === "resume-battle") closePauseMenu();
    else if (action === "restart-battle") restartBattle();
    else if (action === "return-main-menu") returnToMainMenu();
    else if (action === "exit-battle") exitBattle();
  });

  document.addEventListener("keydown", (event) => {
    if (event.key !== "Escape" || mode.screen !== "BATTLE") return;
    if (mode.pauseMenuOpen) closePauseMenu();
    else openPauseMenu();
  });

  window.playerMode = Object.freeze({
    startNewEdition,
    render,
    startNextPlayerMatch,
    chooseTactic,
    useTacticBeforeDuel,
    useMoraleTactic,
    resolveEvade,
    choosePlayerFighter,
    confirmPlayerFighter,
    selectAICombatant,
    chooseAICharacter: selectAICombatant,
    continueBattle,
    advancePhaseThree,
    confirmBattleResult,
    continueTournament,
    continueFromFinalFour,
    autoWatchRemaining,
    openPauseMenu,
    closePauseMenu,
    restartBattle,
    exitBattle,
    isBattleActive: () => ["BATTLE", "TACTIC_SELECT"].includes(mode.screen),
    getState: () => mode,
    getPlayerTeam
  });
})();
