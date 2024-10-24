import { MAX_ROOM_EXTENSIONS } from "buildings/utils";
import { flatten } from "lodash";
import { memorizeRoom } from "memorizeRoom";
import { profileFunction } from "utils/screeps-profiler";

const createRoadsForPaths = profileFunction(
  (room: Room, plannedRoads = getPlannedRoadsSteps(room), VISUALIZE_ONLY = true) => {
    if (VISUALIZE_ONLY) return;

    Memory.rooms[room.name].paths.forEach(memorizedPath => {
      if (memorizedPath.constructedRoad) return;

      const omitEnd = true;
      const roadResults = memorizedPath.path.map((pathStep, i, path) => {
        if (i < (omitEnd ? path.length - 1 : path.length)) {
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
    });
  },
  "architect.roads.createRoadsForPaths"
);

export const getPlannedRoadsSteps = profileFunction((room: Room) => {
  return flatten(Memory.rooms[room.name].paths.map(memorizedPath => memorizedPath.path));
}, "getPlannedRoadsSteps");

const MAX_TOWERS_IN_ROOM = 5;

const planAndBuildTowers = profileFunction(
  (
    room: Room,
    spawns: StructureSpawn[],
    roomController: StructureController,
    sources: Source[] = room.find(FIND_SOURCES),
    constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES),
    towers = room.find(FIND_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } }) as StructureTower[],
    plannedRoads = getPlannedRoadsSteps(room),
    VISUALIZE_ONLY = true
  ) => {
    if (VISUALIZE_ONLY) {
      return;
    }

    if (!Memory.rooms[room.name].towers || Memory.rooms[room.name].towers?.length < MAX_TOWERS_IN_ROOM) {
      Memory.rooms[room.name].towers = [
        ...towers.map(tower => ({
          id: tower.id,
          pos: tower.pos,
          planned: false
        })),
        ...constructionSites
          .filter(site => site.structureType === STRUCTURE_TOWER)
          .map(site => ({
            id: site.id,
            pos: site.pos,
            planned: false
          }))
      ];
    }

    // Build a tower near the centroid of the spawner, controller and sources
    if (Memory.rooms[room.name].towers.length < MAX_TOWERS_IN_ROOM) {
      const referenceStructures = [roomController, ...sources, ...spawns];
      const centroid = referenceStructures
        .reduce((acc, structure) => [acc[0] + structure.pos.x, acc[1] + structure.pos.y] as [x: number, y: number], [
          0, 0
        ] as [x: number, y: number])
        .map(coord => Math.round(coord / referenceStructures.length)) as [x: number, y: number];

      const towerSpace = Math.ceil(Math.sqrt(9)) + 1;

      const spaceAroundCentroid = Array.from({ length: towerSpace ** 2 }, (_, i) => i).map(i => {
        const x = centroid[0] + (i % towerSpace) - Math.floor(towerSpace / 2);
        const y = centroid[1] + Math.floor(i / towerSpace) - Math.floor(towerSpace / 2);
        return [x, y] as [x: number, y: number];
      });

      const structuresAroundCentroid = room
        .lookAtArea(
          centroid[1] - Math.floor(towerSpace / 2),
          centroid[0] - Math.floor(towerSpace / 2),
          centroid[1] + Math.floor(towerSpace / 2),
          centroid[0] + Math.floor(towerSpace / 2),
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

      const freeSpaceAroundCentroid = spaceAroundCentroid
        .filter(([x, y]) => !structuresAroundCentroid.some(lookObject => lookObject.x === x && lookObject.y === y))
        .sort(
          (spaceA, spaceB) =>
            spawns[0].pos.getRangeTo(spaceA[0], spaceA[1]) - spawns[0].pos.getRangeTo(spaceB[0], spaceB[1])
        )
        .slice(
          0,
          1 //MAX_TOWERS_IN_ROOM
        );

      freeSpaceAroundCentroid.forEach(([x, y]) => {
        if (!Memory.rooms[room.name].towers.some(tower => tower.pos.x === x && tower.pos.y === y)) {
          Memory.rooms[room.name].towers.push({
            id: "",
            pos: new RoomPosition(x, y, room.name),
            planned: true
          });
        }
      });

      freeSpaceAroundCentroid
        .slice(constructionSites.filter(site => site.structureType === STRUCTURE_TOWER).length + towers.length, 1)
        .forEach(([x, y]) => {
          if (room.createConstructionSite(x, y, STRUCTURE_TOWER) === OK) {
            console.log(`[${Game.time.toLocaleString()}] Building tower at ${x}, ${y}`);
            room.visual.text(`🏗️ Building Tower`, x + 1, y, {
              align: "left",
              opacity: 0.8
            });
          }
        });
    }
  },
  "architect.towers.planAndBuildTowers"
);

export const getExistingExtensions = profileFunction(
  (
    room: Room,
    constructionSites: ConstructionSite<BuildableStructureConstant>[] = room.find(FIND_MY_CONSTRUCTION_SITES),
    extensions = room.find(FIND_STRUCTURES, {
      filter: { structureType: STRUCTURE_EXTENSION }
    }) as StructureExtension[]
  ) => {
    return (Memory.rooms[room.name].extensions = [
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
    ]);
  },
  "architect.extensions.getExistingExtensions"
);

export const planAndBuildExtensions = profileFunction(
  (
    room: Room,
    spawns: StructureSpawn[],
    roomController: StructureController,
    constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES),
    extensions = room.find(FIND_STRUCTURES, {
      filter: { structureType: STRUCTURE_EXTENSION }
    }) as StructureExtension[],
    plannedRoads = getPlannedRoadsSteps(room),
    VISUALIZE_ONLY = true
  ) => {
    if (!Memory.rooms[room.name].extensions?.length || !extensions.length) {
      Memory.rooms[room.name].extensions = getExistingExtensions(room, constructionSites, extensions);
    }

    if (Memory.rooms[room.name].extensions.length < MAX_ROOM_EXTENSIONS[8]) {
      planExtensions(spawns, room, constructionSites, plannedRoads, extensions);
    }

    // if (VISUALIZE_ONLY) return;

    const extensionConstructionSites = constructionSites.filter(site => site.structureType === STRUCTURE_EXTENSION);

    if (
      extensions.length + extensionConstructionSites.length <
      MAX_ROOM_EXTENSIONS[(room.controller?.level ?? 0) as keyof typeof MAX_ROOM_EXTENSIONS]
    ) {
      console.log(
        `[${Game.time.toLocaleString()}] ${room.name} has ${extensions.length} extensions, ${
          extensionConstructionSites.length
        } extension construction sites, and ${
          MAX_ROOM_EXTENSIONS[(room.controller?.level ?? 0) as keyof typeof MAX_ROOM_EXTENSIONS]
        } max extensions`
      );

      buildExtensions(room, spawns, constructionSites, extensions, roomController);
    }
  },
  "architect.extensions.planAndBuildExtensions"
);

