import { profileFunction } from "utils/screeps-profiler";

export type _hasPos = { pos: { x: number; y: number } };

export const serializeCoord = (coord: number) => (coord > 9 ? String(coord) : `0${coord}`);

export const distance2 = profileFunction(<TA extends _hasPos, TB extends _hasPos>(a: TA, b: TB) => {
  return (a.pos.x - b.pos.x) ** 2 + (a.pos.y - b.pos.y) ** 2;
}, "spatial.distance2");

export const computeCentroid = <Tdata extends _hasPos>(points: Tdata[]) => {
  if (!points.length) {
    throw new Error("No points to compute centroid");
  }

  return {
    pos: {
      x: Math.round(points.reduce((acc, point) => acc + point.pos.x, 0) / points.length),
      y: Math.round(points.reduce((acc, point) => acc + point.pos.y, 0) / points.length)
    }
  };
};

const chooseCentroids = <Tdata extends _hasPos>(k: number, data: Tdata[]) => {
  if (!k) {
    throw new Error(`Invalid value for k: ${k}`);
  }

  const centroids = [computeCentroid(Array.from({ length: k }, () => data[Math.floor(Math.random() * data.length)]))];

  for (let i = 0; i < k; i++) {
    const distances = data
      .map(point => {
        return {
          point,
          distance: distance2(point, centroids[i])
        };
      })
      .sort((a, b) => b.distance - a.distance)
      .slice(0, k - i);

    if (!distances.length) {
      break;
    }

    distances.length && centroids.push(computeCentroid(distances.map(d => d.point)));
  }

  return centroids;
};

export const kmeans = profileFunction(<Tdata extends _hasPos>(k: number, data: Tdata[]) => {
  k = Math.min(k, data.length);
  if (k === 0) {
    return data.length ? [{ centroid: computeCentroid(data), cluster: data }] : [];
  }

  let centroids = chooseCentroids(k, data);

  const clusters = Array.from({ length: centroids.length }, () => [] as Tdata[]);

  let converged = false;
  let iterations = 0;

  while (!converged && iterations < 5) {
    clusters.forEach(cluster => (cluster.length = 0));

    data.forEach(point => {
      const distances = centroids.map(centroid => distance2(point, centroid));
      const closest = distances.indexOf(Math.min(...distances));
      try {
        clusters[closest].push(point);
      } catch (e) {
        console.log(e);
        console.log(distances);
        console.log(closest);
        console.log(clusters);
        console.log(point);
      }
    });

    const newCentroids = clusters.map((cluster, i) => (cluster.length ? computeCentroid(cluster) : centroids[i]));

    if (newCentroids.every((centroid, i) => distance2(centroid, centroids[i]) < 1)) {
      converged = true;
    }

    centroids = newCentroids;
    iterations++;
  }

  return clusters.map((cluster, i) => ({ centroid: centroids[i], cluster }));
}, "kmeans");

export const hollowSquare = <T extends _hasPos>(center: T, width: number) => {
  const halfWidth = Math.floor(width / 2);
  const square = Array.from({ length: width ** 2 }, (_, i) => i).map(i => {
    const x = center.pos.x + (i % width) - halfWidth;
    const y = center.pos.y + Math.floor(i / width) - halfWidth;
    return { pos: { x, y } };
  });

  return square.filter(
    point =>
      point.pos.x === center.pos.x - halfWidth ||
      point.pos.x === center.pos.x + halfWidth ||
      point.pos.y === center.pos.y - halfWidth ||
      point.pos.y === center.pos.y + halfWidth
  );
};

export const costCallback = profileFunction(
  (paths?: PathStep[][]) => (roomName: string, costMatrix: CostMatrix) => {
    if (!paths?.length) {
      return costMatrix;
    }

    Memory.rooms[roomName].costMatrix ??= costMatrix.serialize();
    const newMatrix = PathFinder.CostMatrix.deserialize(Memory.rooms[roomName].costMatrix);
    paths.forEach(path => {
      path.forEach(step => newMatrix.set(step.x, step.y, 1));
    });
    Memory.rooms[roomName].costMatrix = newMatrix.serialize();
    return newMatrix;
  },
  "findPathTo.costCallback"
);
