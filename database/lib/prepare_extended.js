// -------------------- EXTENDED DYNASTY HISTORY IMPORT MODEL --------------------

import { hashIdentity } from "./identity.js";

function rosterFingerprint(player = {}) {
    return hashIdentity([
        player.firstName,
        player.lastName,
        player.hometown,
        player.homeState,
        player.heightInches,
        player.position
    ]);
}

function prepareRankingRows(rankings = {}) {
    const configs = [
        ["media", rankings.mediaPoll ?? rankings.apPoll ?? []],
        ["coaches", rankings.coachesPoll ?? []],
        ["cfp", rankings.cfpPoll ?? []]
    ];

    return configs.flatMap(([pollType, entries]) =>
        entries.map(entry => ({
            pollType,
            rank: entry.rank,
            lastWeekRank: entry.lastWeekRank,
            pointsRaw: entry.pointsRaw,
            firstPlaceVotes: entry.firstPlaceVotes,
            teamIndex: entry.teamIndex,
            teamName: entry.teamName
        }))
    );
}

function prepareRecruitingRows(recruiting = {}, metadata = {}, playerIdentityByRow = new Map()) {
    const classSeasonIndex = metadata.currentSeasonIndex + 1;
    const classSeasonYear = metadata.currentSeasonYear + 1;

    const prospects = (recruiting.recruits ?? []).map(recruit => {
        const player = recruit.player ?? {};
        const matchedIdentityKey = playerIdentityByRow.get(player.playerRow) ?? null;
        return {
            identityKey: `class:${classSeasonIndex}:recruit-row:${recruit.recruitRow}`,
            classSeasonIndex,
            classSeasonYear,
            recruitRow: recruit.recruitRow,
            sourcePlayerRow: player.playerRow ?? null,
            player,
            rosterFingerprint: rosterFingerprint(player),
            matchedPlayerIdentityKey: matchedIdentityKey,
            matchStrategy: matchedIdentityKey ? "source_player_row_same_import" : null,
            recruitStage: recruit.recruitStage,
            recruitClass: recruit.recruitClass,
            isSigned: Boolean(recruit.isSigned),
            isTransfer: Boolean(recruit.isTransfer),
            isHighSchool: Boolean(recruit.isHighSchool),
            isJuniorCollege: Boolean(recruit.isJuniorCollege),
            transferFromTeamIndex: recruit.transferFromTeamIndex ?? null,
            transferFromTeamName: recruit.transferFromTeamName ?? null,
            signedTeamIndex: recruit.signedTeamIndex ?? null,
            signedTeamName: recruit.signedTeamName ?? null,
            destinationResolved: Boolean(recruit.destinationResolved),
            destinationResolution: recruit.destinationResolution ?? null,
            destinationCandidates: recruit.destinationCandidates ?? [],
            nationalRank: recruit.nationalRank ?? null,
            positionRank: recruit.positionRank ?? null,
            stateRank: recruit.stateRank ?? null,
            productionGrade: recruit.productionGrade ?? null,
            qualityModifier: recruit.qualityModifier ?? null,
            totalScholarshipOffers: recruit.totalScholarshipOffers ?? null,
            commitScore: recruit.commitScore ?? null,
            alternatePosition1: recruit.alternatePosition1 ?? null,
            alternatePosition2: recruit.alternatePosition2 ?? null,
            topSchools: recruit.topSchools ?? []
        };
    });

    const prospectByRecruitRow = new Map(
        prospects.map(prospect => [prospect.recruitRow, prospect])
    );

    const boards = (recruiting.boards ?? []).map(board => ({
        teamIndex: board.teamIndex,
        teamName: board.teamName,
        recruitingHoursProcessed: board.recruitingHoursProcessed ?? 0,
        recruitingHoursTotal: board.recruitingHoursTotal ?? 0,
        recruitingHoursAssigned: board.recruitingHoursAssigned ?? 0
    }));

    const interests = [];
    for (const board of recruiting.boards ?? []) {
        for (const target of board.targets ?? []) {
            const prospect = prospectByRecruitRow.get(target.recruitRow);
            if (!prospect) continue;
            interests.push({
                prospectIdentityKey: prospect.identityKey,
                teamIndex: board.teamIndex,
                teamName: board.teamName,
                targetRow: target.targetRow ?? null,
                targetType: target.targetType ?? null,
                scholarshipStatus: target.scholarshipStatus ?? null,
                prospectInfluenceTotal: target.prospectInfluenceTotal ?? 0,
                prospectInfluenceDelta: target.prospectInfluenceDelta ?? 0,
                prospectInfluenceLastWeek: target.prospectInfluenceLastWeek ?? 0,
                hoursSpentCurrent: target.hoursSpentCurrent ?? 0,
                nilExpectation: target.nilExpectation ?? 0,
                currentNilOffer: target.currentNilOffer ?? 0,
                committedWeekNumber: target.committedWeekNumber ?? 0,
                sendTheHouse: Boolean(target.sendTheHouse),
                contactFriendsAndFamily: Boolean(target.contactFriendsAndFamily),
                contactHighSchoolCoaches: Boolean(target.contactHighSchoolCoaches),
                searchSocialMedia: Boolean(target.searchSocialMedia),
                visitRecruitsSchool: Boolean(target.visitRecruitsSchool),
                isFavorite: Boolean(target.isFavorite),
                swayPitch: target.swayPitch ?? null
            });
        }
    }

    return { prospects, boards, interests };
}

