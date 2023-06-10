
import express from "express";
import { ostracodMultiplayer } from "ostracod-multiplayer";
import { projectPath, worldSize, tierAmount, grassTextureAmount, tileTypeIds, startTileChar } from "./constants.js";
import { gameDelegate } from "./gameDelegate.js";

const router = express.Router();

router.get("/gameConstants", (req, res, next) => {
    res.json({
        worldSize,
        tierAmount,
        grassTextureAmount,
        tileTypeIds,
        startTileChar,
    });
});

console.log("Starting Perilous Petals server...");
const result = ostracodMultiplayer.initializeServer(projectPath, gameDelegate, [router]);
if (!result) {
    process.exit(1);
}


