import { getExistingExtensions, getPlannedRoadsSteps } from "architect";
import {
  EnergyTarget,
  findNaiveConstructionSite,
  getNaiveSources as getNaiveSources,
  getNaiveTransferTargets,
  moveToTargetByCachedPath,
  PATH_COLORS
} from "./utils";
import { profileFunction } from "utils/screeps-profiler";

export const switchState = (creep: Creep, newState: CreepMemory["state"]) => {
  if (creep.memory.state === newState) return;

  creep.memory.state = newState;
  newState && creep.say(newState);
  console.log(`[${Game.time.toLocaleString()}]: Room ${creep.room.name}, ${creep.name} Switching to ${newState}`);
};

export const getUnplannedStructures = profileFunction(
  (room: Room, structures = room.find(FIND_STRUCTURES), plannedRoadSteps = getPlannedRoadsSteps(room)) => {
    // If there is a building that is unplanned, dismantle it
    const extensions = structures.filter(structure => structure.structureType === STRUCTURE_EXTENSION);

    // const plannedExtensions = Memory.rooms[room.name].extensions
    //   .filter(struct => struct.planned === true)
    //   .map(extension => `${extension.pos.x}_${extension.pos.y}`);

    if (!plannedRoadSteps.length) {
      return extensions as AnyStructure[];
    }

    const plannedRoads = plannedRoadSteps.map(road => `${road.x}_${road.y}`);
    // if (extensions.some(extension => plannedRoads.includes(`${extension.pos.x}_${extension.pos.y}`))) {
    //   console.log(`Unexpected overlap between planned extensions and roads`);
    //   console.log(`Recomputing planned extensions`);
    //   Memory.rooms[room.name].extensions = getExistingExtensions(room);
    //   // return;
    // }

    const unplannedStructures = extensions.filter(structure =>
      plannedRoads.includes(`${structure.pos.x}_${structure.pos.y}`)
    );
    if (unplannedStructures.length) {
      unplannedStructures.forEach(structure => {
        // console.log(`[${Game.time.toLocaleString()}]: Unplanned structure found at ${structure.pos}`);
        room.visual.text("X!", structure.pos.x, structure.pos.y, { color: "red" });
      });
    }

    return unplannedStructures as AnyStructure[];
  },
  "getUnplannedStructures"
);