const constructSpawn = profileFunction((room: Room, roomController: StructureController, roomSources: Source[]) => {
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
}, "architect.spawns.constructSpawn");

const MAX_CONTAINERS_IN_ROOM = 5;

const planAndBuildContainers = profileFunction(
  (
    room: Room,
    spawns: StructureSpawn[],
    constructionSites: ConstructionSite<BuildableStructureConstant>[],
    structures: Structure<StructureConstant>[],
    VISUALIZE_ONLY = true
  ) => {
    if (VISUALIZE_ONLY) {
      return;
    }

    const containers = [
      ...(structures.filter(structure => structure.structureType === STRUCTURE_CONTAINER) as StructureContainer[]),
      ...constructionSites.filter(site => site.structureType === STRUCTURE_CONTAINER)
    ];

    if (containers.length < MAX_CONTAINERS_IN_ROOM) {
      const referencePosition = spawns[0].pos ?? room.controller?.pos ?? { x: 25, y: 25 };
      for (const position of Memory.rooms[room.name].minerPositions
        .sort(
          (posA, posB) => referencePosition.getRangeTo(posA.x, posA.y) - referencePosition.getRangeTo(posB.x, posB.y)
        )
        .slice(containers.length, MAX_CONTAINERS_IN_ROOM)) {
        if (room.createConstructionSite(position.x, position.y, STRUCTURE_CONTAINER) === OK) {
          console.log(`[${Game.time.toLocaleString()}] Building container at ${position.x}, ${position.y}`);
          room.visual.text(`🏗️ Building Container`, position.x + 1, position.y, {
            align: "left",
            opacity: 0.8
          });
        }
      }
    }
  },
  "architect.containers.planAndBuildContainers"
);

const planAndBuildWalls = (room: Room, spawn: StructureSpawn, roomController: StructureController) => {};

export const architectRoom = profileFunction(
  (
    room: Room,
    sources = room.find(FIND_SOURCES),
    constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES),
    structures = room.find(FIND_STRUCTURES)
  ) => {
    const spawns = structures.filter(structure => structure.structureType === STRUCTURE_SPAWN) as StructureSpawn[];

    const roomController = room.controller;

    memorizeRoom(room, Game.time % 100 === 0, spawns, sources, roomController, structures);

    if (!roomController) {
      return;
    }

    if (
      !spawns.length &&
      room.controller &&
      room.controller.my &&
      !constructionSites.filter(site => site.structureType === STRUCTURE_SPAWN).length &&
      sources.length >= 2
    ) {
      // If there is no spawn and no spawn construction site, create a spawn construction site at the centroid of the sources and controller

      constructSpawn(room, roomController, sources);
      return;
    }

    planAndBuildContainers(room, spawns, constructionSites, structures, Boolean(Game.time % 100));

    const plannedRoads = getPlannedRoadsSteps(room);
    planAndBuildTowers(
      room,
      spawns,
      roomController,
      sources,
      constructionSites,
      structures.filter(structure => structure.structureType === STRUCTURE_TOWER) as StructureTower[],
      plannedRoads,
      Boolean(Game.time % 100)
    );

    planAndBuildExtensions(
      room,
      spawns,
      roomController,
      constructionSites,
      structures.filter(structure => structure.structureType === STRUCTURE_EXTENSION) as StructureExtension[],
      plannedRoads,
      Boolean(Game.time % 100)
    );

    createRoadsForPaths(room, plannedRoads, Boolean(Game.time % 100));
    // planAndBuildWalls(room, spawn, roomController);
  },
  "architect.architectRoom"
);

