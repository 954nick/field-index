// -------------------- NORMALIZED LOOKUP KEYS --------------------

function normalizeLookupText(value) {
    return String(value ?? "")
        .normalize("NFKD")
        .replace(/[\u0300-\u036f]/g, "")
        .toLowerCase()
        .replace(/&/g, " and ")
        .replace(/[^a-z0-9]+/g, " ")
        .trim()
        .replace(/\s+/g, " ");
}

function slugify(value) {
    return normalizeLookupText(value).replace(/ /g, "_");
}

export {
    normalizeLookupText,
    slugify
};
