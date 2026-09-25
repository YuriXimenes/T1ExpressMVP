import { createClient } from "@supabase/supabase-js";
import { revalidatePath, revalidateTag } from "next/cache";
import { CATALOG_CACHE_TAG } from "@/lib/catalog/from-supabase";

/**
 * Força o site público a reler o catálogo do Supabase na hora, em vez de
 * esperar o cache de 5 minutos. O app não tem cookie de sessão (ela vive no
 * navegador), então o painel manda o access token no header Authorization e
 * aqui conferimos se o dono do token está em `admins` — via RLS, com o próprio
 * token, sem nenhuma chave secreta.
 */
export async function POST(request: Request) {
  const token = request.headers.get("authorization")?.match(/^Bearer (.+)$/i)?.[1];
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) {
    return Response.json({ error: "Servidor sem configuração." }, { status: 500 });
  }
  if (!token) {
    return Response.json({ error: "Não autenticado." }, { status: 401 });
  }

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });

  const { data: userData, error: userError } = await supabase.auth.getUser(token);
  if (userError || !userData.user) {
    return Response.json({ error: "Sessão inválida." }, { status: 401 });
  }

  const { data: admin, error: adminError } = await supabase
    .from("admins")
    .select("user_id")
    .eq("user_id", userData.user.id)
    .maybeSingle();
  if (adminError) {
    return Response.json({ error: "Não foi possível verificar o acesso." }, { status: 500 });
  }
  if (!admin) {
    return Response.json({ error: "Acesso restrito a administradores." }, { status: 403 });
  }

  revalidateTag(CATALOG_CACHE_TAG, { expire: 0 });
  revalidatePath("/", "layout");
  return Response.json({ ok: true });
}
