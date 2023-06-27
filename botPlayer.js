
import Heap from "heap";
import { worldTilesLength } from "./constants.js";
import { Pos } from "./pos.js";
import { entityTileSet, playerTileMap, posIsInWorld, getTileIndex, getTile, EmptyTile, BlockTile, FlowerTile, PlayerTile, GrassTile, isWorldEdgePos, getCenterBlockCount } from "./tile.js";

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
    
    createWalkPath(isDestructive) {
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
        return new WalkPath(posList, isDestructive);
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
    
    constructor(posList, isDestructive) {
        this.steps = posList.map((pos) => new PathStep(pos));
        this.isDestructive = isDestructive;
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
            bot.plantSeed(offset);
        }
    }
}

class PoisonStrategy {
    
    constructor(bot) {
        this.bot = bot;
    }
    
    isPoisonPos(pos) {
        return null;
    }
    
    shouldPlantPoison(pos) {
        return this.isPoisonPos(pos);
    }
    
    getPoisonTier() {
        return null;
    }
    
    plantEvent() {
        // Do nothing.
    }
    
    getMinPoisonRatio() {
        return 0.2;
    }
    
    getMaxPoisonRatio() {
        return 0.8;
    }
}

class NeverPoisonStrategy extends PoisonStrategy {
    
    isPoisonPos(pos) {
        return false;
    }
    
    getMinPoisonRatio() {
        return 0;
    }
}

class PeriodicPoisonStrategy extends PoisonStrategy {
    
    constructor(bot) {
        super(bot);
        this.delay = 0;
        this.maxDelay = 1 + Math.floor(Math.random() * 5);
    }
    
    shouldPlantPoison(pos) {
        return (this.delay === 0);
    }
    
    plantEvent() {
        super.plantEvent();
        this.delay += 1;
        if (this.delay > this.maxDelay) {
            this.delay = 0;
        }
    }
}

class PlayerPoisonStrategy extends PoisonStrategy {
    
    constructor(bot) {
        super(bot);
        this.closeToPlayer = (Math.random() < 0.5);
    }
    
    isPoisonPos(pos) {
        for (const playerTile of playerTileMap.values()) {
            if (playerTile === this.bot) {
                continue;
            }
            const distance = getDistance(pos, playerTile.pos);
            return ((distance < 4) === this.closeToPlayer);
        }
        return false;
    }
}

class BlockPoisonStrategy extends PoisonStrategy {
    
    constructor(bot) {
        super(bot);
        this.nextToBlock = (Math.random() < 0.5);
    }
    
    isPoisonPos(inputPos) {
        const pos = new Pos(0, 0);
        for (const offset of neighborOffsets) {
            pos.set(inputPos);
            pos.add(offset);
            if (getTileSafe(pos) instanceof BlockTile) {
                return this.nextToBlock;
            }
        }
        return !this.nextToBlock;
    }
}

class GrassPoisonStrategy extends PoisonStrategy {
    
    constructor(bot) {
        super(bot);
        this.nextToGrass = (Math.random() < 0.5);
    }
    
    isPoisonPos(inputPos) {
        const pos = new Pos(0, 0);
        for (const offset of neighborOffsets) {
            pos.set(inputPos);
            pos.add(offset);
            if (!posIsInWorld(pos)) {
                continue;
            }
            const tile = getTile(false, pos);
            if (tile instanceof GrassTile) {
                return this.nextToGrass;
            }
        }
        return !this.nextToGrass;
    }
}

class DirectionPoisonStrategy extends PoisonStrategy {
    
    constructor(bot) {
        super(bot);
        const index = Math.floor(Math.random() * neighborOffsets.length);
        this.offset = neighborOffsets[index];
    }
    
    shouldPlantPoison(pos) {
        const offset = pos.copy();
        offset.subtract(this.bot.pos);
        return offset.equals(this.offset);
    }
    
}

class TierPoisonStrategy extends PoisonStrategy {
    
    constructor(bot) {
        super(bot);
        this.nextIsPoison = false;
        const level = this.bot.getLevel();
        const minTier = Math.min(3, level - 1);
        this.tier = minTier + Math.floor(Math.random() * (level - minTier));
    }
    
    shouldPlantPoison(pos) {
        return this.nextIsPoison;
    }
    
    getPoisonTier() {
        return this.tier;
    }
    
    plantEvent() {
        super.plantEvent();
        this.nextIsPoison = (Math.random() < 0.25);
    }
}