const buildExtensions = profileFunction(
  (
    room: Room,
    spawns: StructureSpawn[],
    constructionSites: ConstructionSite<BuildableStructureConstant>[],
    extensions: StructureExtension[],
    roomController: StructureController
  ) => {
    Memory.rooms[room.name].extensions
      .sort(
        (extA, extB) =>
          spawns[0].pos.getRangeTo(extA.pos.x, extA.pos.y) - spawns[0].pos.getRangeTo(extB.pos.x, extB.pos.y)
      )
      .forEach(ext => {
        const constructionResult = room.createConstructionSite(ext.pos.x, ext.pos.y, STRUCTURE_EXTENSION);
        if (constructionResult === OK) {
          console.log(`[${Game.time.toLocaleString()}] ${room.name} Building extension at ${ext.pos.x}, ${ext.pos.y}`);
          room.visual.text(`🏗️ Building Extension`, ext.pos.x + 1, ext.pos.y, {
            align: "left",
            opacity: 0.8
          });
          const existingMemorizedExtension = Memory.rooms[room.name].extensions.find(
            extension => extension.pos.x === ext.pos.x && extension.pos.y === ext.pos.y
          );
          if (existingMemorizedExtension) {
            existingMemorizedExtension.planned = true;
          } else {
            Memory.rooms[room.name].extensions.push(ext);
          }
        } else {
          console.log(
            `[${Game.time.toLocaleString()}] ${room.name} Error building extension at ${ext.pos.x}, ${
              ext.pos.y
            }: ${constructionResult}`
          );
        }
      });
  },
  "architect.extensions.buildExtensions"
);

const planExtensions = profileFunction(
  (
    spawns: StructureSpawn[],
    room: Room,
    constructionSites: ConstructionSite<BuildableStructureConstant>[],
    plannedRoads: PathStep[],
    extensions: StructureExtension[]
  ) => {
    const roomExtensionSpace = Math.ceil(Math.sqrt(MAX_ROOM_EXTENSIONS[8])) + 5;

    const spaceAroundSpawn = Array.from({ length: roomExtensionSpace ** 2 }, (_, i) => i).map(i => {
      const x = spawns[0].pos.x + (i % roomExtensionSpace) - Math.floor(roomExtensionSpace / 2);
      const y = spawns[0].pos.y + Math.floor(i / roomExtensionSpace) - Math.floor(roomExtensionSpace / 2);
      return [x, y] as [x: number, y: number];
    });

    const structuresAroundSpawn = room
      .lookAtArea(
        spawns[0].pos.y - Math.floor(roomExtensionSpace / 2),
        spawns[0].pos.x - Math.floor(roomExtensionSpace / 2),
        spawns[0].pos.y + Math.floor(roomExtensionSpace / 2),
        spawns[0].pos.x + Math.floor(roomExtensionSpace / 2),
        true
      )
      .filter(
        lookResult =>
          lookResult.type !== "creep" &&
          lookResult.type !== "tombstone" &&
          !(lookResult.type === "terrain" && (lookResult.terrain === "swamp" || lookResult.terrain === "plain")) &&
          lookResult.type !== "ruin"
      )
      .map(({ x, y }) => ({ x, y }))
      .concat(constructionSites.map(({ pos }) => ({ x: pos.x, y: pos.y })))
      .concat(plannedRoads)
      .concat(Memory.rooms[room.name].towers.map(tower => ({ x: tower.pos.x, y: tower.pos.y })));

    const freeSpaceAroundSpawn = spaceAroundSpawn.filter(
      ([x, y]) => !structuresAroundSpawn.some(lookObject => lookObject.x === x && lookObject.y === y)
    );

    // console.log(
    //   `[${Game.time.toLocaleString()}] Room ${room.name} has ${freeSpaceAroundSpawn.length} free spaces for extensions`
    // );
    // Memorize the free space around the spawn as planned extensions
    freeSpaceAroundSpawn.forEach(([x, y]) => {
      if (!Memory.rooms[room.name].extensions.some(extension => extension.pos.x === x && extension.pos.y === y)) {
        Memory.rooms[room.name].extensions.push({
          id: extensions.find(extension => extension.pos.x === x && extension.pos.y === y)?.id ?? "",
          pos: new RoomPosition(x, y, room.name),
          planned: true
        });
      }
    });
  },
  "architect.extensions.planExtensions"
);
