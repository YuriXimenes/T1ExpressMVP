import { describe, expect, it } from "vitest";
import { matchStore } from "./match-store";
import {
  checkStoreTotal,
  cleanCardName,
  parseMoneyValue,
  parseOrderText,
} from "./parse-order";

// Texto lido por OCR de um print real da Liga (recortado, sem dados pessoais).
const OCR_LIGA = `Vendido e entregue por
Cards Of Paradise J Valor Status Forma de Envio Rastreio Correios Visualizar It A
12523369) R$ 9,23 01.0 - Aguardando Pagamento — Retirada no Balcão (Cards of ~~ - isualizar ftens
Paradise)
Card Quantidade R$ Unit. RS Total
EX Spider-Man, Web-Slinger
| 1 unid. RS 2,25
= O mn Gm R$ 2,25
e] Sagu Wildling // Roost Seek
— 1 unid. RS 6,98
| Afi & EN SN RS 6,98
2 itens Total: R$ 9,23
Frete: R$ 0,00
Valor Total: R$ 9,23`;

// Texto copiado da página (Ctrl+A / Ctrl+C), formato com várias lojas.
const PASTED_TWO_STORES = `Pedido #MP1375190
Vendido e entregue por
Cards Of Paradise
#12523369
Valor
R$ 9,23
Status
Aguardando Pagamento
Card	Quantidade	R$ Unit.	R$ Total
Spider-Man, Web-Slinger
EN NM
1 unid.	R$ 2,50 R$ 2,25	R$ 2,25
Sagu Wildling // Roost Seek
1 unid.	R$ 7,75 R$ 6,98	R$ 6,98
2 itens	Total: R$ 9,23
Vendido e entregue por
Magic Store Brasil
#99887766
Card	Quantidade	R$ Unit.	R$ Total
Lightning Bolt
Foil
3 unid.	R$ 4,00	R$ 12,00
1 item	Total: R$ 12,00
Valor Total: R$ 21,23
Total a pagar: R$ 22,50`;

describe("parseMoneyValue", () => {
  it("lê formatos brasileiros e corrige vírgula perdida", () => {
    expect(parseMoneyValue("2,25")).toEqual({ value: 2.25, exact: true });
    expect(parseMoneyValue("6.98")).toEqual({ value: 6.98, exact: true });
    expect(parseMoneyValue("1.234,50")).toEqual({ value: 1234.5, exact: true });
    expect(parseMoneyValue("225")).toEqual({ value: 2.25, exact: false });
  });
});

describe("cleanCardName", () => {
  it("remove lixo do OCR antes do nome", () => {
    expect(cleanCardName("EX Spider-Man, Web-Slinger")).toBe("Spider-Man, Web-Slinger");
    expect(cleanCardName("e] Sagu Wildling // Roost Seek")).toBe(
      "Sagu Wildling // Roost Seek",
    );
    expect(cleanCardName("Al Spider-Man, Web-Slinger")).toBe("Spider-Man, Web-Slinger");
    expect(cleanCardName("Ob Nixilis, Unshackled")).toBe("Ob Nixilis, Unshackled");
    expect(cleanCardName("edital Spider-Man, Web-Slinger")).toBe(
      "Spider-Man, Web-Slinger",
    );
    expect(cleanCardName("| 5k | Sagu Wildling // Roost Seek")).toBe(
      "Sagu Wildling // Roost Seek",
    );
    expect(cleanCardName("Sword of Fire and Ice")).toBe("Sword of Fire and Ice");
    expect(cleanCardName("ZE] sagu Wildling // Roost Seek")).toBe(
      "Sagu Wildling // Roost Seek",
    );
    expect(cleanCardName("vão Spider-Man, Web-Slinger")).toBe("Spider-Man, Web-Slinger");
  });
});

describe("parseOrderText — OCR do print", () => {
  const { stores } = parseOrderText(OCR_LIGA);
  it("acha a loja, o nº do pedido e as cartas", () => {
    expect(stores).toHaveLength(1);
    expect(stores[0].name).toBe("Cards Of Paradise");
    expect(stores[0].orderNumber).toBe("12523369");
    expect(
      stores[0].items.map((i) => [i.name, i.quantity, i.unitPrice, i.total]),
    ).toEqual([
      ["Spider-Man, Web-Slinger", 1, 2.25, 2.25],
      ["Sagu Wildling // Roost Seek", 1, 6.98, 6.98],
    ]);
  });
  it("confere o total da loja", () => {
    expect(stores[0].storeTotal).toBe(9.23);
    expect(checkStoreTotal(stores[0])).toEqual({ sum: 9.23, matches: true });
  });
});

