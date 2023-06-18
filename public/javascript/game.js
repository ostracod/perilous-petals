
const buildItems = [];
let selectedBuildItem = null;

const walkOffset = new Pos(0, 0);
let walkDelay = 0;
let isFirstStep = false;
let firstStepDelay = 0;

class BuildItem {
    // Concrete subclasses of BuildItem must implement these methods:
    // getDisplayName, getSprite, getTile, getCommandName, getCommandFields, spriteIsWhite
    
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
            const color = this.spriteIsWhite() ? new Color(192, 192, 192) : null;
            const spriteCanvas = createCanvasWithSprite(this.tag, sprite, 6, color);
            spriteCanvas.style.marginRight = 8;
        }
        const spanTag = document.createElement("span");
        spanTag.innerHTML = this.getDisplayName();
        if (sprite !== null) {
            spanTag.style.verticalAlign = 9;
        }
        this.tag.appendChild(spanTag);
        this.updateBorderStyle();
        this.tag.style.padding = "2px";
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
        return (this.tier === null) ? sproutSprites[2] : flowerSprites[this.tier];
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
    
    spriteIsWhite() {
        return (this.tier === 7);
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
    
    spriteIsWhite() {
        return (this.tier === 7);
    }
}

const initializeBuildItems = () => {
    new SproutBuildItem(false);
    new SproutBuildItem(true);
    for (let tier = 0; tier < tierAmount; tier++) {
        new SproutBuildItem(true, tier);
    }
    for (let tier = 0; tier < tierAmount; tier++) {
        new BlockBuildItem(tier);
    }
    for (const buildItem of buildItems) {
        buildItem.createTag();
    }
    buildItems[0].select();
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
        new PlayerTile(playerData.username, playerData.level, pos);
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
        this.callback();
    }
}

class ClientDelegate {
    
    constructor() {
        // Do nothing.
    }
    
    initialize(done) {
        new ConstantsRequest(() => {
            initializeSpriteSets();
            initializeSpriteSheet(() => {
                initializeSprites();
                initializeBufferCanvas();
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
            for (const playerTile of playerTiles) {
                playerTile.drawName();
            }
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


