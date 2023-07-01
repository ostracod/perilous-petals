
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
const maxRemovalAmount = 12;
const planModes = {
    normal: 0,
    clear: 1,
    visit: 2,
};

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
        this.creationTime = Date.now() / 1000;
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

class FlowerRemoval {
    
    constructor(isPoisonous) {
        this.isPoisonous = isPoisonous;
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
        this.poisonStrategyDelay = 0;
        this.receivedPoisons = [];
        this.flowerRemovals = [];
        this.poisonRatio = null;
        this.poisonRatioIsStale = true;
        this.planMode = null;
        this.planModeDelay = 0;
        this.normalModeTime = null;
        this.targetPlayerKey = null;
        this.startNormalPlanMode();
    }
    
    timerEvent() {
        this.poisonRatioIsStale = true;
        this.actDelay += 1;
        if (this.actDelay > 3) {
            this.act();
            this.actDelay = 0;
        }
    }
    
    poisonEvent(creatorKey) {
        super.poisonEvent(creatorKey);
        this.receivedPoisons.push(new ReceivedPoison(creatorKey));
        while (this.receivedPoisons.length > 8) {
            this.receivedPoisons.shift();
        }
    }
    
    flowerRemovedEvent(flowerTile, playerTile) {
        super.flowerRemovedEvent(flowerTile, playerTile);
        if (playerTile === this) {
            return;
        }
        const timeThreshold = Date.now() / 1000 - 90;
        if (this.poisonStrategy.creationTime > timeThreshold) {
            return;
        }
        this.flowerRemovals.push(new FlowerRemoval(flowerTile.isPoisonous));
        while (this.flowerRemovals.length > maxRemovalAmount) {
            this.flowerRemovals.shift();
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
                let neighborNode = getGridNode(nodeGrid, neighborPos, true);
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
            if (node === null) {
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
        for (const pos of seedPosList) {
            const result = selectNeighbor(nodeGrid, pos);
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
        return this.selectSeedNeighborHelper(nodeGrid, candidatePosList);
    }
    
    selectSeedNeighbor(nodeGrid, seedPosList) {
        if (this.lastSeedPos !== null) {
            // Prefer planting seeds in a consistent position.
            // This helps when the bot decides to re-plan.
            for (const pos of seedPosList) {
                if (!pos.equals(this.lastSeedPos)) {
                    continue;
                }
                const result = selectNeighbor(nodeGrid, pos);
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
    
    planBlockDestruction(visitedNodes) {
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
            this.planBlockDestruction(visitedNodes);
        }
    }
    
    expectsPoison(flowerTile) {
        const { creatorKey } = flowerTile;
        if (creatorKey === this.key) {
            return flowerTile.isPoisonous;
        }
        let lastPoisonTime = null;
        for (const poison of this.receivedPoisons) {
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
        const nextPathPos = (this.walkPath === null) ? null : this.walkPath.getNextStep().pos;
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
    
    updatePoisonStrategy() {
        this.poisonStrategyDelay += 1;
        if (this.poisonStrategyDelay < 6) {
            return;
        }
        this.poisonStrategyDelay = 0;
        const currentTime = Date.now() / 1000;
        let lastEventTime;
        if (this.flowerRemovals.length > 0) {
            lastEventTime = this.flowerRemovals.at(-1).time;
        } else {
            lastEventTime = this.poisonStrategy.creationTime;
        }
        if (lastEventTime < currentTime - 10 * 60) {
            if (!(this.poisonStrategy instanceof NeverPoisonStrategy)) {
                this.poisonStrategy = new NeverPoisonStrategy(this);
            }
            this.flowerRemovals = [];
            return;
        }
        if (this.flowerRemovals.length < maxRemovalAmount) {
            return;
        }
        for (const removal of this.flowerRemovals) {
            if (removal.isPoisonous) {
                return;
            }
        }
        const index = Math.floor(Math.random() * poisonStrategyConstructors.length);
        const strategyConstructor = poisonStrategyConstructors[index];
        this.poisonStrategy = new strategyConstructor(this);
        this.flowerRemovals = [];
    }
    
    getOpponentPlayers() {
        const output = [];
        for (const playerTile of playerTileMap.values()) {
            if (playerTile !== this) {
                output.push(playerTile);
            }
        }
        return output;
    }
    
    startNormalPlanMode() {
        this.planMode = planModes.normal;
        this.normalModeTime = Date.now() / 1000;
    }
    
    getTargetPlayer() {
        const playerTile = playerTileMap.get(this.targetPlayerKey);
        return (typeof playerTile === "undefined") ? null : playerTile;
    }
    
    updatePlanMode() {
        this.planModeDelay += 1;
        if (this.planModeDelay < 6) {
            return;
        }
        this.planModeDelay = 0;
        if (this.planMode === planModes.normal) {
            const currentTime = Date.now() / 1000;
            if (currentTime > this.normalModeTime + 5 * 60) {
                const opponents = this.getOpponentPlayers();
                if (opponents.length > 0) {
                    this.planMode = planModes.clear;
                } else {
                    this.startNormalPlanMode();
                }
            }
        } else if (this.planMode === planModes.clear) {
            let flowerExists = false;
            for (const entity of entityTileSet) {
                if (entity instanceof FlowerTile && entity.creatorKey === this.key
                        && !entity.isPoisonous) {
                    flowerExists = true;
                    break;
                }
            }
            if (!flowerExists) {
                const opponents = this.getOpponentPlayers();
                if (opponents.length > 0) {
                    const opponent = opponents[Math.floor(Math.random() * opponents.length)];
                    this.targetPlayerKey = opponent.key;
                    this.planMode = planModes.visit;
                } else {
                    this.startNormalPlanMode();
                }
            }
        } else if (this.planMode === planModes.visit) {
            const playerTile = this.getTargetPlayer();
            if (playerTile === null || getDistance(this.pos, playerTile.pos) < 3) {
                this.startNormalPlanMode();
            }
        } else {
            throw new Error(`Invalid plan mode: ${this.planMode}`);
        }
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
    
    planPickFlower(nodeGrid, shouldPickFlower, getFlowerScore) {
        const unreachablePosList = [];
        let bestNode = null;
        let bestScore = -Infinity;
        for (const entity of entityTileSet) {
            if (!(entity instanceof FlowerTile) || this.expectsPoison(entity)
                    || !shouldPickFlower(entity)) {
                continue;
            }
            const node = getGridNode(nodeGrid, entity.pos);
            if (node === null) {
                if (!entity.isSprout()) {
                    unreachablePosList.push(entity.pos);
                }
                continue;
            }
            const score = getFlowerScore(entity, node.pathCost);
            if (score > bestScore) {
                bestNode = node;
                bestScore = score;
            }
        }
        if (unreachablePosList.length > 0) {
            const hasMadePath = this.makeDestructiveFlowerPath(unreachablePosList);
            if (hasMadePath) {
                return true;
            }
        }
        if (bestNode !== null) {
            this.walkPath = bestNode.createWalkPath(false);
            return true;
        }
        return false;
    }
    
    makeNormalPlan() {
        const { nodeGrid, visitedNodes } = this.scanTiles(false);
        let hasPlanned = this.planPickFlower(
            nodeGrid,
            (flowerTile) => !flowerTile.isSprout(),
            (flowerTile, pathCost) => -pathCost,
        );
        if (hasPlanned) {
            return;
        }
        hasPlanned = this.planSeedAction(nodeGrid, visitedNodes, false);
        if (!hasPlanned) {
            this.makeDestructiveSeedPath();
        }
    }
    
    makeClearPlan() {
        const { nodeGrid } = this.scanTiles(false);
        this.planPickFlower(
            nodeGrid,
            (flowerTile) => (flowerTile.creatorKey === this.key),
            (flowerTile, pathCost) => {
                let output = -pathCost;
                if (!flowerTile.isSprout()) {
                    output += 1000;
                }
                return output;
            },
        );
    }
    
    planVisitPlayer(playerTile, isDestructive) {
        const { nodeGrid } = this.scanTiles(isDestructive);
        const node = getClosestNeighborNode(nodeGrid, playerTile.pos);
        if (node === null) {
            return false;
        } else {
            this.walkPath = node.createWalkPath(isDestructive);
            return true;
        }
    }
    
    makeVisitPlan() {
        const playerTile = this.getTargetPlayer();
        if (playerTile === null) {
            return;
        }
        const hasPlanned = this.planVisitPlayer(playerTile, false);
        if (!hasPlanned) {
            this.planVisitPlayer(playerTile, true);
        }
    }
    
    makePlan() {
        this.walkPath = null;
        this.targetAction = null;
        this.planAge = 0;
        if (this.planMode === planModes.normal) {
            this.makeNormalPlan();
        } else if (this.planMode === planModes.clear) {
            this.makeClearPlan();
        } else if (this.planMode === planModes.visit) {
            this.makeVisitPlan();
        } else {
            throw new Error(`Invalid plan mode: ${this.planMode}`);
        }
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
                if (this.planMode === planModes.normal) {
                    const hasPlanted = this.plantSeedNextToPath();
                    if (hasPlanted) {
                        return;
                    }
                }
            }
            const offset = this.walkPath.getWalkOffset(this.pos);
            if (offset === null) {
                return;
            }
            const pos = this.pos.copy();
            pos.add(offset);
            const tile = getTile(true, pos);
            if (this.walkPath.isDestructive) {
                if (tile instanceof BlockTile) {
                    this.removeTile(offset);
                    return;
                }
            }
            if (tile instanceof FlowerTile && this.expectsPoison(tile)) {
                return
            }
            this.walk(offset);
            const hasFinished = this.walkPath.advance(this.pos);
            if (hasFinished) {
                this.walkPath = null;
            }
        } else if (this.targetAction !== null) {
            this.targetAction.perform(this);
            this.targetAction = null;
        }
    }
    
    act() {
        this.updatePoisonStrategy();
        this.updatePlanMode();
        if (this.shouldMakePlan()) {
            this.makePlan();
        }
        this.executePlan();
    }
}

const getTileSafe = (pos) => posIsInWorld(pos) ? getTile(true, pos) : null;

const getGridNode = (nodeGrid, pos, includeNullCost = false) => {
    const index = getTileIndex(pos);
    const node = nodeGrid[index];
    if (node === null || (node.pathCost === null && !includeNullCost)) {
        return null;
    }
    return node;
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
        if (node === null) {
            continue;
        }
        if (closestNode === null || node.pathCost < closestNode.pathCost) {
            closestNode = node;
        }
    }
    return closestNode;
};

const getTileCost = (tile, isDestructive) => {
    if (tile instanceof EmptyTile) {
        return 1;
    }
    if (tile instanceof BlockTile) {
        return isDestructive ? 4 : null;
    }
    if (tile instanceof FlowerTile || tile instanceof PlayerTile) {
        return 30;
    }
    return null;
};

const canReachOffset = (inputPos, emptyIndex1, emptyIndex2) => {
    const pos = new Pos(0, 0);
    for (let index = emptyIndex1 + 1; index % 8 !== emptyIndex2; index++) {
        const offset = clockwiseOffsets[index % 8];
        pos.set(inputPos);
        pos.add(offset);
        const tile = getTileSafe(pos);
        if (tile === null || tile instanceof BlockTile) {
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


