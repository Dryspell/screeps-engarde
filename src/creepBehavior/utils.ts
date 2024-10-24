import { DIRECTIONS } from "spatial/constants";
import { _hasPos } from "spatial/spatial-utils";
import { profileFunction } from "utils/screeps-profiler";

export const PATH_COLORS = {
  harvesting: "#ffaa00",
  transferring: "#00FFFF",
  building: "##00FF00",
  upgrading: "#0000FF",
  claiming: "#FF0000",
  surveying: "#FF00FF"
};

export type EnergyTarget =
  | { type: "harvest"; base: Source }
  | { type: "pickup"; base: Resource<RESOURCE_ENERGY> }
  | { type: "withdraw"; base: StructureContainer | StructureStorage | Tombstone | Ruin };

export type TransferTarget = {
  type: "transfer";
  base: AnyStoreStructure;
};

export type BuildTarget = {
  type: "build";
  base: ConstructionSite;
};

export type UpgradeTarget = {
  type: "upgrade";
  base: StructureController;
};

export type ActionableTarget = EnergyTarget | TransferTarget | BuildTarget | UpgradeTarget;

export const getEnergyTargets = profileFunction(
  (
    droppedResources: Resource<ResourceConstant>[],
    structures: AnyStructure[],
    ruins: Ruin[],
    tombstones: Tombstone[],
    sources: Source[]
  ) => {
    const energyTargets = [
      ...sources.filter(source => source.energy > 25).map(source => ({ type: "harvest" as const, base: source })),
      ...droppedResources
        .filter(resource => resource.amount > 25)
        .map(resource => ({ type: "pickup", base: resource } as { type: "pickup"; base: Resource<RESOURCE_ENERGY> })),
      ...(
        structures.filter(
          struct =>
            (struct.structureType === STRUCTURE_CONTAINER || struct.structureType === STRUCTURE_STORAGE) &&
            struct.store[RESOURCE_ENERGY] > 25
        ) as (StructureContainer | StructureStorage)[]
      ).map(
        container =>
          ({ type: "withdraw", base: container } as {
            type: "withdraw";
            base: StructureContainer | StructureStorage;
          })
      ),
      ...ruins
        .filter(ruin => ruin.store[RESOURCE_ENERGY] > 0)
        .map(ruin => ({ type: "withdraw", base: ruin } as { type: "withdraw"; base: Ruin })),
      ...tombstones
        .filter(tombstone => tombstone.store[RESOURCE_ENERGY] > 0)
        .map(tombstone => ({ type: "withdraw", base: tombstone } as { type: "withdraw"; base: Tombstone }))
    ] as EnergyTarget[];

    if (!energyTargets.length) {
      energyTargets.push(...sources.map(source => ({ type: "harvest" as const, base: source })));
    }
    return energyTargets;
  },
  "spatial.getEnergyTargets"
);

const getSafeEnergyStores = profileFunction((energyStores: EnergyTarget[]) => {
  return energyStores.filter(energyStore => {
    return energyStore.base.pos.findInRange(FIND_HOSTILE_CREEPS, 5).length === 0 && energyStore.type === "harvest"
      ? energyStore.base.energy > 25
      : energyStore.type === "withdraw"
      ? energyStore.base.store.getUsedCapacity(RESOURCE_ENERGY) > 0
      : true;
  });
}, "spatial.getSafeEnergyStores");

export const cachePathLength = profileFunction(<T extends _hasPos>(sourcePos: T, store: ActionableTarget) => {
  if (sourcePos.pos.x === store.base.pos.x && sourcePos.pos.y === store.base.pos.y) {
    return 0;
  }
  if (!store.base.room) {
    return 1000;
  }

  const concatenatedPosition = `${store.base.pos.x}_${store.base.pos.y}`;
  store.base.room.memory.cachedPaths ??= {};
  store.base.room.memory.cachedPaths[concatenatedPosition] ??= {};
  store.base.room.memory.cachedPaths[concatenatedPosition][sourcePos.pos.x] ??= {};

  if (!store.base.room.memory.cachedPaths[concatenatedPosition][sourcePos.pos.x][sourcePos.pos.y]) {
    const path = store.base.pos.findPathTo(sourcePos.pos.x, sourcePos.pos.y, { ignoreCreeps: true });
    path.forEach((step, i) => {
      if (!store.base.room) {
        return;
      }

      if (!store.base.room.memory.cachedPaths[concatenatedPosition][step.x]) {
        store.base.room.memory.cachedPaths[concatenatedPosition][step.x] = {};
      }

      store.base.room.memory.cachedPaths[concatenatedPosition][step.x][step.y] ??= i + 1;
    });
    return path.length;
  }

  return store.base.room.memory.cachedPaths[concatenatedPosition][sourcePos.pos.x][sourcePos.pos.y];
}, "spatial.cachePathLength");

