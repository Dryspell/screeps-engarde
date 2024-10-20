import { builderTick, harvesterTick, upgraderTick } from "creepBehavior";

export const ROLES = {
  harvester: {
    body: [WORK, CARRY, MOVE] satisfies BodyPartConstant[],
    max: 4,
    tick: harvesterTick,
    spawnCondition: (room: Room) => true
  },
  upgrader: {
    body: [WORK, CARRY, MOVE] satisfies BodyPartConstant[],
    max: 3,
    tick: upgraderTick,
    spawnCondition: (room: Room) => room.controller && room.controller?.level < 8
  },
  builder: {
    body: [WORK, CARRY, MOVE] satisfies BodyPartConstant[],
    max: 6,
    tick: builderTick,
    spawnCondition: (room: Room) => room.find(FIND_CONSTRUCTION_SITES).length > 0
  },
  claimer: {
    body: [CLAIM, MOVE] satisfies BodyPartConstant[],
    max: 1,
    tick: (creep: Creep) => {},
    spawnCondition: (room: Room) => room.energyAvailable >= 650
  }
} as const;

export const isValidRole = (role: string): role is keyof typeof ROLES => {
  return role in ROLES;
};

// const BODYPART_COST = {
//         "move": 50,
//         "work": 100,
//         "attack": 80,
//         "carry": 50,
//         "heal": 250,
//         "ranged_attack": 150,
//         "tough": 10,
//         "claim": 600
//     };

const generateBody = (energy: number, body: BodyPartConstant[]) => {
  let availableEnergy = energy;
  if (availableEnergy < body.reduce((acc, part) => acc + BODYPART_COST[part], 0)) {
    return body;
  }
  const bodyParts = [] as BodyPartConstant[];
  const cheapestPart = body.sort((a, b) => BODYPART_COST[a] - BODYPART_COST[b])[0];

  while (availableEnergy >= BODYPART_COST[cheapestPart]) {
    for (const part of body) {
      if (BODYPART_COST[part] > availableEnergy) {
        continue;
      }
      bodyParts.push(part);
      availableEnergy -= BODYPART_COST[part];
    }
  }
  return bodyParts;
};

export const handleSpawning = (spawns: StructureSpawn[], creeps: Creep[]) => {
  const sortedRoles = Object.entries(ROLES)
    .sort(
      ([roleA, _A], [roleB, _B]) =>
        creeps.filter(creep => creep.memory.role === roleA).length -
        creeps.filter(creep => creep.memory.role === roleB).length
    )
    .filter(([role, { max }]) => creeps.filter(creep => creep.memory.role === role).length < max);

  spawns.forEach(spawn => {
    if (spawn.spawning) {
      const spawningCreep = Game.creeps[spawn.spawning.name];
      spawn.room.visual.text("🛠️" + spawningCreep.memory.role, spawn.pos.x + 1, spawn.pos.y, {
        align: "left",
        opacity: 0.8
      });
      return;
    }

    if (
      sortedRoles.every(
        ([_, { body }]) =>
          generateBody(spawn.room.energyAvailable, body).length <
          generateBody(spawn.room.energyCapacityAvailable, body).length
      )
    )
      return;

    for (const entry of sortedRoles) {
      const [role, { body, max, spawnCondition }] = entry;
      if (!isValidRole(role) || !spawnCondition(spawn.room)) continue;

      const newBody = generateBody(spawn.room.energyAvailable, body);
      if (
        spawn.spawnCreep(newBody, `${role}${Game.time}`, {
          memory: { role, room: spawn.room.name, spawn: spawn.name }
        }) === OK
      ) {
        console.log(`[${Game.time.toLocaleString()}] Spawning new ${role} with body: [${newBody.join(", ")}]`);
      }
      return;
    }
  });
};
