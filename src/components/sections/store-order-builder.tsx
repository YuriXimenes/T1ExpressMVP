"use client";

import { Plus, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { PriceQuantityFields } from "@/components/shared/price-quantity-fields";
import { accessoryOptions, pedidoKindOptions } from "@/lib/data/order-options";
import { gameOptions } from "@/lib/data/games";
import { makeCardItem, makePedidoGroup } from "@/lib/order-helpers";
import { cn } from "@/lib/utils";
import type { AccessoryItem, CardLikeItem, PedidoGroup } from "@/lib/types/order";

export { makePedidoGroup } from "@/lib/order-helpers";

function makeAccessoryItem(): AccessoryItem {
  return {
    id: crypto.randomUUID(),
    accessory: "sleeve",
    price: 0,
    priceMode: "unit",
    quantity: 1,
  };
}

export function lineTotal(item: {
  price: number;
  priceMode: "unit" | "total";
  quantity: number;
}) {
  return item.priceMode === "total" ? item.price : item.price * item.quantity;
}

export function orderGroupTotal(group: PedidoGroup): number {
  if (group.kind === "acessorios") {
    return group.accessoryItems.reduce((sum, item) => sum + lineTotal(item), 0);
  }
  return group.cardItems.reduce((sum, item) => sum + lineTotal(item), 0);
}

export function StoreOrderBuilder({
  groups,
  onChange,
}: {
  groups: PedidoGroup[];
  onChange: (groups: PedidoGroup[]) => void;
}) {
  function updateGroup(id: string, patch: Partial<PedidoGroup>) {
    onChange(groups.map((group) => (group.id === id ? { ...group, ...patch } : group)));
  }

  function setKind(group: PedidoGroup, kind: PedidoGroup["kind"]) {
    const patch: Partial<PedidoGroup> = { kind };
    if (kind === "acessorios" && group.accessoryItems.length === 0) {
      patch.accessoryItems = [makeAccessoryItem()];
    } else if (kind !== "acessorios" && group.cardItems.length === 0) {
      patch.cardItems = [makeCardItem()];
    }
    updateGroup(group.id, patch);
  }

  function updateCardItem(
    group: PedidoGroup,
    itemId: string,
    patch: Partial<CardLikeItem>,
  ) {
    updateGroup(group.id, {
      cardItems: group.cardItems.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item,
      ),
    });
  }

  function updateAccessoryItem(
    group: PedidoGroup,
    itemId: string,
    patch: Partial<AccessoryItem>,
  ) {
    updateGroup(group.id, {
      accessoryItems: group.accessoryItems.map((item) =>
        item.id === itemId ? { ...item, ...patch } : item,
      ),
    });
  }

  function addPedidoGroup() {
    onChange([...groups, makePedidoGroup()]);
  }

  function removePedidoGroup(id: string) {
    onChange(groups.filter((group) => group.id !== id));
  }

  return (
    <div className="space-y-4">
      {groups.map((group, groupIndex) => (
        <div key={group.id} className="space-y-4 rounded-lg border border-slate-200 p-4">
          <div className="flex items-start justify-between gap-2">
            <div className="flex flex-wrap gap-2">
              {pedidoKindOptions.map((option) => (
                <button
                  key={option.id}
                  type="button"
                  onClick={() => setKind(group, option.id)}
                  aria-pressed={group.kind === option.id}
                  className={cn(
                    "rounded-full border px-3 py-1 text-xs font-medium transition-colors",
                    group.kind === option.id
                      ? "border-brand-600 bg-brand-50 text-brand-700"
                      : "border-slate-200 text-slate-600 hover:border-slate-300",
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>
            {groups.length > 1 && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="shrink-0"
                onClick={() => removePedidoGroup(group.id)}
                aria-label="Remover pedido"
              >
                <Trash2 className="h-4 w-4" aria-hidden="true" />
              </Button>
            )}
          </div>

          <div className="space-y-1.5">
            <Label htmlFor={`order-number-${group.id}`}>Número do pedido</Label>
            <Input
              id={`order-number-${group.id}`}
              value={group.orderNumber}
              onChange={(event) =>
                updateGroup(group.id, { orderNumber: event.target.value })
              }
              placeholder={`Pedido ${groupIndex + 1}`}
            />
          </div>

          {group.kind === "acessorios" ? (
            <div className="space-y-3">
              {group.accessoryItems.map((item) => (
                <div key={item.id} className="space-y-2 rounded-md bg-slate-50 p-3">
                  <div className="flex items-start gap-2">
                    <Select
                      value={item.accessory}
                      onValueChange={(value) =>
                        updateAccessoryItem(group, item.id, {
                          accessory: value as AccessoryItem["accessory"],
                        })
                      }
                    >
                      <SelectTrigger className="w-full">
                        <SelectValue placeholder="Qual acessório?" />
                      </SelectTrigger>
                      <SelectContent>
                        {accessoryOptions.map((option) => (
                          <SelectItem key={option.id} value={option.id}>
                            {option.label}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() =>
                        updateGroup(group.id, {
                          accessoryItems: group.accessoryItems.filter(
                            (i) => i.id !== item.id,
                          ),
                        })
                      }
                      aria-label="Remover item"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>
                  {item.accessory === "outro" && (
                    <Input
                      placeholder="Qual acessório?"
                      value={item.otherAccessory ?? ""}
                      onChange={(event) =>
                        updateAccessoryItem(group, item.id, {
                          otherAccessory: event.target.value,
                        })
                      }
                    />
                  )}
                  <PriceQuantityFields
                    price={item.price}
                    quantity={item.quantity}
                    priceMode={item.priceMode}
                    onPriceChange={(price) =>
                      updateAccessoryItem(group, item.id, { price })
                    }
                    onQuantityChange={(quantity) =>
                      updateAccessoryItem(group, item.id, { quantity })
                    }
                    onPriceModeChange={(priceMode) =>
                      updateAccessoryItem(group, item.id, { priceMode })
                    }
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  updateGroup(group.id, {
                    accessoryItems: [...group.accessoryItems, makeAccessoryItem()],
                  })
                }
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Adicionar outro acessório
              </Button>
            </div>
          ) : (
            <div className="space-y-3">
              {group.cardItems.map((item) => (
                <div key={item.id} className="space-y-2 rounded-md bg-slate-50 p-3">
                  <div className="flex items-start gap-2">
                    <Input
                      placeholder={
                        group.kind === "cartas-avulsas"
                          ? "Nome da carta"
                          : "Nome da coleção"
                      }
                      value={item.cardName}
                      onChange={(event) =>
                        updateCardItem(group, item.id, { cardName: event.target.value })
                      }
                      className="flex-1"
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="shrink-0"
                      onClick={() =>
                        updateGroup(group.id, {
                          cardItems: group.cardItems.filter((i) => i.id !== item.id),
                        })
                      }
                      aria-label="Remover item"
                    >
                      <Trash2 className="h-4 w-4" aria-hidden="true" />
                    </Button>
                  </div>

                  <Select
                    value={item.game}
                    onValueChange={(value) =>
                      updateCardItem(group, item.id, {
                        game: value as CardLikeItem["game"],
                      })
                    }
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Jogo" />
                    </SelectTrigger>
                    <SelectContent>
                      {gameOptions.map((option) => (
                        <SelectItem key={option.id} value={option.id}>
                          {option.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {item.game === "outro" && (
                    <Input
                      placeholder="Qual jogo?"
                      value={item.otherGame ?? ""}
                      onChange={(event) =>
                        updateCardItem(group, item.id, { otherGame: event.target.value })
                      }
                    />
                  )}

                  <PriceQuantityFields
                    price={item.price}
                    quantity={item.quantity}
                    priceMode={item.priceMode}
                    onPriceChange={(price) => updateCardItem(group, item.id, { price })}
                    onQuantityChange={(quantity) =>
                      updateCardItem(group, item.id, { quantity })
                    }
                    onPriceModeChange={(priceMode) =>
                      updateCardItem(group, item.id, { priceMode })
                    }
                  />
                </div>
              ))}
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  updateGroup(group.id, {
                    cardItems: [...group.cardItems, makeCardItem()],
                  })
                }
              >
                <Plus className="h-4 w-4" aria-hidden="true" />
                Adicionar outra {group.kind === "cartas-avulsas" ? "carta" : "unidade"}
              </Button>
            </div>
          )}
        </div>
      ))}

      <Button type="button" variant="outline" onClick={addPedidoGroup}>
        <Plus className="h-4 w-4" aria-hidden="true" />
        Adicionar outro pedido nessa loja
      </Button>
    </div>
  );
}
