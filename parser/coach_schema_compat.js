// -------------------- COACH SCHEMA COMPATIBILITY --------------------
// Field Index uses ONLY the user's C27_486_1.gz schema.
//
// Some CFB27 dynasty saves created/continued on schema 486.1 contain a 137-member
// Coach table while the provided 486.1 Coach schema contains 138 members. The
// table itself is still a 486.1 Coach layout, but it omits LeagueJobMotivation.
// madden-franchise refuses to attach a 138-member schema to a 137-member table
// and otherwise falls back to anonymous Field_* columns.
//
// To preserve semantic coach fields without introducing any second/legacy schema,
// Field Index derives a 137-member Coach schema directly from the loaded 486.1
// schema by removing only LeagueJobMotivation. All enums also come from the same
// loaded 486.1 schema.

const EXPECTED_SCHEMA = Object.freeze({ major: 486, minor: 1, gameYear: 27 });
const OMITTED_137_MEMBER_FIELD = "LeagueJobMotivation";

function cloneSchema(value) {
    return structuredClone(value);
}

function hasSemanticCoachSchema(table) {
    const names = new Set((table?.schema?.attributes ?? []).map(attribute => attribute.name));
    return (
        names.has("FirstName") &&
        names.has("LastName") &&
        names.has("TeamIndex") &&
        names.has("Position") &&
        names.has("CoachPoints") &&
        names.has("ActiveTalentTree")
    );
}

function assertProvidedSchema(franchise) {
    const meta = franchise?.schema?.meta ?? {};
    if (
        meta.major !== EXPECTED_SCHEMA.major ||
        meta.minor !== EXPECTED_SCHEMA.minor ||
        meta.gameYear !== EXPECTED_SCHEMA.gameYear
    ) {
        throw new Error(
            `Field Index expected the provided C27 ${EXPECTED_SCHEMA.major}.${EXPECTED_SCHEMA.minor} schema ` +
            `for game year ${EXPECTED_SCHEMA.gameYear}, but loaded ${meta.major}.${meta.minor} / ${meta.gameYear}`
        );
    }

    const coachSchema = franchise?.schema?.schemaMap?.Coach;
    if (!coachSchema || coachSchema.attributes?.length !== 138) {
        throw new Error("The provided C27_486_1 schema does not contain the expected 138-member Coach schema");
    }

    return coachSchema;
}

function evaluateEnumsFromProvidedSchema(franchise, schema) {
    for (const attribute of schema.attributes ?? []) {
        const evaluatedEnum = franchise?.schema?.enumMap?.[attribute.type];
        if (evaluatedEnum) attribute.enum = evaluatedEnum;
    }
    return schema;
}

function derive137MemberCoachSchema(franchise) {
    const providedCoachSchema = assertProvidedSchema(franchise);
    const derived = cloneSchema(providedCoachSchema);

    derived.attributes = derived.attributes.filter(
        attribute => attribute.name !== OMITTED_137_MEMBER_FIELD
    );

    if (Array.isArray(derived.originalAttributesOrder)) {
        derived.originalAttributesOrder = derived.originalAttributesOrder.filter(
            attribute => attribute.name !== OMITTED_137_MEMBER_FIELD
        );
    }

    if (derived.attributes.length !== 137) {
        throw new Error("Could not derive the 137-member Coach schema from the provided C27_486_1 schema");
    }

    derived.numMembers = "137";
    return evaluateEnumsFromProvidedSchema(franchise, derived);
}

/**
 * Attach a semantic Coach schema before records are read.
 * No external, legacy, downloaded, generated, or alternate schema is used.
 */
function ensureCoachTableSchema(franchise, table) {
    if (!table) throw new Error("Coach table not found");

    if (hasSemanticCoachSchema(table)) {
        return {
            source: "provided-C27_486_1",
            variant: "native",
            numMembers: table.header.numMembers,
            compatibilityApplied: false,
            omittedField: null
        };
    }

    const providedCoachSchema = assertProvidedSchema(franchise);

    if (table.header.numMembers === 138) {
        const schema = evaluateEnumsFromProvidedSchema(franchise, cloneSchema(providedCoachSchema));
        table.schema = schema;
    } else if (table.header.numMembers === 137) {
        table.schema = derive137MemberCoachSchema(franchise);
    } else {
        throw new Error(
            `Unsupported Coach table layout with the provided C27_486_1 schema: ${table.header.numMembers} members`
        );
    }

    if (!hasSemanticCoachSchema(table)) {
        throw new Error("Could not attach semantic Coach fields using the provided C27_486_1 schema");
    }

    return {
        source: "provided-C27_486_1",
        variant: table.header.numMembers === 137 ? "derived-137" : "native-138",
        numMembers: table.header.numMembers,
        compatibilityApplied: table.header.numMembers === 137,
        omittedField: table.header.numMembers === 137 ? OMITTED_137_MEMBER_FIELD : null
    };
}

export {
    OMITTED_137_MEMBER_FIELD,
    derive137MemberCoachSchema,
    ensureCoachTableSchema,
    hasSemanticCoachSchema
};
