import { getExits } from "buildings/utils";
import { costCallback } from "spatial/spatial-utils";
import { flattenArray } from "utils/arraySets";
import { profileFunction } from "utils/screeps-profiler";
import { VISUALIZATION_TOGGLES } from "visual";

const memorizeSpawnData = (spawn: StructureSpawn) => {
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
  minerals: Mineral<MineralConstant>[]
) {
  const exits = Memory.rooms[room.name].exits;
  const terrain = new Room.Terrain(room.name);

  const paths = [
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
      : []), // Paths around Spawns
    ...flattenArray(
      flattenArray(
        (
          [
            [
              [-1, -1],
              [-2, -2],
              [-3, -3],
              [-4, -4]
            ],
            [
              [-1, 1],
              [-2, 2],
              [-3, 3],
              [-4, 4]
            ],
            [
              [1, 1],
              [2, 2],
              [3, 3],
              [4, 4]
            ],
            [
              [1, -1],
              [2, -2],
              [3, -3],
              [4, -4]
            ],
            [
              [-4, 0],
              [-3, 0],
              [-2, 0],
              [-1, 0]
            ],
            [
              [4, 0],
              [3, 0],
              [2, 0],
              [1, 0]
            ],
            [
              [0, 4],
              [0, 3],
              [0, 2],
              [0, 1]
            ],
            [
              [0, -4],
              [0, -3],
              [0, -2],
              [0, -1]
            ],
            Array.from({ length: 11 }, (_, i) => [i - 5, 5]),
            Array.from({ length: 11 }, (_, i) => [5, i - 5]),
            Array.from({ length: 11 }, (_, i) => [i - 5, -5]),
            Array.from({ length: 11 }, (_, i) => [-5, i - 5])
          ] as [x: number, y: number][][]
        ).map(spawnPath =>
          spawns.map(spawn => [
            {
              path: spawnPath
                .map(([x, y]) => ({ dx: x, dy: y, x: spawn.pos.x + x, y: spawn.pos.y + y }))
                .filter(step => terrain.get(step.x, step.y) !== TERRAIN_MASK_WALL) as PathStep[],
              constructedRoad: false
            },
            {
              path: spawnPath
                .map(([x, y]) => ({ dx: x, dy: y, x: spawn.pos.x + x, y: spawn.pos.y + y }))
                .filter(step => terrain.get(step.x, step.y) !== TERRAIN_MASK_WALL) as PathStep[],
              constructedRoad: false
            }
          ])
        )
      )
    )
  ];

  paths.push(
    // Paths from Controller to Sources
    ...(controller
      ? sources.map(source => ({
          path: source.pos
            .findPathTo(controller.pos, { ignoreCreeps: true, costCallback: costCallback(paths.map(p => p.path)) })
            .slice(0, -1),
          constructedRoad: false
        }))
      : [])
  );

  paths.push(
    // Paths from Controller to Exits
    ...(controller
      ? exits.map(exit => {
          const closestExit = controller.pos.findClosestByPath(controller.room.find(exit.exitDirection), {
            ignoreCreeps: true
          });
          return {
            path: closestExit
              ? controller.pos
                  .findPathTo(closestExit, { ignoreCreeps: true, costCallback: costCallback(paths.map(p => p.path)) })
                  .slice(0, -1)
              : [],
            constructedRoad: false
          };
        })
      : [])
  );

  paths.push(
    //Paths from Spawns to Exits
    ...flattenArray(
      spawns.map(spawn =>
        exits.map(exit => {
          const closestExit = spawn.pos.findClosestByPath(spawn.room.find(exit.exitDirection), { ignoreCreeps: true });
          return {
            path: closestExit
              ? spawn.pos
                  .findPathTo(closestExit, { ignoreCreeps: true, costCallback: costCallback(paths.map(p => p.path)) })
                  .slice(0, -1)
              : [],
            constructedRoad: false
          };
        })
      )
    )
  );

  paths.push(
    // Paths from Spawns to Controller
    ...(controller
      ? spawns.map(spawn => ({
          path: spawn.pos
            .findPathTo(controller.pos, { ignoreCreeps: true, costCallback: costCallback(paths.map(p => p.path)) })
            .slice(0, -1),
          constructedRoad: false
        }))
      : [])
  );

  paths.push(
    // Paths from Spawns to Sources
    ...flattenArray(
      spawns.map(spawn =>
        sources.map(source => ({
          path: spawn.pos
            .findPathTo(source.pos, { ignoreCreeps: true, costCallback: costCallback(paths.map(p => p.path)) })
            .slice(0, -1),
          constructedRoad: false
        }))
      )
    )
  );

  paths.push(
    // Paths from Spawns to Minerals
    ...flattenArray(
      spawns.map(spawn =>
        minerals.map(mineral => ({
          path: spawn.pos
            .findPathTo(mineral.pos, { ignoreCreeps: true, costCallback: costCallback(paths.map(p => p.path)) })
            .slice(0, -1),
          constructedRoad: false
        }))
      )
    )
  );

  return paths;
}

const memorizeMinerPositions = (room: Room, sources: Source[]) => {
  const terrain = new Room.Terrain(room.name);
  return flattenArray(
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

export const memorizeRoom = profileFunction(
  (
    room: Room,
    spawns = room.find(FIND_MY_SPAWNS),
    sources = room.find(FIND_SOURCES),
    controller = room.controller,
    structures = room.find(FIND_STRUCTURES),
    minerals = room.find(FIND_MINERALS)
  ) => {
    Memory.visual ??= VISUALIZATION_TOGGLES;

    Memory.rooms ??= {};
    //@ts-ignore
    Memory.rooms[room.name] ??= {};
    Memory.rooms[room.name].exits ??= getExits(room);
    Memory.rooms[room.name].spawns ??= spawns.map(spawn => memorizeSpawnData(spawn));
    Memory.rooms[room.name].sources ??= sources.map(source => memorizeSourceData(source));
    Memory.rooms[room.name].controller ??= memorizeControllerData(room);
    Memory.rooms[room.name].minerals ??= minerals.map(mineral => memorizeMineralData(mineral));
    Memory.rooms[room.name].towers ??= structures
      .filter(structure => structure.structureType === STRUCTURE_TOWER)
      .map(tower => memorizeTowerData(tower as StructureTower));
    Memory.rooms[room.name].extensions ??= [];
    Memory.rooms[room.name].containsHostiles ??= room.find(FIND_HOSTILE_CREEPS).length > 0;
    Memory.rooms[room.name].paths ??= memorizePaths(room, spawns, controller, sources, minerals);
    Memory.rooms[room.name].minerPositions ??= memorizeMinerPositions(room, sources);
    Memory.rooms[room.name].lastMemorizedTick ??= Game.time;
    Memory.rooms[room.name].cachedPaths ??= {};
    Memory.rooms[room.name].walls ??= [];
  },
  "memorizeRoom"
);
