
import Heap from "heap";
import { worldTilesLength } from "./constants.js";
import { Pos } from "./pos.js";
import { entityTileSet, posIsInWorld, getTileIndex, getTile, EmptyTile, BlockTile, FlowerTile, PlayerTile } from "./tile.js";

const nodeNeighborOffsets = [
    new Pos(-1, 0), new Pos(1, 0),
    new Pos(0, -1), new Pos(0, 1),
];

let nextBotId = 0;

class TileNode {
    
    constructor(pos, previousNode = null, pathCost = null) {
        this.pos = pos;
        this.previousNode = previousNode;
        this.pathCost = pathCost;
        this.visited = false;
    }
    
    addToGrid(nodeGrid) {
        const index = getTileIndex(this.pos);
        nodeGrid[index] = this;
    }
    
    createWalkPath() {
        const posList = [];
        let node = this;
        while (node !== null) {
            posList.push(node.pos);
            node = node.previousNode;
        }
        posList.reverse();
        return new WalkPath(posList);
    }
}

class PathStep {
    
    constructor(pos) {
        this.pos = pos;
        const tile = getTile(true, this.pos);
        this.wasEmpty = (tile instanceof EmptyTile);
    }
}

class WalkPath {
    
    constructor(posList) {
        this.steps = posList.map((pos) => new PathStep(pos));
        this.index = 0;
    }
    
    isFinished(pos) {
        const lastStep = this.steps.at(-1);
        return pos.equals(lastStep.pos);
    }
    
    getWalkOffset(pos) {
        let step = this.steps[this.index];
        if (this.index < this.steps.length - 1 && pos.equals(step.pos)) {
            this.index += 1;
            step = this.steps[this.index]
        }
        if (pos.x > step.pos.x) {
            return new Pos(-1, 0);
        }
        if (pos.x < step.pos.x) {
            return new Pos(1, 0);
        }
        if (pos.y > step.pos.y) {
            return new Pos(0, -1);
        }
        if (pos.y < step.pos.y) {
            return new Pos(0, 1);
        }
        return null;
    }
}

export class BotPlayerTile extends PlayerTile {
    
    constructor(displayName) {
        const id = nextBotId;
        nextBotId += 1;
        super("bot," + id, displayName);
        this.actDelay = 0;
        this.walkPath = null;
    }
    
    timerEvent() {
        this.actDelay += 1;
        if (this.actDelay > 3) {
            if (this.walkPath !== null && this.walkPath.isFinished(this.pos)) {
                this.walkPath = null;
            }
            if (this.walkPath === null) {
                const { nodeGrid, visitedNodes } = this.scanTiles((tile) => (
                    (tile instanceof BlockTile) ? null : 1
                ));
                for (const entity of entityTileSet) {
                    if (!(entity instanceof FlowerTile) || entity.isSprout()) {
                        continue;
                    }
                    const node = getGridNode(nodeGrid, entity.pos);
                    if (node === null) {
                        continue;
                    }
                    this.walkPath = node.createWalkPath();
                }
            }
            if (this.walkPath !== null) {
                const offset = this.walkPath.getWalkOffset(this.pos);
                if (offset !== null) {
                    this.walk(offset);
                }
            }
            this.actDelay = 0;
        }
    }
    
    setFlip(offset) {
        if (offset.x !== 0) {
            this.flip = (offset.x < 0);
        }
    }
    
    getInitPos() {
        return new Pos(3, 3);
    }
    
    getLevel() {
        return 7;
    }
    
    getScore() {
        return 0;
    }
    
    increaseScore(amount) {
        // Do nothing.
    }
    
    decreaseScore(amount) {
        return amount;
    }
    
    incrementStat(name) {
        // Do nothing.
    }
    
    walk(offset) {
        this.setFlip(offset);
        return super.walk(offset);
    }
    
    buildTile(offset, getBuildTile) {
        this.setFlip(offset);
        super.buildTile(offset, getBuildTile);
    }
    
    removeTile(offset) {
        this.setFlip(offset);
        super.removeTile(offset);
    }
    
    scanTiles(getTileCost) {
        const firstNode = new TileNode(this.pos.copy(), null, 0);
        const nodeGrid = Array(worldTilesLength).fill(null);
        firstNode.addToGrid(nodeGrid);
        const nodesToVisit = new Heap((node1, node2) => node1.pathCost - node2.pathCost);
        nodesToVisit.push(firstNode);
        const visitedNodes = [];
        while (nodesToVisit.size() > 0) {
            const node = nodesToVisit.pop();
            node.visited = true;
            visitedNodes.push(node);
            for (const offset of nodeNeighborOffsets) {
                const neighborPos = node.pos.copy();
                neighborPos.add(offset);
                if (!posIsInWorld(neighborPos)) {
                    continue;
                }
                let neighborNode = getGridNode(nodeGrid, neighborPos);
                if (neighborNode === null) {
                    neighborNode = new TileNode(neighborPos);
                    neighborNode.addToGrid(nodeGrid);
                } else if (neighborNode.visited) {
                    continue;
                }
                const tile = getTile(true, neighborPos);
                const tileCost = getTileCost(tile);
                if (tileCost === null) {
                    continue;
                }
                const neighborCost = node.pathCost + tileCost;
                const lastCost = neighborNode.pathCost;
                if (lastCost === null || neighborCost < lastCost) {
                    neighborNode.previousNode = node;
                    neighborNode.pathCost = neighborCost;
                    if (lastCost === null) {
                        nodesToVisit.push(neighborNode);
                    } else {
                        nodesToVisit.updateItem(neighborNode);
                    }
                }
            }
        }
        return { nodeGrid, visitedNodes };
    }
}

const getGridNode = (nodeGrid, pos) => {
    const index = getTileIndex(pos);
    return nodeGrid[index];
};


