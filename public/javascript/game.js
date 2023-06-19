
const flowerNames = [
    "Rose",
    "Lily",
    "Marigold",
    "Carnation",
    "Hydrangea",
    "Iris",
    "Petunia",
    "Daisy",
    
    "Poppy",
    "Calendula",
    "Daffodil",
    "Chrysanthemum",
    "Brunnera",
    "Lupine",
    "Lilac",
    "Hyacinth",
    
    "Alstroemeria",
    "Montbretia",
    "Zinnia",
    "Dahlia",
    "Lobelia",
    "Salvia",
    "Fuchsia",
    "Artemisia",
];

const buildItems = [];
let selectedBuildItem = null;
const hotbar = Array(10).fill(null);
// Map from name to PlayerStat.
const statMap = new Map();

const walkOffset = new Pos(0, 0);
let walkDelay = 0;
let isFirstStep = false;
let firstStepDelay = 0;

class BuildItem {
    // Concrete subclasses of BuildItem must implement these methods:
    // getDisplayName, getSprite, getTile, getCommandName, getCommandFields,
    // spriteIsWhite, matchesCommandHelper
    
    constructor(minLevel) {
        this.minLevel = minLevel;
        buildItems.push(this);
    }
    
    updateBorderStyle() {
        const color = (selectedBuildItem === this) ? "000000" : "FFFFFF";
        this.tag.style.border = `2px #${color} solid`;
    }
    
    updateVisibility() {
        const level = getLocalPlayerLevel();
        this.tag.style.display = (level === null || level < this.minLevel) ? "none" : "";
    }
    
    createTag() {
        this.tag = document.createElement("div");
        const sprite = this.getSprite();
        if (sprite !== null) {
            const color = this.spriteIsWhite() ? new Color(192, 192, 192) : null;
            const spriteCanvas = createCanvasWithSprite(this.tag, sprite, 6, color);
            spriteCanvas.style.marginRight = 8;
        }
        const divTag = document.createElement("div");
        divTag.style.display = "inline-block";
        if (sprite !== null) {
            divTag.style.verticalAlign = 9;
        }
        this.hotbarTag = document.createElement("span");
        divTag.appendChild(this.hotbarTag);
        const spanTag = document.createElement("span");
        spanTag.innerHTML = this.getDisplayName();
        divTag.appendChild(spanTag);
        this.updateBorderStyle();
        this.updateVisibility();
        this.tag.style.padding = "3px";
        this.tag.style.cursor = "pointer";
        this.tag.onclick = () => {
            this.select();
        };
        this.tag.onmousedown = () => false;
        this.tag.appendChild(divTag)
        document.getElementById("buildItemsContainer").appendChild(this.tag);
    }
    
    select() {
        if (selectedBuildItem !== null) {
            selectedBuildItem.unselect();
        }
        selectedBuildItem = this;
        this.updateBorderStyle();
        this.tag.scrollIntoView({ block: "nearest" });
    }
    
    unselect() {
        if (selectedBuildItem === this) {
            selectedBuildItem = null;
            this.updateBorderStyle();
        }
    }
    
    setHotbarText(index) {
        const text = (index === null) ? "" : `(${index}) `;
        this.hotbarTag.innerHTML = text;
    }
    
    getBaseCommand() {
        return {
            commandName: this.getCommandName(),
            ...this.getCommandFields(),
        }
    }
    
    sendCommand(offset) {
        gameUpdateCommandList.push({
            ...this.getBaseCommand(),
            offset: offset.toJson(),
        });
    }
    
    matchesCommand(command) {
        if (command.commandName !== this.getCommandName()) {
            return false;
        }
        return this.matchesCommandHelper(command);
    }
}

class SproutBuildItem extends BuildItem {
    
    constructor(isPoisonous, tier = null) {
        super((tier === null) ? 1 : Math.max(tier + 1, 2));
        this.isPoisonous = isPoisonous;
        this.tier = tier;
    }
    
    getDisplayName() {
        let output = ((this.tier === null) ? "Flower" : flowerNames[this.tier]) + " Seed";
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
    
    matchesCommandHelper(command) {
        return (command.isPoisonous === this.isPoisonous && command.tier === this.tier);
    }
}

class BlockBuildItem extends BuildItem {
    
    constructor(tier) {
        super(tier + 1);
        this.tier = tier;
        this.tile = blockTiles[this.tier];
    }
    
    getDisplayName() {
        return flowerNames[this.tier] + " Block";
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
    
    matchesCommandHelper(command) {
        return (command.tier === this.tier);
    }
}

class PlayerStat {
    
    constructor(name, displayName) {
        this.name = name;
        this.displayName = displayName;
        this.count = 0;
        this.tag = document.createElement("p");
        this.tag.style.display = "none";
        const nameTag = document.createElement("span");
        nameTag.innerHTML = displayName + ": ";
        this.tag.appendChild(nameTag);
        this.countTag = document.createElement("span");
        this.tag.appendChild(this.countTag);
        document.getElementById("statsContainer").appendChild(this.tag);
        statMap.set(this.name, this);
    }
    
