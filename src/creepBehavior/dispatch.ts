import { accessiblePositions, distance2, kmeans } from "spatial/spatial-utils";
import { cachePath, EnergyTarget, moveToTargetByCachedPath, PATH_COLORS, TransferTarget } from "creepBehavior/utils";
import { colors, visualizeKmeans } from "visual";
import { profileFunction } from "utils/screeps-profiler";
import { getEnergyFromEnergyTarget, laborerState, laborerTick } from "./laborer";
import { minerTick } from "./miner";
import { getUnplannedStructures } from "buildings/utils";
import { flattenArray } from "utils/arraySets";

export const dispatchLaborersByKmeans = profileFunction(
  (
    room: Room,
    spawns: StructureSpawn[],
    energyTargets: EnergyTarget[],
    creeps: Creep[],
    sources: Source[],
    constructionSites: ConstructionSite<BuildableStructureConstant>[],
    droppedResources: Resource<ResourceConstant>[],
    structures: AnyStructure[],
    ruins: Ruin[],
    tombstones: Tombstone[],
    unplannedStructures: AnyStructure[],
    transferTargets: TransferTarget[]
  ) => {
    const useKmeans = true; //Game.time % 5; //true;

    if (!useKmeans) {
      creeps.forEach(creep => {
        const sortedTransferTargets = transferTargets
          .map(t => ({
            id: t.base.id,
            distance: distance2(t.base, creep)
          }))
          .sort((a, b) => a.distance - b.distance)
          .map(t => ({ type: "transfer", base: Game.getObjectById(t.id) } as TransferTarget));

        laborerTick(
          creep,
          spawns,
          sources,
          constructionSites,
          structures,
          unplannedStructures,
          energyTargets,
          energyTargets,
          sortedTransferTargets
        );
      });
    } else {
      const { harvesting, nonHarvesting } = creeps.reduce(
        (acc, creep) => {
          if (creep.memory.state === "harvesting") {
            acc.harvesting.push(creep);
          } else {
            acc.nonHarvesting.push(creep);
          }
          return acc;
        },
        { harvesting: [] as Creep[], nonHarvesting: [] as Creep[] }
      );

      nonHarvesting.forEach(creep => {
        const sortedTransferTargets = transferTargets
          .map(t => ({
            id: t.base.id,
            distance: distance2(t.base, creep)
          }))
          .sort((a, b) => a.distance - b.distance)
          .map(t => ({ type: "transfer", base: Game.getObjectById(t.id) } as TransferTarget));

        laborerTick(
          creep,
          spawns,
          sources,
          constructionSites,
          structures,
          unplannedStructures,
          energyTargets,
          energyTargets,
          sortedTransferTargets
        );
      });

      const creepClusters = kmeans(energyTargets.length, harvesting).filter(c => c.cluster.length);

      if (Memory.visual.kmeans) {
        visualizeKmeans(room, creepClusters, colors);
      }

      const energyTargetsByCluster = energyTargets.map(energyTarget => {
        return {
          energyTarget,
          creepCluster: creepClusters
            .sort((a, b) => cachePath(a.centroid, energyTarget).length - cachePath(b.centroid, energyTarget).length)
            .shift()
        };
      });

      energyTargetsByCluster.forEach(sbc => {
        const sortedTransferTargets = transferTargets
          .map(t => ({
            id: t.base.id,
            distance: distance2(t.base, sbc.creepCluster?.centroid ?? { pos: { x: 25, y: 25 } })
          }))
          .sort((a, b) => a.distance - b.distance)
          .map(t => ({ type: "transfer", base: Game.getObjectById(t.id) } as TransferTarget));

        sbc.creepCluster &&
          room.visual.line(
            sbc.creepCluster.centroid.pos.x,
            sbc.creepCluster.centroid.pos.y,
            sbc.energyTarget.base.pos.x,
            sbc.energyTarget.base.pos.y,
            {
              color: colors[sbc.creepCluster?.cluster.length ?? 0]
            }
          );

        sbc.creepCluster?.cluster.forEach(creep => {
          laborerTick(
            creep,
            spawns,
            sources,
            constructionSites,
            structures,
            unplannedStructures,
            energyTargets,
            [sbc.energyTarget],
            sortedTransferTargets
          );
        });
      });
    }
  },
  "creeps.behavior.dispatchByEnergySource"
);

const VISUALIZE_TARGETS = true;

