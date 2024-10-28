import { _hasPos, costCallback, distance2, serializeCoord, walkableStructures } from "spatial/spatial-utils";
import { profileFunction } from "utils/screeps-profiler";

export const PATH_COLORS = {
  harvesting: "#ffaa00",
  transferring: "#00FFFF",
  building: "##00FF00",
  dismantling: "##00FF00",
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

export const getSafeEnergyTargets = profileFunction(
  (energyTargets: EnergyTarget[], hostileCreeps = energyTargets[0].base.room?.find(FIND_HOSTILE_CREEPS)) => {
    if (!hostileCreeps?.length) {
      return energyTargets;
    }

    return energyTargets.filter(energyTarget => hostileCreeps?.find(creep => distance2(creep, energyTarget.base) < 25));
  },
  "spatial.getSafeEnergyStores"
);

export const cachePath = profileFunction(<T extends _hasPos>(sourcePos: T, target: ActionableTarget) => {
  if (sourcePos.pos.x !== Math.round(sourcePos.pos.x) || sourcePos.pos.y !== Math.round(sourcePos.pos.y)) {
    const message = `Invalid sourcePos: ${sourcePos.pos.x}, ${sourcePos.pos.y}`;
    console.error(message);
    throw new Error(message);
  }
  if (target.base.pos.x !== Math.round(target.base.pos.x) || target.base.pos.y !== Math.round(target.base.pos.y)) {
    const message = `Invalid targetPos: ${target.base.pos.x}, ${target.base.pos.y}`;
    console.error(message);
    throw new Error(message);
  }

  if (sourcePos.pos.x === target.base.pos.x && sourcePos.pos.y === target.base.pos.y) {
    return "";
  }
  const room = target.base.room;
  if (!room) {
    return "";
  }

  room.memory.cachedPaths ??= {};
  room.memory.cachedPaths[target.base.pos.x] ??= {};
  room.memory.cachedPaths[target.base.pos.x][target.base.pos.y] ??= {};
  room.memory.cachedPaths[target.base.pos.x][target.base.pos.y][sourcePos.pos.x] ??= {};

  if (!room.memory.cachedPaths[target.base.pos.x][target.base.pos.y][sourcePos.pos.x][sourcePos.pos.y]) {
    const roomPosition = new RoomPosition(sourcePos.pos.x, sourcePos.pos.y, room.name);
    const path = roomPosition.findPathTo(target.base.pos.x, target.base.pos.y, {
      ignoreCreeps: true,
      costCallback: costCallback(Memory.rooms[room.name].paths?.map(p => p.path))
    });

    if (!path?.length) {
      console.log(
        `No path found from ${sourcePos.pos.x},${sourcePos.pos.y} to ${target.base.pos.x},${target.base.pos.y}`,
        path.map(path => `(${path.x},${path.y})`).join("->")
      );
      return "";
    }

    const serializedPath = Room.serializePath(path);
    room.memory.cachedPaths[target.base.pos.x][target.base.pos.y][sourcePos.pos.x][sourcePos.pos.y] ??= serializedPath;

    path.forEach((step, i) => {
      if (!room) {
        return;
      }
      if (room.memory.cachedPaths[target.base.pos.x]?.[target.base.pos.y]?.[step.x]?.[step.y]) return;

      room.memory.cachedPaths[target.base.pos.x][target.base.pos.y][step.x] ??= {};
      room.memory.cachedPaths[target.base.pos.x][target.base.pos.y][step.x][step.y] ??= `${serializeCoord(
        step.x
      )}${serializeCoord(step.y)}${serializedPath.slice(4 + i)}`;
    });
  }

  const res = room.memory.cachedPaths[target.base.pos.x][target.base.pos.y][sourcePos.pos.x][sourcePos.pos.y];

  // if (!res) {
  //   console.log(
  //     `No path found from ${sourcePos.pos.x},${sourcePos.pos.y} to ${target.base.pos.x},${target.base.pos.y}`
  //   );
  // }

  return res;
}, "spatial.cachePath");

export const moveToTargetByCachedPath = profileFunction(
  (creep: Creep, target: ActionableTarget, visualizePathStyle?: MapPolyStyle) => {
    const room = target.base.room;
    if (!room) {
      return ERR_NO_PATH;
    }
    if (creep.fatigue) {
      return ERR_TIRED;
    }

    room.memory.cachedPaths ??= {};
    room.memory.cachedPaths[target.base.pos.x] ??= {};
    room.memory.cachedPaths[target.base.pos.x][target.base.pos.y] ??= {};
    room.memory.cachedPaths[target.base.pos.x][target.base.pos.y][creep.pos.x] ??= {};
    const path = cachePath(creep, target);

    if (!path) {
      console.log(`Could not find path for ${creep.name}`);
      return ERR_NO_PATH;
    }

    const deserializedPath = Room.deserializePath(Memory.visual.cachedPaths ? path : path.slice(0, 6)).map(
      (step, i, p) => ({
        ...step,
        x: step.x - p[0].x + creep.pos.x,
        y: step.y - p[0].y + creep.pos.y
      })
    );

    if (Memory.visual.cachedPaths) {
      // console.log(
      //   `Deserialized path (${target.base.pos.x},${target.base.pos.y}), (${creep.pos.x}, ${creep.pos.y}):`,
      //   JSON.stringify(deserializedPath)
      // );

      creep.room.visual.poly(
        deserializedPath.map(p => [p.x, p.y]),
        { ...visualizePathStyle, stroke: "magenta" }
      );
    }

    if (!deserializedPath[1]) {
      // console.log(`[${Game.time}] ${creep.room.name} ${creep.name} Invalid path: ${JSON.stringify(deserializedPath)}`);
      return ERR_NO_PATH;
    }

    // console.log(`${JSON.stringify(creep.pos)}, ${JSON.stringify(deserializedPath[1])}`);
    // const nextStep = new RoomPosition(deserializedPath[1].x, deserializedPath[1].y, creep.room.name);

    const obstructions = deserializedPath
      .slice(1)
      .map(step =>
        new RoomPosition(step.x, step.y, creep.room.name)
          .look()
          .filter(
            lookResult =>
              (lookResult.structure && !walkableStructures.includes(lookResult.structure.structureType)) ||
              lookResult.terrain === "wall" ||
              lookResult.creep
          )
          .map(lookResult => ({ ...lookResult, ...step }))
      )
      .filter(lookResults => lookResults.length);

    if (obstructions.length) {
      for (const obstructionListByPos of obstructions) {
        if (obstructionListByPos.every(lookResult => lookResult.creep)) {
          continue;
        }

        console.log(
          `${creep.room.name} ${creep.name} Cached path was obstructed from ${creep.pos.x},${creep.pos.y} to ${
            target.base.pos.x
          },${target.base.pos.y} at ${obstructionListByPos[0].x},${obstructionListByPos[0].y} by ${obstructionListByPos
            .map(obs => obs.type)
            .join(", ")}`
        );
        creep.room.visual.text("!", obstructionListByPos[0].x, obstructionListByPos[0].y, { color: "red" });
        delete room.memory.cachedPaths[target.base.pos.x][target.base.pos.y][creep.pos.x][creep.pos.y];
        break;
      }

      return creep.moveTo(target.base, { visualizePathStyle });
    } else {
      return creep.move(deserializedPath[1].direction);
    }

    // return path.slice(4).length < 5 ? creep.moveTo(target.base, { visualizePathStyle }) : creep.moveByPath(path);
  },
  "spatial.moveToTargetByCachedPath"
);

export const getClosestSources = profileFunction((energyStores: EnergyTarget[], creep: Creep) => {
  // If there are hostile creeps, find the closest source with energy that is not within 5 tiles of a hostile creep
  const sortedEnergyStores = energyStores
    .map(store => ({
      ...store,
      pathLength: cachePath(creep, store).length
    }))
    .sort((a, b) => a.pathLength - b.pathLength);

  return sortedEnergyStores;
}, "spatial.getNaiveSources");

export const findNaiveConstructionSite = profileFunction((constructionSites: ConstructionSite[], creep: Creep) => {
  const sitesByLength = constructionSites.map(site => ({
    type: "build" as const,
    base: site,
    pathLength: cachePath(creep, { type: "build", base: site }).length
  }));
  const sitesByType = sitesByLength.reduce((acc, site) => {
    if (!acc[site.base.structureType]) {
      acc[site.base.structureType] = [];
    }

    acc[site.base.structureType].push(site);
    return acc;
  }, {} as Record<BuildableStructureConstant, { type: "build"; base: ConstructionSite; pathLength: number }[]>);

  if (sitesByType[STRUCTURE_EXTENSION]) {
    return sitesByType[STRUCTURE_EXTENSION].sort((a, b) => a.pathLength - b.pathLength)[0];
  } else if (sitesByType[STRUCTURE_TOWER]) {
    return sitesByType[STRUCTURE_TOWER].sort((a, b) => a.pathLength - b.pathLength)[0];
  } else if (sitesByType[STRUCTURE_ROAD]) {
    return sitesByType[STRUCTURE_ROAD].sort((a, b) => a.pathLength - b.pathLength)[0];
  } else {
    return sitesByLength.sort((a, b) => a.pathLength - b.pathLength)[0];
  }
}, "spatial.findNaiveConstructionSite");

export const getNaiveTransferTargets = profileFunction(
  (creep: Creep, transferTargets: (StructureExtension | StructureSpawn | StructureTower)[]) => {
    const targets = transferTargets.sort(
      (a, b) =>
        cachePath(creep, { type: "transfer", base: a }).length - cachePath(creep, { type: "transfer", base: b }).length
    );

    return targets;
  },
  "spatial.getNaiveTransferTarget"
);
