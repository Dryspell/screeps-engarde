const MAX_ROOM_EXTENSIONS = {
  1: 0,
  2: 5,
  3: 10,
  4: 20,
  5: 30,
  6: 40,
  7: 50,
  8: 60
} as const;

const buildRoadFromPosToSet = (room: Room, pos: RoomPosition, set: RoomPosition[]) => {
  const posPathsToSet = set
    .map(source => pos.findPathTo(source, { ignoreCreeps: true }))
    .sort((a, b) => a.length - b.length)
    .map(path => path.slice(0, path.length - 1));

  for (const path of posPathsToSet) {
    for (const pathStep of path) {
      if (
        room
          .lookForAt(LOOK_STRUCTURES, pathStep.x, pathStep.y)
          .some(structure => structure.structureType === STRUCTURE_ROAD)
      ) {
        continue;
      }

      if (room.createConstructionSite(pathStep.x, pathStep.y, STRUCTURE_ROAD) === OK) {
        room.visual.text(`🚦 Building Road`, pathStep.x + 1, pathStep.y, {
          align: "left",
          opacity: 0.8
        });
        console.log(`[${Game.time.toLocaleString()}] Building road at ${pathStep.x}, ${pathStep.y}`);
        return 1;
      }
    }
  }
  return 0;
};

const getExits = (room: Room) => {
  return Object.entries(Game.map.describeExits(room.name))
    .map(([dir, roomName]) => {
      const exitDirection = parseInt(dir);
      if (exitDirection in ([FIND_EXIT_TOP, FIND_EXIT_RIGHT, FIND_EXIT_BOTTOM, FIND_EXIT_LEFT] as const)) {
        return { exitDirection, roomName };
      }
      return null;
    })
    .filter(Boolean) as {
    exitDirection: FIND_EXIT_TOP | FIND_EXIT_RIGHT | FIND_EXIT_BOTTOM | FIND_EXIT_LEFT;
    roomName: string;
  }[];
};

const getAdjacentAvailableRooms = (exits: ReturnType<typeof getExits>) => {
  return exits
    .map(({ roomName }) => Game.rooms[roomName])
    .filter(
      room =>
        Game.map.getRoomStatus(room.name).status !== "closed" &&
        !room.find(FIND_HOSTILE_STRUCTURES).length &&
        !room.find(FIND_HOSTILE_CREEPS).length &&
        !room.controller?.owner &&
        !room.controller?.reservation
    ) as Room[];
};

function handleBuildingTowers(
  room: Room,
  constructionSites: ConstructionSite<BuildableStructureConstant>[],
  spawn: StructureSpawn,
  roomSources: Source[]
) {
  const towers = room.find(FIND_MY_STRUCTURES, {
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
        break;
      }
    }
  }
}

export const handleBuilding = (controlledRooms: Room[]) => {
  controlledRooms.forEach(room => {
    const extensions = room.find(FIND_MY_STRUCTURES, {
      filter: { structureType: STRUCTURE_EXTENSION }
    }) as StructureExtension[];
    const constructionSites = room.find(FIND_MY_CONSTRUCTION_SITES);

    const spawn = room.find(FIND_MY_SPAWNS)[0];
    const exits = getExits(room);
    const roomSources = room.find(FIND_SOURCES);

    const handleClaimingNewRooms = (controlledRooms: Room[]) => {
      const adjacentAvailableRooms = getAdjacentAvailableRooms(exits);

      adjacentAvailableRooms
        .sort((a, b) => b.find(FIND_SOURCES).length - a.find(FIND_SOURCES).length)
        .slice(0, Game.gcl.level - controlledRooms.length)
        .forEach(room => {
          console.log(`[${Game.time.toLocaleString()}] Claiming room ${room.name}`);
        });
    };

    if (Game.gcl.level - controlledRooms.length > 0) {
      handleClaimingNewRooms(controlledRooms);
    }

    if ((room.controller?.level ?? 0) >= 3) {
      handleBuildingTowers(room, constructionSites, spawn, roomSources);
    }

    const structuresAroundSpawn = room.lookForAtArea(
      LOOK_STRUCTURES,
      spawn.pos.y - 1,
      spawn.pos.x - 1,
      spawn.pos.y + 1,
      spawn.pos.x + 1,
      true
    );

    let roadConstructionSitesCount = constructionSites.filter(site => site.structureType === STRUCTURE_ROAD).length;

    // Build roads to Energy Sources
    if (roadConstructionSitesCount < 2) {
      roadConstructionSitesCount += buildRoadFromPosToSet(
        room,
        spawn.pos,
        roomSources.map(source => source.pos)
      );
    }

    // Build roads to controller
    if (roadConstructionSitesCount < 2 && room.controller) {
      roadConstructionSitesCount += buildRoadFromPosToSet(
        room,
        room.controller.pos,
        roomSources.map(source => source.pos)
      );
    }

    // Build roads to exits
    if (roadConstructionSitesCount < 2) {
      const closest = exits
        .map(({ exitDirection }) => spawn.pos.findClosestByPath(room.find(exitDirection)))
        .filter(Boolean) as RoomPosition[];

      roadConstructionSitesCount += buildRoadFromPosToSet(room, spawn.pos, closest);
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

      const freeSpaceAroundSpawn = spaceAroundSpawn.filter(
        ([x, y]) =>
          !structuresAroundSpawn
            .map(lookObject => [lookObject.x, lookObject.y] as [x: number, y: number])
            .some(([sx, sy]) => sx === x && sy === y)
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
  });
};
