// -------------------- SQL GENERATION HELPERS --------------------

function sqlText(value) {
    if (value === null || value === undefined) return "NULL::text";
    return `'${String(value).replaceAll("'", "''")}'`;
}

function sqlNumber(value) {
    if (value === null || value === undefined || value === "") return "NULL::numeric";
    const numeric = Number(value);
    if (!Number.isFinite(numeric)) return "NULL::numeric";
    return String(numeric);
}

function sqlInteger(value) {
    if (value === null || value === undefined || value === "") return "NULL::integer";
    const numeric = Number(value);
    if (!Number.isInteger(numeric)) return "NULL::integer";
    return String(numeric);
}

function sqlBoolean(value) {
    if (value === null || value === undefined) return "NULL::boolean";
    return value ? "TRUE" : "FALSE";
}

function sqlJson(value) {
    if (value === null || value === undefined) return "NULL::jsonb";
    return `${sqlText(JSON.stringify(value))}::jsonb`;
}

function sqlTimestamp(value) {
    if (!value) return "NULL::timestamp";
    const date = value instanceof Date ? value : new Date(value);
    if (Number.isNaN(date.getTime())) return "NULL::timestamp";
    return sqlText(date.toISOString());
}

function chunk(items, size = 500) {
    const chunks = [];
    for (let index = 0; index < items.length; index += size) {
        chunks.push(items.slice(index, index + size));
    }
    return chunks;
}

export {
    chunk,
    sqlBoolean,
    sqlInteger,
    sqlJson,
    sqlNumber,
    sqlText,
    sqlTimestamp
};