export const dispatchMiners = profileFunction(
  (room: Room, sources: EnergyTarget[], miners: Creep[], hostileCreeps: Creep[]) => {
    const minerPositions = [...Memory.rooms[room.name].minerPositions].filter(pos =>
      hostileCreeps.find(creep => distance2(creep, { pos }) > 25)
    );

    if (!miners.length) return minerPositions;

    for (const miner of miners) {
      const standingOnMinerPosition = minerPositions.find(pos => pos.x === miner.pos.x && pos.y === miner.pos.y);
      if (standingOnMinerPosition) {
        const source = sources.find(source => source.base.pos.isNearTo(miner.pos));
        if (!source) {
          console.log(
            `[${Game.time.toLocaleString()}]: ${room.name} ${miner.name} No source found near miner position (${
              miner.pos.x
            }, ${miner.pos.y})`
          );
          continue;
        }

        miner.room.visual.text("🛠️", standingOnMinerPosition.x, standingOnMinerPosition.y, {
          align: "left",
          opacity: 0.8
        });
        miner.room.visual.line(miner.pos.x, miner.pos.y, standingOnMinerPosition.x, standingOnMinerPosition.y, {
          color: "green"
        });

        source.type === "harvest" && miner.harvest(source.base);
        minerTick(miner, [source]);
        minerPositions.splice(minerPositions.indexOf(standingOnMinerPosition), 1);
        continue;
      }

      const unoccupiedMinerPositions = minerPositions.filter(
        pos => !miners.some(miner => miner.pos.x === pos.x && miner.pos.y === pos.y)
      );

      const closestUnoccupiedPosition = unoccupiedMinerPositions.reduce((acc, pos) => {
        const posDistance = miner.pos.getRangeTo(pos.x, pos.y);
        const accDistance = miner.pos.getRangeTo(acc.x, acc.y);
        return posDistance < accDistance ? pos : acc;
      }, unoccupiedMinerPositions[0]);

      if (!closestUnoccupiedPosition) {
        console.log(
          `[${Game.time.toLocaleString()}]: ${room.name} ${
            miner.name
          } No closest unoccupied position found, ${JSON.stringify(minerPositions)}`
        );
        continue;
      }

      const source = sources.find(source => distance2(source.base, { pos: closestUnoccupiedPosition }) <= 2);
      if (!source) {
        console.log(
          `[${Game.time.toLocaleString()}]: ${room.name} ${miner.name} No source found near miner position (${
            closestUnoccupiedPosition.x
          }, ${closestUnoccupiedPosition.y})`
        );
        continue;
      }

      moveToTargetByCachedPath(
        miner,
        {
          type: "move" as const,
          base: {
            pos: new RoomPosition(closestUnoccupiedPosition.x, closestUnoccupiedPosition.y, room.name),
            room: room
          }
        },
        { stroke: PATH_COLORS["harvesting"] }
      );
      miner.memory.target = source.base.id;
      miner.memory.state = "harvesting";

      miner.room.visual.text("🛠️", closestUnoccupiedPosition.x, closestUnoccupiedPosition.y, {
        align: "left",
        opacity: 0.8
      });
      miner.room.visual.line(miner.pos.x, miner.pos.y, closestUnoccupiedPosition.x, closestUnoccupiedPosition.y, {
        color: "green"
      });

      minerPositions.splice(minerPositions.indexOf(closestUnoccupiedPosition), 1);
    }

    // returns the unoccupied miner positions
    return minerPositions;

    // if a miner is already in a miner position, leave it there and continue mining
    // if there is no miner assigned to a miner position, assign the closest miner;
  },
  "creeps.behavior.dispatchMiners"
);

