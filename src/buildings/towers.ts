export function handleBuildingTowers(
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
        room.visual.text(`🏗️ Building Tower`, searchPos[0] + 1, searchPos[1], {
          align: "left",
          opacity: 0.8
        });
        break;
      }
    }
  }
}

export function towerBehavior(controlledRooms: Room[]) {
  controlledRooms.forEach(room => {
    const towers = room.find(FIND_MY_STRUCTURES, {
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

    const damagedStructures = room.find(FIND_STRUCTURES, {
      filter: structure => structure.hits < structure.hitsMax && structure.structureType !== STRUCTURE_WALL
    }) as AnyStructure[];

    if (damagedStructures.length) {
      towers.forEach(tower => tower.repair(damagedStructures[0]));
      return;
    }
  });
}
