
import * as fs from "fs";
import * as crypto from "crypto";
import { worldTilesPath, worldSize, worldTilesLength, tierAmount, grassTextureAmount, sproutStageAmount, tileTypeIds, startTileChar, levelPointAmounts, flowerPointAmounts, sproutBuildCost, sproutRemovalPenalty, poisonFlowerPenalty, playerEmotions } from "./constants.js";
import * as commonUtils from "./commonUtils.js";
import { Pos } from "./pos.js";

const maxWalkBudget = 30;

const foregroundTiles = Array(worldTilesLength).fill(null);
const backgroundTiles = Array(worldTilesLength).fill(null);
// This is a circular buffer.
const worldChanges = Array(1000).fill(null);
let lastWorldChangeId = 0;
let lastWorldChangeIndex = 0;
export const entityTileSet = new Set();
// Map from player key to PlayerTile.
export const playerTileMap = new Map();
let emptyForegroundTileCount = 0;
let grassTileCount = 0;
let centerBlockCount = 0;

class Tile {
    // Concrete subclasses of Tile must implement these methods:
    // toDbJson
    
    constructor(typeId) {
        this.typeId = typeId;
    }
    
    addEvent(isForeground, pos) {
        if (isForeground && this.killsGrass() && getTile(false, pos) instanceof GrassTile) {
            setTile(false, pos, emptyTile);
        }
    }
    
    moveEvent(pos) {
        // Do nothing.
    }
    
    deleteEvent(isForeground, pos) {
        // Do nothing.
    }
    
    playerCanWalkOn() {
        return false;
    }
    
    playerBuildEvent(playerTile) {
        // Do nothing.
    }
    
    playerCanRemove() {
        return false;
    }
    
    playerRemoveEvent(playerTile) {
        // Do nothing.
    }
    
    killsGrass() {
        return false;
    }
}

export class EmptyTile extends Tile {
    
    constructor() {
        super(tileTypeIds.empty);
    }
    
    addEvent(isForeground, pos) {
        super.addEvent(isForeground, pos);
        if (isForeground) {
            emptyForegroundTileCount += 1;
        }
    }
    
    deleteEvent(isForeground, pos) {
        super.deleteEvent(isForeground, pos);
        if (isForeground) {
            emptyForegroundTileCount -= 1;
        }
    }
    
    playerCanWalkOn() {
        return true;
    }
    
    toDbJson() {
        return null;
    }
}

const emptyTile = new EmptyTile();

export class GrassTile extends Tile {
    
    constructor(texture) {
        super(tileTypeIds.grass + texture);
        this.texture = texture;
    }
    
    addEvent(isForeground, pos) {
        super.addEvent(isForeground, pos);
        grassTileCount += 1;
    }
    
    deleteEvent(isForeground, pos) {
        super.deleteEvent(isForeground, pos);
        grassTileCount -= 1;
    }
    
    toDbJson() {
        return { type: "grass", texture: this.texture };
    }
}

const grassTiles = [];
while (grassTiles.length < grassTextureAmount) {
    const tile = new GrassTile(grassTiles.length);
    grassTiles.push(tile);
}

export class BlockTile extends Tile {
    
    constructor(tier) {
        super(tileTypeIds.block + tier);
        this.tier = tier;
    }
    
    addEvent(isForeground, pos) {
        super.addEvent(isForeground, pos);
        if (!isWorldEdgePos(pos)) {
            centerBlockCount += 1;
        }
    }
    
    deleteEvent(isForeground, pos) {
        super.deleteEvent(isForeground, pos);
        if (!isWorldEdgePos(pos)) {
            centerBlockCount -= 1;
        }
    }
    
    playerCanRemove() {
        return true;
    }
    
    killsGrass() {
        return true;
    }
    
    playerBuildEvent(playerTile) {
        super.playerBuildEvent(playerTile);
        playerTile.incrementStat("blocksPlaced");
    }
    
    playerRemoveEvent(playerTile) {
        super.playerRemoveEvent(playerTile);
        playerTile.incrementStat("blocksRemoved");
    }
    
    toDbJson() {
        return { type: "block", tier: this.tier };
    }
}

export const blockTiles = [];
while (blockTiles.length < tierAmount) {
    const tile = new BlockTile(blockTiles.length);
    blockTiles.push(tile);
}

// EntityTiles may only exist in foregroundTiles.
class EntityTile extends Tile {
    
