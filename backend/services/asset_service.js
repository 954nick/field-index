// -------------------- ASSET MAPPING SERVICE --------------------

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { normalizeLookupText, slugify } from "../lib/slug.js";

const backendDirectory = path.dirname(fileURLToPath(import.meta.url));
const projectDirectory = path.resolve(backendDirectory, "..", "..");
const defaultManifestPath = path.join(projectDirectory, "assets", "mappings", "asset_manifest.json");

function readJson(filePath) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function candidateKeys(value) {
    const normalized = normalizeLookupText(value);
    const slug = slugify(value);
    return new Set([normalized, slug, normalized.replace(/\bthe\b/g, "").replace(/\s+/g, " ").trim()]);
}

function assetBasenameWithoutExtension(asset) {
    return path.basename(asset.field_index_path ?? asset.field_index_name ?? "", path.extname(asset.field_index_path ?? asset.field_index_name ?? ""));
}

export class AssetService {
    constructor(options = {}) {
        this.projectDirectory = path.resolve(options.projectDirectory ?? projectDirectory);
        this.manifestPath = path.resolve(options.manifestPath ?? defaultManifestPath);
        this.manifest = fs.existsSync(this.manifestPath)
            ? readJson(this.manifestPath)
            : { format: "field_index_asset_manifest", version: 1, assets: [], counts: {}, total_assets: 0 };
        this.assets = Array.isArray(this.manifest.assets) ? this.manifest.assets : [];
        this.byType = new Map();
        for (const asset of this.assets) {
            if (!this.byType.has(asset.type)) this.byType.set(asset.type, []);
            this.byType.get(asset.type).push(asset);
        }
    }

    listTypes() {
        return [...this.byType.keys()].sort();
    }

    list(type = null) {
        return type ? [...(this.byType.get(type) ?? [])] : [...this.assets];
    }

    resolvePath(asset) {
        if (!asset?.field_index_path) return null;
        const absolutePath = path.join(this.projectDirectory, "assets", asset.field_index_path);
        return {
            ...asset,
            absolutePath,
            exists: fs.existsSync(absolutePath)
        };
    }

    find(type, lookup) {
        const keys = candidateKeys(lookup);
        const candidates = this.byType.get(type) ?? [];
        const exact = candidates.find(asset => {
            const name = assetBasenameWithoutExtension(asset);
            const normalized = normalizeLookupText(name.replace(/_/g, " "));
            const slug = slugify(name.replace(/_/g, " "));
            return keys.has(normalized) || keys.has(slug);
        });
        return exact ? this.resolvePath(exact) : null;
    }

    getTeamAssets(team) {
        const names = [
            team?.teamName,
            team?.schoolName,
            team?.abbreviation,
            team?.assetName
        ].filter(Boolean);

        const findAny = type => {
            for (const name of names) {
                const match = this.find(type, name);
                if (match) return match;
            }
            return null;
        };

        return {
            icon: findAny("team_icon"),
            helmet: findAny("team_helmet"),
            jersey: findAny("team_jersey"),
            coachPolo: findAny("coach_polo")
        };
    }


    getCoachAssets(coach) {
        const portraitNames = [
            coach?.appearance?.GenericHeadAssetName,
            coach?.appearance?.AssetName,
            coach?.identity?.assetName,
            coach?.genericHeadAssetName,
            coach?.assetName
        ].filter(Boolean);
        const teamNames = [coach?.teamName, coach?.team?.teamName, coach?.team?.schoolName].filter(Boolean);

        const findAny = (type, values) => {
            for (const value of values) {
                const match = this.find(type, value);
                if (match) return match;
            }
            return null;
        };

        return {
            portrait: findAny("coach_portrait", portraitNames),
            polo: findAny("coach_polo", teamNames)
        };
    }

    getAwardAssets(award) {
        const names = [
            typeof award === "string" ? award : null,
            award?.awardType,
            award?.name,
            award?.displayName
        ].filter(Boolean);
        for (const name of names) {
            const trophy = this.find("award_trophy", name);
            if (trophy) return { trophy };
        }
        return { trophy: null };
    }

    getBowlAssets(bowl) {
        const names = [
            typeof bowl === "string" ? bowl : null,
            bowl?.bowlName,
            bowl?.name,
            bowl?.displayName
        ].filter(Boolean);
        const findAny = type => {
            for (const name of names) {
                const match = this.find(type, name);
                if (match) return match;
            }
            return null;
        };
        return { branding: findAny("bowl_branding"), trophy: findAny("bowl_trophy") };
    }

    getConferenceChampionshipAssets(conference) {
        const names = [
            typeof conference === "string" ? conference : null,
            conference?.conferenceName,
            conference?.name,
            conference?.conferenceEnum
        ].filter(Boolean)
            .flatMap(name => [name, `${name} Championship`]);
        const findAny = type => {
            for (const name of names) {
                const match = this.find(type, name);
                if (match) return match;
            }
            return null;
        };
        return {
            branding: findAny("conference_championship_branding"),
            trophy: findAny("conference_championship_trophy")
        };
    }

    getPlayoffAsset(stage) {
        const aliases = {
            first: ["round 1", "round_1", "first round"],
            quarterfinal: ["qtr final", "qtr_final", "quarter final", "quarterfinal"],
            semifinal: ["semi game", "semi_game", "semifinal"],
            championship: ["national championship", "national_championship"]
        };
        const normalized = normalizeLookupText(stage);
        const candidates = Object.entries(aliases).find(([key, values]) =>
            normalizeLookupText(key) === normalized || values.some(value => normalizeLookupText(value) === normalized)
        )?.[1] ?? [stage];
        for (const candidate of candidates) {
            const match = this.find("playoff_branding", candidate);
            if (match) return match;
        }
        return null;
    }

    getSummary() {
        return {
            manifestPath: this.manifestPath,
            format: this.manifest.format,
            version: this.manifest.version,
            totalAssets: this.assets.length,
            counts: this.manifest.counts ?? {}
        };
    }
}
