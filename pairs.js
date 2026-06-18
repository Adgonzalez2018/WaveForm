const PAIRS = [
  ["INEVERSEEYOU", "PRESENTS"],
  ["ORIGIN", "ALEX GONZALEZ"],
  ["SAY THAT", "DAY TRIPPER"],
  ["PARANOID ANDROID", "THIS CHARMING MAN"],
  ["ELECTRIC RELAXATION", "ELECTRIC FEEL"],
  ["SAY MY NAME", "KELLY"],
  ["PUSHER", "BOYS DON’T CRY"],
  ["BROTHERS", "PLAY FOR TODAY"],
  ["ALL MY FRIENDS", "THIEVES LIKE US"],
  ["SUPER RAD", "REPTILIA"],
  ["AQUARIUM", "BADFISH"],
  ["SAN TROPEZ", "CREATURE"],
  ["POW POW", "FLATHEAD"],
  ["OUR LOVE", "NOT IN LOVE"],
  ["ALL I NEED", "TOO MUCH LOVE"],
  ["SINCE I LEFT YOU", "FEARLESS"],
  ["WISH YOU WERE HERE", "NEVER CATCH ME"],
  ["A DAY IN THE LIFE", "NEVER AS TIRED AS WHEN I’M WAKING UP"],
  ["SUNSHINE OF YOUR LOVE", "MY SUNSHINE"],
  ["SUMMERTIME CLOTHES", "BLISTER IN THE SUN"],
  ["RITUAL UNION", "CRYSTALISED"],
  ["THIS MUST BE THE PLACE", "HOME"],
  ["POINT/COUNTERPOINT", "NOCTURNE"],
  ["CAN I KICK IT?", "HEARTBREAKER"],
  ["ROUND AND ROUND", "OBVIOUS BICYCLE"],
  ["DVNO", "POGO"],
  ["SATELLLLIIIIIIITEEE", "TOO LONG"],
  ["CHI FLUTE", "C.R.E.A.M."],
  ["A LOVE SUPREME", "STRAWBERRY FIELDS FOREVER"],
];

function flattenPairsToSequence(pairs) {
  const sequence = [];
  const transitionKinds = [];

  if (!pairs.length) return { sequence, transitionKinds };

  sequence.push(pairs[0][0]);
  sequence.push(pairs[0][1]);
  transitionKinds.push("pair");

  for (let i = 1; i < pairs.length; i++) {
    sequence.push(pairs[i][0]);
    transitionKinds.push("between");
    sequence.push(pairs[i][1]);
    transitionKinds.push("pair");
  }

  return { sequence, transitionKinds };
}