    constructor(typeId) {
        super(typeId);
        this.pos = null;
    }
    
    // EntityTiles should only change their type ID with this method.
    setTypeId(typeId) {
        if (typeId !== this.typeId) {
            this.typeId = typeId;
            new TileChange(true, this.pos.copy(), this.typeId);
        }
    }
    
    addEvent(isForeground, pos) {
        super.addEvent(isForeground, pos);
        this.pos = pos.copy();
        entityTileSet.add(this);
    }
    
    deleteEvent(isForeground, pos) {
        super.deleteEvent(isForeground, pos);
        entityTileSet.delete(this);
    }
    
    moveEvent(pos) {
        super.moveEvent(pos);
        this.pos.set(pos);
    }
    
    timerEvent() {
        // Do nothing.
    }
    
    deleteFromWorld() {
        setTile(true, this.pos, emptyTile);
    }
}

export class PlayerTile extends EntityTile {
    // Concrete subclasses of PlayerTile must implement these methods:
    // getInitPos, getLevel, getScore, increaseScore, decreaseScore, incrementStat
    
    constructor(key, displayName) {
        super(tileTypeIds.empty);
        this.key = key;
        this.displayName = displayName;
        this.flip = false;
    }
    
    addEvent(isForeground, pos) {
        super.addEvent(isForeground, pos);
        playerTileMap.set(this.key, this);
    }
    
    deleteEvent(isForeground, pos) {
        super.deleteEvent(isForeground, pos);
        playerTileMap.delete(this.key);
    }
    
    addToWorld() {
        const pos = this.getInitPos();
        for (let count = 0; count < 400; count++) {
            const tile = getTile(true, pos);
            if (tile instanceof EmptyTile) {
                break;
            }
            if (count > 200 && tile.playerCanRemove()) {
                break;
            }
            pos.x = Math.floor(Math.random() * worldSize);
            pos.y = Math.floor(Math.random() * worldSize);
        }
        setTile(true, pos, this);
    }
    
    walk(offset) {
        const nextPos = this.pos.copy();
        nextPos.add(offset);
        if (!posIsInWorld(nextPos)) {
            return false;
        }
        const nextTile = getTile(true, nextPos);
        if (!nextTile.playerCanWalkOn()) {
            return false;
        }
        if (nextTile.playerCanRemove()) {
            this.removeTile(offset);
        }
        swapForegroundTiles(this.pos, nextPos);
        return true;
    }
    
    emote(emotion) {
        new EmoteChange(this.key, emotion);
    }
    
    valueIsValidTier(value) {
        return (commonUtils.isValidInt(value) && value >= 0 && value < this.getLevel());
    }
    
    createSproutTile(isPoisonous, tier) {
        if (tier === null) {
            const intArray = new Uint32Array(1);
            crypto.getRandomValues(intArray)
            const randomInt = intArray[0];
            let mask = 1;
            for (tier = 0; tier < tierAmount - 1; tier++) {
                if (randomInt & mask) {
                    break;
                }
                mask <<= 1;
            }
            tier = Math.min(tier, this.getLevel() - 1);
        }
        return new FlowerTile({
            creatorKey: this.key,
            isPoisonous,
            tier,
            age: 0,
            growthDelay: 50 + Math.floor(50 * Math.random()),
        });
    }
    
    buildTile(offset, getBuildTile) {
        const pos = this.pos.copy();
        pos.add(offset);
        if (!posIsInWorld(pos)) {
            return;
        }
        const lastTile = getTile(true, pos);
        if (lastTile instanceof EmptyTile) {
            const tile = getBuildTile();
            setTile(true, pos, tile);
            tile.playerBuildEvent(this);
        }
    }
    
    buildBlockTile(offset, tier) {
        this.buildTile(offset, () => blockTiles[tier]);
    }
    
    buildSproutTile(offset, isPoisonous, tier) {
        this.buildTile(offset, () => this.createSproutTile(isPoisonous, tier));
    }
    
    removeTile(offset) {
        const pos = this.pos.copy();
        pos.add(offset);
        if (!posIsInWorld(pos)) {
            return;
        }
        const lastTile = getTile(true, pos);
        if (lastTile.playerCanRemove()) {
            lastTile.playerRemoveEvent(this);
            setTile(true, pos, emptyTile);
        }
    }
    
    poisonEvent(creatorKey) {
        // Do nothing.
    }
    
