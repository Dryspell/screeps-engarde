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

export const generateBody = (energy: number, body: BodyPartConstant[]) => {
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
