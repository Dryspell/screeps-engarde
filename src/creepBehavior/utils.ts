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

export type DismantleTarget = {
  type: "dismantle";
  base: Structure;
};

export type ActionableTarget = EnergyTarget | TransferTarget | BuildTarget | UpgradeTarget | DismantleTarget;

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

export const cachePathLength = profileFunction(<T extends _hasPos>(sourcePos: T, target: ActionableTarget) => {
  if (sourcePos.pos.x === target.base.pos.x && sourcePos.pos.y === target.base.pos.y) {
    return "";
  }
  if (!target.base.room) {
    return "";
  }

  target.base.room.memory.cachedPaths ??= {};
  target.base.room.memory.cachedPaths[target.base.pos.x] ??= {};
  target.base.room.memory.cachedPaths[target.base.pos.x][target.base.pos.y] ??= {};
  target.base.room.memory.cachedPaths[target.base.pos.x][target.base.pos.y][sourcePos.pos.x] ??= {};

  if (!target.base.room.memory.cachedPaths[target.base.pos.x][target.base.pos.y][sourcePos.pos.x][sourcePos.pos.y]) {
    const path = new RoomPosition(sourcePos.pos.x, sourcePos.pos.y, target.base.room.name).findPathTo(
      target.base.pos.x,
      target.base.pos.y,
      { ignoreCreeps: true }
    );
    if (!path?.length) {
      console.log(
        `No path found from ${sourcePos.pos.x},${sourcePos.pos.y} to ${target.base.pos.x},${target.base.pos.y}`,
        path.map(path => `(${path.x},${path.y})`).join("->")
      );
    }

    const serializedPath = Room.serializePath(path);

    path.forEach((step, i) => {
      if (!target.base.room) {
        return;
      }

      target.base.room.memory.cachedPaths[target.base.pos.x][target.base.pos.y][step.x - step.dx] ??= {};
      target.base.room.memory.cachedPaths[target.base.pos.x][target.base.pos.y][step.x - step.dx][step.y - step.dy] ??=
        serializedPath.slice(i);
    });
  }

  const res =
    target.base.room.memory.cachedPaths[target.base.pos.x][target.base.pos.y][sourcePos.pos.x][sourcePos.pos.y];

  // if (!res) {
  //   console.log(
  //     `No path found from ${sourcePos.pos.x},${sourcePos.pos.y} to ${target.base.pos.x},${target.base.pos.y}`
  //   );
  // }

  return res;
}, "spatial.cachePathLength");

export const moveToTargetByCachedPath = profileFunction(
  (creep: Creep, target: ActionableTarget, visualizationStyle?: MapPolyStyle) => {
    if (!target.base.room) {
      return ERR_NO_PATH;
    }

    target.base.room.memory.cachedPaths ??= {};
    target.base.room.memory.cachedPaths[target.base.pos.x] ??= {};
    target.base.room.memory.cachedPaths[target.base.pos.x][target.base.pos.y] ??= {};
    target.base.room.memory.cachedPaths[target.base.pos.x][target.base.pos.y][creep.pos.x] ??= {};
    if (!target.base.room.memory.cachedPaths[target.base.pos.x][target.base.pos.y][creep.pos.x][creep.pos.y]) {
      cachePathLength(creep, target);
    }

    if (!target.base.room.memory.cachedPaths[target.base.pos.x][target.base.pos.y][creep.pos.x][creep.pos.y]) {
      return ERR_NO_PATH;
    }

    //@ts-ignore
    creep.memory._move =
      target.base.room.memory.cachedPaths[target.base.pos.x][target.base.pos.y][creep.pos.x][creep.pos.y];

    return creep.moveTo(target.base, {
      visualizePathStyle: visualizationStyle
    });
  },
  "spatial.moveToTargetByCachedPath"
);

export const getNaiveSources = profileFunction((energyStores: EnergyTarget[], creep: Creep) => {
  // If there are hostile creeps, find the closest source with energy that is not within 5 tiles of a hostile creep
  const sortedEnergyStores = getSafeEnergyStores(energyStores)
    .map(store => ({
      ...store,
      pathLength: cachePathLength(creep, store).length
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
  (creep: Creep, transferTargets: (StructureExtension | StructureSpawn | StructureTower)[]) => {
    const targets = transferTargets.sort(
      (a, b) =>
        cachePathLength(creep, { type: "transfer", base: a }).length -
        cachePathLength(creep, { type: "transfer", base: b }).length
    );

    return targets;
  },
  "spatial.getNaiveTransferTarget"
);