function prepareDepthChartRows(depthCharts = [], playerIdentityByRow = new Map()) {
    const rows = [];
    for (const chart of depthCharts) {
        for (const [positionKey, players] of Object.entries(chart.positions ?? {})) {
            for (const player of players ?? []) {
                rows.push({
                    teamIndex: chart.teamIndex,
                    teamName: chart.teamName,
                    positionKey,
                    depth: player.depth,
                    playerRow: player.playerRow,
                    playerIdentityKey: playerIdentityByRow.get(player.playerRow) ?? null,
                    displayName: player.displayName,
                    position: player.position,
                    jerseyNumber: player.jerseyNumber,
                    overallRating: player.overallRating
                });
            }
        }
    }
    return rows;
}

function preparePostseason(postseason = {}, cfp = {}, awards = {}, playerIdentityByRow = new Map()) {
    const champion = postseason.nationalChampion ?? cfp.nationalChampion ?? null;
    const runnerUp = postseason.nationalRunnerUp ?? cfp.runnerUp ?? null;
    const heisman = postseason.heismanWinner ?? awards.heismanWinner ?? null;
    const heismanPlayer = heisman?.player ?? null;

    return {
        cfpComplete: Boolean(postseason.cfpComplete ?? cfp.isComplete),
        nationalChampion: champion,
        runnerUp,
        heisman: heisman
            ? {
                playerIdentityKey: heismanPlayer
                    ? playerIdentityByRow.get(heismanPlayer.playerRow) ?? null
                    : null,
                playerName: heismanPlayer?.displayName ?? null,
                teamIndex: heisman.teamIndex ?? heismanPlayer?.teamIndex ?? null,
                teamName: heisman.teamName ?? heismanPlayer?.teamName ?? null
            }
            : null,
        cfpRounds: postseason.cfpRounds ?? cfp.rounds ?? {}
    };
}

function prepareAwardRows(awards = {}, playerIdentityByRow = new Map(), coachIdentityByRow = new Map()) {
    const rows = [];
    const ordinalByKey = new Map();

    function nextOrdinal(awardType, entityType) {
        const key = `${awardType}|${entityType}`;
        const next = (ordinalByKey.get(key) ?? 0) + 1;
        ordinalByKey.set(key, next);
        return next;
    }

    for (const award of awards.currentSeasonPlayerAwards ?? []) {
        const player = award.player ?? {};
        rows.push({
            awardType: award.awardType ?? "UNKNOWN",
            entityType: "player",
            ordinal: nextOrdinal(award.awardType ?? "UNKNOWN", "player"),
            sourceAwardRow: award.awardRow ?? null,
            playerIdentityKey: playerIdentityByRow.get(player.playerRow) ?? null,
            coachIdentityKey: null,
            displayName: player.displayName ?? "Unknown Player",
            teamIndex: award.teamIndex ?? player.teamIndex ?? null,
            teamName: award.teamName ?? player.teamName ?? null,
            position: award.position ?? player.position ?? null,
            awardScore: award.awardScore ?? null
        });
    }

    for (const award of awards.currentSeasonCoachAwards ?? []) {
        rows.push({
            awardType: award.awardType ?? "UNKNOWN",
            entityType: "coach",
            ordinal: nextOrdinal(award.awardType ?? "UNKNOWN", "coach"),
            sourceAwardRow: award.awardRow ?? null,
            playerIdentityKey: null,
            coachIdentityKey: coachIdentityByRow.get(award.coachRow) ?? null,
            displayName: award.coachName ?? "Unknown Coach",
            teamIndex: award.teamIndex ?? null,
            teamName: award.teamName ?? null,
            position: null,
            awardScore: null
        });
    }

    return rows;
}