export const moveToTargetByCachedPath = profileFunction(
  (
    creep: Creep,
    target: ActionableTarget
    // TODO: Add Visualization Options
  ) => {
    if (!target.base.room) {
      return ERR_NO_PATH;
    }

    const concatenatedPosition = `${target.base.pos.x}_${target.base.pos.y}`;
    target.base.room.memory.cachedPaths ??= {};
    target.base.room.memory.cachedPaths[concatenatedPosition] ??= {};
    target.base.room.memory.cachedPaths[concatenatedPosition][creep.pos.x] ??= {};
    if (!target.base.room.memory.cachedPaths[concatenatedPosition][creep.pos.x][creep.pos.y]) {
      cachePathLength(creep, target);
    }

    let { shortestDistance, direction } = getShortestWalk(target, creep, concatenatedPosition);

    return creep.move(direction[0]);
  },
  "spatial.moveToTargetByCachedPath"
);

export const getNaiveSources = profileFunction((energyStores: EnergyTarget[], creep: Creep) => {
  // If there are hostile creeps, find the closest source with energy that is not within 5 tiles of a hostile creep
  const sortedEnergyStores = getSafeEnergyStores(energyStores)
    .map(store => ({
      ...store,
      pathLength: cachePathLength(creep, store)
    }))
    .sort((a, b) => a.pathLength - b.pathLength);

  return sortedEnergyStores;
}, "spatial.getNaiveSources");

export const findNaiveConstructionSite = profileFunction((constructionSites: ConstructionSite[], creep: Creep) => {
  const sitesByType = constructionSites.reduce((acc, site) => {
    if (!acc[site.structureType]) {
      acc[site.structureType] = [];
    }

    acc[site.structureType].push(site);
    return acc;
  }, {} as Record<BuildableStructureConstant, ConstructionSite[]>);

  if (sitesByType[STRUCTURE_EXTENSION]) {
    return creep.pos.findClosestByPath(sitesByType[STRUCTURE_EXTENSION]) ?? sitesByType[STRUCTURE_EXTENSION][0];
  } else if (sitesByType[STRUCTURE_TOWER]) {
    return creep.pos.findClosestByPath(sitesByType[STRUCTURE_TOWER]) ?? sitesByType[STRUCTURE_TOWER][0];
  } else if (sitesByType[STRUCTURE_ROAD]) {
    return creep.pos.findClosestByPath(sitesByType[STRUCTURE_ROAD]) ?? sitesByType[STRUCTURE_ROAD][0];
  } else {
    return creep.pos.findClosestByPath(constructionSites) ?? constructionSites[0];
  }
}, "spatial.findNaiveConstructionSite");

export const getNaiveTransferTargets = profileFunction(
  (creep: Creep, structures = creep.room.find(FIND_STRUCTURES)) => {
    const targets = (
      structures.filter(structure => {
        return (
          (structure.structureType == STRUCTURE_EXTENSION ||
            structure.structureType == STRUCTURE_SPAWN ||
            (structure.structureType == STRUCTURE_TOWER &&
              structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0.1 * structure.store.getCapacity(RESOURCE_ENERGY))) &&
          structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
        );
      }) as (StructureExtension | StructureSpawn | StructureTower)[]
    ).sort(
      (a, b) =>
        cachePathLength(creep, { type: "transfer", base: a }) - cachePathLength(creep, { type: "transfer", base: b })
    );

    return targets;
  },
  "spatial.getNaiveTransferTarget"
);

const getShortestWalk = profileFunction(
  (
    target: ActionableTarget,
    creep: Creep,
    concatenatedPosition: string = `${target.base.pos.x}_${target.base.pos.y}`
  ) => {
    let shortestDistance: number | undefined = undefined;
    let direction = DIRECTIONS[0] as (typeof DIRECTIONS)[number];
    for (const dir of DIRECTIONS) {
      if (!target.base.room) {
        break;
      }

      const distance =
        target.base.room.memory.cachedPaths[concatenatedPosition][creep.pos.x + dir[1][0]][creep.pos.y + dir[1][1]];

      shortestDistance ??= distance;

      if (distance < shortestDistance) {
        shortestDistance = distance;
        direction = dir;
        break;
      }
    }

    return { shortestDistance, direction };
  },
  "spatial.getShortestWalk"
);
