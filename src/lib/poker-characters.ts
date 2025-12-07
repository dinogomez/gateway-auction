/**
 * Poker character system - assigns random personas to AI models
 * Hides the real model identity until game reveal
 */

export interface PokerCharacter {
  id: string;
  name: string;
  portrait: string;
  color: string;
}

// Available poker characters with portraits (bright colors for dark UI)
export const POKER_CHARACTERS: PokerCharacter[] = [
  {
    id: "sherlock",
    name: "Sherlock Holmes",
    portrait: "/assets/portraits/sherlock_holmes.png",
    color: "#D2691E",
  },
  {
    id: "yoda",
    name: "Yoda",
    portrait: "/assets/portraits/yoda.png",
    color: "#9ACD32",
  },
  {
    id: "gandalf",
    name: "Gandalf",
    portrait: "/assets/portraits/gandalf.png",
    color: "#C0C0C0",
  },
  {
    id: "darth_vader",
    name: "Darth Vader",
    portrait: "/assets/portraits/darth_vader.png",
    color: "#FF4444",
  },
  {
    id: "jack_sparrow",
    name: "Jack Sparrow",
    portrait: "/assets/portraits/jack_sparrow.png",
    color: "#DEB887",
  },
  {
    id: "einstein",
    name: "Albert Einstein",
    portrait: "/assets/portraits/albert_einstein.png",
    color: "#6495ED",
  },
  {
    id: "tesla",
    name: "Nikola Tesla",
    portrait: "/assets/portraits/nikola_tesla.png",
    color: "#00CED1",
  },
  {
    id: "tyrion",
    name: "Tyrion Lannister",
    portrait: "/assets/portraits/tyrion_lannister.png",
    color: "#FFD700",
  },
  {
    id: "keanu",
    name: "Keanu Reeves",
    portrait: "/assets/portraits/keanu_reeves.png",
    color: "#87CEEB",
  },
  {
    id: "goku",
    name: "Goku",
    portrait: "/assets/portraits/goku.png",
    color: "#FF6600",
  },
  {
    id: "naruto",
    name: "Naruto",
    portrait: "/assets/portraits/naruto.png",
    color: "#FF8C00",
  },
  {
    id: "saitama",
    name: "Saitama",
    portrait: "/assets/portraits/saitama.png",
    color: "#FFEA00",
  },
  {
    id: "snoop",
    name: "Snoop Dogg",
    portrait: "/assets/portraits/snoop_dogg.png",
    color: "#32CD32",
  },
  {
    id: "gordon",
    name: "Gordon Ramsay",
    portrait: "/assets/portraits/gordon_ramsay.png",
    color: "#FF4500",
  },
  {
    id: "bob_ross",
    name: "Bob Ross",
    portrait: "/assets/portraits/bob_ross.png",
    color: "#3CB371",
  },
  {
    id: "freddie",
    name: "Freddie Mercury",
    portrait: "/assets/portraits/freddie_mercury.png",
    color: "#FFD700",
  },
  {
    id: "wednesday",
    name: "Wednesday Addams",
    portrait: "/assets/portraits/wednesday_addams.png",
    color: "#B19CD9",
  },
  {
    id: "oprah",
    name: "Oprah",
    portrait: "/assets/portraits/oprah_winfrey.png",
    color: "#DA70D6",
  },
  {
    id: "velma",
    name: "Velma",
    portrait: "/assets/portraits/velma_dinkley.png",
    color: "#FF6347",
  },
  {
    id: "light",
    name: "Light Yagami",
    portrait: "/assets/portraits/light_yagami.png",
    color: "#FF6B6B",
  },
];

// Shuffle array using Fisher-Yates
function shuffleArray<T>(array: T[]): T[] {
  const shuffled = [...array];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  return shuffled;
}

/**
 * Assigns random characters to model IDs
 * Returns a mapping of modelId -> character
 */
export function assignCharactersToModels(
  modelIds: string[],
): Record<string, PokerCharacter> {
  const shuffledCharacters = shuffleArray(POKER_CHARACTERS);
  const mapping: Record<string, PokerCharacter> = {};

  modelIds.forEach((modelId, index) => {
    mapping[modelId] = shuffledCharacters[index % shuffledCharacters.length];
  });

  return mapping;
}

/**
 * Randomize player order for display
 */
export function randomizePlayerOrder<T>(players: T[]): T[] {
  return shuffleArray(players);
}
