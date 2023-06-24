
import Heap from "heap";
import { worldTilesLength } from "./constants.js";
import { Pos } from "./pos.js";
import { entityTileSet, posIsInWorld, getTileIndex, getTile, EmptyTile, BlockTile, FlowerTile, PlayerTile } from "./tile.js";

const neighborOffsets = [
    new Pos(-1, 0), new Pos(1, 0),
    new Pos(0, -1), new Pos(0, 1),
];
const clockwiseOffsets = [
    new Pos(0, -1), new Pos(1, -1),
    new Pos(1, 0), new Pos(1, 1),
    new Pos(0, 1), new Pos(-1, 1),
    new Pos(-1, 0), new Pos(-1, -1),
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
        if (posList.length <= 1) {
            return null;
        }
        posList.reverse();
        return new WalkPath(posList);
    }
}

class PathStep {
    
    constructor(pos) {
        this.pos = pos;
        this.tile = getTile(true, this.pos);
    }
    
    tileHasChanged() {
        const tile = getTile(true, this.pos);
        return (this.tile !== tile);
    }
}

class WalkPath {
    
    constructor(posList) {
        this.steps = posList.map((pos) => new PathStep(pos));
        this.index = 1;
    }
    
    getNextStep() {
        return this.steps[this.index];
    }
    
    advance(pos) {
        const step = this.getNextStep();
        if (pos.equals(step.pos)) {
            if (this.index >= this.steps.length - 1) {
                return true;
            }
            this.index += 1;
        }
        return false;
    }
    
    getWalkOffset(pos) {
        const step = this.getNextStep();
        return getOffsetToPos(pos, step.pos);
    }
    
    tileHasChanged() {
        for (let index = this.index; index < this.steps.length; index++) {
            const step = this.steps[index];
            if (step.tileHasChanged()) {
                return true;
            }
        }
        return false;
    }
}

class TargetAction {
    // Concrete subclasses of TargetAction must implement these methods:
    // perform
    
}

class PlantSeedAction {
    
    constructor(pos) {
        this.pos = pos;
    }
    
    perform(bot) {
        if (!canPlantSeed(this.pos)) {
            return;
        }
        const offset = getOffsetToPos(bot.pos, this.pos);
        if (offset !== null) {
            bot.buildSproutTile(offset, false, null);
        }
    }
}

export class BotPlayerTile extends PlayerTile {
    
    constructor(displayName) {
        const id = nextBotId;
        nextBotId += 1;
        super("bot," + id, displayName);
        this.actDelay = 0;
        this.walkPath = null;
        this.targetAction = null;
        this.planAge = 0;
    }
    
