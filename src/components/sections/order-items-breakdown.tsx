import Image from "next/image";
import { Card } from "@/components/ui/card";
import { lineTotal, orderGroupTotal } from "@/components/sections/store-order-builder";
import { accessoryOptions, pedidoKindOptions } from "@/lib/data/order-options";
import { gameOptions } from "@/lib/data/games";
import { cn } from "@/lib/utils";
import type { PickupPartner } from "@/lib/types/pickup-partner";
import type { AccessoryItem, CardLikeItem, PedidoGroup } from "@/lib/types/order";

function formatBRL(value: number) {
  return `R$ ${value.toFixed(2).replace(".", ",")}`;
}

function cardItemLabel(item: CardLikeItem) {
  const gameLabel =
    item.game === "outro"
      ? item.otherGame || "Outro"
      : (gameOptions.find((option) => option.id === item.game)?.label ?? item.game);
  return `${item.cardName || "Sem nome"} · ${gameLabel}`;
}

function accessoryItemLabel(item: AccessoryItem) {
  return item.accessory === "outro"
    ? item.otherAccessory || "Outro acessório"
    : (accessoryOptions.find((option) => option.id === item.accessory)?.label ??
        item.accessory);
}

function kindLabel(kind: PedidoGroup["kind"]) {
  return pedidoKindOptions.find((option) => option.id === kind)?.label ?? kind;
}

export function OrderItemsBreakdown({
  originPartners,
  ordersByStore,
  renderStoreFooter,
  footer,
}: {
  originPartners: PickupPartner[];
  ordersByStore: Record<string, PedidoGroup[]>;
  /** Slot opcional renderizado no rodapé de cada card de loja (ex.: "Adicionar pedido"). */
  renderStoreFooter?: (partner: PickupPartner) => React.ReactNode;
  /** Slot opcional renderizado abaixo da lista de lojas (ex.: "Adicionar nova loja"). */
  footer?: React.ReactNode;
}) {
  return (
    <div className="space-y-4">
      {originPartners.map((partner) => {
        const groups = ordersByStore[partner.id] ?? [];
        const storeTotal = groups.reduce((sum, group) => sum + orderGroupTotal(group), 0);

        return (
          <Card key={partner.id} className="gap-3 p-6">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <span
                  className={cn(
                    "flex h-8 w-8 shrink-0 items-center justify-center overflow-hidden rounded-full",
                    partner.onDark && "bg-slate-900",
                  )}
                >
                  <Image
                    src={partner.logo}
                    alt=""
                    width={32}
                    height={32}
                    className="h-full w-full object-contain"
                  />
                </span>
                <h2 className="font-semibold text-slate-900">{partner.name}</h2>
              </div>
              <span className="text-sm font-semibold text-slate-900">
                {formatBRL(storeTotal)}
              </span>
            </div>

            {groups.every(
              (group) =>
                group.cardItems.length === 0 && group.accessoryItems.length === 0,
            ) ? (
              <p className="text-sm text-slate-500">Nenhum item adicionado nessa loja.</p>
            ) : (
              <div className="space-y-3">
                {groups.map((group) => {
                  const items =
                    group.kind === "acessorios" ? group.accessoryItems : group.cardItems;
                  if (items.length === 0) return null;

                  return (
                    <div key={group.id} className="border-t border-slate-100 pt-3">
                      <p className="text-xs font-medium tracking-wide text-slate-400 uppercase">
                        {kindLabel(group.kind)}
                        {group.orderNumber ? ` · Pedido ${group.orderNumber}` : ""}
                      </p>
                      <ul className="mt-1.5 space-y-1">
                        {group.kind === "acessorios"
                          ? group.accessoryItems.map((item) => (
                              <li
                                key={item.id}
                                className="flex items-center justify-between gap-2 text-sm"
                              >
                                <span className="text-slate-700">
                                  {item.quantity}x {accessoryItemLabel(item)}
                                </span>
                                <span className="text-slate-600">
                                  {formatBRL(lineTotal(item))}
                                </span>
                              </li>
                            ))
                          : group.cardItems.map((item) => (
                              <li
                                key={item.id}
                                className="flex items-center justify-between gap-2 text-sm"
                              >
                                <span className="text-slate-700">
                                  {item.quantity}x {cardItemLabel(item)}
                                </span>
                                <span className="text-slate-600">
                                  {formatBRL(lineTotal(item))}
                                </span>
                              </li>
                            ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}

            {renderStoreFooter && (
              <div className="border-t border-slate-100 pt-3">
                {renderStoreFooter(partner)}
              </div>
            )}
          </Card>
        );
      })}

      {footer && <div className="flex justify-center">{footer}</div>}
    </div>
  );
}
