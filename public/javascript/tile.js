
let worldSize;
let worldPixelSize;
let worldTilesLength;
let tierAmount;
let grassTextureAmount;
let sproutStageAmount;
let tileTypeIds;
let startTileChar;
let levelPointAmounts;
let playerEmotions;
let sproutBuildCost;
let sproutRemovalPenalty;

let foregroundTiles;
let backgroundTiles;
let lastWorldChangeId = null;
let hasLoadedTiles = false;
let tileChanges = [];
let generatorDelay = 0;

// Map from tile type ID to Tile.
const typeIdTileMap = new Map();
let emptyTile;
const grassTiles = [];
const blockTiles = [];
const sproutTiles = [];
const flowerTiles = [];

// Map from player key to PlayerTile.
let playerTileMap = new Map();
let localPlayerTile = null;
let localPlayerKey;
let localPlayerFlip = false;
// Map from player key to Emote.
const playerEmoteMap = new Map();
const generatorSet = new Set();

class Tile {
    // Concrete subclasses of Tile must implement these methods:
    // isForeground
    
    constructor(typeId) {
        this.typeId = typeId;
        this.sprite = null;
    }
    
    addEvent(pos) {
        // Do nothing.
    }
    
    moveEvent(pos) {
        // Do nothing.
    }
    
    deleteEvent() {
        // Do nothing.
    }
    
    playerCanRemove() {
        return false;
    }
    
    playerCanWalkOn() {
        return false;
    }
}

class ForegroundTile extends Tile {
    
    isForeground() {
        return true;
    }
}

class BackgroundTile extends Tile {
    
    isForeground() {
        return false;
    }
}

class EmptyTile extends BackgroundTile {
    
    constructor() {
        super(tileTypeIds.empty);
    }
    
    playerCanWalkOn() {
        return true;
    }
}

class GrassTile extends BackgroundTile {
    
    constructor(texture) {
        super(tileTypeIds.grass + texture);
        this.texture = texture;
        this.sprite = new Sprite(grassSpriteSets[this.texture]);
    }
}

class BlockTile extends ForegroundTile {
    
    constructor(tier) {
        super(tileTypeIds.block + tier);
        this.tier = tier;
        const spriteSet = blockSpriteSets[Math.floor(this.tier / flowerColorsPerVariation)];
        const paletteIndex = this.tier % flowerColorsPerVariation;
        this.sprite = new Sprite(spriteSet, paletteIndex);
    }
    
    playerCanRemove() {
        return true;
    }
}

class SproutTile extends ForegroundTile {
    
    constructor(stage) {
        super(tileTypeIds.sprout + stage);
        this.stage = stage;
        this.sprite = sproutSprites[this.stage];
    }
    
    playerCanRemove() {
        return true;
    }
}

class FlowerTile extends ForegroundTile {
    
    constructor(tier) {
        super(tileTypeIds.flower + tier);
        this.tier = tier;
        this.sprite = flowerSprites[this.tier];
    }
    
    playerCanWalkOn() {
        return true;
    }
    
    playerCanRemove() {
        return true;
    }
}

class EntityTile extends ForegroundTile {
    // Concrete subclasses of EntityTile must implement these methods:
    // updateSprite
    
    constructor(typeId) {
        super(typeId);
        this.pos = null;
    }
    
    addEvent(pos) {
        super.addEvent(pos);
        this.pos = pos.copy();
    }
    
    moveEvent(pos) {
        super.moveEvent(pos);
        this.pos.set(pos);
    }
    
    swapToPos(pos) {
        swapForegroundTiles(this.pos.copy(), pos);
    }
    
    redraw() {
        const lastSprite = this.sprite;
        this.updateSprite();
        if (this.sprite !== lastSprite) {
            drawTile(this.pos);
        }
    }
}

class GeneratorTile extends EntityTile {
    
    constructor() {
        super(tileTypeIds.generator);
        this.updateSprite();
    }
    
    updateSprite() {
        const index = Math.floor(generatorDelay / 5) % 2;
        this.sprite = generatorSprites[index];
    }
    
