"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { PackageSearch, History, Settings } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AccountSettingsForm } from "@/components/sections/account-settings-form";
import { MockOrderCard } from "@/components/sections/mock-order-card";
import { useAuth } from "@/lib/auth";
import { useMockOrders } from "@/lib/mock-orders";
import { cn } from "@/lib/utils";

type ContaTab = "ativos" | "historico" | "configuracoes";

function EmptyOrdersState({
  title,
  description,
}: {
  title: string;
  description: string;
}) {
  return (
    <div className="mx-auto max-w-md py-10 text-center">
      <PackageSearch className="mx-auto h-8 w-8 text-slate-300" aria-hidden="true" />
      <h2 className="mt-3 text-lg font-semibold text-slate-900">{title}</h2>
      <p className="mt-1 text-sm text-slate-600">{description}</p>
      <Button className="mt-6" asChild>
        <Link href="/simular-frete">Simular frete</Link>
      </Button>
    </div>
  );
}

export function ContaView() {
  const router = useRouter();
  const { isLoggedIn, isReady, user } = useAuth();
  const { orders, markCompleted } = useMockOrders();
  const [tab, setTab] = useState<ContaTab>("ativos");

  useEffect(() => {
    if (isReady && !isLoggedIn) router.replace("/login?next=%2Fconta");
  }, [isReady, isLoggedIn, router]);

  if (!isLoggedIn) return null;

  const activeOrders = orders.filter((order) => order.status === "active");
  const historyOrders = orders.filter((order) => order.status === "completed");

  return (
    <div className="mx-auto max-w-2xl">
      <h1 className="text-2xl font-bold text-slate-900">
        {user ? `Olá, ${user.name}` : "Minha conta"}
      </h1>
      <p className="mt-1 text-slate-600">Acompanhe seus pedidos e ajuste seus dados.</p>

      <Tabs
        value={tab}
        onValueChange={(value) => setTab(value as ContaTab)}
        className="mt-8"
      >
        <TabsList className="h-auto w-full gap-2 rounded-2xl border border-slate-200 bg-slate-100 p-2 shadow-inner">
          <TabsTrigger
            value="ativos"
            className={cn(
              "h-11 flex-1 gap-2 rounded-xl border-2 text-sm font-bold",
              tab === "ativos"
                ? "!border-brand-700 !bg-brand-600 !text-white !shadow-lg"
                : "border-transparent !text-slate-500 hover:!text-slate-800",
            )}
          >
            <PackageSearch className="h-4 w-4" aria-hidden="true" />
            Pedidos ativos
          </TabsTrigger>
          <TabsTrigger
            value="historico"
            className={cn(
              "h-11 flex-1 gap-2 rounded-xl border-2 text-sm font-bold",
              tab === "historico"
                ? "!border-brand-700 !bg-brand-600 !text-white !shadow-lg"
                : "border-transparent !text-slate-500 hover:!text-slate-800",
            )}
          >
            <History className="h-4 w-4" aria-hidden="true" />
            Histórico
          </TabsTrigger>
          <TabsTrigger
            value="configuracoes"
            className={cn(
              "h-11 flex-1 gap-2 rounded-xl border-2 text-sm font-bold",
              tab === "configuracoes"
                ? "!border-brand-700 !bg-brand-600 !text-white !shadow-lg"
                : "border-transparent !text-slate-500 hover:!text-slate-800",
            )}
          >
            <Settings className="h-4 w-4" aria-hidden="true" />
            Configurações
          </TabsTrigger>
        </TabsList>

        <TabsContent value="ativos">
          {activeOrders.length === 0 ? (
            <EmptyOrdersState
              title="Você ainda não tem pedidos ativos"
              description="Assim que você simular um frete e confirmar um pedido, ele aparece aqui."
            />
          ) : (
            <div className="space-y-3 pt-4">
              {activeOrders.map((order) => (
                <MockOrderCard
                  key={order.id}
                  order={order}
                  onMarkCompleted={() => markCompleted(order.id)}
                />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="historico">
          {historyOrders.length === 0 ? (
            <EmptyOrdersState
              title="Nenhum pedido no histórico ainda"
              description="Pedidos concluídos ou cancelados vão aparecer aqui."
            />
          ) : (
            <div className="space-y-3 pt-4">
              {historyOrders.map((order) => (
                <MockOrderCard key={order.id} order={order} />
              ))}
            </div>
          )}
        </TabsContent>

        <TabsContent value="configuracoes">
          <div className="pt-4">
            <AccountSettingsForm />
          </div>
        </TabsContent>
      </Tabs>
    </div>
  );
}
