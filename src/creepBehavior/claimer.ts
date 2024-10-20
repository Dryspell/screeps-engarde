import { getExits } from "building/utils";
import { PATH_COLORS } from "./utils";

export const claimerTick = (creep: Creep) => {
  // If the room isn't in memory, memorize it
  if (!Memory.rooms) {
    Memory.rooms = {};
  }
  if (!Memory.rooms?.[creep.room.name]) {
    Memory.rooms[creep.room.name] = {
      sources: creep.room.find(FIND_SOURCES).map(source => ({ id: source.id, pos: source.pos })),
      controller: creep.room.controller && { id: creep.room.controller?.id, pos: creep.room.controller?.pos },
      spawns: creep.room.find(FIND_MY_SPAWNS).map(spawn => ({ id: spawn.id, pos: spawn.pos })),
      containsHostiles: creep.room.find(FIND_HOSTILE_CREEPS).length > 0
    };
  }

  // If the room is claimed, move to the next room
  if (creep.room.find(FIND_MY_SPAWNS).some(spawn => spawn.name === creep.memory.spawn) || creep.room.controller?.my) {
    const exits = getExits(creep.room);
    console.log(`[${creep.room.name}] exits: ${exits.map(exit => exit.roomName).join(", ")}`);

    const nonMemoryRooms = exits
      .map(nonMemoryRoom => ({
        ...nonMemoryRoom,
        closeExit: creep.pos.findClosestByPath(creep.room.find(nonMemoryRoom.exitDirection))
      }))
      .filter(
        nonMemoryRoom => nonMemoryRoom.closeExit && !Object.keys(Memory.rooms).includes(nonMemoryRoom.roomName)
      ) as {
      closeExit: RoomPosition;
      exitDirection: FIND_EXIT_TOP | FIND_EXIT_RIGHT | FIND_EXIT_BOTTOM | FIND_EXIT_LEFT;
      roomName: string;
    }[];

    console.log(nonMemoryRooms.map(room => room.roomName).join(", "));

    // Walk to the closest room that isn't in memory and memorize it
    if (nonMemoryRooms.length) {
      creep.memory.state = "surveying";
      creep.say(creep.memory.state);

      const firstRoom = nonMemoryRooms[0];
      const movePosition: [x: number, y: number] =
        firstRoom.exitDirection === FIND_EXIT_TOP
          ? [firstRoom.closeExit.x, 0]
          : firstRoom.exitDirection === FIND_EXIT_LEFT
          ? [49, firstRoom.closeExit.y]
          : firstRoom.exitDirection === FIND_EXIT_BOTTOM
          ? [firstRoom.closeExit.x, 49]
          : [0, firstRoom.closeExit.y];
      creep.moveTo(new RoomPosition(...movePosition, firstRoom.roomName), {
        visualizePathStyle: { stroke: PATH_COLORS[creep.memory.state] }
      });
    }
  }

  // if the room is not claimed but there are hostiles or not enough energy sources, move to the next room
  else if (Memory.rooms[creep.room.name].sources.length < 2 || Memory.rooms[creep.room.name].containsHostiles) {
    creep.memory.state = "surveying";
    creep.say(creep.memory.state);

    creep.moveTo(Game.spawns[creep.memory.spawn ?? "Spawn1"]);
  } else if (creep.room.controller && !creep.room.controller.my) {
    creep.memory.state = "claiming";
    creep.say(creep.memory.state);

    if (creep.claimController(creep.room.controller) == ERR_NOT_IN_RANGE) {
      creep.moveTo(creep.room.controller);
    } else if (creep.claimController(creep.room.controller) === OK) {
      creep.memory.state = "surveying";
      creep.say(creep.memory.state);
    }
  }
};
