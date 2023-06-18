
import { gameUtils } from "ostracod-multiplayer";
import { createPosFromJson } from "./pos.js";
import { blockTiles, playerTileMap, PlayerTile, initWorldTiles, writeWorldTiles, encodeWorldTiles, getWorldChanges, getLastWorldChangeId, tilesTimerEvent } from "./tile.js";

initWorldTiles();

gameUtils.addCommandListener("getState", true, (command, player, outputCommands) => {
    const playerTile = playerTileMap.get(player.username);
    playerTile.flip = command.flip;
    const playerTiles = Array.from(playerTileMap.values());
    const outputCommand = {
        commandName: "setState",
        players: playerTiles.map((tile) => tile.toClientJson()),
        lastWorldChangeId: getLastWorldChangeId(),
    };
    const changeId = command.lastWorldChangeId;
    let changesToSend;
    if (changeId === null) {
        changesToSend = null;
    } else {
        changesToSend = getWorldChanges(changeId + 1);
    }
    if (changesToSend === null) {
        outputCommand.worldTiles = encodeWorldTiles();
    } else {
        outputCommand.worldChanges = changesToSend.map((change) => change.toJson());
    }
    outputCommands.push(outputCommand);
});

gameUtils.addCommandListener("walk", true, (command, player, outputCommands) => {
    const playerTile = playerTileMap.get(player.username);
    playerTile.walk(command.offset);
});

gameUtils.addCommandListener("placeBlock", true, (command, player, outputCommands) => {
    const playerTile = playerTileMap.get(player.username);
    const offset = createPosFromJson(command.offset);
    playerTile.buildTile(offset, () => blockTiles[command.tier]);
});

gameUtils.addCommandListener("placeSprout", true, (command, player, outputCommands) => {
    const playerTile = playerTileMap.get(player.username);
    const offset = createPosFromJson(command.offset);
    playerTile.buildTile(offset, () => (
        playerTile.createSproutTile(command.isPoisonous, command.tier)
    ));
});

gameUtils.addCommandListener("removeTile", true, (command, player, outputCommands) => {
    const playerTile = playerTileMap.get(player.username);
    const offset = createPosFromJson(command.offset);
    playerTile.removeTile(offset);
});

class GameDelegate {
    
    constructor() {
        // Do nothing.
    }
    
    playerEnterEvent(player) {
        if (player.extraFields.level === null) {
            player.extraFields.level = 1;
        }
        const playerTile = new PlayerTile(player);
        playerTile.addToWorld();
    }
    
    playerLeaveEvent(player) {
        const playerTile = playerTileMap.get(player.username);
        playerTile.deleteFromWorld();
    }
    
    async persistEvent() {
        writeWorldTiles();
        for (let playerTile of playerTileMap.values()) {
            playerTile.persistEvent();
        }
    }
}

export const gameDelegate = new GameDelegate();

setInterval(tilesTimerEvent, 100);


