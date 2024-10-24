import { claimerTick } from "creepBehavior/claimer";
import { laborerTick } from "./laborer";
import { minerTick } from "./miner";

const bodyCost = (body: BodyPartConstant[]) => body.reduce((acc, part) => acc + BODYPART_COST[part], 0);

export const ROLES = {
  miner: {
    generateBody: (spawn: StructureSpawn) => {
      const defaultBody: BodyPartConstant[] = spawn.room.find(FIND_MY_CONSTRUCTION_SITES, {
        filter: site => site.structureType === STRUCTURE_CONTAINER
      }).length
        ? [MOVE, CARRY]
        : [MOVE];
      let availableEnergy = spawn.room.energyAvailable - bodyCost(defaultBody);
      const bodyParts = defaultBody;

      while (availableEnergy >= BODYPART_COST[WORK]) {
        bodyParts.push(WORK);
        availableEnergy -= BODYPART_COST[WORK];
      }
      return bodyParts;
    },
    spawnCondition: (room: Room, creeps: Creep[]) => {
      const nonMinerCreeps = creeps.filter(creep => creep.room.name === room.name && creep.memory.role !== "miner");
      const minerCreeps = creeps.filter(creep => creep.room.name === room.name && creep.memory.role === "miner");

      return (
        room.energyAvailable >= bodyCost([MOVE, WORK, WORK]) &&
        nonMinerCreeps.length &&
        Memory.rooms[room.name].minerPositions?.length &&
        minerCreeps.length < Memory.rooms[room.name].minerPositions?.length &&
        nonMinerCreeps.length >= minerCreeps.length
      );
    },
    tick: minerTick
  },
  // multirole harvester, upgrader, builder
  laborer: {
    body: [WORK, CARRY, MOVE] satisfies BodyPartConstant[],
    max: 6,
    tick: laborerTick,
    spawnCondition: (room: Room, creeps: Creep[]) => {
      const laborersInRoom = creeps.filter(creep => creep.room.name === room.name && creep.memory.role === "laborer");
      return (
        (Memory.rooms[room.name].minerPositions?.length &&
          laborersInRoom.length < Memory.rooms[room.name].minerPositions?.length) ||
        laborersInRoom.length < 1
      );
    }
  },
  claimer: {
    body: [CLAIM, MOVE] satisfies BodyPartConstant[],
    max: 1,
    tick: claimerTick,
    spawnCondition: (room: Room) => room.energyAvailable >= 650 && Object.keys(Game.rooms).length < Game.gcl.level
  }
} as const;

export const isValidRole = (role: string): role is keyof typeof ROLES => {
  return role in ROLES;
};
