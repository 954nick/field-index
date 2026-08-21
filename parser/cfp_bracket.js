// -------------------- CFP FIRST-ROUND CONSISTENCY MODEL --------------------

export const CFP_FIRST_ROUND_SEEDS = Object.freeze([5, 6, 7, 8, 9, 10, 11, 12]);
export const CFP_FIRST_ROUND_BRACKET_SLOTS = Object.freeze([0, 1, 2, 3]);

function asInteger(value, label) {
    const number = Number(value);
    if (!Number.isInteger(number)) throw new Error(`${label} must be an integer`);
    return number;
}

function locationKey(slot) {
    return `${slot.seasonGameRow}:${slot.side}`;
}

function normalizeAssignmentInput(assignments) {
    if (assignments instanceof Map) {
        return new Map([...assignments.entries()].map(([seed, teamIndex]) => [Number(seed), Number(teamIndex)]));
    }

    if (Array.isArray(assignments)) {
        if (assignments.length === CFP_FIRST_ROUND_SEEDS.length && assignments.every(Number.isInteger)) {
            return new Map(CFP_FIRST_ROUND_SEEDS.map((seed, index) => [seed, Number(assignments[index])]));
        }
        return new Map(assignments.map(item => [Number(item?.seed), Number(item?.teamIndex)]));
    }

    if (assignments && typeof assignments === "object") {
        return new Map(Object.entries(assignments).map(([seed, teamIndex]) => [Number(seed), Number(teamIndex)]));
    }

    throw new Error("CFP seed assignments must be an object, Map, or eight-team array");
}

export function validateCfpFirstRoundSlots(slots) {
    if (!Array.isArray(slots)) throw new Error("CFP first-round slots must be an array");
    if (slots.length !== CFP_FIRST_ROUND_SEEDS.length) {
        throw new Error(`CFP first round requires exactly ${CFP_FIRST_ROUND_SEEDS.length} participant slots`);
    }

    const normalized = [];
    const bySeed = new Map();
    const byTeam = new Map();
    const byLocation = new Map();

    for (const raw of slots) {
        const seed = asInteger(raw?.seed, "CFP seed");
        const teamIndex = asInteger(raw?.teamIndex, "CFP team index");
        const seasonGameRow = asInteger(raw?.seasonGameRow, "SeasonGame row");
        const bracketSlot = asInteger(raw?.bracketSlot, "CFP bracket slot");
        const side = String(raw?.side ?? "").toLowerCase();

        if (!CFP_FIRST_ROUND_SEEDS.includes(seed)) {
            throw new Error(`CFP first-round seed ${seed} is outside the supported 5-12 range`);
        }
        if (!CFP_FIRST_ROUND_BRACKET_SLOTS.includes(bracketSlot)) {
            throw new Error(`CFP bracket slot ${bracketSlot} is not a first-round slot`);
        }
        if (!['home', 'away'].includes(side)) throw new Error(`Invalid CFP participant side: ${raw?.side}`);
        if (raw?.played === true) {
            throw new Error(`Field Index will not mutate completed CFP game row ${seasonGameRow}`);
        }
        if (bySeed.has(seed)) throw new Error(`Duplicate CFP seed detected: ${seed}`);
        if (byTeam.has(teamIndex)) throw new Error(`CFP team ${teamIndex} appears in multiple first-round seed slots`);

        const cfpRankValue = raw?.cfpRank == null ? seed : Number(raw.cfpRank);
        if (!Number.isInteger(cfpRankValue)) {
            throw new Error(`CFP poll rank for team ${teamIndex} must be an integer`);
        }

        const normalizedSlot = {
            seed,
            cfpRank: cfpRankValue,
            teamIndex,
            seasonGameRow,
            bracketSlot,
            side,
            teamName: raw?.teamName ?? null,
            bowlSeedMarkers: Array.isArray(raw?.bowlSeedMarkers)
                ? raw.bowlSeedMarkers.map(Number).filter(Number.isInteger)
                : []
        };
        const key = locationKey(normalizedSlot);
        if (byLocation.has(key)) throw new Error(`Duplicate CFP location detected: ${key}`);

        normalized.push(normalizedSlot);
        bySeed.set(seed, normalizedSlot);
        byTeam.set(teamIndex, normalizedSlot);
        byLocation.set(key, normalizedSlot);
    }

    for (const seed of CFP_FIRST_ROUND_SEEDS) {
        if (!bySeed.has(seed)) throw new Error(`CFP first-round seed ${seed} is missing`);
    }

    return {
        slots: normalized.sort((a, b) => a.seed - b.seed),
        bySeed,
        byTeam,
        byLocation
    };
}

