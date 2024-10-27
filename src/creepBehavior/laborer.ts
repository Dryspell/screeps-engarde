import { getPlannedRoadsSteps } from "buildings/roads";
import {
  EnergyTarget,
  findNaiveConstructionSite,
  getClosestSources as getClosestSources,
  getNaiveTransferTargets,
  moveToTargetByCachedPath,
  PATH_COLORS,
  TransferTarget
} from "./utils";
import { profileFunction } from "utils/screeps-profiler";
import { getUnplannedStructures } from "buildings/utils";
import { _hasPos, distance2, splitByAdjacency } from "spatial/spatial-utils";

export const switchState = (creep: Creep, newState: CreepMemory["state"]) => {
  if (creep.memory.state === newState) return;

  creep.memory.state = newState;
  newState && creep.say(newState);
  console.log(`[${Game.time.toLocaleString()}]: Room ${creep.room.name}, ${creep.name} Switching to ${newState}`);
};

const laborerState = profileFunction(
  (
    creep: Creep,
    constructionSites: ConstructionSite<BuildableStructureConstant>[],
    unplannedStructures: AnyStructure[],
    energyTargets: EnergyTarget[],
    transferTargets: TransferTarget[]
  ) => {
    if (
      !creep.memory.state ||
      creep.store[RESOURCE_ENERGY] === 0 ||
      (creep.memory.state === "harvesting" && creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
    ) {
      switchState(creep, "harvesting");
    } else if (
      creep.room.energyAvailable >= creep.room.energyCapacityAvailable &&
      (constructionSites.length || unplannedStructures.length) &&
      creep.room.controller &&
      creep.room.controller.ticksToDowngrade > 1000 &&
      creep.room.controller.level > 1
    ) {
      switchState(creep, "building");
    } else if (creep.room.controller && creep.room.energyAvailable >= creep.room.energyCapacityAvailable) {
      switchState(creep, "upgrading");
    } else if (
      transferTargets.length &&
      (creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0 ||
        (creep.memory.state === "transferring" && creep.store[RESOURCE_ENERGY] > 0))
    ) {
      switchState(creep, "transferring");
    } else {
      switchState(creep, "upgrading");
    }
  },
  "creeps.behavior.laborer.state"
);

const laborerBuild = profileFunction(
  (
    creep: Creep,
    spawns: StructureSpawn[],
    sources = creep.room.find(FIND_SOURCES),
    structures = creep.room.find(FIND_STRUCTURES),
    constructionSites = creep.room.find(FIND_MY_CONSTRUCTION_SITES),
    unplannedStructures = getUnplannedStructures(creep.room, structures, constructionSites)
  ) => {
    const tooCloseToSource = sources.find(source => distance2(creep, source) < 2);
    if (tooCloseToSource) {
      moveToTargetByCachedPath(creep, { type: "transfer", base: spawns[0] }, { stroke: PATH_COLORS["building"] });
      return;
    }

    if (constructionSites.length) {
      const target = findNaiveConstructionSite(constructionSites, creep);

      if (creep.build(target.base) == ERR_NOT_IN_RANGE) {
        creep.memory.target = target.base.id;

        // const message = `[${creep.name}]: Moving to construction site ${target.id} at ${target.pos}`;
        // console.log(message);
        moveToTargetByCachedPath(creep, target, { stroke: PATH_COLORS["building"] });
      }

      return;
    } else if (unplannedStructures.length && creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
      const target = creep.pos.findClosestByPath(unplannedStructures);
      if (!target) {
        console.log(`[${creep.name}]: No unplanned structures found`);
        return;
      }

      if (creep.dismantle(target) === ERR_NOT_IN_RANGE) {
        creep.memory.target = target.id;
        moveToTargetByCachedPath(creep, { type: "dismantle", base: target }, { stroke: PATH_COLORS["building"] });
      }
    }
  },
  "creeps.behavior.laborer.build"
);

const getEnergyFromEnergyTarget = profileFunction((energyTarget: EnergyTarget, creep: Creep) => {
  if (energyTarget.type === "harvest" && creep.harvest(energyTarget.base) === OK) {
    creep.memory.target = energyTarget.base.id;
    return OK;
  } else if (energyTarget.type === "pickup" && creep.pickup(energyTarget.base) === OK) {
    creep.memory.target = energyTarget.base.id;
    return OK;
  } else if (energyTarget.type === "withdraw" && creep.withdraw(energyTarget.base, RESOURCE_ENERGY) === OK) {
    creep.memory.target = energyTarget.base.id;
    return OK;
  }
  return ERR_NOT_IN_RANGE;
}, "getEnergyFromEnergyTarget");

const laborerHarvest = profileFunction(
  (
    creep: Creep,
    sources = creep.room.find(FIND_SOURCES),
    energyTargets: EnergyTarget[],
    primaryEnergyTargets: EnergyTarget[]
  ) => {
    const { adjacent, nonAdjacent } = splitByAdjacency(creep, energyTargets);

    const adjacentEnergyTarget = energyTargets.find(target => distance2(creep, target.base) < 2);
    if (adjacentEnergyTarget && getEnergyFromEnergyTarget(adjacentEnergyTarget, creep) === OK) {
      return;
    }

    for (const targetCollection of [primaryEnergyTargets, energyTargets]) {
      const sortedTargetsByDistance = getClosestSources(targetCollection, creep);

      if (!sortedTargetsByDistance.length) {
        console.log(
          `[${Game.time.toLocaleString()}]: ${creep.name} in room ${
            creep.room.name
          }; No naive energy source found, ${energyTargets
            .map(
              target =>
                `${target.type}: (${target.base.pos.x}, ${target.base.pos.y}) ${
                  target.type === "withdraw" ? target.base.store.getUsedCapacity(RESOURCE_ENERGY) : "UNKNOWN"
                }`
            )
            .join(" | ")}`
        );
        sortedTargetsByDistance.push(
          ...getClosestSources(
            sources.map(source => ({ type: "harvest" as const, base: source })),
            creep
          )
        );
      }

      // console.log(
      //   `[${Game.time.toLocaleString()}] Room ${creep.room.name} Creep ${
      //     creep.name
      //   } Primary Energy Targets ${naivestPrimaryTargets
      //     .map(target => `${target.type} (${target.base.pos.x}, ${target.base.pos.y})`)
      //     .join(" | ")}`
      // );

      for (const target of sortedTargetsByDistance) {
        if (
          target.type === "harvest" &&
          creep.harvest(target.base) === ERR_NOT_IN_RANGE &&
          moveToTargetByCachedPath(creep, target, { stroke: PATH_COLORS["harvesting"] }) === OK
        ) {
          creep.memory.target = target.base.id;
          return;
        } else if (
          target.type === "pickup" &&
          creep.pickup(target.base) === ERR_NOT_IN_RANGE &&
          moveToTargetByCachedPath(creep, target, { stroke: PATH_COLORS["harvesting"] }) === OK
        ) {
          creep.memory.target = target.base.id;
          return;
        } else if (
          target.type === "withdraw" &&
          creep.withdraw(target.base, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE &&
          moveToTargetByCachedPath(creep, target, { stroke: PATH_COLORS["harvesting"] }) === OK
        ) {
          creep.memory.target = target.base.id;
          return;
        }

        // console.log(`[${Game.time.toLocaleString()}]: ${creep.name} moving to ${source.type}: ${source.base.id}`);
        return;
      }
    }
  },
  "creeps.behavior.laborer.harvest"
);

const laborerTransfer = profileFunction((creep: Creep, transferTargets: TransferTarget[]) => {
  const { adjacent, nonAdjacent } = splitByAdjacency(creep, transferTargets);

  for (const adjacentTransferTarget of adjacent) {
    if (creep.transfer(adjacentTransferTarget.base, RESOURCE_ENERGY) === OK) {
      return;
    }
  }

  for (const target of nonAdjacent) {
    const transferResult = creep.transfer(target.base, RESOURCE_ENERGY);
    if (transferResult === ERR_NOT_IN_RANGE) {
      creep.memory.target = target.base.id;
      moveToTargetByCachedPath(creep, target, { stroke: PATH_COLORS["transferring"] });
      return;
    } else if (transferResult !== OK) {
      console.log(`[${creep.name}]: Transfer result: ${transferResult}`);
      return;
    }
  }

  return;
}, "creeps.behavior.laborer.transfer");

const laborerUpgrade = profileFunction((creep: Creep) => {
  if (creep.room.controller && creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
    creep.memory.target = creep.room.controller.id;

    moveToTargetByCachedPath(
      creep,
      { type: "upgrade", base: creep.room.controller },
      { stroke: PATH_COLORS["upgrading"] }
    );
  }
}, "creeps.behavior.laborer.upgrade");

export const laborerTick = profileFunction(
  (
    creep: Creep,
    spawns: StructureSpawn[],
    sources = creep.room.find(FIND_SOURCES),
    constructionSites = creep.room.find(FIND_MY_CONSTRUCTION_SITES),
    droppedResources = creep.room.find(FIND_DROPPED_RESOURCES, {
      filter: resource => resource.resourceType === RESOURCE_ENERGY
    }),
    structures = creep.room.find(FIND_STRUCTURES),
    ruins = creep.room.find(FIND_RUINS),
    tombstones = creep.room.find(FIND_TOMBSTONES),
    unplannedStructures = getUnplannedStructures(creep.room),
    energyTargets: EnergyTarget[],
    primaryEnergyTargets: EnergyTarget[],
    transferTargets: TransferTarget[]
  ) => {
    laborerState(creep, constructionSites, unplannedStructures, energyTargets, transferTargets);

    switch (creep.memory.state) {
      case "building": {
        return laborerBuild(creep, spawns, sources, structures, constructionSites, unplannedStructures);
      }

      case "harvesting": {
        return laborerHarvest(creep, sources, energyTargets, primaryEnergyTargets);
      }

      case "transferring": {
        return laborerTransfer(creep, transferTargets);
      }

      case "upgrading": {
        return laborerUpgrade(creep);
      }
    }
  },
  "creeps.behavior.laborer.tick"
);
