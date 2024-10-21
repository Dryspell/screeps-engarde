import { MAX_ROOM_EXTENSIONS } from "buildings/utils";
import { MemorizedPath } from "main";
import { memorizeRoom } from "memorizeRoom";

const VISUALIZE_PATHS = true;
const VISUALIZE_EXTENSIONS = true;
const VISUALIZE_TOWERS = true;
const VISUALIZE_ONLY = false;

const createRoads = <T extends _HasId | string>(room: Room, memorizedPath: MemorizedPath<T>) => {
  if (VISUALIZE_ONLY) return;

  if (!memorizedPath.path) return [];

  const roadResults = memorizedPath.path.map((pathStep, i, path) => {
    if (i < path.length - 1) {
      return room.createConstructionSite(pathStep.x, pathStep.y, STRUCTURE_ROAD);
    } else return OK;
  });
  if (roadResults.every(result => result === OK || result === ERR_INVALID_TARGET)) {
    memorizedPath.constructedRoad = true;
  } else {
    // console.log(
    //   `[${Game.time.toLocaleString()}] Error building roads to source ${memorizedPath.targetId}, errors: ${roadResults
    //     .filter(Boolean)
    //     .join(", ")}`
    // );
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

  Memory.rooms[room.name].sources.forEach(source => {
    if (!source.pathToController) return;

    visualizePath(room, source.pathToController.path);

    if (source.pathToController && source.pathToController.path?.length) {
      createRoads(room, source.pathToController);
    }
  });
};

export const getPlannedRoads = (room: Room) => {
  return Memory.rooms[room.name].spawns
    .map(spawn => {
      return [
        ...spawn.pathsToSources.map(path => path.path),
        spawn.pathToController?.path,
        ...spawn.pathsToMinerals.map(path => path.path),
        ...spawn.pathsToExits.map(path => path.path)
      ].filter(Boolean) as PathStep[][];
    })
    .flat(2)
    .concat(
      (
        Memory.rooms[room.name].sources.map(source => source.pathToController?.path).filter(Boolean) as PathStep[][]
      ).flat()
    );
};

const planAndBuildTowers = (room: Room, spawn: StructureSpawn, roomController: StructureController) => {
  const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
  const towers = room.find(FIND_MY_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } }) as StructureTower[];

  if (!Memory.rooms[room.name].towers) {
    Memory.rooms[room.name].towers = towers.map(tower => ({
      id: tower.id,
      pos: tower.pos,
      planned: false
    }));
  }

  // Build a tower near the centroid of the spawner, controller and sources
  if (Memory.rooms[room.name].towers.length < 6) {
    const towerSpace = Math.ceil(Math.sqrt(6)) + 1;

    const spaceAroundSpawn = Array.from({ length: towerSpace ** 2 }, (_, i) => i).map(i => {
      const x = roomController.pos.x + (i % towerSpace) - Math.floor(towerSpace / 2);
      const y = roomController.pos.y + Math.floor(i / towerSpace) - Math.floor(towerSpace / 2);
      return [x, y] as [x: number, y: number];
    });

    const plannedRoads = getPlannedRoads(room).map(({ x, y }) => ({ x, y }));

    const structuresAroundSpawn = room
      .lookAtArea(
        roomController.pos.y - Math.floor(towerSpace / 2),
        roomController.pos.x - Math.floor(towerSpace / 2),
        roomController.pos.y + Math.floor(towerSpace / 2),
        roomController.pos.x + Math.floor(towerSpace / 2),
        true
      )
      .filter(
        lookResult =>
          lookResult.type !== "creep" &&
          lookResult.type !== "tombstone" &&
          !(lookResult.type === "terrain" && (lookResult.terrain === "swamp" || lookResult.terrain === "plain"))
      )
      .map(({ x, y }) => ({ x, y }))
      .concat(constructionSites.map(({ pos }) => ({ x: pos.x, y: pos.y })))
      .concat(plannedRoads);

    const freeSpaceAroundSpawn = spaceAroundSpawn
      .filter(([x, y]) => !structuresAroundSpawn.some(lookObject => lookObject.x === x && lookObject.y === y))
      .sort((spaceA, spaceB) => spawn.pos.getRangeTo(spaceA[0], spaceA[1]) - spawn.pos.getRangeTo(spaceB[0], spaceB[1]))
      .slice(constructionSites.filter(site => site.structureType === STRUCTURE_TOWER).length + towers.length, 1);

    freeSpaceAroundSpawn.forEach(([x, y]) => {
      if (!Memory.rooms[room.name].towers.some(tower => tower.pos.x === x && tower.pos.y === y)) {
        Memory.rooms[room.name].towers.push({
          id: "",
          pos: new RoomPosition(x, y, room.name),
          planned: true
        });
      }
    });

    if (VISUALIZE_TOWERS) {
      freeSpaceAroundSpawn.forEach(([x, y]) => {
        room.visual.circle(x, y, { fill: "transparent", radius: 0.5, stroke: "magenta" });
      });
    }

    if (VISUALIZE_ONLY) return;

    freeSpaceAroundSpawn.forEach(([x, y]) => {
      if (room.createConstructionSite(x, y, STRUCTURE_TOWER) === OK) {
        console.log(`[${Game.time.toLocaleString()}] Building tower at ${x}, ${y}`);
        room.visual.text(`🏗️ Building Tower`, x + 1, y, {
          align: "left",
          opacity: 0.8
        });
      }
    });
  }
};

