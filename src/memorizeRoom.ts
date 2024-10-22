import { getExits } from "buildings/utils";
import { flatten } from "lodash";

const memorizeSpawnData = (spawn: StructureSpawn, exits: ReturnType<typeof getExits>) => {
  return {
    id: spawn.id,
    pos: spawn.pos
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
    pos: source.pos
  };
}

function memorizePaths(
  room: Room,
  spawns: StructureSpawn[],
  controller: StructureController | undefined,
  sources: Source[],
  minerals: Mineral<MineralConstant>[],
  exits: ReturnType<typeof getExits>
) {
  return [
    // Paths from Controller to Sources
    ...(controller
      ? sources.map(source => ({
          path: source.pos.findPathTo(controller.pos, { ignoreCreeps: true }),
          constructedRoad: false
        }))
      : []),

    // Paths around Controller
    ...(controller
      ? [
          {
            path: [
              [-1, -1],
              [-1, 1],
              [1, 1],
              [1, -1]
            ].map(([x, y]) => ({ dx: x, dy: y, x: controller.pos.x + x, y: controller.pos.y + y })) as PathStep[],
            constructedRoad: false
          },
          {
            path: [
              [-1, 0],
              [0, 1],
              [1, 0],
              [0, -1]
            ].map(([x, y]) => ({ dx: x, dy: y, x: controller.pos.x + x, y: controller.pos.y + y })) as PathStep[],
            constructedRoad: false
          }
        ]
      : []),

    // Paths from Controller to Exits
    ...(controller
      ? exits.map(exit => {
          const closestExit = controller.pos.findClosestByPath(controller.room.find(exit.exitDirection), {
            ignoreCreeps: true
          });
          return {
            path: closestExit ? controller.pos.findPathTo(closestExit, { ignoreCreeps: true }) : [],
            constructedRoad: false
          };
        })
      : []),

    //Paths from Spawns to Exits
    ...flatten(
      spawns.map(spawn =>
        exits.map(exit => {
          const closestExit = spawn.pos.findClosestByPath(spawn.room.find(exit.exitDirection), { ignoreCreeps: true });
          return {
            path: closestExit ? spawn.pos.findPathTo(closestExit, { ignoreCreeps: true }) : [],
            constructedRoad: false
          };
        })
      )
    ),

    // Paths from Spawns to Controller
    ...(controller
      ? spawns.map(spawn => ({
          path: spawn.pos.findPathTo(controller.pos, { ignoreCreeps: true }),
          constructedRoad: false
        }))
      : []),

    // Paths from Spawns to Sources
    ...flatten(
      spawns.map(spawn =>
        sources.map(source => ({
          path: spawn.pos.findPathTo(source.pos, { ignoreCreeps: true }),
          constructedRoad: false
        }))
      )
    ),

    // Paths from Spawns to Minerals
    ...flatten(
      spawns.map(spawn =>
        minerals.map(mineral => ({
          path: spawn.pos.findPathTo(mineral.pos, { ignoreCreeps: true }),
          constructedRoad: false
        }))
      )
    ),

    // Paths around Spawns
    ...flatten(
      spawns.map(spawn => [
        {
          path: [
            [-1, -1],
            [-1, 1],
            [1, 1],
            [1, -1]
          ].map(([x, y]) => ({ dx: x, dy: y, x: spawn.pos.x + x, y: spawn.pos.y + y })) as PathStep[],
          constructedRoad: false
        },
        {
          path: [
            [-1, 0],
            [0, 1],
            [1, 0],
            [0, -1]
          ].map(([x, y]) => ({ dx: x, dy: y, x: spawn.pos.x + x, y: spawn.pos.y + y })) as PathStep[],
          constructedRoad: false
        }
      ])
    )
  ];
}

export function memorizeRoom(room: Room, refreshMemory = false) {
  if (refreshMemory) {
    console.log(`[${Game.time.toLocaleString()}] Resetting memory for room ${room.name}`);
  }

  const spawns = room.find(FIND_MY_SPAWNS);
  const sources = room.find(FIND_SOURCES);
  const controller = room.controller;
  const minerals = room.find(FIND_MINERALS);
  const structures = room.find(FIND_MY_STRUCTURES);

  if (!Memory.rooms[room.name] || refreshMemory) {
    const exits = getExits(room);

    Memory.rooms[room.name] = {
      spawns: spawns.map(spawn => memorizeSpawnData(spawn, exits)),
      sources: sources.map(source => memorizeSourceData(source)),
      controller: memorizeControllerData(room),
      minerals: minerals.map(mineral => memorizeMineralData(mineral)),
      towers: structures
        .filter(structure => structure.structureType === STRUCTURE_TOWER)
        .map(tower => memorizeTowerData(tower as StructureTower)),
      extensions: [],
      containsHostiles: room.find(FIND_HOSTILE_CREEPS).length > 0,
      exits,
      paths: memorizePaths(room, spawns, controller, sources, minerals, exits),
      lastMemorizedTick: Game.time
    };
  }

  if (room.find(FIND_HOSTILE_CREEPS).length > 0) {
    Memory.rooms[room.name].containsHostiles = true;
  }
}