    addEvent(pos) {
        super.addEvent(pos);
        generatorSet.add(this);
    }
    
    deleteEvent() {
        super.deleteEvent();
        generatorSet.delete(this);
    }
}

class PlayerTile extends EntityTile {
    
    constructor(data) {
        super(tileTypeIds.empty);
        this.key = data.key;
        this.displayName = data.displayName;
        this.level = data.level;
        this.score = data.score;
        if (this.key === localPlayerKey) {
            localPlayerTile = this;
            this.flip = localPlayerFlip;
            document.getElementById("level").innerHTML = this.level;
            document.getElementById("score").innerHTML = pluralize(this.score, "point");
            let nextLevelText;
            if (this.level >= levelPointAmounts.length) {
                nextLevelText = "(None)";
            } else {
                const pointAmount = levelPointAmounts[this.level];
                nextLevelText = pluralize(pointAmount, "point");
            }
            document.getElementById("nextLevelScore").innerHTML = nextLevelText;
        } else {
            this.flip = data.flip;
        }
        this.isStunned = data.isStunned;
        this.poisonStunDelay = data.poisonStunDelay;
        this.updateSprite();
        const pos = createPosFromJson(data.pos);
        setTile(true, pos, this);
        playerTileMap.set(this.key, this);
    }
    
    updateSprite() {
        let emotion;
        if (this.poisonStunDelay > 0) {
            emotion = playerEmotions.sad;
        } else {
            const emote = playerEmoteMap.get(this.key);
            if (typeof emote === "undefined") {
                emotion = playerEmotions.neutral;
            } else {
                emotion = emote.emotion;
            }
        }
        this.sprite = playerSprites[emotion * 2 + (this.flip ? 1 : 0)];
    }
    
    drawName() {
        context.font = "28px Arial";
        context.textAlign = "center";
        context.textBaseline = "bottom";
        context.fillStyle = "#000000";
        context.fillText(
            `${this.displayName} L${this.level}`,
            Math.round((this.pos.x + 1 / 2) * scaledSpriteSize),
            Math.round((this.pos.y - 1 / 4) * scaledSpriteSize),
        );
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
        if (!(nextTile instanceof EmptyTile)) {
            setTile(true, nextPos, emptyTile);
        }
        this.swapToPos(nextPos);
        return true;
    }
}

class TileChange {
    
    constructor(isForeground, pos, lastTypeId) {
        this.isForeground = isForeground;
        this.pos = pos;
        this.lastTypeId = lastTypeId;
        tileChanges.push(this);
    }
    
    undo() {
        const tile = convertTypeIdToTile(this.lastTypeId);
        setTile(this.isForeground, this.pos, tile, false);
    }
}

class Emote {
    
    constructor(key, emotion) {
        this.key = key;
        this.emotion = emotion;
        this.age = 0;
        playerEmoteMap.set(this.key, this);
        this.redrawPlayer();
    }
    
    redrawPlayer() {
        const playerTile = playerTileMap.get(this.key);
        if (typeof playerTile !== "undefined") {
            playerTile.redraw();
        }
    }
    
    timerEvent() {
        this.age += 1;
        if (this.age > 15) {
            playerEmoteMap.delete(this.key);
            this.redrawPlayer();
        }
    }
}

const initializeTiles = () => {
    foregroundTiles = Array(worldTilesLength).fill(null);
    backgroundTiles = Array(worldTilesLength).fill(null);
    emptyTile = new EmptyTile();
    typeIdTileMap.set(tileTypeIds.empty, emptyTile);
    for (let texture = 0; texture < grassTextureAmount; texture++) {
        const tile = new GrassTile(texture);
        typeIdTileMap.set(tile.typeId, tile);
        grassTiles.push(tile);
    }
    for (let tier = 0; tier < tierAmount; tier++) {
        const tile = new BlockTile(tier);
        typeIdTileMap.set(tile.typeId, tile);
        blockTiles.push(tile);
    }
    for (let stage = 0; stage < sproutStageAmount; stage++) {
        const tile = new SproutTile(stage);
        typeIdTileMap.set(tile.typeId, tile);
        sproutTiles.push(tile)
    }
    for (let tier = 0; tier < tierAmount; tier++) {
        const tile = new FlowerTile(tier);
        typeIdTileMap.set(tile.typeId, tile);
        flowerTiles.push(tile);
    }
};

