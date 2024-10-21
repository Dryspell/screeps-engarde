import { getExits } from "buildings/utils";

const memorizeSpawnData = (spawn: StructureSpawn, exits: ReturnType<typeof getExits>) => {
  return {
    id: spawn.id,
    pos: spawn.pos,
    pathsToExits: exits.map(exit => {
      const closestExit = spawn.pos.findClosestByPath(spawn.room.find(exit.exitDirection), { ignoreCreeps: true });
      return {
        targetId: exit.roomName,
        path: closestExit && spawn.pos.findPathTo(closestExit, { ignoreCreeps: true }),
        constructedRoad: false
      };
    }),
    pathToController: spawn.room.controller
      ? {
          targetId: spawn.room.controller.id,
          path: spawn.pos.findPathTo(spawn.room.controller.pos, { ignoreCreeps: true }),
          constructedRoad: false
        }
      : null,
    pathsToSources: spawn.room.find(FIND_SOURCES).map(source => ({
      targetId: source.id,
      path: spawn.pos.findPathTo(source.pos, { ignoreCreeps: true }),
      constructedRoad: false
    })),
    pathsToMinerals: spawn.room.find(FIND_MINERALS).map(mineral => ({
      targetId: mineral.id,
      path: spawn.pos.findPathTo(mineral.pos, { ignoreCreeps: true }),
      constructedRoad: false
    }))
  };
};

function memorizeTowerData(tower: StructureTower) {
  return { id: tower.id, pos: tower.pos, planned: false };
}

function memorizeMineralData(mineral: Mineral<MineralConstant>) {
  return { id: mineral.id, pos: mineral.pos };
}

function memorizeControllerData(room: Room) {
  return room.controller && { id: room.controller.id, pos: room.controller.pos };
}

function memorizeSourceData(source: Source) {
  return {
    id: source.id,
    pos: source.pos,
    pathToController: source.room.controller
      ? {
          targetId: source.room.controller.id,
          path: source.pos.findPathTo(source.room.controller.pos, { ignoreCreeps: true }),
          constructedRoad: false
        }
      : null
  };
}

export function memorizeRoom(room: Room) {
  if (!Memory.rooms[room.name]) {
    const exits = getExits(room);

    Memory.rooms[room.name] = {
      spawns: room.find(FIND_MY_SPAWNS).map(spawn => memorizeSpawnData(spawn, exits)),
      sources: room.find(FIND_SOURCES).map(source => memorizeSourceData(source)),
      controller: memorizeControllerData(room),
      minerals: room.find(FIND_MINERALS).map(mineral => memorizeMineralData(mineral)),
      towers: room
        .find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } })
        .map(tower => memorizeTowerData(tower as StructureTower)),
      extensions: [],
      containsHostiles: room.find(FIND_HOSTILE_CREEPS).length > 0,
      exits
    };
  }

  if (!Memory.rooms[room.name].spawns?.length && room.find(FIND_MY_SPAWNS).length) {
    const exits = getExits(room);

    Memory.rooms[room.name].spawns = room.find(FIND_MY_SPAWNS).map(spawn => memorizeSpawnData(spawn, exits));
  }

  if (!Memory.rooms[room.name].sources?.length && room.find(FIND_SOURCES).length) {
    Memory.rooms[room.name].sources = room.find(FIND_SOURCES).map(source => memorizeSourceData(source));
  }

  if (!Memory.rooms[room.name].controller && room.controller) {
    Memory.rooms[room.name].controller = memorizeControllerData(room);
  }

  if (
    (!Memory.rooms[room.name].minerals?.length || !Memory.rooms[room.name].spawns[0].pathsToMinerals.length) &&
    room.find(FIND_MINERALS).length
  ) {
    const exits = getExits(room);

    Memory.rooms[room.name].minerals = room.find(FIND_MINERALS).map(mineral => memorizeMineralData(mineral));
    Memory.rooms[room.name].spawns = room.find(FIND_MY_SPAWNS).map(spawn => memorizeSpawnData(spawn, exits));
  }

  if (
    !Memory.rooms[room.name].towers?.length &&
    room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } }).length
  ) {
    Memory.rooms[room.name].towers = room
      .find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } })
      .map(tower => memorizeTowerData(tower as StructureTower));
  }

  if (!Memory.rooms[room.name].exits?.length) {
    Memory.rooms[room.name].exits = getExits(room);
  }

  if (room.find(FIND_HOSTILE_CREEPS).length > 0) {
    Memory.rooms[room.name].containsHostiles = true;
  }
}
