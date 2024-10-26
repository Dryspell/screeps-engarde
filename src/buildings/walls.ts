import { profileFunction } from "utils/screeps-profiler";
import { getPlannedRoadsSteps } from "./roads";
import { ROOM_EXTENSIONS_WIDTH } from "./extensions";
import { _hasPos, hollowSquare } from "spatial/spatial-utils";

export const WALLS_WIDTH = ROOM_EXTENSIONS_WIDTH + 2;

export const planWalls = (spawns: StructureSpawn[], plannedRoads = getPlannedRoadsSteps(spawns[0].room)) => {
  const terrain = new Room.Terrain(spawns[0].room.name);

  return hollowSquare(spawns[0], WALLS_WIDTH)
    .filter(squarePosition => terrain.get(squarePosition.pos.x, squarePosition.pos.y) !== TERRAIN_MASK_WALL)
    .map(squarePosition => ({
      ...squarePosition,
      type: plannedRoads.find(road => road.x === squarePosition.pos.x && road.y === squarePosition.pos.y)
        ? STRUCTURE_RAMPART
        : STRUCTURE_WALL,
      planned: true
    }));
};

const buildWalls = profileFunction(
  (
    room: Room,
    spawns: StructureSpawn[],
    roomController: StructureController,
    plannedRoads = getPlannedRoadsSteps(room),
    structures = room.find(FIND_STRUCTURES),
    existingWalls = structures.filter(
      structure => structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART
    ) as (StructureWall | StructureRampart)[],
    constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES)
  ) => {
    if (
      constructionSites.filter(
        site => site.structureType === STRUCTURE_WALL || site.structureType === STRUCTURE_RAMPART
      ).length
    ) {
      return;
    }

    const plannedWalls = Memory.rooms[room.name].walls.filter(wall => wall.planned);

    const wallsToBuild = plannedWalls.filter(wall => {
      const existingWall = existingWalls.find(
        existingWall =>
          existingWall.pos.x === wall.pos.x &&
          existingWall.pos.y === wall.pos.y &&
          existingWall.structureType === wall.type
      );

      return !existingWall;
    });

    for (const wall of wallsToBuild) {
      const constructionResult = room.createConstructionSite(wall.pos.x, wall.pos.y, wall.type);
      if (constructionResult === OK) {
        break;
      } else if (constructionResult === ERR_INVALID_TARGET) {
        console.log(`[${Game.time.toLocaleString()}] Error building walls at ${wall.pos.x}, ${wall.pos.y}`);
        Memory.rooms[room.name].walls = Memory.rooms[room.name].walls.filter(
          wall => wall.pos.x !== wall.pos.x && wall.pos.y !== wall.pos.y
        );
        continue;
      } else {
        console.log(
          `[${Game.time.toLocaleString()}] Error building walls at ${wall.pos.x}, ${wall.pos.y}: ${constructionResult}`
        );
      }
    }
  },
  "architect.walls.build"
);

export const planAndBuildWalls = profileFunction(
  (
    room: Room,
    spawns: StructureSpawn[],
    roomController: StructureController,
    plannedRoads = getPlannedRoadsSteps(room),
    structures = room.find(FIND_STRUCTURES),
    existingWalls = structures.filter(
      structure => structure.structureType === STRUCTURE_WALL || structure.structureType === STRUCTURE_RAMPART
    ) as (StructureWall | StructureRampart)[],
    constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES)
  ) => {
    if (spawns.length && !Memory.rooms[room.name].walls.find(wall => wall.planned)) {
      const plannedWalls = planWalls(spawns, plannedRoads);

      Memory.rooms[room.name].walls = plannedWalls.concat(
        existingWalls
          .filter(wall => {
            const plannedWall = plannedWalls.find(
              plannedWall =>
                plannedWall.pos.x === wall.pos.x &&
                plannedWall.pos.y === wall.pos.y &&
                plannedWall.type === wall.structureType
            );
            return plannedWall ? false : true;
          })
          .map(wall => ({
            type: wall.structureType,
            pos: wall.pos,
            planned: false
          }))
      );
    }

    if (room.controller?.my && room.controller.level >= 2) {
      buildWalls(room, spawns, roomController, plannedRoads, structures, existingWalls, constructionSites);
    }
  },
  "architect.walls.planAndBuildWalls"
);
