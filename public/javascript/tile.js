
let worldSize;
let worldPixelSize;
let worldTilesLength;
let tierAmount;
let grassTextureAmount;
let sproutStageAmount;
let tileTypeIds;
let startTileChar;

let foregroundTiles;
let backgroundTiles;
let lastTileChangeId = null;
let hasLoadedTiles = false;
let tileChanges = [];

// Map from tile type ID to Tile.
const typeIdTileMap = new Map();
let emptyTile;
const grassTiles = [];
const blockTiles = [];
const sproutTiles = [];
const flowerTiles = [];
let playerTiles = [];
let localPlayerTile = null;
let localPlayerUsername;
let localPlayerFlip = false;

class Tile {
    // Concrete subclasses of Tile must implement these methods:
    // isForeground
    
    constructor(typeId) {
        this.typeId = typeId;
        this.sprite = null;
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
    
    constructor(typeId, pos) {
        super(typeId);
        this.pos = pos;
    }
}

class PlayerTile extends EntityTile {
    
    constructor(data) {
        const pos = createPosFromJson(data.pos);
        super(tileTypeIds.empty, pos);
        this.username = data.username;
        this.level = data.level;
        if (this.username === localPlayerUsername) {
            localPlayerTile = this;
            this.flip = localPlayerFlip;
        } else {
            this.flip = data.flip;
        }
        this.updateSprite();
        setTile(true, this.pos, this, false);
        playerTiles.push(this);
    }
    
    updateSprite() {
        this.sprite = this.flip ? playerSprites[1] : playerSprites[0];
    }
    
    redraw() {
        this.updateSprite();
        drawTile(this.pos);
    }
    
    drawName() {
        context.font = "28px Arial";
        context.textAlign = "center";
        context.textBaseline = "bottom";
        context.fillStyle = "#000000";
        context.fillText(
            `${this.username} L${this.level}`,
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
        if (nextTile.playerCanWalkOn()) {
            setTile(true, this.pos, emptyTile, false);
            this.pos.set(nextPos);
            setTile(true, this.pos, this, false);
            return true;
        } else {
            return false;
        }
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

const setTile = (isForeground, pos, tile, recordChange = true) => {
    const index = getTileIndex(pos);
    const tiles = getTiles(isForeground);
    if (recordChange) {
        const lastTile = tiles[index];
        new TileChange(isForeground, pos.copy(), lastTile.typeId);
    }
    tiles[index] = tile;
    drawTile(pos);
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

const convertTypeIdToTile = (typeId) => typeIdTileMap.get(typeId);

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
        tiles1[index] = tile;
        tiles2[index] = emptyTile;
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