export function planCfpFirstRoundSeedAssignments(slots, assignments) {
    const current = validateCfpFirstRoundSlots(slots);
    const desired = normalizeAssignmentInput(assignments);

    if (desired.size !== CFP_FIRST_ROUND_SEEDS.length) {
        throw new Error("CFP first-round edit must provide exactly seeds 5-12");
    }

    const currentTeams = new Set(current.slots.map(slot => slot.teamIndex));
    const desiredTeams = new Set();

    for (const seed of CFP_FIRST_ROUND_SEEDS) {
        if (!desired.has(seed)) throw new Error(`CFP first-round edit is missing seed ${seed}`);
        const teamIndex = asInteger(desired.get(seed), `Team index for CFP seed ${seed}`);
        if (!currentTeams.has(teamIndex)) {
            throw new Error(
                `Team ${teamIndex} is not already in the current CFP first round. ` +
                "Arbitrary CFP team injection is not game-verified and is blocked."
            );
        }
        if (desiredTeams.has(teamIndex)) throw new Error(`CFP seed assignment duplicates team ${teamIndex}`);
        desiredTeams.add(teamIndex);
        desired.set(seed, teamIndex);
    }

    if (desiredTeams.size !== currentTeams.size || [...currentTeams].some(teamIndex => !desiredTeams.has(teamIndex))) {
        throw new Error("CFP first-round assignments must be a permutation of the existing eight participants");
    }

    const desiredSeedByTeam = new Map([...desired.entries()].map(([seed, teamIndex]) => [teamIndex, seed]));
    const participantChanges = [];
    const rankChanges = [];

    for (const slot of current.slots) {
        const afterTeamIndex = desired.get(slot.seed);
        if (afterTeamIndex !== slot.teamIndex) {
            participantChanges.push({
                seed: slot.seed,
                seasonGameRow: slot.seasonGameRow,
                bracketSlot: slot.bracketSlot,
                side: slot.side,
                beforeTeamIndex: slot.teamIndex,
                afterTeamIndex,
                bowlSeedMarkers: [...slot.bowlSeedMarkers]
            });
        }

        const afterSeed = desiredSeedByTeam.get(slot.teamIndex);
        if (afterSeed !== slot.seed) {
            const destinationSlot = current.bySeed.get(afterSeed);
            rankChanges.push({
                teamIndex: slot.teamIndex,
                beforeSeed: slot.seed,
                afterSeed,
                beforeCfpRank: slot.cfpRank,
                afterCfpRank: destinationSlot.cfpRank
            });
        }
    }

    return {
        currentAssignments: Object.fromEntries(current.slots.map(slot => [slot.seed, slot.teamIndex])),
        desiredAssignments: Object.fromEntries(CFP_FIRST_ROUND_SEEDS.map(seed => [seed, desired.get(seed)])),
        participantChanges,
        rankChanges
    };
}

export function planCfpFirstRoundTeamSwap(slots, teamIndexA, teamIndexB) {
    const current = validateCfpFirstRoundSlots(slots);
    const a = asInteger(teamIndexA, "First CFP team index");
    const b = asInteger(teamIndexB, "Second CFP team index");
    if (a === b) throw new Error("CFP team swap requires two different teams");

    const slotA = current.byTeam.get(a);
    const slotB = current.byTeam.get(b);
    if (!slotA || !slotB) {
        throw new Error("Both teams must already be in the current CFP first round");
    }

    const assignments = new Map(current.slots.map(slot => [slot.seed, slot.teamIndex]));
    assignments.set(slotA.seed, b);
    assignments.set(slotB.seed, a);
    return planCfpFirstRoundSeedAssignments(current.slots, assignments);
}

export function planCfpGameParticipantPermutation(slots, seasonGameRow, changes = {}) {
    const current = validateCfpFirstRoundSlots(slots);
    const row = asInteger(seasonGameRow, "SeasonGame row");
    const homeSlot = current.slots.find(slot => slot.seasonGameRow === row && slot.side === "home");
    const awaySlot = current.slots.find(slot => slot.seasonGameRow === row && slot.side === "away");
    if (!homeSlot || !awaySlot) throw new Error(`SeasonGame row ${row} is not a complete CFP first-round matchup`);

    const requestedHome = asInteger(changes.homeTeamIndex, "CFP home team index");
    const requestedAway = asInteger(changes.awayTeamIndex, "CFP away team index");
    if (requestedHome === requestedAway) throw new Error("Home and away team cannot be the same");
    if (!current.byTeam.has(requestedHome) || !current.byTeam.has(requestedAway)) {
        throw new Error(
            "CFP participant edits may only rearrange teams already in the current first round. " +
            "Adding/removing CFP teams is not game-verified and is blocked."
        );
    }

    const assignments = new Map(current.slots.map(slot => [slot.seed, slot.teamIndex]));

    function swapTeamIntoSeed(targetSeed, desiredTeamIndex) {
        const currentSeed = [...assignments.entries()].find(([, teamIndex]) => teamIndex === desiredTeamIndex)?.[0];
        if (currentSeed == null) throw new Error(`CFP team ${desiredTeamIndex} is not assigned to a seed`);
        if (currentSeed === targetSeed) return;
        const displacedTeam = assignments.get(targetSeed);
        assignments.set(targetSeed, desiredTeamIndex);
        assignments.set(currentSeed, displacedTeam);
    }

    swapTeamIntoSeed(homeSlot.seed, requestedHome);
    swapTeamIntoSeed(awaySlot.seed, requestedAway);

    const plan = planCfpFirstRoundSeedAssignments(current.slots, assignments);
    if (plan.desiredAssignments[homeSlot.seed] !== requestedHome || plan.desiredAssignments[awaySlot.seed] !== requestedAway) {
        throw new Error("Unable to build a consistent CFP participant permutation for the requested matchup");
    }
    return plan;
}
