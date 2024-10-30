import { kmeans } from "spatial/spatial-utils";
import { profileFunction } from "utils/screeps-profiler";

export const VISUALIZATION_TOGGLES = {
  containers: true,
  paths: true,
  extensions: true,
  towers: true,
  roads: true,
  walls: true,
  unplannedStructures: true,
  kmeans: true,
  cachedPaths: true,
  energyAccessPositions: true,
  costMatrix: false
};

export const randomColors = (length: number) =>
  Array.from({ length }, () => `#${Math.floor(Math.random() * 16777215).toString(16)}`);

export const colors = randomColors(30);

export const visualizeRoad = profileFunction((room: Room, path: PathStep[] | null) => {
  if (!path || !Memory.visual.roads) return;

  room.visual.poly(
    path.map(p => [p.x, p.y]),
    { stroke: "red" }
  );
}, "visual.paths");

export const visualizeTowers = profileFunction((room: Room) => {
  if (!Memory.visual.towers) return;

  Memory.rooms[room.name].towers.forEach(tower => {
    room.visual.circle(tower.pos.x, tower.pos.y, { fill: "transparent", radius: 0.5, stroke: "magenta" });
  });
}, "visual.towers");

export const visualizeExtensions = profileFunction((room: Room) => {
  if (!Memory.visual.extensions) return;

  Memory.rooms[room.name].extensions.forEach(extension => {
    room.visual.circle(extension.pos.x, extension.pos.y, { fill: "transparent", radius: 0.5, stroke: "green" });
  });
}, "visual.extensions");

export const visualizeContainers = profileFunction((room: Room) => {
  if (!Memory.visual.containers) return;

  Memory.rooms[room.name].minerPositions.forEach(({ x, y }) => {
    room.visual.circle(x, y, { fill: "transparent", radius: 0.5, stroke: "yellow" });
  });
}, "visual.containers");

export const visualizeWalls = profileFunction((room: Room) => {
  if (!Memory.visual.walls) return;

  Memory.rooms[room.name].walls.forEach(wall => {
    wall.planned === true
      ? room.visual.rect(wall.pos.x - 0.5, wall.pos.y - 0.5, 1, 1, {
          fill: "transparent",
          stroke: wall.type === "constructedWall" ? "brown" : "blue"
        })
      : null; // room.visual.text("X!", wall.pos.x, wall.pos.y, { color: "red" });
  });
}, "visual.walls");

export const visualizeKmeans = profileFunction((room: Room, cc: ReturnType<typeof kmeans>, colors: string[]) => {
  const rectWidth = 2;

  cc.forEach((c, i) => {
    c.cluster.forEach(point => {
      room.visual.circle(point.pos.x, point.pos.y, { radius: 0.5, fill: colors[i] });
      room.visual.line(c.centroid.pos.x, c.centroid.pos.y, point.pos.x, point.pos.y, { color: colors[i] });
    });
    // c.centroid &&
    //   new RoomVisual().rect(c.centroid.pos.x - rectWidth / 2, c.centroid.pos.y, rectWidth, rectWidth, {
    //     fill: colors[i]
    //   });
  });
}, "visual.kmeans");

const visualizePaths = (room: Room) => {
  loopEnd: for (const endX of Object.keys(Memory.rooms[room.name].cachedPaths)) {
    const targetX = typeof endX === "string" ? parseInt(endX) : endX;

    for (const endY of Object.keys(Memory.rooms[room.name].cachedPaths[targetX])) {
      const targetY = typeof endY === "string" ? parseInt(endY) : endY;

      for (const startX of Object.keys(Memory.rooms[room.name].cachedPaths[targetX][targetY])) {
        const sourceX = typeof startX === "string" ? parseInt(startX) : startX;

        for (const startY of Object.keys(Memory.rooms[room.name].cachedPaths[targetX][targetY][sourceX])) {
          const sourceY = typeof startY === "string" ? parseInt(startY) : startY;

          if (Number.isNaN(sourceX) || Number.isNaN(sourceY) || Number.isNaN(targetX) || Number.isNaN(targetY)) {
            console.log(`Invalid start position: ${startX}, ${startY}, ${endX}, ${endY}`);
            continue loopEnd;
          }

          const path = Room.deserializePath(Memory.rooms[room.name].cachedPaths[targetX][targetY][sourceX][sourceY]);

          console.log(`deserializedPath: ${JSON.stringify(path)}`);

          const adjustedPath = path.map(step => [step.x, step.y] as [number, number]);

          room.visual.poly(adjustedPath, {
            stroke: "#FF00FF"
          });

          room.visual.text("🏗️", adjustedPath[0][0], adjustedPath[0][1], {
            align: "left",
            opacity: 0.8
          });

          break loopEnd;
        }
      }
    }
  }
};

function rgbToHex(r: number, g: number, b: number): string {
  // Clamp values to be in the range of 0-255
  r = Math.max(0, Math.min(255, r));
  g = Math.max(0, Math.min(255, g));
  b = Math.max(0, Math.min(255, b));

  // Convert to hex and pad with leading zeros if necessary
  const hex = ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1).toUpperCase();

  return `#${hex}`;
}

interface RGB {
  r: number;
  g: number;
  b: number;
}

function hexToRgb(hex: string): RGB | null {
  // Remove the hash at the start if it's there
  hex = hex.replace(/^#/, "");

  // Check if the hex format is valid
  if (hex.length !== 6) {
    return null; // Return null for invalid hex input
  }

  // Parse the hex values
  let bigint = parseInt(hex, 16);
  let r = (bigint >> 16) & 255;
  let g = (bigint >> 8) & 255;
  let b = bigint & 255;

  return { r, g, b };
}

const visualizeCostMatrix = (room: Room) => {
  Memory.visual.costMatrix ??= VISUALIZATION_TOGGLES.costMatrix;
  if (!Memory.visual.costMatrix) return;
  if (!Memory.rooms[room.name].costMatrix) return;

  const costMatrix = PathFinder.CostMatrix.deserialize(Memory.rooms[room.name].costMatrix);

  const rectWidth = 1;
  const halfWidth = rectWidth / 2;

  for (let x = 0; x < 50; x++) {
    for (let y = 0; y < 50; y++) {
      const cost = costMatrix.get(x, y);
      const color = rgbToHex(255 - cost, 255 - cost, 255 - cost);

      room.visual.rect(x - halfWidth, y - halfWidth, rectWidth, rectWidth, { fill: color, opacity: 0.5 });
    }
  }
};

export const visualize = profileFunction((room: Room, creeps: Creep[]) => {
  Memory.rooms[room.name].paths.forEach(path => visualizeRoad(room, path.path));

  visualizeTowers(room);
  visualizeExtensions(room);
  visualizeContainers(room);
  visualizeWalls(room);
  visualizeCostMatrix(room);

  // visualizePaths(room);
}, "visual");
