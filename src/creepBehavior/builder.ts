import { getExits } from "buildings/utils";
import { findNaiveTarget, getNaiveSource, PATH_COLORS } from "./utils";
import { upgraderTick } from "./upgrader";
import { getExistingExtensions, getPlannedRoads } from "architect";

export const builderTick = (creep: Creep) => {
  const constructionSites = creep.room.find(FIND_CONSTRUCTION_SITES);

  if (creep.memory.state === "building" && creep.store[RESOURCE_ENERGY] == 0) {
    creep.memory.state = "harvesting";
    creep.say(creep.memory.state);
  }
  if (creep.memory.state !== "building" && creep.store.getFreeCapacity() == 0) {
    creep.memory.state = "building";
    creep.say(creep.memory.state);
  }

  const sources = creep.room.find(FIND_SOURCES);

  if (constructionSites.length) {
    if (creep.memory.state === "building") {
      const tooCloseToSource = sources.find(source => source.pos.inRangeTo(creep.pos, 1));
      if (tooCloseToSource) {
        creep.moveTo(25, 25);
        return;
      }

      const target =
        findNaiveTarget(
          constructionSites.filter(site => site.structureType === "extension"),
          creep
        ) ?? findNaiveTarget(constructionSites, creep);

      if (creep.build(target) == ERR_NOT_IN_RANGE) {
        creep.memory.target = target.id;

        // const message = `[${creep.name}]: Moving to construction site ${target.id} at ${target.pos}`;
        // console.log(message);
        creep.moveTo(target, { visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state] } });
      }
    } else {
      const naivestSource = getNaiveSource(sources, creep);
      if (!naivestSource) {
        // Grab energy from the closest creep with energy
        const closestCreep = creep.pos.findClosestByPath(FIND_MY_CREEPS, {
          filter: creep => creep.store[RESOURCE_ENERGY] > 0
        });

        if (closestCreep && closestCreep.transfer(creep, RESOURCE_ENERGY) !== OK) {
          creep.moveTo(closestCreep, {
            visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state ?? "harvesting"] }
          });
        }

        return;
      }

      if (creep.harvest(naivestSource) == ERR_NOT_IN_RANGE) {
        creep.moveTo(naivestSource, {
          visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state ?? "harvesting"] }
        });
      }
    }
  } else {
    // If there is a building that is unplanned, dismantle it
    const structures = creep.room
      .find(FIND_MY_STRUCTURES)
      .filter(structure => structure.structureType === STRUCTURE_EXTENSION);

    const plannedExtensions = Memory.rooms[creep.room.name].extensions
      .filter(struct => struct.planned === true)
      .map(extension => `${extension.pos.x}_${extension.pos.y}`);

    const plannedRoads = getPlannedRoads(creep.room).map(road => `${road.x}_${road.y}`);

    if (plannedExtensions.some(extension => plannedRoads.includes(extension))) {
      console.log(`Unexpected overlap between planned extensions and roads`);
      console.log(`Recomputing planned extensions`);
      Memory.rooms[creep.room.name].extensions = getExistingExtensions(creep.room);
      // return;
    }

    const unplannedStructure = structures.find(
      structure => !plannedExtensions.includes(`${structure.pos.x}_${structure.pos.y}`)
    );

    if (unplannedStructure) {
      creep.say("dismantling");
      if (creep.dismantle(unplannedStructure) === ERR_NOT_IN_RANGE) {
        creep.moveTo(unplannedStructure, {
          visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state ?? "building"] }
        });
      }
    }

    // If there are no construction sites, find a room with construction sites
    else {
      const exitRooms = getExits(creep.room).map(exit => exit.roomName);
      const roomsWithSites = Object.entries(Game.rooms)
        .map(([roomName, room]) => [roomName, { room, constructionSites: room.find(FIND_CONSTRUCTION_SITES) }] as const)
        .filter(
          ([roomName, roomWithSites]) => roomWithSites.constructionSites.length > 0 && exitRooms.includes(roomName)
        );

      if (roomsWithSites.length) {
        // Go to the first room with construction sites
        const [roomName, { room, constructionSites }] = roomsWithSites[0];
        const target = findNaiveTarget(constructionSites, creep);
        creep.moveTo(target, { visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state ?? "building"] } });
      } else {
        creep.memory.role = "upgrader";
        creep.say("upgrader");
        console.log(`[${creep.name}]: Switching to upgrader`);
        // creep.name = `${creep.memory.role}${Game.time}`;

        return upgraderTick(creep);
      }
    }
  }
};
