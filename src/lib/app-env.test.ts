import { describe, expect, it } from "vitest";
import { supabaseProjectRef } from "./app-env";

describe("supabaseProjectRef", () => {
  it("tira o id do projeto da URL do Supabase", () => {
    expect(supabaseProjectRef("https://abcd1234.supabase.co")).toBe("abcd1234");
    expect(supabaseProjectRef(" https://abcd1234.supabase.co/ ")).toBe("abcd1234");
  });
  it("devolve null sem URL ou com URL estranha", () => {
    expect(supabaseProjectRef(undefined)).toBeNull();
    expect(supabaseProjectRef("")).toBeNull();
    expect(supabaseProjectRef("http://localhost:54321")).toBeNull();
  });
});