const posIsInWorld = (pos) => (
    pos.x >= 0 && pos.x < worldSize && pos.y >= 0 && pos.y < worldSize
);

const getTileIndex = (pos) => pos.x + pos.y * worldSize;

const getTiles = (isForeground) => isForeground ? foregroundTiles : backgroundTiles;

const getTile = (isForeground, pos) => {
    const index = getTileIndex(pos);
    return getTiles(isForeground)[index];
};

const setTileHelper = (tiles, pos, index, tile) => {
    const lastTile = tiles[index];
    if (lastTile !== null) {
        lastTile.deleteEvent();
    }
    tiles[index] = tile;
    tile.addEvent(pos);
};

const setTile = (isForeground, pos, tile, recordChange = true) => {
    const index = getTileIndex(pos);
    const tiles = getTiles(isForeground);
    if (recordChange) {
        const lastTypeId = tiles[index].typeId;
        if (lastTypeId !== tile.typeId) {
            new TileChange(isForeground, pos.copy(), lastTypeId);
        }
    }
    setTileHelper(tiles, pos, index, tile);
    drawTile(pos);
};

const swapForegroundTiles = (pos1, pos2) => {
    const index1 = getTileIndex(pos1);
    const index2 = getTileIndex(pos2);
    const tile1 = foregroundTiles[index1];
    const tile2 = foregroundTiles[index2];
    const typeId1 = tile1.typeId;
    const typeId2 = tile2.typeId;
    foregroundTiles[index1] = tile2;
    foregroundTiles[index2] = tile1;
    tile1.moveEvent(pos2);
    tile2.moveEvent(pos1);
    if (typeId1 !== typeId2) {
        new TileChange(true, pos1.copy(), typeId1);
        new TileChange(true, pos2.copy(), typeId2);
    }
    drawTile(pos1);
    drawTile(pos2);
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

const convertTypeIdToTile = (typeId) => {
    if (typeId === tileTypeIds.generator) {
        return new GeneratorTile();
    } else {
        return typeIdTileMap.get(typeId);
    }
};

const setWorldTiles = (tileChars) => {
    iterateWorldPos((pos, index) => {
        const charCode = tileChars.charCodeAt(index);
        const tile = convertTypeIdToTile(charCode - startTileChar);
        let tiles1;
        let tiles2;
        if (tile.isForeground()) {
            tiles1 = foregroundTiles;
            tiles2 = backgroundTiles;
        } else {
            tiles1 = backgroundTiles;
            tiles2 = foregroundTiles;
        }
        setTileHelper(tiles1, pos, index, tile);
        setTileHelper(tiles2, pos, index, emptyTile);
        drawTile(pos);
    });
};

const drawTile = (pos) => {
    const index = getTileIndex(pos);
    const foregroundTile = foregroundTiles[index];
    let sprite = foregroundTile.sprite;
    if (sprite === null) {
        const backgroundTile = backgroundTiles[index];
        sprite = backgroundTile.sprite;
    }
    if (sprite === null || sprite.hasBackground) {
        bufferContext.fillStyle = backgroundColorString;
        bufferContext.fillRect(
            pos.x * spriteSize,
            pos.y * spriteSize,
            spriteSize,
            spriteSize,
        );
    }
    if (sprite !== null) {
        sprite.draw(bufferContext, 1, pos);
    }
    bufferCanvasHasChanged = true;
};

const getLocalPlayerLevel = () => (localPlayerTile === null) ? null : localPlayerTile.level;

const getLocalPlayerScore = () => (localPlayerTile === null) ? null : localPlayerTile.score;