    setCount(count) {
        this.count = count;
        this.countTag.innerHTML = this.count;
        this.tag.style.display = "";
    }
}

const pluralize = (count, noun) => {
    let output = count + " " + noun;
    if (count !== 1) {
        output += "s";
    }
    return output;
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

const initializeStats = () => {
    new PlayerStat("blocksPlaced", "Blocks placed");
};

const updateBuildItemsVisibility = () => {
    for (const buildItem of buildItems) {
        buildItem.updateVisibility();
    }
};

const getBuildItemByCommand = (command) => {
    const matchingItem = buildItems.find((buildItem) => buildItem.matchesCommand(command));
    return (typeof matchingItem === "undefined") ? null : matchingItem;
};

const setHotbarItem = (index, buildItem, shouldToggle = false) => {
    const lastItem = hotbar[index];
    if (lastItem !== null) {
        lastItem.setHotbarText(null);
    }
    if (lastItem === buildItem && shouldToggle) {
        hotbar[index] = null;
    } else {
        if (buildItem !== null) {
            for (let tempIndex = 0; tempIndex < hotbar.length; tempIndex++) {
                const tempItem = hotbar[tempIndex];
                if (tempItem === buildItem) {
                    hotbar[tempIndex] = null;
                }
            }
            buildItem.setHotbarText(index);
        }
        hotbar[index] = buildItem;
    }
};

const setHotbar = (hotbarText) => {
    const dataList = JSON.parse(hotbarText);
    for (let index = 0; index < dataList.length; index++) {
        const data = dataList[index];
        const buildItem = (data === null) ? null : getBuildItemByCommand(data);
        setHotbarItem(index, buildItem);
    }
};

const selectHotbarItem = (index) => {
    const buildItem = hotbar[index];
    if (buildItem !== null) {
        buildItem.select();
    }
};

const sendHotbarCommand = () => {
    const hotbarData = hotbar.map((buildItem) => (
        (buildItem === null) ? null : buildItem.getBaseCommand()
    ));
    gameUpdateCommandList.push({
        commandName: "setHotbar",
        hotbar: hotbarData,
    });
}

const handleWorldChanges = (worldChanges) => {
    for (let index = tileChanges.length - 1; index >= 0; index--) {
        const change = tileChanges[index];
        change.undo();
    }
    tileChanges = [];
    for (const change of worldChanges) {
        if (change.type === "tile") {
            const pos = createPosFromJson(change.pos);
            const tile = convertTypeIdToTile(change.tileTypeId);
            setTile(change.isForeground, pos, tile, false);
        } else if (change.type = "emote") {
            new Emote(change.username, change.emotion);
        } else {
            throw new Error(`Unrecognized world change type "${changeType}".`);
        }
    }
};

const setLocalPlayerFlip = (offset) => {
    if (offset.x === 0) {
        return;
    }
    localPlayerFlip = (offset.x < 0);
    localPlayerTile.flip = localPlayerFlip;
    localPlayerTile.redraw();
};

const tryWalk = () => {
    setLocalPlayerFlip(walkOffset);
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
    setLocalPlayerFlip(offset);
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
        const buildItem = getBuildItemByCommand(command);
        const tile = buildItem.getTile();
        setTile(true, pos, tile);
    }
};

const handleStatChange = (name, count) => {
    const stat = statMap.get(name);
    if (typeof stat !== "undefined") {
        stat.setCount(count);
    }
};

addCommandListener("setState", (command) => {
    const tileChars = command.worldTiles;
    if (typeof tileChars === "undefined") {
        for (const playerTile of playerTileMap.values()) {
            setTile(true, playerTile.pos, emptyTile, false);
        }
    } else {
        setWorldTiles(tileChars);
        hasLoadedTiles = true;
        tileChanges = [];
    }
    const { worldChanges, stats } = command;
    if (typeof worldChanges !== "undefined") {
        handleWorldChanges(worldChanges);
    }
    lastWorldChangeId = command.lastWorldChangeId;
    const lastLevel = getLocalPlayerLevel();
    playerTileMap = new Map();
    localPlayerTile = null;
    for (const playerData of command.players) {
        new PlayerTile(playerData);
    }
    if (getLocalPlayerLevel() !== lastLevel) {
        updateBuildItemsVisibility();
    }
    if (typeof stats !== "undefined") {
        for (const name in stats) {
            handleStatChange(name, stats[name]);
        }
    }
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
        levelPointAmounts = data.levelPointAmounts;
        playerEmotions = data.playerEmotions;
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
                initializeStats();
                done();
            });
        });
    }
    
    setLocalPlayerInfo(command) {
        localPlayerUsername = command.username;
        const hotbarText = command.extraFields.hotbar;
        if (hotbarText !== null) {
            setHotbar(hotbarText);
        }
    }
    
    addCommandsBeforeUpdateRequest() {
        gameUpdateCommandList.push({
            commandName: "getState",
            lastWorldChangeId,
            flip: localPlayerFlip,
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
        const emotes = Array.from(usernameEmoteMap.values());
        for (const emote of emotes) {
            emote.timerEvent();
        }
        if (bufferCanvasHasChanged) {
            context.imageSmoothingEnabled = false;
            context.drawImage(bufferCanvas, 0, 0, canvasWidth, canvasHeight);
            bufferCanvasHasChanged = false;
            for (const playerTile of playerTileMap.values()) {
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
        if (keyCode >= 48 && keyCode <= 57) {
            const index = keyCode - 48;
            if (shiftKeyIsHeld) {
                setHotbarItem(index, selectedBuildItem, true);
                sendHotbarCommand();
            } else {
                selectHotbarItem(index);
            }
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