const planAndBuildExtensions = (room: Room, spawn: StructureSpawn, roomController: StructureController) => {
  const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
  const extensions = room.find(FIND_MY_STRUCTURES, {
    filter: { structureType: STRUCTURE_EXTENSION }
  }) as StructureExtension[];

  if (!Memory.rooms[room.name].extensions.length) {
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
          planned: false
        }))
    ];
  }

  if (Memory.rooms[room.name].extensions.length < MAX_ROOM_EXTENSIONS[8]) {
    const roomExtensionSpace = Math.ceil(Math.sqrt(MAX_ROOM_EXTENSIONS[8])) + 1;

    const spaceAroundSpawn = Array.from({ length: roomExtensionSpace ** 2 }, (_, i) => i).map(i => {
      const x = spawn.pos.x + (i % roomExtensionSpace) - Math.floor(roomExtensionSpace / 2);
      const y = spawn.pos.y + Math.floor(i / roomExtensionSpace) - Math.floor(roomExtensionSpace / 2);
      return [x, y] as [x: number, y: number];
    });

    const plannedRoads = getPlannedRoads(room).map(({ x, y }) => ({ x, y }));

    const structuresAroundSpawn = room
      .lookAtArea(
        spawn.pos.y - Math.floor(roomExtensionSpace / 2),
        spawn.pos.x - Math.floor(roomExtensionSpace / 2),
        spawn.pos.y + Math.floor(roomExtensionSpace / 2),
        spawn.pos.x + Math.floor(roomExtensionSpace / 2),
        true
      )
      .filter(
        lookResult =>
          lookResult.type !== "creep" &&
          lookResult.type !== "tombstone" &&
          !(lookResult.type === "terrain" && (lookResult.terrain === "swamp" || lookResult.terrain === "plain"))
      )
      .map(({ x, y }) => ({ x, y }))
      .concat(constructionSites.map(({ pos }) => ({ x: pos.x, y: pos.y })))
      .concat(plannedRoads)
      .concat(Memory.rooms[room.name].towers.map(tower => ({ x: tower.pos.x, y: tower.pos.y })));

    const freeSpaceAroundSpawn = spaceAroundSpawn.filter(
      ([x, y]) => !structuresAroundSpawn.some(lookObject => lookObject.x === x && lookObject.y === y)
    );

    // Memorize the free space around the spawn as planned extensions
    freeSpaceAroundSpawn.forEach(([x, y]) => {
      if (!Memory.rooms[room.name].extensions.some(extension => extension.pos.x === x && extension.pos.y === y)) {
        Memory.rooms[room.name].extensions.push({
          id: "",
          pos: new RoomPosition(x, y, room.name),
          planned: true
        });
      }
    });

    if (VISUALIZE_EXTENSIONS) {
      freeSpaceAroundSpawn.forEach(([x, y]) => {
        room.visual.circle(x, y, { fill: "transparent", radius: 0.5, stroke: "green" });
      });
    }

    if (VISUALIZE_ONLY) return;

    freeSpaceAroundSpawn
      .slice(
        constructionSites.filter(site => site.structureType === STRUCTURE_EXTENSION).length + extensions.length,
        MAX_ROOM_EXTENSIONS[roomController.level as keyof typeof MAX_ROOM_EXTENSIONS] + 1
      )
      .forEach(([x, y]) => {
        if (room.createConstructionSite(x, y, STRUCTURE_EXTENSION) === OK) {
          console.log(`[${Game.time.toLocaleString()}] Building extension at ${x}, ${y}`);
          room.visual.text(`🏗️ Building Extension`, x + 1, y, {
            align: "left",
            opacity: 0.8
          });
          const existingMemorizedExtension = Memory.rooms[room.name].extensions.find(
            extension => extension.pos.x === x && extension.pos.y === y
          );
          if (existingMemorizedExtension) {
            existingMemorizedExtension.planned = false;
          } else {
            Memory.rooms[room.name].extensions.push({
              id: "",
              pos: new RoomPosition(x, y, room.name),
              planned: true
            });
          }
        }
      });
  }
};

function constructSpawn(room: Room, roomController: StructureController, roomSources: Source[]) {
  const spawnPos = [roomController, ...roomSources]
    .reduce((acc, structure) => [acc[0] + structure.pos.x, acc[1] + structure.pos.y] as [x: number, y: number], [
      0, 0
    ] as [x: number, y: number])
    .map(coord => Math.floor(coord / (roomSources.length + 1))) as [x: number, y: number];

  if (room.createConstructionSite(...spawnPos, STRUCTURE_SPAWN) === OK) {
    console.log(`[${Game.time.toLocaleString()}] Building spawn at (${spawnPos.join(", ")})`);
    room.visual.text(`🏗️ Building Spawn`, spawnPos[0] + 1, spawnPos[1], {
      align: "left",
      opacity: 0.8
    });
  }
}

export const architectRoom = (room: Room) => {
  memorizeRoom(room);

  const roomController = room.controller;
  if (!roomController) {
    return;
  }

  const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);
  const roomSources = room.find(FIND_SOURCES);
  const spawn = room.find(FIND_MY_SPAWNS)[0];

  if (!spawn && room.controller && !constructionSites.filter(site => site.structureType === STRUCTURE_SPAWN).length) {
    // If there is no spawn and no spawn construction site, create a spawn construction site at the centroid of the sources and controller

    constructSpawn(room, roomController, roomSources);
  }

  if (!spawn) {
    return;
  }

  createRoadsForPaths(room);
  planAndBuildTowers(room, spawn, roomController);
  planAndBuildExtensions(room, spawn, roomController);
};