export const laborerTick = profileFunction(
  (
    creep: Creep,
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
    transferTargets: (StructureExtension | StructureSpawn | StructureTower)[]
  ) => {
    if (
      !creep.memory.state ||
      creep.store[RESOURCE_ENERGY] === 0 ||
      (creep.memory.state === "harvesting" && creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0)
    ) {
      switchState(creep, "harvesting");
    } else if (creep.room.energyAvailable >= creep.room.energyCapacityAvailable) {
      if (
        (constructionSites.length || unplannedStructures.length) &&
        creep.room.controller &&
        creep.room.controller.ticksToDowngrade > 1000 &&
        creep.room.controller.level > 1
      ) {
        switchState(creep, "building");
      } else {
        switchState(creep, "upgrading");
      }
    } else if (
      creep.store.getFreeCapacity(RESOURCE_ENERGY) === 0 ||
      (creep.memory.state === "transferring" && creep.store[RESOURCE_ENERGY] > 0)
    ) {
      switchState(creep, "transferring");
    }

    switch (creep.memory.state) {
      case "building": {
        const tooCloseToSource = sources.find(source => source.pos.inRangeTo(creep.pos, 1));
        if (tooCloseToSource) {
          creep.moveTo(25, 25);
          return;
        }

        if (constructionSites.length) {
          const target = findNaiveConstructionSite(constructionSites, creep);

          if (creep.build(target) == ERR_NOT_IN_RANGE) {
            creep.memory.target = target.id;

            // const message = `[${creep.name}]: Moving to construction site ${target.id} at ${target.pos}`;
            // console.log(message);
            moveToTargetByCachedPath(
              creep,
              { type: "build", base: target },
              { stroke: PATH_COLORS[creep.memory.state] }
            );
          }

          break;
        } else if (unplannedStructures.length && creep.store.getFreeCapacity(RESOURCE_ENERGY) > 0) {
          const target = creep.pos.findClosestByPath(unplannedStructures);
          if (!target) {
            console.log(`[${creep.name}]: No unplanned structures found`);
            return;
          }

          if (creep.dismantle(target) === ERR_NOT_IN_RANGE) {
            creep.memory.target = target.id;
            moveToTargetByCachedPath(
              creep,
              { type: "dismantle", base: target },
              { stroke: PATH_COLORS[creep.memory.state] }
            );
          }
        }

        break;
      }
      case "harvesting": {
        for (const energyTarget of energyTargets) {
          if (energyTarget.type === "harvest" && creep.harvest(energyTarget.base) === OK) {
            creep.memory.target = energyTarget.base.id;
            return;
          } else if (energyTarget.type === "pickup" && creep.pickup(energyTarget.base) === OK) {
            creep.memory.target = energyTarget.base.id;
            return;
          } else if (energyTarget.type === "withdraw" && creep.withdraw(energyTarget.base, RESOURCE_ENERGY) === OK) {
            creep.memory.target = energyTarget.base.id;
            return;
          }
        }

        const naivestPrimaryTargets = getNaiveSources(primaryEnergyTargets, creep);

        if (!naivestPrimaryTargets.length) {
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
          naivestPrimaryTargets.push(
            ...getNaiveSources(
              sources.map(source => ({ type: "harvest" as const, base: source })),
              creep
            )
          );
        }

        for (const target of naivestPrimaryTargets) {
          if (
            target.type === "harvest" &&
            creep.harvest(target.base) === ERR_NOT_IN_RANGE &&
            moveToTargetByCachedPath(creep, target, { stroke: PATH_COLORS[creep.memory.state] }) === OK
          ) {
            creep.memory.target = target.base.id;
          } else if (
            target.type === "pickup" &&
            creep.pickup(target.base) === ERR_NOT_IN_RANGE &&
            moveToTargetByCachedPath(creep, target, { stroke: PATH_COLORS[creep.memory.state] }) === OK
          ) {
            creep.memory.target = target.base.id;
          } else if (
            target.type === "withdraw" &&
            creep.withdraw(target.base, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE &&
            moveToTargetByCachedPath(creep, target, { stroke: PATH_COLORS[creep.memory.state] }) === OK
          ) {
            creep.memory.target = target.base.id;
          }

          // console.log(`[${Game.time.toLocaleString()}]: ${creep.name} moving to ${source.type}: ${source.base.id}`);
          return;
        }

        const naivestSources = getNaiveSources(energyTargets, creep);

        if (!naivestSources.length) {
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
          naivestSources.push(
            ...getNaiveSources(
              sources.map(source => ({ type: "harvest" as const, base: source })),
              creep
            )
          );
        }

        for (const target of naivestSources) {
          if (
            target.type === "harvest" &&
            creep.harvest(target.base) === ERR_NOT_IN_RANGE &&
            moveToTargetByCachedPath(creep, target, { stroke: PATH_COLORS[creep.memory.state] }) === OK
          ) {
            creep.memory.target = target.base.id;
          } else if (
            target.type === "pickup" &&
            creep.pickup(target.base) === ERR_NOT_IN_RANGE &&
            moveToTargetByCachedPath(creep, target, { stroke: PATH_COLORS[creep.memory.state] }) === OK
          ) {
            creep.memory.target = target.base.id;
          } else if (
            target.type === "withdraw" &&
            creep.withdraw(target.base, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE &&
            moveToTargetByCachedPath(creep, target, { stroke: PATH_COLORS[creep.memory.state] }) === OK
          ) {
            creep.memory.target = target.base.id;
          }

          // console.log(`[${Game.time.toLocaleString()}]: ${creep.name} moving to ${source.type}: ${source.base.id}`);
          return;
        }
      }

      case "transferring": {
        const targets = getNaiveTransferTargets(creep, transferTargets);

        for (const target of targets) {
          const transferResult = creep.transfer(target, RESOURCE_ENERGY);
          if (transferResult === ERR_NOT_IN_RANGE) {
            creep.memory.target = target.id;
            moveToTargetByCachedPath(
              creep,
              { type: "transfer", base: target },
              { stroke: PATH_COLORS[creep.memory.state] }
            );
            return;
          } else if (transferResult !== OK) {
            console.log(`[${creep.name}]: Transfer result: ${transferResult}`);
            return;
          }
        }

        break;
      }

      case "upgrading": {
        if (creep.room.controller && creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
          creep.memory.target = creep.room.controller.id;

          moveToTargetByCachedPath(
            creep,
            { type: "upgrade", base: creep.room.controller },
            { stroke: PATH_COLORS[creep.memory.state] }
          );
        }

        break;
      }
    }
  },
  "laborerTick"
);