    flowerRemovedEvent(flowerTile, playerTile) {
        // Do nothing.
    }
    
    persistEvent() {
        // Do nothing.
    }
    
    toDbJson() {
        return emptyTile.toDbJson();
    }
    
    toClientJson() {
        return {
            key: this.key,
            displayName: this.displayName,
            level: this.getLevel(),
            score: this.getScore(),
            pos: this.pos.toJson(),
            flip: this.flip,
        }
    }
}

export class HumanPlayerTile extends PlayerTile {
    
    constructor(player) {
        const { username } = player;
        super(getHumanPlayerKey(username), username);
        this.player = player;
        this.walkBudget = maxWalkBudget;
        const statsText = this.player.extraFields.stats;
        if (statsText === null) {
            this.stats = {};
        } else {
            this.stats = JSON.parse(statsText);
        }
        this.changedStats = null;
        this.clearStatChanges();
    }
    
    timerEvent() {
        super.timerEvent();
        if (this.walkBudget < maxWalkBudget) {
            this.walkBudget += 1;
        }
    }
    
    getInitPos() {
        const { posX, posY } = this.player.extraFields;
        return new Pos(posX ?? 3, posY ?? 3);
    }
    
    walk(offset) {
        if (this.walkBudget < 0) {
            return;
        }
        super.walk(offset);
        this.walkBudget -= 1.5;
    }
    
    getLevel() {
        return this.player.extraFields.level;
    }
    
    getScore() {
        return this.player.score;
    }
    
    increaseScore(amount) {
        this.player.score += amount;
        const { extraFields } = this.player;
        while (extraFields.level < levelPointAmounts.length) {
            const scoreThreshold = levelPointAmounts[extraFields.level];
            if (typeof scoreThreshold === "undefined"
                    || this.player.score < scoreThreshold) {
                break;
            }
            extraFields.level += 1;
        }
    }
    
    decreaseScore(amount) {
        const { score } = this.player;
        if (amount > score) {
            amount = score;
        }
        this.player.score = score - amount;
        return amount;
    }
    
    incrementStat(name) {
        if (!(name in this.stats)) {
            this.stats[name] = 0;
        }
        this.stats[name] += 1;
        this.changedStats.add(name);
    }
    
    clearStatChanges() {
        this.changedStats = new Set();
    }
    
    persistEvent() {
        super.persistEvent();
        this.player.extraFields.posX = this.pos.x;
        this.player.extraFields.posY = this.pos.y;
        this.player.extraFields.stats = JSON.stringify(this.stats);
    }
}

export class FlowerTile extends EntityTile {
    
    constructor(data) {
        super(tileTypeIds.sprout);
        this.creatorKey = data.creatorKey;
        this.isPoisonous = data.isPoisonous;
        this.tier = data.tier;
        this.age = data.age;
        this.growthDelay = data.growthDelay;
        this.maxAge = this.growthDelay * sproutStageAmount + 600;
    }
    
    getStage() {
        return Math.min(Math.floor(this.age / this.growthDelay), sproutStageAmount);
    }
    
    isSprout() {
        return flowerStageIsSprout(this.getStage());
    }
    
    timerEvent() {
        super.timerEvent();
        this.age += 1;
        if (this.age > this.maxAge) {
            const creatorTile = this.getCreatorTile();
            if (creatorTile !== null) {
                const statName = this.isPoisonous ? "poisonWithered" : "regularWithered";
                creatorTile.incrementStat(statName);
            }
            this.deleteFromWorld();
            return;
        }
        const stage = this.getStage();
        let typeId;
        if (flowerStageIsSprout(stage)) {
            typeId = tileTypeIds.sprout + stage;
        } else {
            typeId = tileTypeIds.flower + this.tier;
        }
        this.setTypeId(typeId);
    }
    
    playerCanWalkOn() {
        return !this.isSprout();
    }
    
    playerBuildEvent(playerTile) {
        super.playerBuildEvent(playerTile);
        playerTile.decreaseScore(sproutBuildCost);
        const statName = this.isPoisonous ? "poisonPlanted" : "regularPlanted";
        playerTile.incrementStat(statName);
    }
    
    playerCanRemove() {
        return true;
    }
    
    getCreatorTile() {
        const playerTile = playerTileMap.get(this.creatorKey);
        return (typeof playerTile === "undefined") ? null : playerTile;
    }
    
