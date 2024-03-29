
import { gameUtils } from "ostracod-multiplayer";
import * as commonUtils from "./commonUtils.js";
import { readClientOffset } from "./pos.js";
import { playerTileMap, HumanPlayerTile, initWorldTiles, writeWorldTiles, encodeWorldTiles, getWorldChanges, getLastWorldChangeId, tilesTimerEvent, getHumanPlayerKey } from "./tile.js";
import { addBotToWorld, checkWorldBot } from "./botPlayer.js";

const getHumanPlayerTile = (player) => {
    const key = getHumanPlayerKey(player.username);
    return playerTileMap.get(key);
};

const readOffsetCommand = (command, player) => {
    const playerTile = getHumanPlayerTile(player);
    const offset = readClientOffset(command.offset);
    if (typeof playerTile === "undefined" || offset === null) {
        return { offset: null, playerTile: null };
    }
    return { offset, playerTile };
};

initWorldTiles();
addBotToWorld();

gameUtils.addCommandListener("getState", true, (command, player, outputCommands) => {
    const playerTile = getHumanPlayerTile(player);
    const { flip, lastWorldChangeId: changeId } = command;
    if (typeof playerTile === "undefined" || typeof flip !== "boolean"
            || !commonUtils.isValidInt(changeId, true)) {
        return;
    }
    playerTile.flip = flip;
    const playerTiles = Array.from(playerTileMap.values());
    const outputCommand = {
        commandName: "setState",
        players: playerTiles.map((tile) => tile.toClientJson()),
        lastWorldChangeId: getLastWorldChangeId(),
    };
    const changesToSend = (changeId === null) ? null : getWorldChanges(changeId + 1);
    if (changesToSend === null) {
        outputCommand.worldTiles = encodeWorldTiles();
    } else {
        outputCommand.worldChanges = changesToSend.map((change) => change.toJson());
    }
    if (changeId === null) {
        outputCommand.stats = playerTile.stats;
        playerTile.clearStatChanges();
    } else if (playerTile.changedStats.size > 0) {
        const stats = {};
        for (const name of playerTile.changedStats) {
            stats[name] = playerTile.stats[name];
        }
        outputCommand.stats = stats;
        playerTile.clearStatChanges();
    }
    outputCommands.push(outputCommand);
});

gameUtils.addCommandListener("walk", true, (command, player, outputCommands) => {
    const { offset, playerTile } = readOffsetCommand(command, player);
    if (offset !== null) {
        playerTile.walk(offset);
    }
});

gameUtils.addCommandListener("placeBlock", true, (command, player, outputCommands) => {
    const { offset, playerTile } = readOffsetCommand(command, player);
    const { tier } = command;
    if (offset !== null && playerTile.valueIsValidTier(tier)) {
        playerTile.buildBlockTile(offset, tier);
    }
});

gameUtils.addCommandListener("placeSprout", true, (command, player, outputCommands) => {
    const { offset, playerTile } = readOffsetCommand(command, player);
    const { isPoisonous, tier } = command;
    if (offset !== null && typeof isPoisonous === "boolean"
            && (tier === null || (playerTile.valueIsValidTier(tier) && isPoisonous))) {
        playerTile.buildSproutTile(offset, isPoisonous, tier);
    }
});

gameUtils.addCommandListener("removeTile", true, (command, player, outputCommands) => {
    const { offset, playerTile } = readOffsetCommand(command, player);
    if (offset !== null) {
        playerTile.removeTile(offset);
    }
});

gameUtils.addCommandListener("setHotbar", true, (command, player, outputCommands) => {
    player.extraFields.hotbar = JSON.stringify(command.hotbar);
});

class GameDelegate {
    
    constructor() {
        // Do nothing.
    }
    
    playerEnterEvent(player) {
        let playerTile = getHumanPlayerTile(player);
        if (typeof playerTile !== "undefined") {
            return;
        }
        if (player.extraFields.level === null) {
            player.extraFields.level = 1;
        }
        playerTile = new HumanPlayerTile(player);
        playerTile.addToWorld();
    }
    
    playerLeaveEvent(player) {
        const playerTile = getHumanPlayerTile(player);
        if (typeof playerTile !== "undefined") {
            playerTile.deleteFromWorld();
        }
    }
    
    async persistEvent() {
        writeWorldTiles();
        for (const playerTile of playerTileMap.values()) {
            playerTile.persistEvent();
        }
    }
}

const timerEvent = () => {
    tilesTimerEvent();
    checkWorldBot();
};

export const gameDelegate = new GameDelegate();

setInterval(timerEvent, 100);


