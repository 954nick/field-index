// -------------------- RECRUITING READ SERVICE --------------------

import { sortBy } from "../lib/query.js";
import { normalizeLookupText } from "../lib/slug.js";

function starValue(recruit) {
    const value = Number(recruit?.player?.prospectStarRating);
    return Number.isFinite(value) && value >= 0 ? value : null;
}

function classMetrics(recruits = []) {
    const stars = recruits.map(starValue).filter(value => value != null);
    const counts = { fiveStar: 0, fourStar: 0, threeStar: 0, twoStar: 0, oneStar: 0 };
    for (const star of stars) {
        if (star >= 5) counts.fiveStar += 1;
        else if (star === 4) counts.fourStar += 1;
        else if (star === 3) counts.threeStar += 1;
        else if (star === 2) counts.twoStar += 1;
        else if (star === 1) counts.oneStar += 1;
    }

    const overallValues = recruits
        .map(recruit => Number(recruit?.player?.overallRating))
        .filter(Number.isFinite);

    return {
        classSize: recruits.length,
        highSchoolCount: recruits.filter(recruit => recruit.isHighSchool).length,
        transferCount: recruits.filter(recruit => recruit.isTransfer).length,
        juniorCollegeCount: recruits.filter(recruit => recruit.isJuniorCollege).length,
        ...counts,
        averageStarRating: stars.length
            ? Number((stars.reduce((sum, value) => sum + value, 0) / stars.length).toFixed(3))
            : null,
        averageOverallRating: overallValues.length
            ? Number((overallValues.reduce((sum, value) => sum + value, 0) / overallValues.length).toFixed(3))
            : null
    };
}

export class RecruitingService {
    constructor(data) {
        this.data = data;
        this.recruiting = data?.recruiting ?? {};
    }

    listRecruits(options = {}) {
        let recruits = [...(this.recruiting.recruits ?? [])];
        if (options.type === "transfer") recruits = recruits.filter(recruit => recruit.isTransfer);
        if (options.type === "highSchool") recruits = recruits.filter(recruit => recruit.isHighSchool);
        if (options.signed === true) recruits = recruits.filter(recruit => recruit.isSigned);
        if (options.signed === false) recruits = recruits.filter(recruit => !recruit.isSigned);
        if (options.position) {
            recruits = recruits.filter(recruit => recruit.player?.position === options.position);
        }
        if (options.search) {
            const search = normalizeLookupText(options.search);
            recruits = recruits.filter(recruit =>
                normalizeLookupText(`${recruit.player?.displayName} ${recruit.player?.position} ${recruit.player?.hometownDisplay}`).includes(search)
            );
        }
        return sortBy(recruits, recruit => recruit.nationalRank || 99999, "asc");
    }

    getBoard(teamIndex) {
        return (this.recruiting.boards ?? []).find(board => board.teamIndex === Number(teamIndex)) ?? null;
    }

    getSigningClass(teamIndex) {
        return this.recruiting.signingClassesByTeam?.[String(teamIndex)] ?? [];
    }

    getClassRankings(options = {}) {
        let teams = [...(this.data.teams ?? [])]
            .filter(team => {
                const rank = Number(team.recruitingClassRank);
                return Number.isInteger(rank) && rank > 0 && rank < 255;
            })
            .map(team => {
                const recruits = this.getSigningClass(team.teamIndex);
                return {
                    rank: Number(team.recruitingClassRank),
                    conferenceRank: Number.isInteger(Number(team.recruitingClassConferenceRank))
                        ? Number(team.recruitingClassConferenceRank)
                        : null,
                    teamIndex: team.teamIndex,
                    teamName: team.teamName,
                    recruitProgramPointsSpent: Number(team.recruitProgramPointsSpent ?? 0),
                    lastWeekCommittedRecruits: Number(team.lastWeekCommittedRecruits ?? 0),
                    ...classMetrics(recruits)
                };
            });

        if (options.teamIndex != null) {
            teams = teams.filter(team => team.teamIndex === Number(options.teamIndex));
        }
        if (options.top != null) {
            const top = Math.max(1, Number(options.top) || 1);
            teams = teams.filter(team => team.rank <= top);
        }
        return teams.sort((a, b) => a.rank - b.rank || a.teamName.localeCompare(b.teamName));
    }

    getTeamClassSummary(teamIndex) {
        const team = (this.data.teams ?? []).find(item => item.teamIndex === Number(teamIndex));
        if (!team) throw new Error(`Team index ${teamIndex} was not found`);
        const recruits = this.getSigningClass(teamIndex);
        return {
            teamIndex: team.teamIndex,
            teamName: team.teamName,
            rank: team.recruitingClassRank ?? null,
            conferenceRank: team.recruitingClassConferenceRank ?? null,
            recruitProgramPointsSpent: team.recruitProgramPointsSpent ?? 0,
            lastWeekCommittedRecruits: team.lastWeekCommittedRecruits ?? 0,
            ...classMetrics(recruits),
            recruits: structuredClone(recruits)
        };
    }

    getPortal() {
        return this.data.transfers?.portal ?? {
            candidates: [],
            signedTransfers: [],
            unsignedTransfers: [],
            unresolvedSignedTransfers: [],
            incomingByTeam: {},
            outgoingByTeam: {}
        };
    }
}