    playerRemoveEvent(playerTile) {
        super.playerRemoveEvent(playerTile);
        const isCreator = (playerTile.key === this.creatorKey);
        const creatorTile = this.getCreatorTile();
        if (this.isSprout()) {
            playerTile.decreaseScore(sproutRemovalPenalty);
            playerTile.incrementStat("sproutsDestroyed");
            return;
        }
        if (creatorTile !== null) {
            creatorTile.flowerRemovedEvent(this, playerTile);
        }
        if (this.isPoisonous) {
            const pointAmount = playerTile.decreaseScore(poisonFlowerPenalty);
            playerTile.emote(playerEmotions.sad);
            if (isCreator) {
                playerTile.incrementStat("selfSabotaged");
            } else {
                playerTile.incrementStat("theySabotaged");
                if (creatorTile !== null) {
                    creatorTile.increaseScore(pointAmount);
                    creatorTile.incrementStat("youSabotaged");
                }
            }
            playerTile.poisonEvent(this.creatorKey);
        } else {
            const pointAmount = flowerPointAmounts[this.tier];
            playerTile.increaseScore(pointAmount);
            playerTile.incrementStat(`regular${this.tier}Picked`);
            playerTile.emote(playerEmotions.happy);
            if (!isCreator) {
                playerTile.incrementStat("youStole");
                if (creatorTile !== null) {
                    creatorTile.incrementStat("theyStole");
                }
            }
        }
    }
    
    killsGrass() {
        return true;
    }
    
    toDbJson() {
        return {
            type: "flower",
            creatorKey: this.creatorKey,
            isPoisonous: this.isPoisonous,
            tier: this.tier,
            age: this.age,
            growthDelay: this.growthDelay,
        };
    }
}

class WorldChange {
    // Concrete subclasses of WorldChange must implement these methods:
    // getTypeName, getJsonFields
    
    constructor() {
        lastWorldChangeId += 1;
        this.id = lastWorldChangeId;
        lastWorldChangeIndex = (lastWorldChangeIndex + 1) % worldChanges.length;
        worldChanges[lastWorldChangeIndex] = this;
    }
    
    toJson() {
        return {
            type: this.getTypeName(),
            ...this.getJsonFields(),
        };
    }
}

class TileChange extends WorldChange {
    
    constructor(isForeground, pos, tileTypeId) {
        super();
        this.isForeground = isForeground;
        this.pos = pos;
        this.tileTypeId = tileTypeId;
    }
    
    getTypeName() {
        return "tile";
    }
    
    getJsonFields() {
        return {
            isForeground: this.isForeground,
            pos: this.pos.toJson(),
            tileTypeId: this.tileTypeId,
        };
    }
}

class EmoteChange extends WorldChange {
    
    constructor(key, emotion) {
        super();
        this.key = key;
        this.emotion = emotion;
    }
    
    getTypeName() {
        return "emote";
    }
    
    getJsonFields() {
        return {
            key: this.key,
            emotion: this.emotion,
        };
    }
}

const convertJsonToTile = (data) => {
    if (data === null) {
        return emptyTile;
    }
    const { type } = data;
    if (type === "block") {
        return blockTiles[data.tier];
    } else if (type === "grass") {
        return grassTiles[data.texture];
    } else if (type === "flower") {
        return new FlowerTile(data);
    }
    throw new Error(`Unrecognized tile type "${type}".`);
};

export const posIsInWorld = (pos) => (
    pos.x >= 0 && pos.x < worldSize && pos.y >= 0 && pos.y < worldSize
);

export const getTileIndex = (pos) => pos.x + pos.y * worldSize;

const getTiles = (isForeground) => isForeground ? foregroundTiles : backgroundTiles;

export const getTile = (isForeground, pos) => {
    const index = getTileIndex(pos);
    return getTiles(isForeground)[index];
};

const setTile = (isForeground, pos, tile) => {
    const tiles = getTiles(isForeground);
    const index = getTileIndex(pos);
    const lastTile = tiles[index];
    let lastTypeId;
    if (lastTile === null) {
        lastTypeId = null;
    } else {
        lastTypeId = lastTile.typeId;
        lastTile.deleteEvent(isForeground, pos);
    }
    tiles[index] = tile;
    tile.addEvent(isForeground, pos);
    const { typeId } = tile;
    if (lastTypeId !== typeId) {
        new TileChange(isForeground, pos.copy(), typeId);
    }
};

