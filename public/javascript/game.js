
const pixelScale = 6;
const scaledSpriteSize = spriteSize * pixelScale;

let worldSize;
let worldPixelSize;
let worldTilesLength;
let tierAmount;
let grassTextureAmount;
let sproutStageAmount;
let tileTypeIds;
let startTileChar;

let bufferCanvas;
let bufferContext;
let bufferCanvasHasChanged = false;

let foregroundTiles;
let backgroundTiles;
let lastTileChangeId = null;
let hasLoadedTiles = false;
let tileChanges = [];

let sproutSprites = [];
let flowerSprites = [];
let playerSprite;

// Map from tile type ID to Tile;
const typeIdTileMap = new Map();
let emptyTile;
const grassTiles = [];
const blockTiles = [];
const sproutTiles = [];
const flowerTiles = [];

const buildItems = [];
let selectedBuildItem = null;

let localPlayerUsername;
let playerTiles = [];
let localPlayerTile = null;
const walkOffset = new Pos(0, 0);
let walkDelay = 0;
let isFirstStep = false;
let firstStepDelay = 0;

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
}

class GrassTile extends BackgroundTile {
    
    constructor(texture) {
        super(tileTypeIds.grass + texture);
        this.texture = texture;
        this.sprite = new Sprite(grassSpriteSet, this.texture);
    }
}

class BlockTile extends ForegroundTile {
    
