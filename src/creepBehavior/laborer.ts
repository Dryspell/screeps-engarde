import { getExistingExtensions, getPlannedRoadsSteps } from "architect";
import { EnergyTarget, findNaiveConstructionSite, getNaiveSources as getNaiveSources, PATH_COLORS } from "./utils";

export const switchState = (creep: Creep, newState: CreepMemory["state"]) => {
  if (creep.memory.state === newState) return;

  creep.memory.state = newState;
  newState && creep.say(newState);
  console.log(`[${Game.time.toLocaleString()}]: ${creep.name} Switching to ${newState}`);
};

//! Currently only implemented for extensions
export const getUnplannedStructures = (room: Room, structures = room.find(FIND_MY_STRUCTURES)) => {
  // If there is a building that is unplanned, dismantle it
  const extensions = structures.filter(structure => structure.structureType === STRUCTURE_EXTENSION);

  const plannedExtensions = Memory.rooms[room.name].extensions
    .filter(struct => struct.planned === true)
    .map(extension => `${extension.pos.x}_${extension.pos.y}`);

  const plannedRoads = getPlannedRoadsSteps(room).map(road => `${road.x}_${road.y}`);

  if (plannedExtensions.some(extension => plannedRoads.includes(extension))) {
    console.log(`Unexpected overlap between planned extensions and roads`);
    console.log(`Recomputing planned extensions`);
    Memory.rooms[room.name].extensions = getExistingExtensions(room);
    // return;
  }

  const unplannedStructures = extensions.filter(
    structure => !plannedExtensions.includes(`${structure.pos.x}_${structure.pos.y}`)
  );
  return unplannedStructures as AnyOwnedStructure[];
};

export const laborerTick = (
  creep: Creep,
  sources = creep.room.find(FIND_SOURCES),
  constructionSites = creep.room.find(FIND_MY_CONSTRUCTION_SITES),
  droppedResources = creep.room.find(FIND_DROPPED_RESOURCES, {
    filter: resource => resource.resourceType === RESOURCE_ENERGY
  }),
  structures = creep.room.find(FIND_MY_STRUCTURES),
  ruins = creep.room.find(FIND_RUINS),
  tombstones = creep.room.find(FIND_TOMBSTONES),
  unplannedStructures = getUnplannedStructures(creep.room),
  energyTarget: EnergyTarget | undefined
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
          creep.moveTo(target, { visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state] } });
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
          creep.moveTo(target, { visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state] } });
        }
      }

      break;
    }
    case "harvesting": {
      const naiveEnergyTargets = energyTarget ? getNaiveSources([energyTarget], creep) : [];

      const naivestSources = naiveEnergyTargets.length
        ? naiveEnergyTargets
        : getNaiveSources(
            [
              ...sources.map(source => ({ type: "harvest" as const, base: source })),
              ...droppedResources.map(
                resource => ({ type: "pickup", base: resource } as { type: "pickup"; base: Resource<RESOURCE_ENERGY> })
              ),
              ...(
                structures.filter(
                  struct =>
                    // @ts-ignore
                    struct.structureType === STRUCTURE_CONTAINER || struct.structureType === STRUCTURE_STORAGE
                ) as (StructureContainer | StructureStorage)[]
              ).map(
                container =>
                  ({ type: "withdraw", base: container } as {
                    type: "withdraw";
                    base: StructureContainer | StructureStorage;
                  })
              ),
              ...ruins.map(ruin => ({ type: "withdraw", base: ruin } as { type: "withdraw"; base: Ruin })),
              ...tombstones.map(
                tombstone => ({ type: "withdraw", base: tombstone } as { type: "withdraw"; base: Tombstone })
              )
            ],
            creep
          );
      if (!naivestSources.length) {
        console.log(
          `[${Game.time.toLocaleString()}]: ${creep.name} in room ${creep.room.name}; No naive energy source found`
        );
        return;
      }

      for (const source of [naivestSources[0]]) {
        if (source.type === "harvest" && creep.harvest(source.base) === ERR_NOT_IN_RANGE) {
          creep.memory.target = source.base.id;
          creep.moveTo(source.base, { visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state] } });
        } else if (source.type === "pickup" && creep.pickup(source.base) === ERR_NOT_IN_RANGE) {
          creep.memory.target = source.base.id;
          creep.moveTo(source.base, { visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state] } });
        } else if (source.type === "withdraw" && creep.withdraw(source.base, RESOURCE_ENERGY) === ERR_NOT_IN_RANGE) {
          creep.memory.target = source.base.id;
          creep.moveTo(source.base, { visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state] } });
        }

        // console.log(`[${Game.time.toLocaleString()}]: ${creep.name} moving to ${source.type}: ${source.base.id}`);
        return;
      }
    }

    case "transferring": {
      const target = creep.room.find(FIND_MY_STRUCTURES, {
        filter: structure => {
          return (
            (structure.structureType === STRUCTURE_EXTENSION || structure.structureType === STRUCTURE_SPAWN) &&
            structure.store.getFreeCapacity(RESOURCE_ENERGY) > 0
          );
        }
      })[0];

      const transferResult = creep.transfer(target, RESOURCE_ENERGY);
      if (transferResult === ERR_NOT_IN_RANGE) {
        creep.memory.target = target.id;
        creep.moveTo(target, { visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state] } });
      } else if (transferResult !== OK) {
        console.log(`[${creep.name}]: Transfer result: ${transferResult}`);
      }

      break;
    }

    case "upgrading": {
      if (creep.room.controller && creep.upgradeController(creep.room.controller) === ERR_NOT_IN_RANGE) {
        creep.memory.target = creep.room.controller.id;
        creep.moveTo(creep.room.controller, { visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state] } });
      }

      break;
    }
  }
};
