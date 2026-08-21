// -------------------- COACH READ SERVICE --------------------

import { findByNumericKey, sortBy } from "../lib/query.js";
import { normalizeLookupText } from "../lib/slug.js";
import { flattenCoachAbilities } from "../../parser/coach_talents.js";

function clone(value) {
    return value == null ? value : structuredClone(value);
}

export class CoachService {
    constructor(data) {
        this.data = data;
        this.coaches = Array.isArray(data?.coaches) ? data.coaches : [];
        this.catalog = data?.coachTalentCatalog ?? {
            format: "field_index_coach_talent_catalog",
            version: 1,
            source: "live_save",
            available: false,
            trees: [],
            treeCount: 0,
            talentCount: 0
        };
    }

    list(options = {}) {
        let coaches = [...this.coaches];
        if (options.teamIndex != null) {
            coaches = coaches.filter(coach => coach.teamIndex === Number(options.teamIndex));
        }
        if (options.position) {
            const position = normalizeLookupText(options.position);
            coaches = coaches.filter(coach => normalizeLookupText(coach.position) === position);
        }
        if (options.role) {
            const role = normalizeLookupText(options.role);
            coaches = coaches.filter(coach =>
                normalizeLookupText(coach.role).includes(role) || normalizeLookupText(coach.position).includes(role)
            );
        }
        if (options.archetype) {
            const archetype = normalizeLookupText(options.archetype);
            coaches = coaches.filter(coach => normalizeLookupText(coach.dominantArchetype).includes(archetype));
        }
        if (options.userControlled != null) {
            coaches = coaches.filter(coach => Boolean(coach.isUserControlled) === Boolean(options.userControlled));
        }
        if (options.search) {
            const search = normalizeLookupText(options.search);
            coaches = coaches.filter(coach =>
                normalizeLookupText(`${coach.displayName} ${coach.position} ${coach.teamName}`).includes(search)
            );
        }
        return sortBy(coaches, coach => coach.displayName, "asc").map(clone);
    }

    get(coachRow) {
        return clone(findByNumericKey(this.coaches, "coachRow", coachRow));
    }

    require(coachRow) {
        const coach = this.get(coachRow);
        if (!coach) throw new Error(`Coach row ${coachRow} was not found`);
        return coach;
    }

    getStaff(teamIndex) {
        return clone((this.data.coaching ?? []).find(staff => staff.teamIndex === Number(teamIndex)) ?? null);
    }

    getTalentCatalog(options = {}) {
        const catalog = clone(this.catalog);
        if (!options.availableOnly) return catalog;
        catalog.trees = (catalog.trees ?? []).filter(tree => tree.available);
        catalog.treeCount = catalog.trees.length;
        catalog.talentCount = catalog.trees.reduce((sum, tree) => sum + (tree.talentCount ?? 0), 0);
        return catalog;
    }

    getTalentTree(coachRow) {
        return clone(this.require(coachRow).talentTree ?? null);
    }

    getArchetypeContext(coachRow) {
        return clone(this.require(coachRow).talentTree?.archetypeContext ?? null);
    }

    getAbilities(coachRow, options = {}) {
        return flattenCoachAbilities(this.require(coachRow).talentTree, options);
    }

    getOwnedAbilities(coachRow) {
        return this.getAbilities(coachRow, { status: "Owned", availableTreesOnly: true });
    }

    getPurchasableAbilities(coachRow) {
        return this.getAbilities(coachRow, { status: "Purchasable", availableTreesOnly: true });
    }

    getUnlockedTrees(coachRow) {
        return (this.require(coachRow).talentTree?.trees ?? [])
            .filter(tree => tree.available && tree.unlocked)
            .map(clone);
    }

    getSummary(coachRow) {
        const coach = this.require(coachRow);
        const abilities = flattenCoachAbilities(coach.talentTree, { availableTreesOnly: true });
        return {
            coachRow: coach.coachRow,
            displayName: coach.displayName,
            teamIndex: coach.teamIndex,
            teamName: coach.teamName,
            position: coach.position,
            level: coach.level,
            coachPoints: coach.coachPoints,
            experiencePoints: coach.experiencePoints,
            dominantArchetype: coach.dominantArchetype,
            dominantArchetypeDisplayName:
                coach.talentTree?.archetypeContext?.displayName ?? coach.dominantArchetype ?? null,
            archetypeContext: clone(coach.talentTree?.archetypeContext ?? null),
            talentCatalogAvailable: Boolean(coach.talentTree?.catalogAvailable),
            unlockedTreeCount: (coach.talentTree?.trees ?? []).filter(tree => tree.available && tree.unlocked).length,
            ownedAbilityCount: abilities.filter(ability => ability.status === "Owned").length,
            purchasableAbilityCount: abilities.filter(ability => ability.status === "Purchasable").length
        };
    }
}
