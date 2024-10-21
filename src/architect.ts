import { MAX_ROOM_EXTENSIONS } from "buildings/utils";
import { MemorizedPath } from "main";
import { memorizeRoom } from "memorizeRoom";

const VISUALIZE_PATHS = true;
const VISUALIZE_ONLY = true;

const createRoads = <T extends _HasId | string>(room: Room, memorizedPath: MemorizedPath<T>) => {
  if (VISUALIZE_ONLY) return;

  if (!memorizedPath.path) return [];

  const roadResults = memorizedPath.path.map((pathStep, i, path) => {
    if (i < path.length - 1) {
      return room.createConstructionSite(pathStep.x, pathStep.y, STRUCTURE_ROAD);
    } else return OK;
  });
  if (roadResults.every(result => result === OK)) {
    memorizedPath.constructedRoad = true;
  } else {
    console.log(
      `[${Game.time.toLocaleString()}] Error building roads to source ${memorizedPath.targetId}, errors: ${roadResults
        .filter(Boolean)
        .join(", ")}`
    );
  }
  return roadResults;
};

const visualizePath = (room: Room, path: PathStep[] | null) => {
  if (!path) return;

  if (VISUALIZE_PATHS) {
    room.visual.poly(
      path.map(p => [p.x, p.y]),
      { stroke: "red" }
    );
  }
};

const createRoadsForPaths = (room: Room) => {
  Memory.rooms[room.name].spawns.forEach(spawn => {
    spawn.pathsToSources.forEach(pathToSource => {
      visualizePath(room, pathToSource.path);

      if (pathToSource.constructedRoad) return;
      createRoads(room, pathToSource);
    });

    if (spawn.pathToController) {
      visualizePath(room, spawn.pathToController.path);

      if (spawn.pathToController.constructedRoad) return;

      createRoads(room, spawn.pathToController);
    }

    spawn.pathsToMinerals.forEach(pathToMineral => {
      visualizePath(room, pathToMineral.path);

      if (pathToMineral.constructedRoad) return;

      createRoads(room, pathToMineral);
    });

    spawn.pathsToExits.forEach(pathToExit => {
      visualizePath(room, pathToExit.path);

      if (pathToExit.constructedRoad) return;

      createRoads(room, pathToExit);
    });
  });
};

const buildExtensions = (room: Room) => {
  const spawn = room.find(FIND_MY_SPAWNS)[0];
  if (!spawn) {
    return;
  }
  const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
  const extensions = room.find(FIND_MY_STRUCTURES, {
    filter: { structureType: STRUCTURE_EXTENSION }
  }) as StructureExtension[];

  if (!Memory.rooms[room.name].extensions) {
    Memory.rooms[room.name].extensions = [
      ...extensions.map(extensions => ({
        id: extensions.id,
        pos: extensions.pos,
        planned: false
      })),
      ...constructionSites
        .filter(site => site.structureType === STRUCTURE_EXTENSION)
        .map(site => ({
          id: site.id,
          pos: site.pos,
          planned: true
        }))
    ];
  }

  // Build extensions around the spawn if there are less than MAX_ROOM_EXTENSIONS
  if (
    room.controller &&
    room.controller.level >= 2 &&
    !constructionSites.some(site => site.structureType === STRUCTURE_EXTENSION) &&
    extensions.length < MAX_ROOM_EXTENSIONS[room.controller.level as keyof typeof MAX_ROOM_EXTENSIONS]
  ) {
    const roomExtensionSpace = Math.ceil(
      Math.sqrt(MAX_ROOM_EXTENSIONS[room.controller.level as keyof typeof MAX_ROOM_EXTENSIONS])
    );

    const spaceAroundSpawn = Array.from({ length: roomExtensionSpace ** 2 }, (_, i) => i).map(i => {
      const x = spawn.pos.x + (i % roomExtensionSpace) - 1;
      const y = spawn.pos.y + Math.floor(i / roomExtensionSpace) - 1;
      return [x, y] as [x: number, y: number];
    });

    const structuresAroundSpawn = room.lookForAtArea(
      LOOK_STRUCTURES,
      spawn.pos.y - Math.floor(roomExtensionSpace / 2),
      spawn.pos.x - Math.floor(roomExtensionSpace / 2),
      spawn.pos.y + Math.floor(roomExtensionSpace / 2),
      spawn.pos.x + Math.floor(roomExtensionSpace / 2),
      true
    );

    const freeSpaceAroundSpawn = spaceAroundSpawn.filter(
      ([x, y]) =>
        !structuresAroundSpawn.some(lookObject => !lookObject.structure && lookObject.x === x && lookObject.y === y)
    );

    for (const site of freeSpaceAroundSpawn) {
      if (room.createConstructionSite(...site, STRUCTURE_EXTENSION) !== OK) {
        continue;
      }

      console.log(
        `[${Game.time.toLocaleString()}] Building extension at ${freeSpaceAroundSpawn[0][0]}, ${
          freeSpaceAroundSpawn[0][1]
        }`
      );
      room.visual.text(`🏗️ Building Extension`, freeSpaceAroundSpawn[0][0] + 1, freeSpaceAroundSpawn[0][1], {
        align: "left",
        opacity: 0.8
      });
      // return 1;
    }
  }
};

export const architectRoom = (room: Room) => {
  memorizeRoom(room);

  createRoadsForPaths(room);

  buildExtensions(room);
};
