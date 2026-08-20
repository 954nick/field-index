// -------------------- DATABASE ENTITY IDENTITY --------------------

import crypto from "node:crypto";

function normalizeIdentityText(value) {
    return String(value ?? "")
        .trim()
        .toLowerCase()
        .replace(/\s+/g, " ");
}

function hashIdentity(parts) {
    const canonical = parts.map(normalizeIdentityText).join("|");
    return crypto.createHash("sha256").update(canonical).digest("hex");
}

function positiveInteger(value) {
    return Number.isInteger(value) && value > 0 ? value : null;
}

function nonNegativeInteger(value) {
    return Number.isInteger(value) && value >= 0 ? value : null;
}

function assertUniqueIdentityKeys(items, entityName) {
    const seen = new Map();

    for (const item of items) {
        const existing = seen.get(item.identityKey);
        if (existing) {
            throw new Error(
                `${entityName} identity collision for ${item.identityKey}: ` +
                `${existing.displayName} and ${item.displayName}`
            );
        }
        seen.set(item.identityKey, item);
    }
}

function buildPlayerIdentityRecords(players) {
    const presentationCounts = new Map();

    for (const player of players) {
        const presentationId = positiveInteger(player.identity?.presentationId);
        if (presentationId === null) continue;
        presentationCounts.set(
            presentationId,
            (presentationCounts.get(presentationId) ?? 0) + 1
        );
    }

    const records = players.map(player => {
        const presentationId = positiveInteger(player.identity?.presentationId);

        if (presentationId !== null && presentationCounts.get(presentationId) === 1) {
            return {
                ...player,
                identityKey: `presentation:${presentationId}`,
                identityStrategy: "presentation_id"
            };
        }

        const bioFingerprint = hashIdentity([
            player.firstName,
            player.lastName,
            player.identity?.birthDateRaw,
            player.hometown,
            player.homeState,
            player.heightInches
        ]);

        return {
            ...player,
            identityKey: `bio:${bioFingerprint}`,
            identityStrategy: "bio_fingerprint"
        };
    });

    assertUniqueIdentityKeys(records, "Player");
    return records;
}

function buildCoachIdentityRecords(coaches) {
    const presentationCounts = new Map();

    for (const coach of coaches) {
        const presentationId = positiveInteger(coach.identity?.presentationId);
        if (presentationId === null) continue;
        presentationCounts.set(
            presentationId,
            (presentationCounts.get(presentationId) ?? 0) + 1
        );
    }

    const records = coaches.map(coach => {
        const presentationId = positiveInteger(coach.identity?.presentationId);

        if (presentationId !== null && presentationCounts.get(presentationId) === 1) {
            return {
                ...coach,
                identityKey: `presentation:${presentationId}`,
                identityStrategy: "presentation_id"
            };
        }

        // Coach PresentationId is not populated/unique for every CFB27 coach.
        // The raw Coach record row was verified stable across the supplied
        // regular-season, postseason, Players Leaving, and Signing Day saves.
        // Prefer it over editable name fields when PresentationId is unusable.
        const coachRow = nonNegativeInteger(coach.coachRow);
        if (coachRow !== null) {
            return {
                ...coach,
                identityKey: `coach-row:${coachRow}`,
                identityStrategy: "coach_row"
            };
        }

        const bioFingerprint = hashIdentity([
            coach.firstName,
            coach.lastName,
            coach.identity?.homeTown,
            coach.identity?.homeState,
            coach.identity?.almaMater
        ]);

        return {
            ...coach,
            identityKey: `bio:${bioFingerprint}`,
            identityStrategy: "bio_fingerprint"
        };
    });

    assertUniqueIdentityKeys(records, "Coach");
    return records;
}

export {
    buildCoachIdentityRecords,
    buildPlayerIdentityRecords,
    hashIdentity,
    normalizeIdentityText
};
