import { profileFunction } from "utils/screeps-profiler";
import { getPlannedRoadsSteps } from "./roads";

const MAX_TOWERS_IN_ROOM = 5;

export const planTowers = profileFunction(
  (
    room: Room,
    spawns: StructureSpawn[],
    roomController: StructureController,
    sources: Source[] = room.find(FIND_SOURCES),
    constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES),
    towers = room.find(FIND_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } }) as StructureTower[],
    plannedRoads = getPlannedRoadsSteps(room)
  ) => {
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

    // Build a tower near the centroid of the spawns, controller and sources
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
    }
  },
  "architect.towers.plan"
);

const buildTowers = profileFunction(
  (
    room: Room,
    constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES),
    towers = room.find(FIND_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } }) as StructureTower[]
  ) => {
    const towerConstructionSites = constructionSites.filter(site => site.structureType === STRUCTURE_TOWER);
    if (towerConstructionSites.length) {
      return;
    }

    const plannedTowerPositions = Memory.rooms[room.name].towers
      .filter(tower => tower.planned && !towers.some(existingTower => existingTower.pos.isEqualTo(tower.pos)))
      .map(tower => [tower.pos.x, tower.pos.y] as [x: number, y: number]);

    plannedTowerPositions
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
  },
  "architect.towers.build"
);

export const planAndBuildTowers = profileFunction(
  (
    room: Room,
    spawns: StructureSpawn[],
    roomController: StructureController,
    sources: Source[] = room.find(FIND_SOURCES),
    constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES),
    towers = room.find(FIND_STRUCTURES, { filter: { structureType: STRUCTURE_TOWER } }) as StructureTower[],
    plannedRoads = getPlannedRoadsSteps(room)
  ) => {
    planTowers(room, spawns, roomController, sources, constructionSites, towers, plannedRoads);

    buildTowers(room, constructionSites, towers);
  },
  "architect.towers.planAndBuildTowers"
);

export function handleBuildingTowers(
  room: Room,
  constructionSites: ConstructionSite<BuildableStructureConstant>[],
  spawn: StructureSpawn,
  roomSources: Source[]
) {
  const towers = room.find(FIND_STRUCTURES, {
    filter: { structureType: STRUCTURE_TOWER }
  }) as StructureTower[];
  if (room.controller && !towers.length && !constructionSites.some(site => site.structureType === STRUCTURE_TOWER)) {
    // Build a new tower as close to the centroid of the spawn, controller, and sources as possible
    const structures = [spawn, room.controller, ...roomSources];
    const centroid = [spawn, room.controller, ...roomSources]
      .reduce((acc, structure) => [acc[0] + structure.pos.x, acc[1] + structure.pos.y] as [x: number, y: number], [
        0, 0
      ] as [x: number, y: number])
      .map(coord => coord / structures.length) as [x: number, y: number];

    // try to build the tower at the centroid, but if it's not possible, build it at the closest available spot by doing a spiral search
    const spiralSearch = [
      [0, 0],
      [1, 0],
      [1, -1],
      [0, -1],
      [-1, -1],
      [-1, 0],
      [-1, 1],
      [0, 1],
      [1, 1]
    ];

    for (const d of spiralSearch) {
      const searchPos = centroid.map((coord, i) => coord + d[i]) as [x: number, y: number];
      if (room.createConstructionSite(...searchPos, STRUCTURE_TOWER) === OK) {
        console.log(`[${Game.time.toLocaleString()}] Building tower at (${searchPos.join(", ")})`);
        room.visual.text(`🏗️ Building Tower`, searchPos[0] + 1, searchPos[1], {
          align: "left",
          opacity: 0.8
        });
        break;
      }
    }
  }
}

export const towerBehavior = profileFunction((controlledRooms: Room[]) => {
  controlledRooms.forEach(room => {
    const towers = room.find(FIND_STRUCTURES, {
      filter: { structureType: STRUCTURE_TOWER }
    }) as StructureTower[];

    const centroid = towers
      .map(tower => tower.pos)
      .reduce(
        (acc, pos) => {
          return [acc[0] + pos.x, acc[1] + pos.y] as [x: number, y: number];
        },
        [0, 0] as [x: number, y: number]
      );

    const closestHostile = new RoomPosition(...centroid, room.name).findClosestByRange(FIND_HOSTILE_CREEPS);
    if (closestHostile) {
      towers.forEach(tower => tower.attack(closestHostile));
      return;
    }

    const plannedRoads = getPlannedRoadsSteps(room).map(({ x, y }) => ({ x, y }));

    const damagedStructures = room.find(FIND_STRUCTURES, {
      filter: structure =>
        structure.hits < structure.hitsMax &&
        structure.structureType !== STRUCTURE_EXTENSION &&
        structure.structureType !== STRUCTURE_WALL &&
        structure.structureType !== STRUCTURE_RAMPART &&
        // Only repair planned roads
        (structure.structureType === STRUCTURE_ROAD
          ? plannedRoads.some(road => road.x === structure.pos.x && road.y === structure.pos.y)
          : true)
    }) as AnyStructure[];

    if (damagedStructures.length) {
      towers.forEach(tower => tower.repair(damagedStructures[0]));
      return;
    }
  });
}, "towers.behavior");
