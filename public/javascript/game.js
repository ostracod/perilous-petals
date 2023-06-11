
const pixelScale = 6;
const scaledSpriteSize = spriteSize * pixelScale;

let worldSize;
let worldPixelSize;
let worldTilesLength;
let tierAmount;
let grassTextureAmount;
let tileTypeIds;
let startTileChar;

let bufferCanvas;
let bufferContext;
let bufferCanvasHasChanged = false;
let localPlayerUsername;
let foregroundTiles;
let backgroundTiles;
let lastWorldChangeId = null;
let hasLoadedTiles = false;
const grassTiles = [];
const blockTiles = [];
let playerTiles = [];
let localPlayerTile = null;
const walkOffset = new Pos(0, 0);
let walkDelay = 0;
let isFirstStep = false;
let firstStepDelay = 0;

class Tile {
    // Concrete subclasses of Tile must implement these methods:
    // isForeground, getSprite
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
    
    getSprite() {
        return null;
    }
}

const emptyTile = new EmptyTile();

class GrassTile extends BackgroundTile {
    
    constructor(texture) {
        super();
        this.texture = texture;
    }
    
    getSprite() {
        return grassSprite;
    }
}

class BlockTile extends ForegroundTile {
    
    constructor(tier) {
        super();
        this.tier = tier;
    }
    
    getSprite() {
        return blockSprite;
    }
}

class PlayerTile extends ForegroundTile {
    
    constructor(username, pos) {
        super();
        this.username = username;
        this.pos = pos;
        setForegroundTile(this.pos, this);
        playerTiles.push(this);
        if (this.username === localPlayerUsername) {
            localPlayerTile = this;
        }
    }
    
    getSprite() {
        return playerSprite;
    }
    
    walk(offset) {
        const nextPos = this.pos.copy();
        nextPos.add(offset);
        if (!posIsInWorld(nextPos)) {
            return false;
        }
        const nextTile = getForegroundTile(nextPos);
        if (nextTile instanceof EmptyTile) {
            setForegroundTile(this.pos, emptyTile);
            this.pos.set(nextPos);
            setForegroundTile(this.pos, this);
            return true;
        } else {
            return false;
        }
    }
}

const initializeTiles = () => {
    while (grassTiles.length < grassTextureAmount) {
        const tile = new GrassTile(grassTiles.length);
        grassTiles.push(tile);
    }
    while (blockTiles.length < tierAmount) {
        const tile = new BlockTile(blockTiles.length);
        blockTiles.push(tile);
    }
};

const posIsInWorld = (pos) => (
    pos.x >= 0 && pos.x < worldSize && pos.y >= 0 && pos.y < worldSize
);

const getTileIndex = (pos) => pos.x + pos.y * worldSize;

const getForegroundTile = (pos) => {
    const index = getTileIndex(pos);
    return foregroundTiles[index];
};

const setForegroundTile = (pos, tile) => {
    const index = getTileIndex(pos);
    foregroundTiles[index] = tile;
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
    const tile = getForegroundTile(pos);
    if (tile instanceof BlockTile) {
        setForegroundTile(pos, emptyTile);
        gameUpdateCommandList.push({
            commandName: "removeTile",
            pos: pos.copy().toJson(),
        });
    } else if (tile instanceof EmptyTile) {
        setForegroundTile(pos, blockTiles[0]);
        gameUpdateCommandList.push({
            commandName: "placeTile",
            pos: pos.copy().toJson(),
        });
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

const convertTypeIdToTile = (typeId) => {
    if (typeId === tileTypeIds.empty) {
        return emptyTile;
    }
    if (typeId >= tileTypeIds.grass && typeId < tileTypeIds.grass + grassTextureAmount) {
        return grassTiles[typeId - tileTypeIds.grass];
    }
    if (typeId >= tileTypeIds.block && typeId < tileTypeIds.block + tierAmount) {
        return blockTiles[typeId - tileTypeIds.block];
    }
    throw new Error(`Cannot convert type ID ${typeId} to a tile.`);
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
        tiles1[index] = tile;
        tiles2[index] = emptyTile;
        drawTile(pos);
    });
};

const drawTile = (pos) => {
    const index = getTileIndex(pos);
    const foregroundTile = foregroundTiles[index];
    let sprite = foregroundTile.getSprite();
    if (sprite === null) {
        const backgroundTile = backgroundTiles[index];
        sprite = backgroundTile.getSprite();
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

addCommandListener("setState", (command) => {
    const tileChars = command.worldTiles;
    if (typeof tileChars === "undefined") {
        for (const playerTile of playerTiles) {
            setForegroundTile(playerTile.pos, emptyTile);
        }
    } else {
        setWorldTiles(tileChars);
        hasLoadedTiles = true;
    }
    playerTiles = [];
    localPlayerTile = null;
    for (const playerData of command.players) {
        const pos = createPosFromJson(playerData.pos);
        new PlayerTile(playerData.username, pos);
    }
    lastWorldChangeId = command.lastWorldChangeId;
});

addCommandRepeater("walk", (command) => {
    localPlayerTile.walk(command.offset);
});

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
        tileTypeIds = data.tileTypeIds;
        startTileChar = data.startTileChar;
        worldPixelSize = worldSize * spriteSize;
        worldTilesLength = worldSize ** 2;
        foregroundTiles = Array(worldTilesLength).fill(null);
        backgroundTiles = Array(worldTilesLength).fill(null);
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
            initializeTiles();
            initializeSpriteSheet(done);
        });
    }
    
    setLocalPlayerInfo(command) {
        localPlayerUsername = command.username;
    }
    
    addCommandsBeforeUpdateRequest() {
        gameUpdateCommandList.push({
            commandName: "getState",
            lastWorldChangeId,
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