const poisonStrategyConstructors = [
    PeriodicPoisonStrategy,
    PlayerPoisonStrategy,
    BlockPoisonStrategy,
    GrassPoisonStrategy,
    DirectionPoisonStrategy,
    TierPoisonStrategy,
];

class ReceivedPoison {
    
    constructor(creatorKey) {
        this.creatorKey = creatorKey;
        this.time = Date.now() / 1000;
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
        this.lastSeedPos = null;
        this.poisonStrategy = new NeverPoisonStrategy(this);
        this.receivedPoisons = [];
        this.poisonRatio = null;
        this.poisonRatioIsStale = true;
    }
    
    timerEvent() {
        this.poisonRatioIsStale = true;
        this.actDelay += 1;
        if (this.actDelay > 3) {
            this.act();
            this.actDelay = 0;
        }
    }
    
    poisonEvent(creatorTile) {
        super.poisonEvent(creatorTile);
        this.receivedPoisons.push(new ReceivedPoison(creatorTile.key));
        while (this.receivedPoisons.length > 8) {
            this.receivedPoisons.shift();
        }
    }
    
    flowerRemovedEvent(flowerTile, playerTile) {
        if (playerTile === this) {
            return;
        }
        // TODO: Record flower removed.
        
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
    
    scanTiles(isDestructive) {
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
                const tileCost = getTileCost(tile, isDestructive);
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
    
    // unreachablePosList is a list of flower positions which
    // can only be reached by destroying blocks.
    makeDestructiveFlowerPath(unreachablePosList) {
        const { nodeGrid } = this.scanTiles(true);
        let closestNode = null;
        for (const pos of unreachablePosList) {
            const node = getGridNode(nodeGrid, pos);
            if (node === null || node.pathCost === null) {
                continue;
            }
            if (closestNode === null || node.pathCost < closestNode.pathCost) {
                closestNode = node;
            }
        }
        if (closestNode === null) {
            return false
        }
        this.walkPath = closestNode.createWalkPath(true);
        return true;
    }
    
    getPoisonRatio() {
        if (!this.poisonRatioIsStale) {
            return this.poisonRatio;
        }
        let poisonCount = 0;
        let totalCount = 0;
        for (const entity of entityTileSet) {
            if (entity instanceof FlowerTile && entity.creatorKey === this.key) {
                if (entity.isPoisonous) {
                    poisonCount += 1;
                }
                totalCount += 1;
            }
        }
        this.poisonRatio = (totalCount < 3) ? null : poisonCount / totalCount;
        this.poisonRatioIsStale = false;
        return this.poisonRatio;
    }
    
    selectSeedNeighborHelper(nodeGrid, seedPosList) {
        if (seedPosList.length <= 0) {
            return null;
        }
        const endIndex = Math.min(seedPosList.length, 15);
        const index = Math.floor(Math.random() * endIndex);
        const result = selectNeighbor(nodeGrid, seedPosList[index]);
        if (result !== null) {
            return result;
        }
        for (let index = 0; index < seedPosList.length; index++) {
            const result = selectNeighbor(nodeGrid, seedPosList[index]);
            if (result !== null) {
                return result;
            }
        }
        return null;
    }
    
    selectNeighborByPoison(nodeGrid, seedPosList, isPoisonous) {
        const candidatePosList = seedPosList.filter((pos) => (
            this.poisonStrategy.isPoisonPos(pos) === isPoisonous
        ));
        return this.selectSeedNeighborHelper(nodeGrid, candidatePosList)
    }
    
    selectSeedNeighbor(nodeGrid, seedPosList) {
        if (this.lastSeedPos !== null) {
            // Prefer planting seeds in a consistent position.
            // This helps when the bot decides to re-plan.
            for (let index = 0; index < seedPosList.length; index++) {
                const pos = seedPosList[index];
                if (!pos.equals(this.lastSeedPos)) {
                    continue;
                }
                const result = selectNeighbor(nodeGrid, seedPosList[index]);
                if (result !== null) {
                    return result;
                }
            }
        }
        const poisonRatio = this.getPoisonRatio();
        if (poisonRatio !== null) {
            if (poisonRatio < this.poisonStrategy.getMinPoisonRatio()) {
                const result = this.selectNeighborByPoison(nodeGrid, seedPosList, true);
                if (result !== null) {
                    return result;
                }
            } else if (poisonRatio > this.poisonStrategy.getMaxPoisonRatio()) {
                const result = this.selectNeighborByPoison(nodeGrid, seedPosList, false);
                if (result !== null) {
                    return result;
                }
            }
        }
        return this.selectSeedNeighborHelper(nodeGrid, seedPosList);
    }
    
    planSeedAction(nodeGrid, visitedNodes, isDestructive) {
        const seedPosList = [];
        for (const node of visitedNodes) {
            if (canPlantSeed(node.pos)) {
                seedPosList.push(node.pos);
                if (seedPosList.length > 100) {
                    break;
                }
            }
        }
        if (seedPosList.length <= 0) {
            return false;
        }
        const result = this.selectSeedNeighbor(nodeGrid, seedPosList);
        if (result === null) {
            return false;
        }
        const { neighborNode, pos } = result;
        this.walkPath = neighborNode.createWalkPath(isDestructive);
        this.targetAction = new PlantSeedAction(pos);
        this.lastSeedPos = pos;
        return true;
    }
    
    planBlockDestruction(nodeGrid, visitedNodes) {
        const blockNodes = [];
        for (const node of visitedNodes) {
            const tile = getTile(true, node.pos);
            if (tile instanceof BlockTile) {
                blockNodes.push(node);
                if (blockNodes.length > 15) {
                    break;
                }
            }
        }
        let bestNode = null;
        let bestScore = -Infinity;
        for (const node of blockNodes) {
            let emptyNeighborCount = 0;
            const pos = new Pos(0, 0);
            for (const offset of clockwiseOffsets) {
                pos.set(node.pos);
                pos.add(offset);
                const tile = getTileSafe(pos);
                if (tile !== null && !(tile instanceof BlockTile)) {
                    emptyNeighborCount += 1;
                }
            }
            const score = 2 * emptyNeighborCount - node.pathCost;
            if (score > bestScore) {
                bestNode = node;
                bestScore = score;
            }
        }
        if (bestNode !== null) {
            this.walkPath = bestNode.createWalkPath(true);
        }
    }
    
    makeDestructiveSeedPath() {
        const { nodeGrid, visitedNodes } = this.scanTiles(true);
        const hasPlanned = this.planSeedAction(nodeGrid, visitedNodes, true);
        if (!hasPlanned) {
            this.planBlockDestruction(nodeGrid, visitedNodes);
        }
    }
    
    expectsPoison(flowerTile) {
        const { creatorKey } = flowerTile;
        if (creatorKey === this.key) {
            return flowerTile.isPoisonous;
        }
        let lastPoisonTime = null;
        for (let index = this.receivedPoisons.length - 1; index >= 0; index--) {
            const poison = this.receivedPoisons[index];
            if (poison.creatorKey !== creatorKey) {
                continue;
            }
            if (lastPoisonTime === null || poison.time > lastPoisonTime) {
                lastPoisonTime = poison.time;
            }
        }
        const timeThreshold = Date.now() / 1000 - 5 * 60;
        return (lastPoisonTime !== null && lastPoisonTime > timeThreshold);
    }
    
    getPosNextToPath() {
        const nextPathPos = this.walkPath.getNextStep().pos;
        const offset = neighborOffsets[Math.floor(Math.random() * neighborOffsets.length)];
        const pos = this.pos.copy();
        pos.add(offset);
        if (!posIsInWorld(pos) || (nextPathPos !== null && pos.equals(nextPathPos))) {
            return null;
        }
        return { pos, offset };
    }
    
    plantSeed(offset) {
        const pos = this.pos.copy();
        pos.add(offset);
        let isPoisonous;
        let tier;
        if (this.poisonStrategy.shouldPlantPoison(pos)) {
            isPoisonous = true;
            tier = this.poisonStrategy.getPoisonTier();
        } else {
            isPoisonous = false;
            tier = null
        }
        console.log([isPoisonous, tier]);
        this.buildSproutTile(offset, isPoisonous, tier);
        this.poisonStrategy.plantEvent();
    }
    
    plantSeedNextToPath() {
        const result = this.getPosNextToPath();
        if (result === null) {
            return false;
        }
        const { pos, offset } = result;
        if (!canPlantSeed(pos)) {
            return false;
        }
        const poisonRatio = this.getPoisonRatio();
        if (poisonRatio !== null) {
            const isPoisonous = this.poisonStrategy.shouldPlantPoison(pos);
            if (poisonRatio < this.poisonStrategy.getMinPoisonRatio()) {
                if (!isPoisonous) {
                    return false;
                }
            } else if (poisonRatio > this.poisonStrategy.getMaxPoisonRatio()) {
                if (isPoisonous) {
                    return false;
                }
            }
        }
        this.plantSeed(offset);
        return true;
    }
    
    placeBlockNextToPath() {
        const result = this.getPosNextToPath();
        if (result === null) {
            return false;
        }
        const { pos, offset } = result;
        if (isWorldEdgePos(pos)) {
            return false;
        }
        const tile = getTile(true, pos);
        if (!(tile instanceof EmptyTile)) {
            return false;
        }
        const tier = Math.floor(Math.random() * this.getLevel());
        this.buildBlockTile(offset, tier);
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
    
    makePlanHelper() {
        this.walkPath = null;
        this.targetAction = null;
        this.planAge = 0;
        
        // Find the shortest path to all reachable tiles.
        const { nodeGrid, visitedNodes } = this.scanTiles(false);
        
        // Find the closest reachable flower.
        const unreachablePosList = [];
        let closestNode = null;
        for (const entity of entityTileSet) {
            if (!(entity instanceof FlowerTile) || entity.isSprout()
                    || this.expectsPoison(entity)) {
                continue;
            }
            const node = getGridNode(nodeGrid, entity.pos);
            if (node === null || node.pathCost === null) {
                unreachablePosList.push(entity.pos);
                continue;
            }
            if (closestNode === null || node.pathCost < closestNode.pathCost) {
                closestNode = node;
            }
        }
        
        // If we find unreachable flowers, destroy blocks to reach them.
        if (unreachablePosList.length > 0) {
            const hasMadePath = this.makeDestructiveFlowerPath(unreachablePosList);
            if (hasMadePath) {
                return;
            }
        }
        if (closestNode !== null) {
            this.walkPath = closestNode.createWalkPath(false);
            return;
        }
        
        // Find a good place to plant a seed.
        const hasPlanned = this.planSeedAction(nodeGrid, visitedNodes, false);
        if (!hasPlanned) {
            this.makeDestructiveSeedPath();
        }
    }
    
    makePlan() {
        this.makePlanHelper();
        if (!(this.targetAction instanceof PlantSeedAction)) {
            this.lastSeedPos = null;
        }
    }
    
    executePlan() {
        this.planAge += 1;
        if (this.walkPath !== null) {
            if (Math.random() < 0.2) {
                if (getCenterBlockCount() < 15) {
                    const hasPlaced = this.placeBlockNextToPath();
                    if (hasPlaced) {
                        return;
                    }
                }
                const hasPlanted = this.plantSeedNextToPath();
                if (hasPlanted) {
                    return;
                }
            }
            const offset = this.walkPath.getWalkOffset(this.pos);
            if (offset !== null) {
                if (this.walkPath.isDestructive) {
                    const pos = this.pos.copy();
                    pos.add(offset);
                    const tile = getTile(true, pos);
                    if (tile instanceof BlockTile) {
                        this.removeTile(offset);
                        return;
                    }
                }
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

const getTileSafe = (pos) => posIsInWorld(pos) ? getTile(true, pos) : null;

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

const getTileCost = (tile, isDestructive) => {
    if (tile instanceof BlockTile) {
        return isDestructive ? 4 : null;
    }
    if (tile instanceof FlowerTile || tile instanceof PlayerTile) {
        return 30;
    }
    return 1;
};

const canReachOffset = (inputPos, emptyIndex1, emptyIndex2) => {
    const pos = new Pos(0, 0);
    for (let index = emptyIndex1 + 1; index % 8 !== emptyIndex2; index++) {
        const offset = clockwiseOffsets[index % 8];
        pos.set(inputPos);
        pos.add(offset);
        if (getTileSafe(pos) instanceof BlockTile) {
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
            if (getTileSafe(pos) instanceof FlowerTile) {
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
        const tile = getTileSafe(pos);
        if (tile !== null && !(tile instanceof BlockTile)) {
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

const selectNeighbor = (nodeGrid, pos) => {
    const neighborNode = getClosestNeighborNode(nodeGrid, pos);
    return (neighborNode === null) ? null : { pos, neighborNode };
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

const getDistance = (pos1, pos2) => (
    Math.max(Math.abs(pos1.x - pos2.x), Math.abs(pos1.y - pos2.y))
);


