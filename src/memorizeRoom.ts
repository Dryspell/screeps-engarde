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
  exits: ReturnType<typeof getExits>,
  terrain = new Room.Terrain(room.name)
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
            ]
              .map(([x, y]) => ({ dx: x, dy: y, x: controller.pos.x + x, y: controller.pos.y + y }))
              .filter(step => terrain.get(step.x, step.y) !== TERRAIN_MASK_WALL) as PathStep[],
            constructedRoad: false
          },
          {
            path: [
              [-1, 0],
              [0, 1],
              [1, 0],
              [0, -1]
            ]
              .map(([x, y]) => ({ dx: x, dy: y, x: controller.pos.x + x, y: controller.pos.y + y }))
              .filter(step => terrain.get(step.x, step.y) !== TERRAIN_MASK_WALL) as PathStep[],
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
          ]
            .map(([x, y]) => ({ dx: x, dy: y, x: spawn.pos.x + x, y: spawn.pos.y + y }))
            .filter(step => terrain.get(step.x, step.y) !== TERRAIN_MASK_WALL) as PathStep[],
          constructedRoad: false
        },
        {
          path: [
            [-1, 0],
            [0, 1],
            [1, 0],
            [0, -1]
          ]
            .map(([x, y]) => ({ dx: x, dy: y, x: spawn.pos.x + x, y: spawn.pos.y + y }))
            .filter(step => terrain.get(step.x, step.y) !== TERRAIN_MASK_WALL) as PathStep[],
          constructedRoad: false
        }
      ])
    )
  ];
}

const memorizeMinerPositions = (room: Room, sources: Source[], terrain = new Room.Terrain(room.name)) => {
  return flatten(
    sources.map(source =>
      [
        [-1, 0],
        [0, 1],
        [1, 0],
        [0, -1],
        [-1, -1],
        [-1, 1],
        [1, 1],
        [1, -1]
      ]
        .map(([x, y]) => ({ x: source.pos.x + x, y: source.pos.y + y }))
        .filter(step => terrain.get(step.x, step.y) !== TERRAIN_MASK_WALL)
    )
  );
};

export function memorizeRoom(
  room: Room,
  refreshMemory = false,
  spawns = room.find(FIND_MY_SPAWNS),
  sources = room.find(FIND_SOURCES),
  controller = room.controller,
  structures = room.find(FIND_MY_STRUCTURES),
  minerals = room.find(FIND_MINERALS)
) {
  if (refreshMemory) {
    console.log(`[${Game.time.toLocaleString()}] Resetting memory for room ${room.name}`);
  }

  if (!Memory.rooms[room.name] || refreshMemory) {
    const exits = getExits(room);
    const terrain = new Room.Terrain(room.name);

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
      minerPositions: memorizeMinerPositions(room, sources, terrain),
      terrain,
      lastMemorizedTick: Game.time,
    };
  }

  if (room.find(FIND_HOSTILE_CREEPS).length > 0) {
    Memory.rooms[room.name].containsHostiles = true;
  }
}