describe("parseOrderText — texto colado", () => {
  const { stores } = parseOrderText(PASTED_TWO_STORES);
  it("separa as duas lojas", () => {
    expect(stores.map((s) => [s.name, s.orderNumber])).toEqual([
      ["Cards Of Paradise", "12523369"],
      ["Magic Store Brasil", "99887766"],
    ]);
  });
  it("usa o preço com desconto e ignora o riscado", () => {
    expect(
      stores[0].items.map((i) => [i.name, i.unitPrice, i.total, i.doubtful]),
    ).toEqual([
      ["Spider-Man, Web-Slinger", 2.25, 2.25, false],
      ["Sagu Wildling // Roost Seek", 6.98, 6.98, false],
    ]);
    expect(checkStoreTotal(stores[0]).matches).toBe(true);
  });
  it("marca foil e quantidade", () => {
    const [bolt] = stores[1].items;
    expect(bolt).toMatchObject({
      name: "Lightning Bolt (Foil)",
      quantity: 3,
      unitPrice: 4,
      total: 12,
      foil: true,
    });
    expect(checkStoreTotal(stores[1])).toEqual({ sum: 12, matches: true });
  });
});

describe("parseOrderText — leitura ruim", () => {
  it("corrige total sem vírgula e marca como duvidoso", () => {
    const { stores } = parseOrderText(
      "Card Quantidade\nBlack Lotus\n2 unid. R$ 3,00 R$ 600\nTotal: R$ 6,00",
    );
    expect(stores[0].items[0]).toMatchObject({
      name: "Black Lotus",
      quantity: 2,
      unitPrice: 3,
      total: 6,
      doubtful: true,
    });
  });
  it("devolve vazio quando não há itens", () => {
    expect(parseOrderText("qualquer coisa sem pedido").stores).toEqual([]);
  });
});

describe("matchStore", () => {
  const lojas = [
    { id: "a", name: "Cards of Paradise" },
    { id: "b", name: "Magic Store Brasil" },
  ];
  it("casa ignorando maiúsculas e acentos", () => {
    expect(matchStore("Cards Of Paradise", lojas)?.id).toBe("a");
    expect(matchStore("MAGIC STORE", lojas)?.id).toBe("b");
    expect(matchStore("Loja Desconhecida", lojas)).toBeNull();
  });
});

// Texto real colado da página do pedido da Liga (formato de 2026-11).
const PASTED_LIGA_REAL = `Cards Of ParadiseLoja Verificada - Possui loja física aberta ao público #12523369
Valor R$ 9,23
Status 01.0 - Aguardando Pagamento
Forma de Envio Retirada no Balcão (Cards of Paradise)
Rastreio Correios -
Visualizar Itens
 Card
Quantidade
R$ Unit.
R$ Total

Spider-Man, Web-Slinger

Marvel's Spider-Man Inglês  EN       NM
1 unid.
R$ 2,50
R$ 2,25
R$ 2,25

Sagu Wildling // Roost Seek

    Foil  Tarkir: Dragonstorm  Inglês  EN       NM
1 unid.
R$ 7,75
R$ 6,98
R$ 6,98
2 itens
Total:

Frete:

Valor Total:

R$ 9,23

R$ 0,00

R$ 9,23`;

describe("parseOrderText — texto real colado da Liga", () => {
  const { stores } = parseOrderText(PASTED_LIGA_REAL);
  it("lê loja, nº do pedido, nomes das cartas (não a coleção) e valores", () => {
    expect(stores).toHaveLength(1);
    expect(stores[0].name).toBe("Cards Of Paradise");
    expect(stores[0].orderNumber).toBe("12523369");
    expect(
      stores[0].items.map((i) => [
        i.name,
        i.quantity,
        i.unitPrice,
        i.total,
        i.foil,
        i.doubtful,
      ]),
    ).toEqual([
      ["Spider-Man, Web-Slinger", 1, 2.25, 2.25, false, false],
      ["Sagu Wildling // Roost Seek (Foil)", 1, 6.98, 6.98, true, false],
    ]);
  });
  it("acha o total da loja mesmo com os valores abaixo dos rótulos", () => {
    expect(stores[0].storeTotal).toBe(9.23);
    expect(checkStoreTotal(stores[0])).toEqual({ sum: 9.23, matches: true });
  });
});

// OCR de um segundo print real (nº do pedido em amarelo sobre a barra laranja).
const OCR_LIGA_2 = `Cards Of Paradise @ Valor Status Forma de Envio Rastreio Correios I A
#12523369 R$9,23 01.0 - Aguardando Pagamento — Retirada no Balcão (Cards of - Visualizar ltens
Paradise)
Card Quantidade R$ Unit. R$ Total
Fa]
|| Spider-Man, Web-Slinger
1 unid. R$ 2,25
® Een gnv R§225
| 5k | Sagu Wildling // Roost Seek
E 1 unid. R$ 6,98
| Ari & EN SN R$ 6,98
2itens Total: R$ 9,23
Frete: R$ 0,00
Valor Total: R$ 9,23`;

