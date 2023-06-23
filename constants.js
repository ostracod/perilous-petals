
import * as pathUtils from "path";
import { fileURLToPath } from "url";

export const projectPath = pathUtils.dirname(fileURLToPath(import.meta.url));
export const worldTilesPath = pathUtils.join(projectPath, "worldTiles.json");

export const worldSize = 26;
export const worldTilesLength = worldSize ** 2;
export const tierAmount = 24;
export const grassTextureAmount = 3;
export const sproutStageAmount = 3;

const grassTypeId = 1;
const blockTypeId = grassTypeId + grassTextureAmount;
const sproutTypeId = blockTypeId + tierAmount;
const flowerTypeId = sproutTypeId + sproutStageAmount;
export const tileTypeIds = {
    empty: 0,
    grass: grassTypeId,
    block: blockTypeId,
    sprout: sproutTypeId,
    flower: flowerTypeId,
};
export const startTileChar = 35;

export const flowerPointAmounts = [3, 5, 8, 14, 25, 44, 78, 140, 260, 510, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000, 2000000, 4000000, 8000000];
export const levelPointAmounts = [0, 30, 80, 170, 340, 650, 1200, 2200, 4000, 7250, 13200, 24000, 43800, 80000, 146000, 265000, 480000, 870000, 1590000, 2900000, 5300000, 9600000, 17400000];
export const sproutBuildCost = 1;
export const sproutRemovalPenalty = 1;
export const poisonFlowerPenalty = 20;

export const playerEmotions = {
    neutral: 0,
    happy: 1,
    sad: 2,
};

export const clientConstants = {
    worldSize,
    tierAmount,
    grassTextureAmount,
    sproutStageAmount,
    tileTypeIds,
    startTileChar,
    levelPointAmounts,
    playerEmotions,
};


