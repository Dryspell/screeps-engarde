import { profileFunction } from "utils/screeps-profiler";

export const constructSpawn = profileFunction(
  (room: Room, roomController: StructureController, roomSources: Source[]) => {
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
  },
  "architect.spawns.constructSpawn"
);