export const dispatchLaborers = profileFunction(
  (
    laborers: Creep[],
    spawns: StructureSpawn[],
    sources: Source[],
    constructionSites: ConstructionSite<BuildableStructureConstant>[],
    structures: AnyStructure[],
    unplannedStructures: ReturnType<typeof getUnplannedStructures>,
    energyTargets: EnergyTarget[],
    transferTargets: TransferTarget[]
  ) => {
    const { harvesting, nonHarvesting } = laborers.reduce(
      (acc, creep) => {
        const state = laborerState(creep, constructionSites, unplannedStructures, transferTargets);

        if (VISUALIZE_TARGETS && creep.memory.target) {
          const target = Game.getObjectById(creep.memory.target);
          if (
            target &&
            "pos" in target &&
            target.pos &&
            typeof target.pos === "object" &&
            "x" in target.pos &&
            typeof target.pos.x === "number" &&
            "y" in target.pos &&
            typeof target.pos.y === "number"
          ) {
            creep.room.visual.text("🛠️", target.pos.x, target.pos.y, { align: "left", opacity: 0.8 });
            creep.room.visual.line(creep.pos.x, creep.pos.y, target.pos.x, target.pos.y, {
              color: "green"
            });
          }
        }

        if (state === "harvesting") {
          acc.harvesting.push(creep);
        } else {
          acc.nonHarvesting.push(creep);
        }
        return acc;
      },
      { harvesting: [] as Creep[], nonHarvesting: [] as Creep[] }
    );

    for (const laborer of nonHarvesting) {
      const sortedTransferTargets = transferTargets
        .map(t => ({
          id: t.base.id,
          distance: distance2(t.base, laborer)
        }))
        .sort((a, b) => a.distance - b.distance)
        .map(t => ({ type: "transfer", base: Game.getObjectById(t.id) } as TransferTarget));

      laborerTick(
        laborer,
        spawns,
        sources,
        constructionSites,
        structures,
        unplannedStructures,
        energyTargets,
        energyTargets,
        sortedTransferTargets
      );
    }

    if (!harvesting.length) return;

    const energyAccessPositions = flattenArray(
      energyTargets
        .map(target => ({
          ...target,
          accessiblePositions: accessiblePositions(target),
          relativeEnergy:
            target.type === "harvest"
              ? target.base.energy / target.base.energyCapacity
              : target.type === "withdraw"
              ? target.base.store.getUsedCapacity(RESOURCE_ENERGY) /
                (target.base.store.getCapacity(RESOURCE_ENERGY) ?? 2000)
              : 0
        }))
        // .filter(t => t.accessiblePositions.length)
        .sort((a, b) => b.relativeEnergy - a.relativeEnergy)
        .map(({ accessiblePositions, ...rest }) =>
          accessiblePositions.map(accessiblePosition => ({ ...rest, accessiblePosition }))
        )
    );

    if (Memory.visual.energyAccessPositions) {
      energyAccessPositions.forEach(({ accessiblePosition }) => {
        laborers[0].room.visual.circle(accessiblePosition.pos.x, accessiblePosition.pos.y, {
          radius: 0.5,
          fill: "green",
          opacity: 0.3
        });
      });
    }

    for (const harvester of harvesting) {
      const accessFromMyPosition = flattenArray(
        energyTargets
          .filter(t => t.base.pos.isNearTo(harvester.pos))
          .map(target => ({
            ...target,
            accessiblePositions: [{ pos: { x: harvester.pos.x, y: harvester.pos.y } }],
            relativeEnergy:
              target.type === "harvest"
                ? target.base.energy / target.base.energyCapacity
                : target.type === "withdraw"
                ? target.base.store.getUsedCapacity(RESOURCE_ENERGY) /
                  (target.base.store.getCapacity(RESOURCE_ENERGY) ?? 2000)
                : 0
          }))
          .map(({ accessiblePositions, ...rest }) =>
            accessiblePositions.map(accessiblePosition => ({ ...rest, accessiblePosition }))
          )
      );

      const standingOnPositions = energyAccessPositions
        .concat(accessFromMyPosition)
        .filter(t => t.accessiblePosition.pos.x === harvester.pos.x && t.accessiblePosition.pos.y === harvester.pos.y)
        .sort((a, b) =>
          a.type === "withdraw" && b.type === "withdraw"
            ? -2 * (b.relativeEnergy - a.relativeEnergy)
            : a.type === "withdraw"
            ? -1
            : 1
        );

      if (standingOnPositions.length) {
        // console.log(`Harvester ${harvester.name} is standing on an energy target access position`);
        getEnergyFromEnergyTarget(standingOnPositions[0], harvester);
        harvester.memory.target = standingOnPositions[0].base.id;

        for (const standingOnPosition of standingOnPositions) {
          energyAccessPositions.splice(energyAccessPositions.indexOf(standingOnPosition), 1);
        }
        continue;
      }

      // Weight by distance and relative energy
      const closestPositions = energyAccessPositions.sort(
        (a, b) =>
          distance2(a.accessiblePosition, harvester) * (1 - a.relativeEnergy) -
          distance2(b.accessiblePosition, harvester) * (1 - b.relativeEnergy)
      );

      if (closestPositions.length) {
        moveToTargetByCachedPath(
          harvester,
          {
            type: "move",
            base: {
              pos: new RoomPosition(
                closestPositions[0].accessiblePosition.pos.x,
                closestPositions[0].accessiblePosition.pos.y,
                harvester.room.name
              ),
              room: harvester.room
            }
          },
          { stroke: PATH_COLORS["harvesting"] }
        );
        harvester.memory.target = closestPositions[0].base.id;
        harvester.memory.movingTo = closestPositions[0].accessiblePosition.pos;

        const samePositions = energyAccessPositions.filter(
          t =>
            t.accessiblePosition.pos.x === closestPositions[0].accessiblePosition.pos.x &&
            t.accessiblePosition.pos.y === closestPositions[0].accessiblePosition.pos.y
        );
        for (const samePosition of samePositions) {
          energyAccessPositions.splice(energyAccessPositions.indexOf(samePosition), 1);
        }
      }
    }
  },
  "creeps.behavior.laborer.dispatch"
);