const swapForegroundTiles = (pos1, pos2) => {
    const index1 = getTileIndex(pos1);
    const index2 = getTileIndex(pos2);
    const tile1 = foregroundTiles[index1];
    const tile2 = foregroundTiles[index2];
    const lastTypeId1 = tile1.typeId;
    const lastTypeId2 = tile2.typeId;
    foregroundTiles[index1] = tile2;
    foregroundTiles[index2] = tile1;
    tile1.moveEvent(pos2);
    tile2.moveEvent(pos1);
    const typeId1 = tile1.typeId;
    const typeId2 = tile1.typeId;
    if (lastTypeId1 !== typeId2) {
        new TileChange(isForeground, pos1.copy(), typeId2);
    }
    if (lastTypeId2 !== typeId1) {
        new TileChange(isForeground, pos2.copy(), typeId1);
    }
};

const iterateWorldPos = (handle) => {
    const pos = new Pos(0, 0);
    for (let index = 0; index < worldTilesLength; index++) {
        handle(pos, index);
        pos.x += 1;
        if (pos.x >= worldSize) {
            pos.x = 0;
            pos.y += 1;
        }
    }
};

const createWorldTiles = () => {
    iterateWorldPos((pos) => {
        setTile(true, pos, emptyTile);
        setTile(false, pos, emptyTile);
    });
};

const readWorldTiles = () => {
    const data = JSON.parse(fs.readFileSync(worldTilesPath));
    iterateWorldPos((pos, index) => {
        const foregroundTile = convertJsonToTile(data.foreground[index]);
        const backgroundTile = convertJsonToTile(data.background[index]);
        setTile(true, pos, foregroundTile);
        setTile(false, pos, backgroundTile);
    });
};

export const initWorldTiles = () => {
    if (fs.existsSync(worldTilesPath)) {
        readWorldTiles();
    } else {
        createWorldTiles();
    }
};

export const writeWorldTiles = () => {
    const data = {
        foreground: foregroundTiles.map((tile) => tile.toDbJson()),
        background: backgroundTiles.map((tile) => tile.toDbJson()),
    };
    fs.writeFileSync(worldTilesPath, JSON.stringify(data));
};

export const encodeWorldTiles = () => {
    const chars = [];
    for (let index = 0; index < worldTilesLength; index++) {
        let tile = foregroundTiles[index];
        if (tile instanceof EmptyTile) {
            tile = backgroundTiles[index];
        }
        const { typeId } = tile;
        chars.push(String.fromCharCode(typeId + startTileChar));
    }
    return chars.join("");
};

export const getWorldChanges = (startChangeId) => {
    if (lastWorldChangeId - startChangeId > worldChanges.length - 5) {
        return null;
    }
    const output = [];
    let index = lastWorldChangeIndex;
    while (true) {
        const worldChange = worldChanges[index];
        if (worldChange === null || worldChange.id < startChangeId) {
            break;
        }
        output.push(worldChange);
        index -= 1;
        if (index < 0) {
            index = worldChanges.length - 1;
        }
    }
    output.reverse();
    return output;
};

export const getLastWorldChangeId = () => lastWorldChangeId;

const flowerStageIsSprout = (stage) => (stage < sproutStageAmount);

const growGrass = () => {
    if (Math.random() > 0.02) {
        return;
    }
    const grassRatio = grassTileCount / emptyForegroundTileCount;
    if (grassRatio >= 30 / 676) {
        return;
    }
    const pos = new Pos(
        Math.floor(Math.random() * worldSize),
        Math.floor(Math.random() * worldSize),
    );
    if (getTile(true, pos) instanceof EmptyTile
            && getTile(false, pos) instanceof EmptyTile) {
        const texture = Math.floor(Math.random() * grassTiles.length);
        const grassTile = grassTiles[texture];
        setTile(false, pos, grassTile);
    }
};

export const tilesTimerEvent = () => {
    const entityTiles = Array.from(entityTileSet);
    for (const entityTile of entityTiles) {
        entityTile.timerEvent();
    }
    growGrass();
};

export const getHumanPlayerKey = (username) => "human," + username;

export const isWorldEdgePos = (pos) => (
    pos.x <= 0 || pos.x >= worldSize - 1 || pos.y <= 0 || pos.y >= worldSize - 1
);

export const getCenterBlockCount = () => centerBlockCount;


