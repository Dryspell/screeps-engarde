import { generateBody, isValidRole, ROLES } from "./utils";

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
      if (
        !isValidRole(role) ||
        !spawnCondition(spawn.room) ||
        creeps.filter(creep => creep.room.name === spawn.room.name && creep.memory.role === role).length >= max
      )
        continue;

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
