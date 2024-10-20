export const MAX_ROOM_EXTENSIONS = {
  1: 0,
  2: 5,
  3: 10,
  4: 20,
  5: 30,
  6: 40,
  7: 50,
  8: 60
} as const;

export const buildRoadFromPosToSet = (room: Room, pos: RoomPosition, set: RoomPosition[], omitLast: boolean = true) => {
  const posPathsToSet = set
    .map(source => pos.findPathTo(source, { ignoreCreeps: true }))
    .sort((a, b) => a.length - b.length)
    .map(path => (omitLast ? path.slice(0, path.length - 1) : path));

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

export const getExits = (room: Room) => {
  try {
    return Object.entries(Game.map.describeExits(room.name))
      .map(([dir, roomName]) => {
        // console.log(`[${Game.time.toLocaleString()}] Exits: ${dir} - ${roomName}`);
        const exitDirection = parseInt(dir);

        return { exitDirection, roomName };
      })
      .filter(Boolean) as {
      exitDirection: FIND_EXIT_TOP | FIND_EXIT_RIGHT | FIND_EXIT_BOTTOM | FIND_EXIT_LEFT;
      roomName: string;
    }[];
  } catch (e) {
    // console.log(`[${Game.time.toLocaleString()}] Error getting exits: ${e}`);
    return [];
  }
};
