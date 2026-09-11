import type { GameTag } from "@/lib/types/signup";

export const gameOptions: { id: GameTag; label: string }[] = [
  { id: "magic", label: "Magic" },
  { id: "pokemon", label: "Pokémon" },
  { id: "yugioh", label: "Yu-Gi-Oh!" },
  { id: "lorcana", label: "Lorcana" },
  { id: "fab", label: "Flesh and Blood" },
  { id: "outro", label: "Outro" },
];
