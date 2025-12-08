/**
 * Poker character system - assigns random personas to AI models
 * Hides the real model identity until game reveal
 */

export interface PokerCharacter {
  id: string;
  name: string;
  portrait: string;
  color: string;
  weight?: number; // Selection weight (default 1.0, lower = rarer)
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
    color: "#556B2F",
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
    color: "#C9A227",
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
    color: "#FF7518",
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
    color: "#E6BE8A",
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
    color: "#E35335",
  },
  {
    id: "light",
    name: "Light Yagami",
    portrait: "/assets/portraits/light_yagami.png",
    color: "#8B0000",
  },
  // Scientists & Inventors
  {
    id: "ada",
    name: "Ada Lovelace",
    portrait: "/assets/portraits/ada_lovelace.png",
    color: "#9370DB",
  },
  {
    id: "alan",
    name: "Alan Turing",
    portrait: "/assets/portraits/alan_turing.png",
    color: "#4682B4",
  },
  {
    id: "isaac",
    name: "Isaac Newton",
    portrait: "/assets/portraits/isaac_newton.png",
    color: "#8B4513",
  },
  {
    id: "marie",
    name: "Marie Curie",
    portrait: "/assets/portraits/marie_curie.png",
    color: "#20B2AA",
  },
  {
    id: "leonardo",
    name: "Leonardo da Vinci",
    portrait: "/assets/portraits/leonardo_da_vinci.png",
    color: "#DAA520",
  },
  {
    id: "carl",
    name: "Carl Sagan",
    portrait: "/assets/portraits/carl_sagan.png",
    color: "#1E90FF",
  },
  {
    id: "bill_nye",
    name: "Bill Nye",
    portrait: "/assets/portraits/bill_nye.png",
    color: "#0096FF",
  },
  // Entertainers & Celebrities
  {
    id: "beyonce",
    name: "Beyoncé",
    portrait: "/assets/portraits/beyonce.png",
    color: "#D4AF37",
  },
  {
    id: "dwayne",
    name: "The Rock",
    portrait: "/assets/portraits/dwayne_johnson.png",
    color: "#36454F",
  },
  {
    id: "steve_irwin",
    name: "Steve Irwin",
    portrait: "/assets/portraits/steve_irwin.png",
    color: "#228B22",
  },
  {
    id: "david",
    name: "David Attenborough",
    portrait: "/assets/portraits/david_attenborough.png",
    color: "#355E3B",
  },
  // Anime Characters
  {
    id: "all_might",
    name: "All Might",
    portrait: "/assets/portraits/all_might.png",
    color: "#0047AB",
  },
  {
    id: "sailor_moon",
    name: "Sailor Moon",
    portrait: "/assets/portraits/sailor_moon.png",
    color: "#FFB6C1",
  },
  {
    id: "pikachu",
    name: "Pikachu",
    portrait: "/assets/portraits/pikachu.png",
    color: "#FFCB05",
  },
  {
    id: "totoro",
    name: "Totoro",
    portrait: "/assets/portraits/totoro.png",
    color: "#808080",
  },
  // Cartoon Characters
  {
    id: "spongebob",
    name: "SpongeBob",
    portrait: "/assets/portraits/spongebob.png",
    color: "#FFFF00",
  },
  {
    id: "patrick",
    name: "Patrick Star",
    portrait: "/assets/portraits/patrick_star.png",
    color: "#FF69B4",
  },
  {
    id: "scooby",
    name: "Scooby-Doo",
    portrait: "/assets/portraits/scooby_doo.png",
    color: "#7B3F00",
  },
  {
    id: "shrek",
    name: "Shrek",
    portrait: "/assets/portraits/shrek.png",
    color: "#6B8E23",
  },
  // Fantasy Characters
  {
    id: "hagrid",
    name: "Hagrid",
    portrait: "/assets/portraits/hagrid.png",
    color: "#5C4033",
  },
  // Tech & Business (rare - lower weight)
  {
    id: "guillermo",
    name: "Guillermo Rauch",
    portrait: "/assets/portraits/guillermo_rauch.png",
    color: "#000000",
    weight: 0.15,
  },
  {
    id: "evan_you",
    name: "Evan You",
    portrait: "/assets/portraits/evan_you.png",
    color: "#42B883",
    weight: 0.15,
  },
  {
    id: "tanner",
    name: "Tanner Linsley",
    portrait: "/assets/portraits/tanner_linsley.png",
    color: "#9ACD32",
    weight: 0.15,
  },
  {
    id: "theo",
    name: "Theo Browne",
    portrait: "/assets/portraits/theo_browne.png",
    color: "#403253",
    weight: 0.15,
  },
  {
    id: "elon",
    name: "Elon Musk",
    portrait: "/assets/portraits/elon_musk.png",
    color: "#1DA1F2",
    weight: 0.15,
  },
  {
    id: "jeff",
    name: "Jeff Bezos",
    portrait: "/assets/portraits/jeff_bezos.png",
    color: "#FF9900",
    weight: 0.15,
  },
  {
    id: "gabe",
    name: "Gabe Newell",
    portrait: "/assets/portraits/gabe_newell.png",
    color: "#1B2838",
    weight: 0.15,
  },
  // Sports (rare)
  {
    id: "max",
    name: "Max Verstappen",
    portrait: "/assets/portraits/max_verstappen.png",
    color: "#0600EF",
    weight: 0.15,
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
 * Weighted random selection - picks a character based on weights
 * Lower weight = less likely to be selected
 */
function weightedRandomSelect(
  characters: PokerCharacter[],
  excludeIds: Set<string>,
): PokerCharacter | null {
  const available = characters.filter((c) => !excludeIds.has(c.id));
  if (available.length === 0) return null;

  // Calculate total weight
  const totalWeight = available.reduce(
    (sum, char) => sum + (char.weight ?? 1.0),
    0,
  );

  // Pick a random point in the weight space
  let random = Math.random() * totalWeight;

  for (const char of available) {
    const weight = char.weight ?? 1.0;
    random -= weight;
    if (random <= 0) {
      return char;
    }
  }

  // Fallback to last character
  return available[available.length - 1];
}

/**
 * Assigns random characters to model IDs
 * Returns a mapping of modelId -> character
 * Uses weighted selection for rare characters
 */
export function assignCharactersToModels(
  modelIds: string[],
): Record<string, PokerCharacter> {
  const mapping: Record<string, PokerCharacter> = {};
  const usedIds = new Set<string>();

  for (const modelId of modelIds) {
    const selected = weightedRandomSelect(POKER_CHARACTERS, usedIds);
    if (selected) {
      mapping[modelId] = selected;
      usedIds.add(selected.id);
    } else {
      // Fallback if we run out of characters (shouldn't happen)
      const shuffled = shuffleArray(POKER_CHARACTERS);
      mapping[modelId] = shuffled[0];
    }
  }

  return mapping;
}

/**
 * Randomize player order for display
 */
export function randomizePlayerOrder<T>(players: T[]): T[] {
  return shuffleArray(players);
}
