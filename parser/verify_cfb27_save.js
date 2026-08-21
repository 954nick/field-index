// -------------------- ISOLATED CFB27 SAVE VERIFIER --------------------

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import Franchise from "madden-franchise";

const schemaDirectory = fileURLToPath(new URL("./schemas/", import.meta.url));

async function verifySave(savePath) {
    const franchise = await Franchise.create(savePath, { schemaDirectory });
    const verification = {
        loaded: franchise.gameType === "college" && franchise.gameYear === 27,
        gameType: franchise.gameType,
        gameYear: franchise.gameYear,
        schema: franchise.schema.meta
    };
    if (!verification.loaded) throw new Error(`Edited save failed round-trip validation: ${savePath}`);
    return verification;
}

async function main() {
    const [savePath, outputPath] = process.argv.slice(2);
    if (!savePath || !outputPath) {
        throw new Error("Usage: node verify_cfb27_save.js <save> <output-json>");
    }
    const verification = await verifySave(path.resolve(savePath));
    fs.writeFileSync(path.resolve(outputPath), `${JSON.stringify(verification, null, 2)}\n`, "utf8");
    console.log(`VERIFIED: ${path.resolve(savePath)}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
    main().catch(error => {
        console.error(`CFB27 verification failed: ${error.message}`);
        process.exit(1);
    });
}

export { verifySave };