    timerEvent() {
        this.actDelay += 1;
        if (this.actDelay > 3) {
            this.act();
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
            for (const offset of neighborOffsets) {
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
    
    plantSeedNextToPath() {
        const nextPathPos = this.walkPath.getNextStep().pos;
        const offset = neighborOffsets[Math.floor(Math.random() * neighborOffsets.length)];
        const pos = this.pos.copy();
        pos.add(offset);
        if (nextPathPos !== null && pos.equals(nextPathPos)) {
            return false;
        }
        if (!canPlantSeed(pos)) {
            return false;
        }
        this.buildSproutTile(offset, false, null);
        return true;
    }
    
    shouldMakePlan() {
        if (this.planAge > 9) {
            return true;
        }
        if (this.walkPath !== null) {
            return this.walkPath.tileHasChanged();
        }
        return (this.targetAction === null);
    }
    
    makePlan() {
        this.walkPath = null;
        this.targetAction = null;
        this.planAge = 0;
        
        // Find the shortest path to all reachable tiles.
        const { nodeGrid, visitedNodes } = this.scanTiles((tile) => {
            if (tile instanceof BlockTile) {
                return null;
            }
            if (tile instanceof FlowerTile) {
                return 30;
            }
            return 1;
        });
        
        // Find the closest reachable flower.
        let closestNode = null;
        for (const entity of entityTileSet) {
            if (!(entity instanceof FlowerTile) || entity.isSprout()) {
                continue;
            }
            const node = getGridNode(nodeGrid, entity.pos);
            if (node === null || node.pathCost === null) {
                continue;
            }
            if (closestNode === null || node.pathCost < closestNode.pathCost) {
                closestNode = node;
            }
        }
        if (closestNode !== null) {
            this.walkPath = closestNode.createWalkPath();
            return;
        }
        
        // Find a good place to plant a seed.
        const seedPosList = [];
        for (const node of visitedNodes) {
            if (canPlantSeed(node.pos)) {
                seedPosList.push(node.pos);
                if (seedPosList.length > 15) {
                    break;
                }
            }
        }
        if (seedPosList.length > 0) {
            const pos = seedPosList[Math.floor(Math.random() * seedPosList.length)];
            const neighborNode = getClosestNeighborNode(nodeGrid, pos);
            if (neighborNode !== null) {
                this.walkPath = neighborNode.createWalkPath();
                this.targetAction = new PlantSeedAction(pos);
            }
        }
    }
    
    executePlan() {
        this.planAge += 1;
        if (this.walkPath !== null) {
            if (Math.random() < 0.2) {
                const hasPlanted = this.plantSeedNextToPath();
                if (hasPlanted) {
                    return;
                }
            }
            const offset = this.walkPath.getWalkOffset(this.pos);
            if (offset !== null) {
                this.walk(offset);
                const hasFinished = this.walkPath.advance(this.pos);
                if (hasFinished) {
                    this.walkPath = null;
                }
            }
        } else if (this.targetAction !== null) {
            this.targetAction.perform(this);
            this.targetAction = null;
        }
    }
    
    act() {
        if (this.shouldMakePlan()) {
            this.makePlan();
        }
        this.executePlan();
    }
}

const getGridNode = (nodeGrid, pos) => {
    const index = getTileIndex(pos);
    return nodeGrid[index];
};

const getClosestNeighborNode = (nodeGrid, inputPos) => {
    let closestNode = null;
    const pos = new Pos(0, 0);
    for (const offset of neighborOffsets) {
        pos.set(inputPos);
        pos.add(offset);
        if (!posIsInWorld(pos)) {
            continue;
        }
        const node = getGridNode(nodeGrid, pos);
        if (node === null || node.pathCost === null) {
            continue;
        }
        if (closestNode === null || node.pathCost < closestNode.pathCost) {
            closestNode = node;
        }
    }
    return closestNode;
};

const canReachOffset = (inputPos, emptyIndex1, emptyIndex2) => {
    const pos = new Pos(0, 0);
    for (let index = emptyIndex1 + 1; index % 8 !== emptyIndex2; index++) {
        const offset = clockwiseOffsets[index % 8];
        pos.set(inputPos);
        pos.add(offset);
        const tile = getTile(true, pos);
        if (tile instanceof BlockTile) {
            return false;
        }
    }
    return true;
};

const canPlantSeed = (inputPos) => {
    // Only plant flowers in empty spaces.
    if (!(getTile(true, inputPos) instanceof EmptyTile)) {
        return false;
    }
    
    // Do not plant flowers adjacent to other flowers.
    const pos = new Pos(0, 0);
    for (let offsetY = -1; offsetY <= 1; offsetY++) {
        for (let offsetX = -1; offsetX <= 1; offsetX++) {
            pos.x = inputPos.x + offsetX;
            pos.y = inputPos.y + offsetY;
            if (getTile(true, pos) instanceof FlowerTile) {
                return false;
            }
        }
    }
    
    // Do not plant a flower which would obstruct an opening between two blocks.
    const emptyIndexes = [];
    for (let index = 0; index < clockwiseOffsets.length; index += 2) {
        const offset = clockwiseOffsets[index];
        pos.set(inputPos);
        pos.add(offset);
        const tile = getTile(true, pos);
        if (!(tile instanceof BlockTile)) {
            emptyIndexes.push(index);
        }
    }
    for (let index1 = 0; index1 < emptyIndexes.length; index1++) {
        const emptyIndex1 = emptyIndexes[index1];
        for (let index2 = index1 + 1; index2 < emptyIndexes.length; index2++) {
            const emptyIndex2 = emptyIndexes[index2];
            if (!canReachOffset(inputPos, emptyIndex1, emptyIndex2)
                    && !canReachOffset(inputPos, emptyIndex2, emptyIndex1)) {
                return false;
            }
        }
    }
    return true;
};

const getOffsetToPos = (srcPos, destPos) => {
    if (srcPos.x > destPos.x) {
        return new Pos(-1, 0);
    }
    if (srcPos.x < destPos.x) {
        return new Pos(1, 0);
    }
    if (srcPos.y > destPos.y) {
        return new Pos(0, -1);
    }
    if (srcPos.y < destPos.y) {
        return new Pos(0, 1);
    }
    return null;
};


