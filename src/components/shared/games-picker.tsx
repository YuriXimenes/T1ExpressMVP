"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { Check, X } from "lucide-react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { gameOptions } from "@/lib/data/games";
import { cn } from "@/lib/utils";
import type { GameTag } from "@/lib/types/signup";

export function GamesPicker({
  games,
  setGames,
  customGames,
  setCustomGames,
  heading = "Quais jogos você joga?",
}: {
  games: GameTag[];
  setGames: Dispatch<SetStateAction<GameTag[]>>;
  customGames: string[];
  setCustomGames: Dispatch<SetStateAction<string[]>>;
  heading?: string;
}) {
  const [customGameInput, setCustomGameInput] = useState("");

  function toggleGame(id: GameTag) {
    setGames((prev) =>
      prev.includes(id) ? prev.filter((g) => g !== id) : [...prev, id],
    );
  }

  function addCustomGame() {
    const value = customGameInput.trim();
    if (!value || customGames.includes(value)) {
      setCustomGameInput("");
      return;
    }
    setCustomGames((prev) => [...prev, value]);
    setCustomGameInput("");
  }

  function removeCustomGame(tag: string) {
    setCustomGames((prev) => prev.filter((g) => g !== tag));
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">{heading}</h3>
      <div className="flex flex-wrap gap-2">
        {gameOptions.map((game) => {
          const selected = games.includes(game.id);
          return (
            <button
              key={game.id}
              type="button"
              onClick={() => toggleGame(game.id)}
              aria-pressed={selected}
              className={cn(
                "flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium transition-colors",
                selected
                  ? "border-brand-600 bg-brand-50 text-brand-700"
                  : "border-slate-200 text-slate-600 hover:border-slate-300",
              )}
            >
              {selected && <Check className="h-3.5 w-3.5" aria-hidden="true" />}
              {game.label}
            </button>
          );
        })}
      </div>
      {games.includes("outro") && (
        <div className="space-y-2">
          <Label htmlFor="customGameInput">Quais?</Label>
          {customGames.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {customGames.map((tag) => (
                <span
                  key={tag}
                  className="border-brand-600 bg-brand-50 text-brand-700 flex items-center gap-1.5 rounded-full border px-3.5 py-1.5 text-sm font-medium"
                >
                  <Check className="h-3.5 w-3.5" aria-hidden="true" />
                  {tag}
                  <button
                    type="button"
                    onClick={() => removeCustomGame(tag)}
                    aria-label={`Remover ${tag}`}
                    className="text-brand-400 hover:text-brand-700"
                  >
                    <X className="h-3.5 w-3.5" aria-hidden="true" />
                  </button>
                </span>
              ))}
            </div>
          )}
          <Input
            id="customGameInput"
            value={customGameInput}
            onChange={(event) => setCustomGameInput(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") {
                event.preventDefault();
                addCustomGame();
              }
            }}
            placeholder="Digite o nome do jogo e pressione Enter"
          />
        </div>
      )}
    </div>
  );
}
