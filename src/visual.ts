import { getPlannedRoadsSteps } from "architect";
import { profileFunction } from "utils/screeps-profiler";

const VISUALIZATION_TOGGLES = {
  containers: true,
  paths: true,
  extensions: true,
  towers: true,
  roads: true,
  unplannedStructures: true
};

export const visualizeRoad = profileFunction((room: Room, path: PathStep[] | null) => {
  if (!path || !VISUALIZATION_TOGGLES.roads) return;

  room.visual.poly(
    path.map(p => [p.x, p.y]),
    { stroke: "red" }
  );
}, "visual.paths");

export const visualizeTowers = profileFunction((room: Room) => {
  if (!VISUALIZATION_TOGGLES.towers) return;

  Memory.rooms[room.name].towers.forEach(tower => {
    room.visual.circle(tower.pos.x, tower.pos.y, { fill: "transparent", radius: 0.5, stroke: "magenta" });
  });
}, "visual.towers");

export const visualizeExtensions = profileFunction((room: Room) => {
  if (!VISUALIZATION_TOGGLES.extensions) return;

  Memory.rooms[room.name].extensions.forEach(extension => {
    room.visual.circle(extension.pos.x, extension.pos.y, { fill: "transparent", radius: 0.5, stroke: "green" });
  });
}, "visual.extensions");

export const visualizeContainers = profileFunction((room: Room) => {
  if (!VISUALIZATION_TOGGLES.containers) return;

  Memory.rooms[room.name].minerPositions.forEach(({ x, y }) => {
    room.visual.circle(x, y, { fill: "transparent", radius: 0.5, stroke: "yellow" });
  });
}, "visual.containers");

export const visualize = profileFunction((room: Room) => {
  Memory.rooms[room.name].paths.forEach(path => visualizeRoad(room, path.path));
  visualizeTowers(room);
  visualizeExtensions(room);
  visualizeContainers(room);
}, "visual");