function prepareIdentityObservations(players = []) {
    return players.map(player => ({
        playerIdentityKey: player.identityKey,
        sourcePlayerRow: player.playerRow,
        presentationId: player.identity?.presentationId ?? null,
        birthDateRaw: player.identity?.birthDateRaw ?? null,
        rosterFingerprint: rosterFingerprint(player)
    }));
}


function prepareCoachTalentRows(coaches = []) {
    const trees = [];
    const nodes = [];

    for (const coach of coaches) {
        const talentTree = coach.talentTree ?? {};
        for (const tree of talentTree.trees ?? []) {
            const treeInternalName = tree.internalName ?? tree.treeName ?? null;
            const treeDisplayName = tree.displayName ?? tree.treeDisplayName ?? treeInternalName;
            trees.push({
                coachIdentityKey: coach.identityKey,
                coachRow: coach.coachRow,
                treeIndex: tree.treeIndex,
                treeInternalName,
                treeDisplayName,
                treeDescription: tree.description ?? null,
                available: Boolean(tree.available),
                state: tree.available ? (tree.state ?? "Locked") : "Unavailable",
                rootStatus: tree.rootStatus ?? null,
                coachPointsSpent: tree.coachPointsSpent ?? null,
                ownedCount: tree.ownedCount ?? 0,
                purchasableCount: tree.purchasableCount ?? 0,
                notOwnedCount: tree.notOwnedCount ?? 0,
                lockedCount: tree.lockedCount ?? 0
            });

            if (!tree.available) continue;
            for (const talent of tree.talents ?? []) {
                const definition = talent.definition ?? null;
                nodes.push({
                    coachIdentityKey: coach.identityKey,
                    coachRow: coach.coachRow,
                    treeIndex: tree.treeIndex,
                    treeInternalName,
                    treeDisplayName,
                    talentIndex: talent.talentIndex,
                    canonicalKey: `${treeInternalName ?? `Tree${tree.treeIndex}`}:${talent.talentIndex}`,
                    status: talent.status ?? null,
                    abilityName: definition?.name ?? null,
                    abilityDescription: definition?.description ?? null,
                    staffPointCost: definition?.staffPointCost ?? null,
                    isArchetypeNode: definition?.isArchetypeNode ?? null,
                    progressLabel: definition?.progressLabel ?? null,
                    branchTitle: definition?.branch?.title ?? null,
                    branchSubtitle: definition?.branch?.subtitle ?? null,
                    positionGroup: definition?.talent?.positionGroup ?? null,
                    effect: definition?.talent?.effect ?? null,
                    duration: definition?.talent?.duration ?? null,
                    prerequisite: definition?.prerequisite ?? null
                });
            }
        }
    }

    return { trees, nodes };
}

function prepareExtendedHistory(fieldIndexData, players, coaches) {
    const playerIdentityByRow = new Map(
        players.map(player => [player.playerRow, player.identityKey])
    );
    const coachIdentityByRow = new Map(
        coaches.map(coach => [coach.coachRow, coach.identityKey])
    );

    const recruiting = prepareRecruitingRows(
        fieldIndexData.recruiting ?? {},
        fieldIndexData.metadata ?? {},
        playerIdentityByRow
    );

    return {
        rankings: prepareRankingRows(fieldIndexData.rankings ?? {}),
        recruiting,
        depthCharts: prepareDepthChartRows(fieldIndexData.depthCharts ?? [], playerIdentityByRow),
        postseason: preparePostseason(
            fieldIndexData.postseason ?? {},
            fieldIndexData.cfp ?? {},
            fieldIndexData.awards ?? {},
            playerIdentityByRow
        ),
        awards: prepareAwardRows(fieldIndexData.awards ?? {}, playerIdentityByRow, coachIdentityByRow),
        coachTalents: prepareCoachTalentRows(coaches),
        identityObservations: prepareIdentityObservations(players)
    };
}

export {
    prepareAwardRows,
    prepareCoachTalentRows,
    prepareDepthChartRows,
    prepareExtendedHistory,
    prepareRankingRows,
    prepareRecruitingRows,
    rosterFingerprint
};