describe("parseOrderText — OCR do print 2", () => {
  it("lê o nº do pedido e limpa o lixo antes do nome", () => {
    const [store] = parseOrderText(OCR_LIGA_2).stores;
    expect([store.name, store.orderNumber, store.storeTotal]).toEqual([
      "Cards Of Paradise",
      "12523369",
      9.23,
    ]);
    expect(store.items.map((i) => [i.name, i.quantity, i.unitPrice])).toEqual([
      ["Spider-Man, Web-Slinger", 1, 2.25],
      ["Sagu Wildling // Roost Seek", 1, 6.98],
    ]);
  });
});

// OCR de um print feito no celular (layout em coluna: nome, linha de ícones, quantidade e valor).
const OCR_LIGA_CELULAR = `11:07 ¢ oll TED
&— ligamagic.com.br Meee
21021-030
Vendido e entregue por
Cards Of Paradise ®: #12523369
Valor: R$ 9,23
Status: 11.0 - Entregue
Forma de Envio: Retirada no Balcão (Cards of Paradise)
Rastreio Correios: -
Visualizar Itens A
Spider-Man, Web-Slinger
Emi ©
= | € EEN gov
1 unid. R$ 2,25
| Sagu Wildling // Roost Seek
=] Aro O EN gw
1 unid. R$ 6,98
Sumário
Total: R$ 9,23
Frete: R$ 0,00
Valor Total: R$ 9,23
12390893
(16 dias atrás - 04/11/2026 14:11)
Exibir Detalhes
+ ©
Peça ao Gemini Nova guia Todas as guias`;

describe("parseOrderText — print do celular", () => {
  it("pega o nome da carta, não a linha de ícones abaixo dele", () => {
    const { stores } = parseOrderText(OCR_LIGA_CELULAR);
    expect(stores).toHaveLength(1);
    expect([stores[0].name, stores[0].orderNumber, stores[0].storeTotal]).toEqual([
      "Cards Of Paradise",
      "12523369",
      9.23,
    ]);
    expect(stores[0].items.map((i) => [i.name, i.quantity, i.unitPrice])).toEqual([
      ["Spider-Man, Web-Slinger", 1, 2.25],
      ["Sagu Wildling // Roost Seek", 1, 6.98],
    ]);
  });
});

// OCR de print da página de pedido da loja (tema escuro, "2x Nome / Nome em inglês").
const OCR_PEDIDO_LOJA_ESCURO = `10 ITENS - PEDIDO #12504012
Q, 2x Fluxo de Pensamento / Stream of Thought (código:
MH171)
R$425 R$ 2,26 (subtotal)
R$ 1,13 (unid.)
<>» Modern Horizons PT mm
Cod: 20.888.479-1
® 1x Geothermal Bog / Charco Geotérmico (código:
DMU247)
R475 R$ 4,28 (subtotal)
R$ 4,28 (unid.)
& Dominaria Unida EE EN a
Cod: 24.305.939-1
Q 2x Golem Pedragalho / Boulderbranch Golem (código:
BRO197)
R$9;75 R$17,56 (subtotal)
R$ 8,78 (unid.)
Ss A Guerra dos Irmãos PT mm
Cod: 33.526.434-]
Q 5x Forest (#286) / Floresta (#286) (Código: TDM286)
R$31,25 R$ 5,65 (subtotal)
R$ 1,13 (unid.)
(&) Tarkir: Dragonstorm EE EN mm
Cod: 24.356.900-]
Valor dos Itens: R$ 29,75
Frete: R$ 0,00
Crédito utilizado: R$ 29,75
Valor Total: R$ 0,00`;

describe("parseOrderText — print da página de pedido da loja (2x Nome)", () => {
  const { stores } = parseOrderText(OCR_PEDIDO_LOJA_ESCURO);
  it("lê nº do pedido, nome (primeiro nome), quantidade, unitário e subtotal", () => {
    expect(stores).toHaveLength(1);
    expect(stores[0].orderNumber).toBe("12504012");
    expect(
      stores[0].items.map((i) => [i.name, i.quantity, i.unitPrice, i.total, i.doubtful]),
    ).toEqual([
      ["Fluxo de Pensamento", 2, 1.13, 2.26, false],
      ["Geothermal Bog", 1, 4.28, 4.28, false],
      ["Golem Pedragalho", 2, 8.78, 17.56, false],
      ["Forest (#286)", 5, 1.13, 5.65, false],
    ]);
  });
  it("total das cartas = Valor dos Itens (ignora o crédito usado)", () => {
    expect(stores[0].storeTotal).toBe(29.75);
    expect(checkStoreTotal(stores[0])).toEqual({ sum: 29.75, matches: true });
  });
});
