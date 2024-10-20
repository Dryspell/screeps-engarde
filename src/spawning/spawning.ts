import { isValidRole, ROLES } from "creepBehavior/roles";
import { generateBody } from "./utils";

export const nameCreep = (role: string) => `${role}${Game.time}`;

const energyProduction = (room: Room) => {
  const sources = room.find(FIND_SOURCES);
  const regenerationTime = 300; //sources.reduce((acc, source) => acc + source.ticksToRegeneration, 0);
  const workParts = room.find(FIND_MY_CREEPS).reduce((acc, creep) => acc + creep.getActiveBodyparts(WORK), 0);

  const energyPotential = sources.length * 3000;
  const production = workParts * regenerationTime;

  Game.time % 5 === 0 &&
    console.log(
      `[${Game.time.toLocaleString()}] Room ${room.name} Energy Production: ${production}/${energyPotential}`
    );

  return [workParts * regenerationTime, sources.length * 3000] as [production: number, energyPotential: number];
};

export const handleSpawning = (spawns: StructureSpawn[], creeps: Creep[]) => {
  const sortedRoles = Object.entries(ROLES).sort(
    ([roleA, _A], [roleB, _B]) =>
      creeps.filter(creep => creep.memory.role === roleA).length -
      creeps.filter(creep => creep.memory.role === roleB).length
  );

  spawns.forEach(spawn => {
    if (spawn.spawning) {
      const spawningCreep = Game.creeps[spawn.spawning.name];
      spawn.room.visual.text("🛠️" + spawningCreep.memory.role, spawn.pos.x + 1, spawn.pos.y, {
        align: "left",
        opacity: 0.8
      });
      return;
    }

    const [production, energyPotential] = energyProduction(spawn.room);
    if (production > energyPotential) return;

    if (
      spawn.room.find(FIND_MY_CREEPS).length &&
      (sortedRoles.every(
        ([_, { body }]) =>
          generateBody(spawn.room.energyAvailable, body).length <
          generateBody(spawn.room.energyCapacityAvailable, body).length
      ) ||
        sortedRoles.reduce((acc, [_, { max }]) => acc + max, 0) >= creeps.length)
    )
      return;

    for (const entry of sortedRoles) {
      const [role, { body, max, spawnCondition }] = entry;
      if (
        !isValidRole(role) ||
        !spawnCondition(spawn.room) ||
        creeps.filter(creep => creep.room.name === spawn.room.name && creep.memory.role === role).length >= max
      )
        continue;

      const newBody = generateBody(spawn.room.energyAvailable, body);
      if (
        spawn.spawnCreep(newBody, nameCreep(role), {
          memory: { role, room: spawn.room.name, spawn: spawn.name }
        }) === OK
      ) {
        console.log(
          `[${Game.time.toLocaleString()}] Room ${spawn.room.name}: Spawning new ${role} with body: [${newBody.join(
            ", "
          )}]`
        );
      }
      return;
    }
  });
};
