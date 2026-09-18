"use client";

import { useState, type Dispatch, type SetStateAction } from "react";
import { Plus, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { FreightStoreCard } from "@/components/shared/freight-store-card";
import { useCatalog } from "@/lib/catalog/provider";
import type { CustomPreferredStore } from "@/lib/types/signup";

export function StorePreferencesPicker({
  preferredStoreIds,
  setPreferredStoreIds,
  customStores,
  setCustomStores,
}: {
  preferredStoreIds: string[];
  setPreferredStoreIds: Dispatch<SetStateAction<string[]>>;
  customStores: CustomPreferredStore[];
  setCustomStores: Dispatch<SetStateAction<CustomPreferredStore[]>>;
}) {
  const { stores: freightStores } = useCatalog();
  const [showCustomStoreForm, setShowCustomStoreForm] = useState(customStores.length > 0);

  function toggleStore(id: string) {
    setPreferredStoreIds((prev) =>
      prev.includes(id) ? prev.filter((s) => s !== id) : [...prev, id],
    );
  }

  function addCustomStoreRow() {
    setCustomStores((prev) => [...prev, { name: "", address: "" }]);
  }

  function updateCustomStore(index: number, field: "name" | "address", value: string) {
    setCustomStores((prev) =>
      prev.map((store, i) => (i === index ? { ...store, [field]: value } : store)),
    );
  }

  function removeCustomStore(index: number) {
    setCustomStores((prev) => prev.filter((_, i) => i !== index));
  }

  return (
    <div className="space-y-3">
      <h3 className="text-sm font-semibold text-slate-900">
        Lojas de preferência{" "}
        <span className="font-normal text-slate-400">(pode selecionar mais de uma)</span>
      </h3>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        {freightStores.map((store) => (
          <FreightStoreCard
            key={store.id}
            store={store}
            selected={preferredStoreIds.includes(store.id)}
            onToggle={() => toggleStore(store.id)}
          />
        ))}
      </div>

      <div className="border-t border-slate-100 pt-3">
        {!showCustomStoreForm ? (
          <button
            type="button"
            onClick={() => {
              setShowCustomStoreForm(true);
              setCustomStores((prev) =>
                prev.length === 0 ? [{ name: "", address: "" }] : prev,
              );
            }}
            className="text-brand-600 text-left text-sm font-medium hover:underline"
          >
            Não há sua loja de preferência na lista? Nos informe qual é.
          </button>
        ) : (
          <div className="space-y-3">
            <p className="text-sm font-medium text-slate-700">
              Sua loja não está na lista
            </p>
            {customStores.map((store, index) => (
              <div key={index} className="flex items-start gap-2">
                <div className="grid flex-1 gap-2 sm:grid-cols-2">
                  <Input
                    placeholder="Nome da loja"
                    value={store.name}
                    onChange={(event) =>
                      updateCustomStore(index, "name", event.target.value)
                    }
                  />
                  <Input
                    placeholder="Endereço"
                    value={store.address}
                    onChange={(event) =>
                      updateCustomStore(index, "address", event.target.value)
                    }
                  />
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="shrink-0"
                  onClick={() => removeCustomStore(index)}
                  aria-label="Remover loja"
                >
                  <X className="h-4 w-4" aria-hidden="true" />
                </Button>
              </div>
            ))}
            <Button type="button" variant="outline" size="sm" onClick={addCustomStoreRow}>
              <Plus className="h-4 w-4" aria-hidden="true" />
              Adicionar outra loja
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
