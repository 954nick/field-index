// -------------------- COLLECTION QUERY HELPERS --------------------

function asArray(value) {
    return Array.isArray(value) ? value : [];
}

function compareNullable(a, b, direction = "asc") {
    if (a == null && b == null) return 0;
    if (a == null) return 1;
    if (b == null) return -1;

    let result;
    if (typeof a === "number" && typeof b === "number") {
        result = a - b;
    } else {
        result = String(a).localeCompare(String(b), undefined, {
            numeric: true,
            sensitivity: "base"
        });
    }
    return direction === "desc" ? -result : result;
}

function sortBy(items, selector, direction = "asc") {
    return [...asArray(items)].sort((left, right) =>
        compareNullable(selector(left), selector(right), direction)
    );
}

function paginate(items, options = {}) {
    const offset = Math.max(0, Number(options.offset ?? 0));
    const requestedLimit = Number(options.limit ?? 100);
    const limit = Number.isFinite(requestedLimit)
        ? Math.max(1, Math.min(1000, requestedLimit))
        : 100;
    const values = asArray(items);

    return {
        items: values.slice(offset, offset + limit),
        total: values.length,
        offset,
        limit,
        hasMore: offset + limit < values.length
    };
}

function findByNumericKey(items, key, value) {
    const number = Number(value);
    if (!Number.isInteger(number)) return null;
    return asArray(items).find(item => Number(item?.[key]) === number) ?? null;
}

export {
    asArray,
    compareNullable,
    findByNumericKey,
    paginate,
    sortBy
};
