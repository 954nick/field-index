// -------------------- HEAD ID READ SERVICE --------------------

import { HeadCatalog } from "../../parser/head_catalog.js";

export class HeadService {
    constructor(data, options = {}) {
        this.data = data;
        this.catalog = HeadCatalog.load(options.headCatalogPath, { allowMissing: true });
    }

    refresh(catalogPath = this.catalog.catalogPath) {
        this.catalog = HeadCatalog.load(catalogPath, { allowMissing: true });
        return this.getSummary();
    }

    list(options = {}) {
        return this.catalog.list(options);
    }

    get(headId, options = {}) {
        return this.catalog.resolve(headId, options);
    }

    getPlayerHeadId(playerRow) {
        const row = Number(playerRow);
        const player = (this.data.players ?? []).find(item => item.playerRow === row);
        if (!player) throw new Error(`Player row ${playerRow} was not found`);

        const identity = player.head ?? {};
        let catalogEntry = null;
        if (identity.canonicalKey) {
            try {
                catalogEntry = this.catalog.resolve(identity.canonicalKey);
            } catch {
                catalogEntry = null;
            }
        }

        return {
            playerRow: row,
            displayName: player.displayName,
            headId: identity.headId ?? null,
            headType: identity.headType ?? "unknown",
            canonicalKey: identity.canonicalKey ?? null,
            assetName: identity.assetName ?? null,
            genericHeadAssetName: identity.genericHeadAssetName ?? null,
            portraitId: identity.portraitId ?? null,
            knownFormat: Boolean(identity.knownFormat),
            catalogKnown: Boolean(catalogEntry),
            catalogUsable: Boolean(catalogEntry?.profile_complete && catalogEntry?.portrait_id != null),
            portraitAssetPath: catalogEntry?.portrait_asset_path ?? null
        };
    }

    getPlayerHeadProfile(playerRow, options = {}) {
        const identity = this.getPlayerHeadId(playerRow);
        if (!identity.canonicalKey) {
            return {
                ...identity,
                profile: null,
                editable: false,
                reason: "Current player head format is unknown"
            };
        }

        try {
            const profile = this.catalog.profileFor(identity.canonicalKey, options);
            return { ...identity, profile, editable: true, reason: null };
        } catch (error) {
            return { ...identity, profile: null, editable: false, reason: error.message };
        }
    }

    getSummary() {
        return {
            exists: this.catalog.exists,
            total: this.catalog.size,
            ...this.catalog.counts
        };
    }
}
