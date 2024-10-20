import { getExits } from "buildings/utils";
import { findNaiveTarget, getNaiveSource, PATH_COLORS } from "./utils";

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

  if (constructionSites.length) {
    if (creep.memory.state === "building") {
      const target = findNaiveTarget(constructionSites, creep);

      if (creep.build(target) == ERR_NOT_IN_RANGE) {
        creep.memory.target = target.id;

        // const message = `[${creep.name}]: Moving to construction site ${target.id} at ${target.pos}`;
        // console.log(message);
        creep.moveTo(target, { visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state] } });
      }
    } else {
      const sources = creep.room.find(FIND_SOURCES);
      const naivestSource = getNaiveSource(sources, creep);
      if (!naivestSource) return;

      if (creep.harvest(naivestSource) == ERR_NOT_IN_RANGE) {
        creep.moveTo(naivestSource, {
          visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state ?? "harvesting"] }
        });
      }
    }
    // If there are no construction sites, find a room with construction sites
  } else {
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
    }
  }
};