    constructor(tier) {
        super(tileTypeIds.block + tier);
        this.tier = tier;
        this.sprite = new Sprite(blockSpriteSet, this.tier);
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
    
    constructor(username, pos) {
        super(tileTypeIds.empty, pos);
        this.username = username;
        this.sprite = playerSprite;
        setTile(true, this.pos, this, false);
        playerTiles.push(this);
        if (this.username === localPlayerUsername) {
            localPlayerTile = this;
        }
    }
    
    walk(offset) {
        const nextPos = this.pos.copy();
        nextPos.add(offset);
        if (!posIsInWorld(nextPos)) {
            return false;
        }
        const nextTile = getTile(true, nextPos);
        if (nextTile instanceof EmptyTile) {
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

class BuildItem {
    // Concrete subclasses of BuildItem must implement these methods:
    // getDisplayName, getSprite, getTile, getCommandName, getCommandFields
    
    constructor() {
        this.index = buildItems.length;
        buildItems.push(this);
    }
    
    updateBorderStyle() {
        const color = (selectedBuildItem === this) ? "000000" : "FFFFFF";
        this.tag.style.border = `2px #${color} solid`;
    }
    
    createTag() {
        this.tag = document.createElement("div");
        const sprite = this.getSprite();
        if (sprite !== null) {
            const spriteCanvas = createCanvasWithSprite(this.tag, sprite, 6);
            spriteCanvas.style.marginRight = 8;
        }
        const spanTag = document.createElement("span");
        spanTag.innerHTML = this.getDisplayName();
        if (sprite !== null) {
            spanTag.style.verticalAlign = 6;
        }
        this.tag.appendChild(spanTag);
        this.updateBorderStyle();
        this.tag.style.padding = "5px";
        this.tag.style.cursor = "pointer";
        this.tag.onclick = () => {
            this.select();
        };
        this.tag.onmousedown = () => false;
        document.getElementById("buildItemsContainer").appendChild(this.tag);
    }
    
    select() {
        if (selectedBuildItem !== null) {
            selectedBuildItem.unselect();
        }
        selectedBuildItem = this;
        this.updateBorderStyle();
    }
    
    unselect() {
        if (selectedBuildItem === this) {
            selectedBuildItem = null;
            this.updateBorderStyle();
        }
    }
    
    sendCommand(offset) {
        gameUpdateCommandList.push({
            commandName: this.getCommandName(),
            offset: offset.toJson(),
            ...this.getCommandFields(),
            buildItemIndex: this.index,
        });
    }
}

class SproutBuildItem extends BuildItem {
    
    constructor(isPoisonous, tier = null) {
        super();
        this.isPoisonous = isPoisonous;
        this.tier = tier;
    }
    
    getDisplayName() {
        let output = ((this.tier === null) ? "Flower" : this.tier) + " Seed";
        if (this.isPoisonous) {
            output = "Poison " + output;
        }
        return output;
    }
    
    getSprite() {
        return sproutSprites[2];
    }
    
    getTile() {
        return sproutTiles[0];
    }
    
    getCommandName() {
        return "placeSprout";
    }
    
    getCommandFields() {
        return {
            isPoisonous: this.isPoisonous,
            tier: this.tier,
        };
    }
}

class BlockBuildItem extends BuildItem {
    
    constructor(tier) {
        super();
        this.tier = tier;
        this.tile = blockTiles[this.tier];
    }
    
    getDisplayName() {
        return "Block " + this.tier;
    }
    
    getSprite() {
        return this.tile.sprite;
    }
    
    getTile() {
        return this.tile;
    }
    
    getCommandName() {
        return "placeBlock";
    }
    
    getCommandFields() {
        return { tier: this.tier };
    }
}

const initializeSprites = () => {
    playerSprite = new Sprite(playerSpriteSet, 0, false);
    for (const spriteSet of sproutSpriteSets) {
        sproutSprites.push(new Sprite(spriteSet, 0));
    }
    const flowerSpriteSet = flowerSpriteSets[0];
    flowerSprites.push(new Sprite(flowerSpriteSet, 0));
    flowerSprites.push(new Sprite(flowerSpriteSet, 1));
};

const initializeTiles = () => {
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

const initializeBuildItems = () => {
    new BlockBuildItem(0);
    new BlockBuildItem(1);
    new SproutBuildItem(false);
    new SproutBuildItem(true);
    new SproutBuildItem(true, 0);
    new SproutBuildItem(true, 1);
    for (const buildItem of buildItems) {
        buildItem.createTag();
    }
    buildItems[0].select();
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

const tryWalk = () => {
    if ((walkOffset.x === 0 && walkOffset.y === 0)
            || localPlayerTile === null || walkDelay > 0) {
        return;
    }
    const hasWalked = localPlayerTile.walk(walkOffset);
    if (!hasWalked) {
        return;
    }
    if (isFirstStep) {
        firstStepDelay = 9;
        isFirstStep = false;
    }
    gameUpdateCommandList.push({
        commandName: "walk",
        offset: walkOffset.copy().toJson(),
    });
    walkDelay = 3;
};

const startWalk = (offset) => {
    if (offset.equals(walkOffset)) {
        return;
    }
    isFirstStep = true;
    firstStepDelay = 0;
    walkOffset.set(offset);
    tryWalk();
};

const buildInDirection = (offset) => {
    const pos = localPlayerTile.pos.copy();
    pos.add(offset);
    if (!posIsInWorld(pos)) {
        return;
    }
    const lastTile = getTile(true, pos);
    if (lastTile.playerCanRemove()) {
        setTile(true, pos, emptyTile);
        gameUpdateCommandList.push({
            commandName: "removeTile",
            offset: offset.toJson(),
        });
    } else if (lastTile instanceof EmptyTile) {
        const tile = selectedBuildItem.getTile();
        setTile(true, pos, tile);
        selectedBuildItem.sendCommand(offset);
    }
};

const actInDirection = (offset) => {
    if (shiftKeyIsHeld) {
        buildInDirection(offset);
    } else {
        startWalk(offset);
    }
};

const stopWalk = (offset) => {
    if (walkOffset.equals(offset)) {
        walkOffset.x = 0;
        walkOffset.y = 0;
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
    if (sprite === null) {
        bufferContext.fillStyle = backgroundColorString;
        bufferContext.fillRect(
            pos.x * spriteSize,
            pos.y * spriteSize,
            spriteSize,
            spriteSize,
        );
    } else {
        sprite.draw(bufferContext, 1, pos);
    }
    bufferCanvasHasChanged = true;
};

const repeatBuildItem = (command) => {
    const pos = localPlayerTile.pos.copy();
    const offset = createPosFromJson(command.offset);
    pos.add(offset);
    if (!posIsInWorld(pos)) {
        return;
    }
    const lastTile = getTile(true, pos);
    if (lastTile instanceof EmptyTile) {
        const buildItem = buildItems[command.buildItemIndex];
        const tile = buildItem.getTile();
        setTile(true, pos, tile);
    }
};

addCommandListener("setState", (command) => {
    const tileChars = command.worldTiles;
    if (typeof tileChars === "undefined") {
        for (const playerTile of playerTiles) {
            setTile(true, playerTile.pos, emptyTile, false);
        }
    } else {
        setWorldTiles(tileChars);
        hasLoadedTiles = true;
        tileChanges = [];
    }
    const serverChanges = command.tileChanges;
    if (typeof serverChanges !== "undefined") {
        for (let index = tileChanges.length - 1; index >= 0; index--) {
            const change = tileChanges[index];
            change.undo();
        }
        tileChanges = [];
        for (const change of serverChanges) {
            const pos = createPosFromJson(change.pos);
            const tile = convertTypeIdToTile(change.typeId);
            setTile(change.isForeground, pos, tile, false);
        }
    }
    playerTiles = [];
    localPlayerTile = null;
    for (const playerData of command.players) {
        const pos = createPosFromJson(playerData.pos);
        new PlayerTile(playerData.username, pos);
    }
    lastTileChangeId = command.lastTileChangeId;
});

addCommandRepeater("walk", (command) => {
    localPlayerTile.walk(command.offset);
});

addCommandRepeater("removeTile", (command) => {
    const pos = localPlayerTile.pos.copy();
    const offset = createPosFromJson(command.offset);
    pos.add(offset);
    if (!posIsInWorld(pos)) {
        return;
    }
    const lastTile = getTile(true, pos);
    if (lastTile.playerCanRemove()) {
        setTile(true, pos, emptyTile);
    }
});

addCommandRepeater("placeBlock", repeatBuildItem);
addCommandRepeater("placeSprout", repeatBuildItem);

class ConstantsRequest extends AjaxRequest {
    
    constructor(callback) {
        super("gameConstants", {}, null);
        this.callback = callback;
    }
    
    respond(data) {
        super.respond(data);
        worldSize = data.worldSize;
        tierAmount = data.tierAmount;
        grassTextureAmount = data.grassTextureAmount;
        sproutStageAmount = data.sproutStageAmount;
        tileTypeIds = data.tileTypeIds;
        startTileChar = data.startTileChar;
        worldPixelSize = worldSize * spriteSize;
        worldTilesLength = worldSize ** 2;
        foregroundTiles = Array(worldTilesLength).fill(null);
        backgroundTiles = Array(worldTilesLength).fill(null);
        for (let stage = 0; stage < sproutStageAmount; stage += 1) {
            sproutSpriteSets.push(new SpriteSet(8 + stage, [dummyPalette1], false));
        }
        this.callback();
    }
}

class ClientDelegate {
    
    constructor() {
        // Do nothing.
    }
    
    initialize(done) {
        new ConstantsRequest(() => {
            bufferCanvas = document.createElement("canvas");
            bufferCanvas.width = worldPixelSize;
            bufferCanvas.height = worldPixelSize;
            bufferContext = bufferCanvas.getContext("2d");
            initializeSpriteSheet(() => {
                initializeSprites();
                initializeTiles();
                initializeBuildItems();
                done();
            });
        });
    }
    
    setLocalPlayerInfo(command) {
        localPlayerUsername = command.username;
    }
    
    addCommandsBeforeUpdateRequest() {
        gameUpdateCommandList.push({
            commandName: "getState",
            lastTileChangeId,
        });
    }
    
    timerEvent() {
        if (!hasLoadedTiles) {
            return;
        }
        walkDelay -= 1;
        firstStepDelay -= 1;
        if (firstStepDelay <= 0) {
            tryWalk();
        }
        if (bufferCanvasHasChanged) {
            context.imageSmoothingEnabled = false;
            context.drawImage(bufferCanvas, 0, 0, canvasWidth, canvasHeight);
            bufferCanvasHasChanged = false;
        }
    }
    
    keyDownEvent(keyCode) {
        if (!hasLoadedTiles || focusedTextInput !== null) {
            return true;
        }
        if (keyCode === 65 || keyCode === 37) {
            actInDirection(new Pos(-1, 0));
        }
        if (keyCode === 68 || keyCode === 39) {
            actInDirection(new Pos(1, 0));
        }
        if (keyCode === 87 || keyCode === 38) {
            actInDirection(new Pos(0, -1));
        }
        if (keyCode === 83 || keyCode === 40) {
            actInDirection(new Pos(0, 1));
        }
        return (keyCode !== 38 && keyCode !== 40);
    }
    
    keyUpEvent(keyCode) {
        if (!hasLoadedTiles) {
            return true;
        }
        if (keyCode === 65 || keyCode === 37) {
            stopWalk(new Pos(-1, 0));
        }
        if (keyCode === 68 || keyCode === 39) {
            stopWalk(new Pos(1, 0));
        }
        if (keyCode === 87 || keyCode === 38) {
            stopWalk(new Pos(0, -1));
        }
        if (keyCode === 83 || keyCode === 40) {
            stopWalk(new Pos(0, 1));
        }
        return true;
    }
}

clientDelegate = new ClientDelegate();


