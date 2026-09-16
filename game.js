"use strict";

(() => {
  const characters = window.CHARACTERS;
  const calculateCombatPower = window.calculateCombatPower;
  if (typeof calculateCombatPower !== "function") throw new TypeError("缺少统一的综合战力计算函数");
  const homeView = document.querySelector("#home-view");
  const galleryView = document.querySelector("#gallery-view");
  const cupView = document.querySelector("#cup-view");
  const cardGrid = document.querySelector("#card-grid");
  const featuredCards = document.querySelector("#featured-cards");
  const visibleCount = document.querySelector("#visible-count");
  const sortSelect = document.querySelector("#sort-select");
  const dialog = document.querySelector("#character-dialog");
  const dialogContent = document.querySelector("#dialog-content");
  const toast = document.querySelector("#toast");
  const cupContent = document.querySelector("#cup-content");
  const drawButton = document.querySelector("#draw-button");
  const participantCount = document.querySelector("#participant-count");
  const notSelectedCount = document.querySelector("#not-selected-count");
  const teamCount = document.querySelector("#team-count");
  const groupCount = document.querySelector("#group-count");

  const state = {
    view: "home",
    faction: "全部",
    sort: "rank",
    cupPage: "overview",
    activeGroup: "group-a",
    worldCup: null,
    tournament: null
  };

  const TOURNAMENT_STAGES = Object.freeze({
    GROUP_STAGE: "GROUP_STAGE",
    ROUND_OF_16: "ROUND_OF_16",
    QUARTER_FINALS: "QUARTER_FINALS",
    SEMI_FINALS: "SEMI_FINALS",
    THIRD_PLACE: "THIRD_PLACE",
    FINAL: "FINAL",
    COMPLETED: "COMPLETED"
  });

  // 小组赛与全部淘汰赛统一使用的正式三阶段单场规则。
  const MATCH_RULES = Object.freeze({
    version: 4,
    teamSize: 4,
    usePreMatchTeamPower: false,
    allowedAttribute: "combatPower",
    resetRosterBeforeEveryMatch: true,
    phaseOne: Object.freeze({
      name: "四场跨队单挑",
      duelCount: 4,
      pairing: "shuffle-each-team-then-one-to-one",
      crossTeamOnly: true,
      appearancesPerCharacter: 1,
      winnerRule: "higher-combat-power-survives",
      loserRule: "lower-combat-power-eliminated; equal-power-both-eliminated",
      randomModifier: false
    }),
    phaseTwo: Object.freeze({
      name: "幸存者再次跨队单挑",
      enterOnlyWhenBothTeamsHaveSurvivors: true,
      duelCount: "minimum-survivor-count",
      pairing: "random-survivors-one-to-one",
      crossTeamOnly: true,
      appearancesPerCharacter: 1,
      extraSurvivors: "bye-and-advance",
      winnerRule: "higher-combat-power-survives",
      loserRule: "lower-combat-power-eliminated; equal-power-both-eliminated",
      randomModifier: false
    }),
    phaseThree: Object.freeze({
      name: "最终幸存阵容总战力决胜",
      enterOnlyWhenBothTeamsHaveSurvivors: true,
      continueDuels: false,
      score: "sum-of-survivors-combat-power",
      tieBreak: Object.freeze([
        "highest-survivor-combat-power",
        "random-50-percent"
      ])
    }),
    immediateVictory: "opponent-has-zero-survivors-after-combat-phase"
  });

  function shuffle(values, random = Math.random) {
    const result = [...values];
    for (let index = result.length - 1; index > 0; index -= 1) {
      const swapIndex = Math.floor(random() * (index + 1));
      [result[index], result[swapIndex]] = [result[swapIndex], result[index]];
    }
    return result;
  }

  function prepareMatchTeam(team, side) {
    if (!team || typeof team.id !== "string" || !team.id.trim()) {
      throw new TypeError(`${side}队缺少有效的球队ID`);
    }
    if (!Array.isArray(team.members) || team.members.length !== MATCH_RULES.teamSize) {
      throw new RangeError(`${side}队必须正好包含${MATCH_RULES.teamSize}名武将`);
    }
    if (new Set(team.members).size !== MATCH_RULES.teamSize) {
      throw new RangeError(`${side}队不能包含重复武将`);
    }
    const roster = team.members.map((name) => {
      const character = characters.find((item) => item.name === name);
      if (!character) throw new RangeError(`${side}队包含未知武将：${name}`);
      return character;
    });
    return { id: team.id, name: team.name || `${side}队`, side, roster };
  }

  function fighterSnapshot(character, team) {
    return Object.freeze({
      teamId: team.id,
      teamName: team.name,
      side: team.side,
      name: character.name,
      martial: character.martial,
      intelligence: character.intelligence,
      power: calculateCombatPower(character)
    });
  }

  function resolveCombatDuel(characterA, characterB, teamA, teamB, duelNumber) {
    const fighterA = fighterSnapshot(characterA, teamA);
    const fighterB = fighterSnapshot(characterB, teamB);
    const powerA = calculateCombatPower(characterA);
    const powerB = calculateCombatPower(characterB);
    if (powerA === powerB) {
      return Object.freeze({
        duelNumber,
        fighterA,
        fighterB,
        winner: null,
        eliminated: Object.freeze([fighterA, fighterB]),
        mutualDestruction: true
      });
    }
    const aWins = powerA > powerB;
    return Object.freeze({
      duelNumber,
      fighterA,
      fighterB,
      winner: aWins ? fighterA : fighterB,
      eliminated: Object.freeze([aWins ? fighterB : fighterA]),
      mutualDestruction: false
    });
  }

  function survivorSummary(team, survivors) {
    return Object.freeze({
      teamId: team.id,
      teamName: team.name,
      side: team.side,
      count: survivors.length,
      members: Object.freeze(survivors.map((character) => fighterSnapshot(character, team)))
    });
  }

  function skippedPhase(reason) {
    return Object.freeze({ skipped: true, reason });
  }

  function winnerSnapshot(team, reason) {
    return Object.freeze({ teamId: team.id, teamName: team.name, side: team.side, reason });
  }

  function simulateTeamMatch(teamAInput, teamBInput, random = Math.random) {
    if (typeof random !== "function") throw new TypeError("random必须是函数");
    const teamA = prepareMatchTeam(teamAInput, "A");
    const teamB = prepareMatchTeam(teamBInput, "B");
    if (teamA.id === teamB.id) throw new RangeError("A队和B队必须是不同球队");
    const sharedMember = teamA.roster.find((character) => teamB.roster.includes(character));
    if (sharedMember) throw new RangeError(`两队不能共享同一武将：${sharedMember.name}`);

    // 每次调用都从两队完整四人名单开始，阵亡状态不会带入下一场比赛。
    const phaseOneA = shuffle(teamA.roster, random);
    const phaseOneB = shuffle(teamB.roster, random);
    const phaseOneDuels = phaseOneA.map((characterA, index) => (
      resolveCombatDuel(characterA, phaseOneB[index], teamA, teamB, index + 1)
    ));
    let survivorsA = phaseOneDuels
      .filter((duel) => duel.winner?.side === "A")
      .map((duel) => characters.find((character) => character.name === duel.winner.name));
    let survivorsB = phaseOneDuels
      .filter((duel) => duel.winner?.side === "B")
      .map((duel) => characters.find((character) => character.name === duel.winner.name));

    const phaseOne = Object.freeze({
      skipped: false,
      duelCount: 4,
      duels: Object.freeze(phaseOneDuels),
      survivors: Object.freeze({
        A: survivorSummary(teamA, survivorsA),
        B: survivorSummary(teamB, survivorsB)
      })
    });

    if (survivorsA.length === 0 || survivorsB.length === 0) {
      const winningTeam = survivorsA.length === survivorsB.length
        ? (random() < 0.5 ? teamA : teamB)
        : (survivorsA.length ? teamA : teamB);
      return Object.freeze({
        rulesVersion: MATCH_RULES.version,
        teams: Object.freeze({ A: { id: teamA.id, name: teamA.name }, B: { id: teamB.id, name: teamB.name } }),
        phaseOne,
        phaseTwo: skippedPhase("第一阶段后一方已全灭"),
        phaseThree: skippedPhase("第一阶段后一方已全灭"),
        endedAfter: "phase-one",
        winner: winnerSnapshot(winningTeam, survivorsA.length || survivorsB.length ? "opponent-eliminated-in-phase-one" : "mutual-annihilation-random")
      });
    }

    const shuffledSurvivorsA = shuffle(survivorsA, random);
    const shuffledSurvivorsB = shuffle(survivorsB, random);
    const phaseTwoDuelCount = Math.min(shuffledSurvivorsA.length, shuffledSurvivorsB.length);
    const participantsA = shuffledSurvivorsA.slice(0, phaseTwoDuelCount);
    const participantsB = shuffledSurvivorsB.slice(0, phaseTwoDuelCount);
    const byesA = shuffledSurvivorsA.slice(phaseTwoDuelCount);
    const byesB = shuffledSurvivorsB.slice(phaseTwoDuelCount);
    const phaseTwoDuels = participantsA.map((characterA, index) => (
      resolveCombatDuel(characterA, participantsB[index], teamA, teamB, index + 1)
    ));
    survivorsA = [
      ...byesA,
      ...phaseTwoDuels
        .filter((duel) => duel.winner?.side === "A")
        .map((duel) => characters.find((character) => character.name === duel.winner.name))
    ];
    survivorsB = [
      ...byesB,
      ...phaseTwoDuels
        .filter((duel) => duel.winner?.side === "B")
        .map((duel) => characters.find((character) => character.name === duel.winner.name))
    ];

    const phaseTwo = Object.freeze({
      skipped: false,
      duelCount: phaseTwoDuelCount,
      participants: Object.freeze({
        A: Object.freeze(participantsA.map((character) => fighterSnapshot(character, teamA))),
        B: Object.freeze(participantsB.map((character) => fighterSnapshot(character, teamB)))
      }),
      byes: Object.freeze({
        A: Object.freeze(byesA.map((character) => fighterSnapshot(character, teamA))),
        B: Object.freeze(byesB.map((character) => fighterSnapshot(character, teamB)))
      }),
      duels: Object.freeze(phaseTwoDuels),
      survivors: Object.freeze({
        A: survivorSummary(teamA, survivorsA),
        B: survivorSummary(teamB, survivorsB)
      })
    });

    if (survivorsA.length === 0 || survivorsB.length === 0) {
      const winningTeam = survivorsA.length === survivorsB.length
        ? (random() < 0.5 ? teamA : teamB)
        : (survivorsA.length ? teamA : teamB);
      return Object.freeze({
        rulesVersion: MATCH_RULES.version,
        teams: Object.freeze({ A: { id: teamA.id, name: teamA.name }, B: { id: teamB.id, name: teamB.name } }),
        phaseOne,
        phaseTwo,
        phaseThree: skippedPhase("第二阶段后一方已全灭"),
        endedAfter: "phase-two",
        winner: winnerSnapshot(winningTeam, survivorsA.length || survivorsB.length ? "opponent-eliminated-in-phase-two" : "mutual-annihilation-random")
      });
    }

    const finalPowerA = survivorsA.reduce((total, character) => total + calculateCombatPower(character), 0);
    const finalPowerB = survivorsB.reduce((total, character) => total + calculateCombatPower(character), 0);
    const highestPowerA = Math.max(...survivorsA.map(calculateCombatPower));
    const highestPowerB = Math.max(...survivorsB.map(calculateCombatPower));
    let winningTeam;
    let decision;
    if (finalPowerA !== finalPowerB) {
      winningTeam = finalPowerA > finalPowerB ? teamA : teamB;
      decision = "final-power";
    } else if (highestPowerA !== highestPowerB) {
      winningTeam = highestPowerA > highestPowerB ? teamA : teamB;
      decision = "highest-survivor-combat-power";
    } else {
      winningTeam = random() < 0.5 ? teamA : teamB;
      decision = "random-50-percent";
    }

    const phaseThree = Object.freeze({
      skipped: false,
      survivors: Object.freeze({
        A: survivorSummary(teamA, survivorsA),
        B: survivorSummary(teamB, survivorsB)
      }),
      finalPower: Object.freeze({ A: finalPowerA, B: finalPowerB }),
      highestPower: Object.freeze({ A: highestPowerA, B: highestPowerB }),
      decision
    });

    return Object.freeze({
      rulesVersion: MATCH_RULES.version,
      teams: Object.freeze({ A: { id: teamA.id, name: teamA.name }, B: { id: teamB.id, name: teamB.name } }),
      phaseOne,
      phaseTwo,
      phaseThree,
      endedAfter: "phase-three",
      winner: winnerSnapshot(winningTeam, decision)
    });
  }

  function createWorldCupDraw(random = Math.random) {
    const randomizedPool = shuffle(characters, random);
    const participants = randomizedPool.slice(0, 128);
    const notSelected = randomizedPool.slice(128);
    const teamMembers = shuffle(participants, random);
    const teams = Array.from({ length: 32 }, (_, index) => ({
      id: `team-${String(index + 1).padStart(2, "0")}`,
      name: `第${index + 1}队`,
      members: teamMembers.slice(index * 4, index * 4 + 4).map((character) => character.name)
    }));
    const randomizedTeams = shuffle(teams, random);
    const groups = "ABCDEFGH".split("").map((label, index) => ({
      id: `group-${label.toLowerCase()}`,
      name: `${label}组`,
      teams: randomizedTeams.slice(index * 4, index * 4 + 4)
    }));
    return { participants, notSelected, teams, groups };
  }

  function validateWorldCupDraw(draw) {
    const errors = [];
    if (!draw || typeof draw !== "object") return ["抽签结果不存在"];
    if (characters.length !== 150) errors.push("总卡池不是150人");
    if (!Array.isArray(draw.participants) || draw.participants.length !== 128) errors.push("参赛武将不是128人");
    if (!Array.isArray(draw.notSelected) || draw.notSelected.length !== 22) errors.push("未抽中武将不是22人");
    if (!Array.isArray(draw.teams) || draw.teams.length !== 32) errors.push("球队不是32支");
    if (!Array.isArray(draw.groups) || draw.groups.length !== 8) errors.push("小组不是8个");
    if (errors.length) return errors;

    const participantNames = draw.participants.map((character) => character.name);
    const notSelectedNames = draw.notSelected.map((character) => character.name);
    const participantSet = new Set(participantNames);
    const notSelectedSet = new Set(notSelectedNames);
    if (participantSet.size !== 128) errors.push("参赛名单存在重复");
    if (notSelectedSet.size !== 22) errors.push("未抽中名单存在重复");
    if (notSelectedNames.some((name) => participantSet.has(name))) errors.push("参赛与未抽中名单存在交集");
    if (new Set([...participantNames, ...notSelectedNames]).size !== 150) errors.push("两份名单未覆盖完整卡池");

    if (draw.teams.some((team) => !Array.isArray(team.members) || team.members.length !== 4)) errors.push("存在非4人球队");
    if (draw.teams.some((team) => "power" in team || "totalPower" in team || "teamPower" in team)) errors.push("球队数据不应包含总战力");
    const assignedNames = draw.teams.flatMap((team) => team.members);
    if (assignedNames.length !== 128 || new Set(assignedNames).size !== 128) errors.push("球队成员存在遗漏或重复分配");
    if (assignedNames.some((name) => !participantSet.has(name))) errors.push("球队包含非参赛武将");

    if (draw.groups.some((group) => !Array.isArray(group.teams) || group.teams.length !== 4)) errors.push("存在非4队小组");
    const groupedTeamIds = draw.groups.flatMap((group) => group.teams.map((team) => team.id));
    if (groupedTeamIds.length !== 32 || new Set(groupedTeamIds).size !== 32) errors.push("小组中的球队存在遗漏或重复");
    return errors;
  }

  function createScheduledMatch(id, stage, teamAId, teamBId, groupId = null, matchDay = null) {
    return {
      id,
      stage,
      groupId,
      matchDay,
      teamAId,
      teamBId,
      status: "pending",
      winnerTeamId: null,
      loserTeamId: null,
      survivorPower: null,
      battleRecord: null
    };
  }

  function createGroupMatches(group) {
    const teamIds = group.teams.map((team) => team.id);
    const matchDays = [
      [[0, 3], [1, 2]],
      [[0, 2], [3, 1]],
      [[0, 1], [2, 3]]
    ];
    let matchNumber = 1;
    return matchDays.flatMap((pairs, dayIndex) => pairs.map(([first, second]) => {
      const match = createScheduledMatch(
        `${group.id}-match-${matchNumber}`,
        TOURNAMENT_STAGES.GROUP_STAGE,
        teamIds[first],
        teamIds[second],
        group.id,
        dayIndex + 1
      );
      matchNumber += 1;
      return match;
    }));
  }

  function createTournament(draw, random = Math.random) {
    const groupMatches = draw.groups.flatMap(createGroupMatches);
    return {
      stage: TOURNAMENT_STAGES.GROUP_STAGE,
      groupStage: {
        matches: groupMatches,
        drawLots: Object.fromEntries(draw.teams.map((team) => [team.id, random()])),
        qualifiers: []
      },
      knockout: {
        roundOf16: null,
        quarterFinals: null,
        semiFinals: null,
        thirdPlace: null,
        final: null,
        semiFinalWinners: [],
        semiFinalLosers: []
      },
      podium: null
    };
  }

  function getTeamById(draw, teamId) {
    return draw.teams.find((team) => team.id === teamId);
  }

  function getFinalSurvivors(battleRecord) {
    if (!battleRecord.phaseThree.skipped) return battleRecord.phaseThree.survivors;
    if (!battleRecord.phaseTwo.skipped) return battleRecord.phaseTwo.survivors;
    return battleRecord.phaseOne.survivors;
  }

  function sumSurvivorPower(summary) {
    return summary.members.reduce((total, fighter) => total + fighter.power, 0);
  }

  function playScheduledMatch(match, draw, random = Math.random) {
    if (!match || match.status !== "pending") throw new RangeError("只能模拟尚未进行的比赛");
    const teamA = getTeamById(draw, match.teamAId);
    const teamB = getTeamById(draw, match.teamBId);
    if (!teamA || !teamB) throw new RangeError("赛程包含未知球队");
    const battleRecord = simulateTeamMatch(teamA, teamB, random);
    return completeScheduledMatch(match, draw, battleRecord);
  }

  function completeScheduledMatch(match, draw, battleRecord) {
    if (!match || match.status !== "pending") throw new RangeError("只能记录尚未进行的比赛");
    const teamA = getTeamById(draw, match.teamAId);
    const teamB = getTeamById(draw, match.teamBId);
    if (!teamA || !teamB) throw new RangeError("赛程包含未知球队");
    if (![teamA.id, teamB.id].includes(battleRecord?.winner?.teamId)) {
      throw new RangeError("战报胜者不属于本场比赛");
    }
    const survivors = getFinalSurvivors(battleRecord);
    const powerA = sumSurvivorPower(survivors.A);
    const powerB = sumSurvivorPower(survivors.B);
    match.status = "completed";
    match.winnerTeamId = battleRecord.winner.teamId;
    match.loserTeamId = battleRecord.winner.teamId === teamA.id ? teamB.id : teamA.id;
    match.survivorPower = { [teamA.id]: powerA, [teamB.id]: powerB };
    match.battleRecord = battleRecord;
    return match;
  }

  function getGroupMatches(tournament, groupId) {
    return tournament.groupStage.matches.filter((match) => match.groupId === groupId);
  }

  function getGroupStandings(group, tournament) {
    const rows = group.teams.map((team) => ({
      teamId: team.id,
      teamName: team.name,
      played: 0,
      won: 0,
      lost: 0,
      points: 0,
      headToHeadPoints: 0,
      netSurvivorPower: 0,
      totalSurvivorPower: 0,
      drawLot: tournament.groupStage.drawLots[team.id]
    }));
    const rowById = new Map(rows.map((row) => [row.teamId, row]));
    const completedMatches = getGroupMatches(tournament, group.id).filter((match) => match.status === "completed");
    completedMatches.forEach((match) => {
      const rowA = rowById.get(match.teamAId);
      const rowB = rowById.get(match.teamBId);
      const powerA = match.survivorPower[match.teamAId];
      const powerB = match.survivorPower[match.teamBId];
      rowA.played += 1;
      rowB.played += 1;
      rowA.totalSurvivorPower += powerA;
      rowB.totalSurvivorPower += powerB;
      rowA.netSurvivorPower += powerA - powerB;
      rowB.netSurvivorPower += powerB - powerA;
      if (match.winnerTeamId === rowA.teamId) {
        rowA.won += 1;
        rowA.points += 3;
        rowB.lost += 1;
      } else {
        rowB.won += 1;
        rowB.points += 3;
        rowA.lost += 1;
      }
    });

    // 同积分时建立同分球队内部的小积分榜；二队同分就是直接胜负，
    // 三队或四队同分则先比较彼此交手所得积分，再比较净剩余战力。
    const rowsByPoints = new Map();
    rows.forEach((row) => {
      if (!rowsByPoints.has(row.points)) rowsByPoints.set(row.points, []);
      rowsByPoints.get(row.points).push(row);
    });
    rowsByPoints.forEach((tiedRows) => {
      if (tiedRows.length < 2) return;
      const tiedIds = new Set(tiedRows.map((row) => row.teamId));
      completedMatches
        .filter((match) => tiedIds.has(match.teamAId) && tiedIds.has(match.teamBId))
        .forEach((match) => { rowById.get(match.winnerTeamId).headToHeadPoints += 3; });
    });
    return rows.sort((left, right) => {
      if (left.points !== right.points) return right.points - left.points;
      if (left.headToHeadPoints !== right.headToHeadPoints) return right.headToHeadPoints - left.headToHeadPoints;
      if (left.netSurvivorPower !== right.netSurvivorPower) {
        return right.netSurvivorPower - left.netSurvivorPower;
      }
      if (left.totalSurvivorPower !== right.totalSurvivorPower) {
        return right.totalSurvivorPower - left.totalSurvivorPower;
      }
      return left.drawLot - right.drawLot;
    });
  }

  function simulateNextGroupMatch(tournament, draw, random = Math.random) {
    if (tournament.stage !== TOURNAMENT_STAGES.GROUP_STAGE) {
      throw new RangeError("小组赛已经结束，不能继续模拟小组比赛");
    }
    const nextMatch = tournament.groupStage.matches.find((match) => match.status === "pending");
    if (!nextMatch) throw new RangeError("没有尚未进行的小组赛");
    playScheduledMatch(nextMatch, draw, random);
    if (tournament.groupStage.matches.every((match) => match.status === "completed")) {
      finalizeGroupStage(tournament, draw, random);
    }
    return nextMatch;
  }

  function simulateAllGroupMatches(tournament, draw, random = Math.random) {
    while (tournament.stage === TOURNAMENT_STAGES.GROUP_STAGE) {
      simulateNextGroupMatch(tournament, draw, random);
    }
    return tournament.groupStage.matches;
  }

  function createKnockoutRound(key, stage, label, teamIds) {
    const matches = [];
    for (let index = 0; index < teamIds.length; index += 2) {
      matches.push(createScheduledMatch(
        `${key}-match-${index / 2 + 1}`,
        stage,
        teamIds[index],
        teamIds[index + 1]
      ));
    }
    return { key, stage, label, matches };
  }

  function finalizeGroupStage(tournament, draw, random = Math.random) {
    if (!tournament.groupStage.matches.every((match) => match.status === "completed")) {
      throw new RangeError("48场小组赛尚未全部完成");
    }
    const qualifiers = draw.groups.flatMap((group) => (
      getGroupStandings(group, tournament).slice(0, 2).map((row, index) => ({
        teamId: row.teamId,
        groupId: group.id,
        groupRank: index + 1
      }))
    ));
    if (qualifiers.length !== 16 || new Set(qualifiers.map((item) => item.teamId)).size !== 16) {
      throw new RangeError("小组晋级球队不是16支唯一球队");
    }
    tournament.groupStage.qualifiers = qualifiers;
    const randomizedIds = shuffle(qualifiers.map((item) => item.teamId), random);
    tournament.knockout.roundOf16 = createKnockoutRound(
      "round-of-16",
      TOURNAMENT_STAGES.ROUND_OF_16,
      "16强",
      randomizedIds
    );
    tournament.stage = TOURNAMENT_STAGES.ROUND_OF_16;
    return tournament.knockout.roundOf16;
  }

  function getKnockoutRound(tournament, roundKey) {
    return tournament.knockout[roundKey];
  }

  function currentRoundKey(stage) {
    return {
      [TOURNAMENT_STAGES.ROUND_OF_16]: "roundOf16",
      [TOURNAMENT_STAGES.QUARTER_FINALS]: "quarterFinals",
      [TOURNAMENT_STAGES.SEMI_FINALS]: "semiFinals",
      [TOURNAMENT_STAGES.THIRD_PLACE]: "thirdPlace",
      [TOURNAMENT_STAGES.FINAL]: "final"
    }[stage] || null;
  }

  function advanceKnockoutStage(tournament) {
    const roundKey = currentRoundKey(tournament.stage);
    const round = getKnockoutRound(tournament, roundKey);
    if (!round || !round.matches.every((match) => match.status === "completed")) return;
    const winners = round.matches.map((match) => match.winnerTeamId);
    const losers = round.matches.map((match) => match.loserTeamId);

    if (roundKey === "roundOf16") {
      tournament.knockout.quarterFinals = createKnockoutRound(
        "quarter-finals",
        TOURNAMENT_STAGES.QUARTER_FINALS,
        "8强",
        winners
      );
      tournament.stage = TOURNAMENT_STAGES.QUARTER_FINALS;
    } else if (roundKey === "quarterFinals") {
      tournament.knockout.semiFinals = createKnockoutRound(
        "semi-finals",
        TOURNAMENT_STAGES.SEMI_FINALS,
        "半决赛",
        winners
      );
      tournament.stage = TOURNAMENT_STAGES.SEMI_FINALS;
    } else if (roundKey === "semiFinals") {
      tournament.knockout.semiFinalWinners = [...winners];
      tournament.knockout.semiFinalLosers = [...losers];
      tournament.knockout.thirdPlace = createKnockoutRound(
        "third-place",
        TOURNAMENT_STAGES.THIRD_PLACE,
        "季军赛",
        losers
      );
      tournament.knockout.final = createKnockoutRound(
        "final",
        TOURNAMENT_STAGES.FINAL,
        "决赛",
        winners
      );
      tournament.stage = TOURNAMENT_STAGES.THIRD_PLACE;
    } else if (roundKey === "thirdPlace") {
      tournament.stage = TOURNAMENT_STAGES.FINAL;
    } else if (roundKey === "final") {
      const finalMatch = tournament.knockout.final.matches[0];
      const thirdPlaceMatch = tournament.knockout.thirdPlace.matches[0];
      tournament.podium = {
        championTeamId: finalMatch.winnerTeamId,
        runnerUpTeamId: finalMatch.loserTeamId,
        thirdTeamId: thirdPlaceMatch.winnerTeamId,
        fourthTeamId: thirdPlaceMatch.loserTeamId
      };
      tournament.stage = TOURNAMENT_STAGES.COMPLETED;
    }
  }

  function simulateNextKnockoutMatch(tournament, draw, roundKey, random = Math.random) {
    const round = getKnockoutRound(tournament, roundKey);
    if (!round) throw new RangeError("该淘汰赛阶段尚未生成");
    if (tournament.stage !== round.stage) throw new RangeError("当前赛事阶段不允许模拟该轮比赛");
    const nextMatch = round.matches.find((match) => match.status === "pending");
    if (!nextMatch) throw new RangeError("本轮没有尚未进行的比赛");
    playScheduledMatch(nextMatch, draw, random);
    advanceKnockoutStage(tournament);
    return nextMatch;
  }

  function simulateAllKnockoutRound(tournament, draw, roundKey, random = Math.random) {
    const round = getKnockoutRound(tournament, roundKey);
    if (!round) throw new RangeError("该淘汰赛阶段尚未生成");
    while (tournament.stage === round.stage) {
      simulateNextKnockoutMatch(tournament, draw, roundKey, random);
    }
    return round.matches;
  }

  function simulateNextTournamentMatch(tournament, draw, random = Math.random) {
    if (tournament.stage === TOURNAMENT_STAGES.GROUP_STAGE) {
      return simulateNextGroupMatch(tournament, draw, random);
    }
    const roundKey = currentRoundKey(tournament.stage);
    if (!roundKey) throw new RangeError("本届世界杯已经全部结束");
    return simulateNextKnockoutMatch(tournament, draw, roundKey, random);
  }

  function simulateAllCurrentStage(tournament, draw, random = Math.random) {
    if (tournament.stage === TOURNAMENT_STAGES.GROUP_STAGE) {
      return simulateAllGroupMatches(tournament, draw, random);
    }
    const roundKey = currentRoundKey(tournament.stage);
    if (!roundKey) throw new RangeError("本届世界杯已经全部结束");
    return simulateAllKnockoutRound(tournament, draw, roundKey, random);
  }

  let toastTimer = 0;

  function validateCharacterData(data) {
    const requiredText = ["name", "faction", "tier", "subTier", "trait", "portrait"];
    const requiredStats = ["rank", "power", "martial", "intelligence"];
    const errors = [];
    if (!Array.isArray(data) || data.length !== 150) {
      errors.push(`完整卡池应为150人，当前为${Array.isArray(data) ? data.length : 0}人`);
      return errors;
    }

    const names = new Set();
    const ranks = new Set();
    data.forEach((character, index) => {
      requiredText.forEach((field) => {
        if (typeof character[field] !== "string") errors.push(`第${index + 1}项缺少${field}`);
      });
      requiredStats.forEach((field) => {
        const maximum = field === "rank" ? 150 : 100;
        const minimum = 1;
        if (!Number.isFinite(character[field]) || character[field] < minimum || character[field] > maximum) {
          errors.push(`${character.name || `第${index + 1}项`}的${field}无效`);
        }
      });
      if (names.has(character.name)) errors.push(`人物重复：${character.name}`);
      if (ranks.has(character.rank)) errors.push(`排名重复：${character.rank}`);
      if (!["魏", "蜀", "吴", "群"].includes(character.faction)) errors.push(`${character.name}阵营无效`);
      if (!["天", "地", "人", "凡"].includes(character.tier)) errors.push(`${character.name}等级无效`);
      if (!["一", "二", "三"].includes(character.subTier)) errors.push(`${character.name}小等级无效`);
      if (!character.trait.trim()) errors.push(`${character.name}缺少特性`);
      if (character.power !== calculateCombatPower(character)) errors.push(`${character.name}综合战力不等于武力与智力中的较高值`);
      const expectedTier = character.rank <= 30 ? "天" : character.rank <= 60 ? "地" : character.rank <= 90 ? "人" : "凡";
      if (character.tier !== expectedTier) errors.push(`${character.name}等级与综合排名不一致`);
      const expectedSubTier = character.rank <= 30
        ? character.rank <= 10 ? "一" : character.rank <= 20 ? "二" : "三"
        : character.rank <= 60
          ? character.rank <= 40 ? "一" : character.rank <= 50 ? "二" : "三"
          : character.rank <= 90
            ? character.rank <= 70 ? "一" : character.rank <= 80 ? "二" : "三"
            : character.rank <= 110 ? "一" : character.rank <= 130 ? "二" : "三";
      if (character.subTier !== expectedSubTier) errors.push(`${character.name}小等级与综合排名不一致`);
      names.add(character.name);
      ranks.add(character.rank);
    });

    for (let rank = 1; rank <= 150; rank += 1) {
      if (!ranks.has(rank)) errors.push(`缺少排名：${rank}`);
    }
    const byRank = [...data].sort((a, b) => a.rank - b.rank);
    for (let index = 1; index < byRank.length; index += 1) {
      if (calculateCombatPower(byRank[index - 1]) < calculateCombatPower(byRank[index])) {
        errors.push(`综合战力排名顺序错误：${byRank[index - 1].name} / ${byRank[index].name}`);
      }
    }
    return errors;
  }

  function portraitMarkup(character) {
    const image = character.portrait
      ? `<img class="character-portrait-image" src="${character.portrait}" alt="" loading="lazy" decoding="async" onerror="this.remove()">`
      : "";
    return `${image}<span class="portrait-fallback" aria-hidden="true"><span class="portrait-mark">${character.name[0]}</span><span class="silhouette"><span class="silhouette-head"></span><span class="silhouette-body"></span></span></span>`;
  }

  function cardMarkup(character, index = 0) {
    const stats = [["武力", character.martial], ["智力", character.intelligence]];
    return `
      <button class="warrior-card" type="button" data-name="${character.name}" data-tier="${character.tier}"
        data-faction="${character.faction}" style="--card-index:${Math.min(index, 20)}"
        aria-label="查看${character.name}详情，综合排名第${character.rank}">
        <span class="card-portrait">${portraitMarkup(character)}<span class="portrait-topline"><span class="faction-badge">${character.faction}</span><span class="tier-badge">${character.tier}${character.subTier}</span></span><span class="card-rank"><small>RANK</small><strong>${String(character.rank).padStart(3, "0")}</strong></span></span>
        <span class="card-main"><span class="card-title-row"><span class="card-name">${character.name}</span><span class="card-power"><span>综合战力</span><strong>${calculateCombatPower(character)}</strong></span></span><span class="card-stats">${stats.map(([label, value]) => `<span class="card-stat"><span>${label}</span><strong>${value}</strong></span>`).join("")}</span></span>
        <span class="card-trait">${character.trait}</span>
      </button>`;
  }

  function getCharacterByName(name) {
    return characters.find((character) => character.name === name);
  }

  function getVisibleCharacters() {
    const filtered = state.faction === "全部" ? [...characters] : characters.filter((character) => character.faction === state.faction);
    return filtered.sort((a, b) => {
      if (state.sort === "rank") return a.rank - b.rank;
      if (state.sort === "power") return calculateCombatPower(b) - calculateCombatPower(a) || a.rank - b.rank;
      return b[state.sort] - a[state.sort] || a.rank - b.rank;
    });
  }

  function renderGallery() {
    const visibleCharacters = getVisibleCharacters();
    cardGrid.innerHTML = visibleCharacters.map(cardMarkup).join("");
    visibleCount.textContent = String(visibleCharacters.length);
  }

  function renderFeaturedCards() {
    const featuredRanks = new Set([1, 2, 4]);
    featuredCards.innerHTML = characters.filter((character) => featuredRanks.has(character.rank)).map(cardMarkup).join("");
  }

  function updateCupSummary() {
    const draw = state.worldCup;
    participantCount.textContent = draw ? String(draw.participants.length) : "—";
    notSelectedCount.textContent = draw ? String(draw.notSelected.length) : "—";
    teamCount.textContent = draw ? String(draw.teams.length) : "—";
    groupCount.textContent = draw ? String(draw.groups.length) : "—";
  }

  function updateCupNavigation() {
    document.querySelectorAll("[data-cup-page]").forEach((button) => {
      button.classList.toggle("is-active", button.dataset.cupPage === state.cupPage);
      const page = button.dataset.cupPage;
      const drawPages = ["overview", "participants", "not-selected", "teams", "groups"];
      const roundByPage = {
        "round-of-16": "roundOf16",
        "quarter-finals": "quarterFinals",
        "semi-finals": "semiFinals",
        "third-place": "thirdPlace",
        final: "final"
      };
      if (window.playerMode?.isBattleActive() && page !== "player-mode") {
        button.disabled = true;
        return;
      }
      if (page === "overview") button.disabled = false;
      else if (drawPages.includes(page)) button.disabled = !state.worldCup;
      else if (page === "player-mode") button.disabled = !state.worldCup || !window.playerMode;
      else if (page === "group-stage") button.disabled = !state.tournament;
      else if (page === "champion") button.disabled = !state.tournament?.podium;
      else button.disabled = !state.tournament?.knockout?.[roundByPage[page]];
    });
  }

  function sectionHeading(kicker, title, description) {
    return `<div class="cup-section-heading"><p>${kicker}</p><h3>${title}</h3><span>${description}</span></div>`;
  }

  function teamMarkup(team, index = 0) {
    const members = team.members.map(getCharacterByName).filter(Boolean);
    return `<article class="team-panel" id="${team.id}"><div class="team-panel-heading"><div><small>TEAM ${String(index + 1).padStart(2, "0")}</small><h3>${team.name}</h3></div><button type="button" data-team-id="${team.id}">查看四将</button></div><div class="team-roster">${members.map(cardMarkup).join("")}</div></article>`;
  }

  function groupMarkup(group) {
    return `<article class="group-panel"><div class="group-title"><small>GROUP</small><strong>${group.name[0]}</strong><span>${group.name}</span></div><div class="group-team-list">${group.teams.map((team) => `<button type="button" class="group-team-button" data-team-id="${team.id}"><span>${team.name}</span><small>${team.members.join(" · ")}</small><b>查看</b></button>`).join("")}</div></article>`;
  }

  function matchMarkup(match, draw) {
    const teamA = getTeamById(draw, match.teamAId);
    const teamB = getTeamById(draw, match.teamBId);
    const completed = match.status === "completed";
    const powerA = completed ? match.survivorPower[teamA.id] : "—";
    const powerB = completed ? match.survivorPower[teamB.id] : "—";
    return `
      <button class="match-card ${completed ? "is-completed" : ""}" type="button"
        ${completed ? `data-match-id="${match.id}"` : "disabled"}>
        <span class="match-number">${match.id.split("-").slice(-1)[0]}号赛</span>
        <span class="match-team ${match.winnerTeamId === teamA.id ? "is-winner" : ""}"><b>${teamA.name}</b><small>最终剩余战力 ${powerA}</small></span>
        <i>VS</i>
        <span class="match-team ${match.winnerTeamId === teamB.id ? "is-winner" : ""}"><b>${teamB.name}</b><small>最终剩余战力 ${powerB}</small></span>
        <strong>${completed ? `${getTeamById(draw, match.winnerTeamId).name}胜 · 查看战报` : "等待比赛"}</strong>
      </button>`;
  }

  function standingsMarkup(group, tournament) {
    const rows = getGroupStandings(group, tournament);
    const groupFinished = getGroupMatches(tournament, group.id).every((match) => match.status === "completed");
    return `
      <div class="standings-table" role="table" aria-label="${group.name}积分榜">
        <div class="standings-row standings-head" role="row"><span>排名</span><span>球队</span><span>赛</span><span>胜</span><span>负</span><span>积分</span><span>同分对战</span><span>净胜战力</span></div>
        ${rows.map((row, index) => `
          <button class="standings-row" type="button" data-team-id="${row.teamId}" role="row">
            <span>${index + 1}${groupFinished && index < 2 ? " ✅" : ""}</span><strong>${row.teamName}</strong>
            <span>${row.played}</span><span>${row.won}</span><span>${row.lost}</span><b>${row.points}</b><span>${row.headToHeadPoints}</span><span>${row.netSurvivorPower}</span>
          </button>`).join("")}
      </div>`;
  }

  function renderGroupStagePage() {
    const tournament = state.tournament;
    const draw = state.worldCup;
    const completed = tournament.groupStage.matches.filter((match) => match.status === "completed").length;
    const group = draw.groups.find((item) => item.id === state.activeGroup) || draw.groups[0];
    state.activeGroup = group.id;
    const matches = getGroupMatches(tournament, group.id);
    const canPlay = tournament.stage === TOURNAMENT_STAGES.GROUP_STAGE;
    cupContent.innerHTML = `
      ${sectionHeading("32队 · 八组单循环", "小组赛", `已完成 ${completed} / 48 场；每组6场，每队严格3场。`)}
      <div class="tournament-controls">
        <button type="button" data-action="simulate-next-group" ${canPlay ? "" : "disabled"}>模拟下一场</button>
        <button type="button" data-action="simulate-all-group" ${canPlay ? "" : "disabled"}>模拟全部小组赛</button>
        ${canPlay ? "" : `<span>小组赛已完成，16支球队晋级。</span>`}
      </div>
      <div class="group-tabs">${draw.groups.map((item) => `<button type="button" data-group-id="${item.id}" class="${item.id === group.id ? "is-active" : ""}">${item.name}</button>`).join("")}</div>
      <div class="group-stage-layout">
        <section><h3>${group.name}积分榜</h3>${standingsMarkup(group, tournament)}</section>
        <section><h3>${group.name}六场赛程</h3><div class="match-list">${matches.map((match) => matchMarkup(match, draw)).join("")}</div></section>
      </div>`;
  }

  const ROUND_PAGE_MAP = Object.freeze({
    "round-of-16": "roundOf16",
    "quarter-finals": "quarterFinals",
    "semi-finals": "semiFinals",
    "third-place": "thirdPlace",
    final: "final"
  });

  function renderKnockoutPage(page) {
    const roundKey = ROUND_PAGE_MAP[page];
    const round = state.tournament.knockout[roundKey];
    if (!round) {
      cupContent.innerHTML = `<div class="draw-placeholder"><span class="draw-seal">赛</span><h3>该轮尚未生成</h3><p>请先完成前一阶段比赛。</p></div>`;
      return;
    }
    const completed = round.matches.filter((match) => match.status === "completed").length;
    const canPlay = state.tournament.stage === round.stage;
    cupContent.innerHTML = `
      ${sectionHeading("固定对阵树", round.label, `已完成 ${completed} / ${round.matches.length} 场；所有比赛统一采用三阶段单场规则。`)}
      <div class="tournament-controls">
        <button type="button" data-action="simulate-next-round" data-round-key="${roundKey}" ${canPlay ? "" : "disabled"}>模拟下一场</button>
        <button type="button" data-action="simulate-all-round" data-round-key="${roundKey}" ${canPlay ? "" : "disabled"}>模拟本轮全部</button>
        ${canPlay ? "" : `<span>${completed === round.matches.length ? "本轮已结束" : "请先完成前一阶段"}</span>`}
      </div>
      <div class="knockout-matches">${round.matches.map((match) => matchMarkup(match, state.worldCup)).join("")}</div>
      ${roundKey === "semiFinals" && state.tournament.knockout.semiFinalWinners.length ? `
        <div class="semi-summary"><p>决赛球队：${state.tournament.knockout.semiFinalWinners.map((id) => getTeamById(state.worldCup, id).name).join("、")}</p><p>季军赛球队：${state.tournament.knockout.semiFinalLosers.map((id) => getTeamById(state.worldCup, id).name).join("、")}</p></div>` : ""}`;
  }

  function renderChampionPage() {
    const podium = state.tournament?.podium;
    if (!podium) {
      cupContent.innerHTML = `<div class="draw-placeholder"><span class="draw-seal">冠</span><h3>冠军尚未产生</h3><p>完成决赛后将在这里展示本届前四名。</p></div>`;
      return;
    }
    const champion = getTeamById(state.worldCup, podium.championTeamId);
    const runnerUp = getTeamById(state.worldCup, podium.runnerUpTeamId);
    const third = getTeamById(state.worldCup, podium.thirdTeamId);
    const fourth = getTeamById(state.worldCup, podium.fourthTeamId);
    cupContent.innerHTML = `
      ${sectionHeading("天下归一", "本届冠军", "所有阵亡状态均已随单场比赛结束；此处展示球队原始四人阵容。")}
      <section class="champion-panel">
        <span class="champion-crown">🏆</span><p>冠军</p><h3>${champion.name}</h3>
        <div class="team-roster champion-roster">${champion.members.map(getCharacterByName).map(cardMarkup).join("")}</div>
      </section>
      <div class="podium-grid">
        <button type="button" data-team-id="${runnerUp.id}"><span>🥈 亚军</span><strong>${runnerUp.name}</strong></button>
        <button type="button" data-team-id="${third.id}"><span>🥉 季军</span><strong>${third.name}</strong></button>
        <button type="button" data-team-id="${fourth.id}"><span>第四名</span><strong>${fourth.name}</strong></button>
      </div>
      <div class="result-actions"><button type="button" data-action="new-draw">开始新一届世界杯</button></div>`;
  }

  function renderCupOverview() {
    if (!state.worldCup) {
      cupContent.innerHTML = `<div class="draw-placeholder"><span class="draw-seal">签</span><h3>等待本届抽签</h3><p>点击“开始新世界杯”，一次完成参赛抽取、球队组建与小组分配。</p></div>`;
      return;
    }
    cupContent.innerHTML = `
      ${sectionHeading("本届抽签已经完成", "赛事总览", "抽签、组队和分组已经完成，小组赛赛程已生成。")}
      <div class="draw-flow">
        <button type="button" data-cup-page="participants"><strong>150 → 128</strong><span>随机抽取参赛武将</span><small>另有22人未抽中</small></button><i aria-hidden="true">→</i>
        <button type="button" data-cup-page="teams"><strong>128 → 32</strong><span>随机组成四人球队</span><small>每人只进入一队</small></button><i aria-hidden="true">→</i>
        <button type="button" data-cup-page="groups"><strong>32 → 8</strong><span>随机分入八个小组</span><small>每组正好四队</small></button>
      </div>
      <div class="result-actions"><button type="button" data-cup-page="participants">查看128名参赛武将</button><button type="button" data-cup-page="not-selected">查看22名未抽中武将</button><button type="button" data-cup-page="teams">查看32支球队</button><button type="button" data-cup-page="groups">查看8个小组</button><button type="button" data-cup-page="group-stage">进入小组赛</button></div>
      <p class="scope-note">球队不计算赛前总战力；每一场比赛均通过三阶段武将对抗产生唯一胜者。</p>`;
  }

  function renderCupPage(page = state.cupPage) {
    state.cupPage = page;
    updateCupNavigation();
    if (page === "overview" || !state.worldCup) {
      renderCupOverview();
      return;
    }
    const draw = state.worldCup;
    if (page === "participants") {
      cupContent.innerHTML = `${sectionHeading("本届入选名单", "128名参赛武将", "由150名完整卡池随机抽取，每名武将只出现一次。")}<div class="card-grid cup-card-grid">${draw.participants.map(cardMarkup).join("")}</div>`;
    } else if (page === "not-selected") {
      cupContent.innerHTML = `${sectionHeading("本届暂别赛场", "22名未抽中武将", "他们仍保留在完整卡池中，重新抽签时仍有机会参赛。")}<div class="card-grid cup-card-grid">${draw.notSelected.map(cardMarkup).join("")}</div>`;
    } else if (page === "teams") {
    cupContent.innerHTML = `${sectionHeading("随机组队结果", "32支四人球队", "每队严格四名武将；不以赛前球队属性总和直接判定胜负。")}<div class="teams-list">${draw.teams.map(teamMarkup).join("")}</div>`;
    } else if (page === "groups") {
      cupContent.innerHTML = `${sectionHeading("随机分组结果", "A—H八个小组", "32支球队随机分配，每个小组严格四队。点击球队可查看四名成员。")}<div class="groups-grid">${draw.groups.map(groupMarkup).join("")}</div>`;
    } else if (page === "group-stage") {
      renderGroupStagePage();
    } else if (page === "player-mode") {
      window.playerMode?.render();
    } else if (ROUND_PAGE_MAP[page]) {
      renderKnockoutPage(page);
    } else if (page === "champion") {
      renderChampionPage();
    }
  }

  function showToast(message) {
    window.clearTimeout(toastTimer);
    toast.textContent = message;
    toast.classList.add("is-visible");
    toastTimer = window.setTimeout(() => toast.classList.remove("is-visible"), 2600);
  }

  function runNewDraw() {
    const draw = createWorldCupDraw();
    const errors = validateWorldCupDraw(draw);
    if (errors.length) {
      console.error("世界杯抽签校验失败：", errors);
      showToast("抽签数据校验失败，请查看控制台");
      return;
    }
    state.worldCup = draw;
    state.tournament = createTournament(draw);
    state.activeGroup = "group-a";
    window.playerMode?.startNewEdition(draw, state.tournament);
    state.cupPage = window.playerMode ? "player-mode" : "overview";
    drawButton.querySelector("span").textContent = "重新抽签";
    drawButton.querySelector("b").textContent = "重新生成全部名单与分组";
    updateCupSummary();
    renderCupPage(state.cupPage);
    showToast(window.playerMode ? "你的球队已经随机分配，征程开始" : "抽签完成：128名武将、32支球队、8个小组");
  }

  function runTournamentAction(action, roundKey = null) {
    try {
      let match = null;
      if (action === "simulate-next-group") {
        match = simulateNextGroupMatch(state.tournament, state.worldCup);
        state.activeGroup = match.groupId;
      } else if (action === "simulate-all-group") {
        simulateAllGroupMatches(state.tournament, state.worldCup);
      } else if (action === "simulate-next-round") {
        match = simulateNextKnockoutMatch(state.tournament, state.worldCup, roundKey);
      } else if (action === "simulate-all-round") {
        simulateAllKnockoutRound(state.tournament, state.worldCup, roundKey);
      }
      updateCupNavigation();
      renderCupPage(state.cupPage);
      showToast(match ? `${getTeamById(state.worldCup, match.winnerTeamId).name}赢得本场比赛` : "本阶段比赛已全部完成");
    } catch (error) {
      console.error("赛事模拟失败：", error);
      showToast(error.message || "赛事模拟失败");
    }
  }

  function switchView(nextView) {
    state.view = nextView;
    const views = { home: homeView, gallery: galleryView, cup: cupView };
    Object.entries(views).forEach(([name, element]) => {
      const active = name === nextView;
      element.hidden = !active;
      element.classList.toggle("is-active", active);
    });
    if (nextView === "gallery") renderGallery();
    if (nextView === "cup") renderCupPage(state.cupPage);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  function getFactionColor(faction) {
    return { 魏: "#263e51", 蜀: "#70402f", 吴: "#294b44", 群: "#4d3d58" }[faction];
  }

  function openDialog() {
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function openCharacterDialog(name) {
    const character = getCharacterByName(name);
    if (!character) return;
    const stats = [["武力", character.martial], ["智力", character.intelligence]];
    dialog.classList.remove("team-dialog", "battle-dialog");
    dialog.setAttribute("aria-labelledby", "dialog-name");
    dialogContent.innerHTML = `<div class="dialog-layout" style="--dialog-faction:${getFactionColor(character.faction)}"><div class="dialog-portrait">${portraitMarkup(character)}<span class="dialog-rank">RANK ${String(character.rank).padStart(3, "0")}</span></div><div class="dialog-info"><p class="dialog-meta">${character.faction} · ${character.tier}${character.subTier}级武将</p><h3 id="dialog-name">${character.name}</h3><div class="dialog-power-row"><span>综合战力</span><strong>${calculateCombatPower(character)}</strong></div><div class="dialog-stats">${stats.map(([label, value]) => `<div class="dialog-stat"><span>${label}</span><span class="stat-track"><i style="width:${value}%"></i></span><strong>${value}</strong></div>`).join("")}</div><div class="dialog-trait"><small>武将特性</small><strong>${character.trait}</strong></div></div></div>`;
    openDialog();
  }

  function openTeamDialog(teamId) {
    const team = state.worldCup?.teams.find((item) => item.id === teamId);
    if (!team) return;
    const group = state.worldCup.groups.find((item) => item.teams.some((groupTeam) => groupTeam.id === teamId));
    const members = team.members.map(getCharacterByName).filter(Boolean);
    dialog.classList.remove("battle-dialog");
    dialog.classList.add("team-dialog");
    dialog.setAttribute("aria-labelledby", "dialog-team-name");
    dialogContent.innerHTML = `<div class="team-dialog-layout"><p>${group ? `${group.name} · ` : ""}四人球队</p><h3 id="dialog-team-name">${team.name}</h3><div class="dialog-team-grid">${members.map(cardMarkup).join("")}</div><small>球队不计算赛前总战力；每场比赛开始时四名武将全部恢复。</small></div>`;
    openDialog();
  }

  function allTournamentMatches() {
    if (!state.tournament) return [];
    const knockoutRounds = ["roundOf16", "quarterFinals", "semiFinals", "thirdPlace", "final"]
      .map((key) => state.tournament.knockout[key])
      .filter(Boolean)
      .flatMap((round) => round.matches);
    return [...state.tournament.groupStage.matches, ...knockoutRounds];
  }

  function duelRecordMarkup(duel) {
    const result = duel.mutualDestruction ? "战力相同 · 同归于尽" : `${duel.winner.name}胜`;
    return `<div class="battle-duel"><span>第${duel.duelNumber}场</span><b>${duel.fighterA.name} ${duel.fighterA.power}</b><i>VS</i><b>${duel.fighterB.name} ${duel.fighterB.power}</b><strong>${result}</strong></div>`;
  }

  function survivorNames(summary) {
    return summary.members.length
      ? summary.members.map((fighter) => `${fighter.name} ${fighter.power}`).join("、")
      : "无";
  }

  function openBattleDialog(matchId) {
    const match = allTournamentMatches().find((item) => item.id === matchId);
    if (!match?.battleRecord) return;
    const record = match.battleRecord;
    const teamA = getTeamById(state.worldCup, match.teamAId);
    const teamB = getTeamById(state.worldCup, match.teamBId);
    const finalSurvivors = getFinalSurvivors(record);
    const phaseTwo = record.phaseTwo.skipped
      ? `<p class="battle-skipped">第二阶段跳过：${record.phaseTwo.reason}</p>`
      : `<div class="battle-duels">${record.phaseTwo.duels.map(duelRecordMarkup).join("")}</div>
         <p>轮空：A队 ${survivorNames({ members: record.phaseTwo.byes.A })}；B队 ${survivorNames({ members: record.phaseTwo.byes.B })}</p>`;
    const phaseThree = record.phaseThree.skipped
      ? `<p class="battle-skipped">第三阶段跳过：${record.phaseThree.reason}</p>`
      : `<div class="battle-final-power"><span>${teamA.name}<b>${record.phaseThree.finalPower.A}</b></span><i>最终剩余总战力</i><span>${teamB.name}<b>${record.phaseThree.finalPower.B}</b></span></div>`;

    dialog.classList.remove("team-dialog");
    dialog.classList.add("battle-dialog");
    dialog.setAttribute("aria-labelledby", "battle-dialog-name");
    dialogContent.innerHTML = `
      <div class="battle-dialog-layout">
        <p>完整战斗记录</p><h3 id="battle-dialog-name">${teamA.name} <i>VS</i> ${teamB.name}</h3>
        <section><h4>第一阶段 · 四场跨队单挑</h4><div class="battle-duels">${record.phaseOne.duels.map(duelRecordMarkup).join("")}</div>
          <p>A队幸存 ${record.phaseOne.survivors.A.count}人：${survivorNames(record.phaseOne.survivors.A)}</p>
          <p>B队幸存 ${record.phaseOne.survivors.B.count}人：${survivorNames(record.phaseOne.survivors.B)}</p></section>
        <section><h4>第二阶段 · 幸存者再次捉对</h4>${phaseTwo}</section>
        <section><h4>第三阶段 · 最终幸存阵容</h4>${phaseThree}
          <p>A队最终幸存：${survivorNames(finalSurvivors.A)}</p><p>B队最终幸存：${survivorNames(finalSurvivors.B)}</p></section>
        <div class="battle-winner">最终获胜：<strong>${getTeamById(state.worldCup, record.winner.teamId).name}</strong></div>
      </div>`;
    openDialog();
  }

  function closeDialog() {
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  document.addEventListener("click", (event) => {
    const actionButton = event.target.closest("[data-action]");
    if (actionButton) {
      const action = actionButton.dataset.action;
      if (action === "home") switchView("home");
      if (action === "open-gallery") switchView("gallery");
      if (action === "start-game") switchView("cup");
      if (action === "new-draw") runNewDraw();
      if (["simulate-next-group", "simulate-all-group", "simulate-next-round", "simulate-all-round"].includes(action)) {
        runTournamentAction(action, actionButton.dataset.roundKey || null);
      }
      return;
    }

    const cupPageButton = event.target.closest("[data-cup-page]");
    if (cupPageButton && !cupPageButton.disabled) {
      renderCupPage(cupPageButton.dataset.cupPage);
      window.scrollTo({ top: cupView.offsetTop, behavior: "smooth" });
      return;
    }

    const groupButton = event.target.closest("[data-group-id]");
    if (groupButton) {
      state.activeGroup = groupButton.dataset.groupId;
      renderGroupStagePage();
      return;
    }

    const matchButton = event.target.closest("[data-match-id]");
    if (matchButton) {
      openBattleDialog(matchButton.dataset.matchId);
      return;
    }

    const teamButton = event.target.closest("[data-team-id]");
    if (teamButton) {
      openTeamDialog(teamButton.dataset.teamId);
      return;
    }

    const factionButton = event.target.closest("[data-faction].filter-button");
    if (factionButton) {
      state.faction = factionButton.dataset.faction;
      document.querySelectorAll(".filter-button").forEach((button) => {
        const isActive = button === factionButton;
        button.classList.toggle("is-active", isActive);
        button.setAttribute("aria-pressed", String(isActive));
      });
      renderGallery();
      return;
    }

    const card = event.target.closest(".warrior-card");
    if (card) openCharacterDialog(card.dataset.name);
  });

  sortSelect.addEventListener("change", () => {
    state.sort = sortSelect.value;
    renderGallery();
  });
  document.querySelector(".dialog-close").addEventListener("click", closeDialog);
  dialog.addEventListener("click", (event) => {
    if (event.target === dialog) closeDialog();
  });

  const dataErrors = validateCharacterData(characters);
  if (dataErrors.length) {
    console.error("武将数据校验失败：", dataErrors);
    cardGrid.innerHTML = "<p>武将数据校验失败，请检查控制台。</p>";
  } else {
    renderFeaturedCards();
    renderGallery();
    updateCupSummary();
    updateCupNavigation();
  }

  window.sanguoApp = Object.freeze({
    calculateCombatPower,
    validateCharacterData,
    getVisibleCharacters,
    getState: () => ({ ...state }),
    getWorldCupState: () => state.worldCup,
    shuffle,
    createWorldCupDraw,
    validateWorldCupDraw,
    createTournament,
    getGroupStandings,
    getTeamById,
    getFinalSurvivors,
    completeScheduledMatch,
    playScheduledMatch,
    simulateNextGroupMatch,
    simulateAllGroupMatches,
    simulateNextKnockoutMatch,
    simulateAllKnockoutRound,
    simulateNextTournamentMatch,
    simulateAllCurrentStage,
    finalizeGroupStage,
    advanceKnockoutStage,
    currentRoundKey,
    cardMarkup,
    runNewDraw,
    renderCupPage,
    refreshCupNavigation: updateCupNavigation,
    tournamentStages: TOURNAMENT_STAGES,
    matchRules: MATCH_RULES,
    simulateTeamMatch
  });
})();
