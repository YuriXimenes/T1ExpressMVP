"""Monta o banco de staging pela API de gerenciamento do Supabase.

Uso (na raiz do projeto):  python scripts/staging/supabase_setup.py <passo>
Passos, na ordem: status | create | keys | auth | schema | seed | logos | compare | all
Precisa de SUPABASE_ACCESS_TOKEN no .env.local. Nunca imprime chaves nem senhas.
"""
import glob
import json
import os
import re
import secrets
import string
import sys
import urllib.request

sys.path.insert(0, os.path.dirname(__file__))
from _common import (PROD_REF, ROOT, STAGING_DOMAIN, assert_staging, find_staging,  # noqa: E402
                     need, read_env, sb, sb_query, set_env, wait_healthy)

ENV = read_env()
TOKEN = need(ENV, "SUPABASE_ACCESS_TOKEN")

# Tabelas de configuração/catálogo copiadas de produção (sem dado pessoal), na ordem das dependências.
SEED_TABLES = [
    "brazil_states", "stores", "freight_routes", "carrier_flat_rates",
    "comparison_carriers", "comparison_rows", "comparison_values",
    "pricing_versions", "coupons", "ops_settings", "occurrence_types",
    "expense_categories", "fuel_prices", "store_closures",
    "staff_roles", "staff_role_permissions", "admin_function_perms",
]
# Filtros para não trazer nada ligado a pessoas.
SEED_WHERE = {"coupons": "owner_user_id is null"}


def staging_ref() -> str:
    _, stg, _ = find_staging(TOKEN)
    if not stg:
        sys.exit("Projeto de staging ainda não existe. Rode o passo 'create'.")
    ref = stg.get("ref") or stg.get("id")
    assert_staging(ref)
    return ref


def step_status():
    prod, stg, projects = find_staging(TOKEN)
    print("Projetos na conta:", len(projects))
    print("Produção:", prod and {k: prod.get(k) for k in ("name", "region", "status", "organization_id")})
    print("Staging :", stg and {k: stg.get(k) for k in ("name", "ref", "region", "status")})


def step_create():
    prod, stg, _ = find_staging(TOKEN)
    if not prod:
        sys.exit("Não achei o projeto de produção com esta chave (confira a organização da chave).")
    if stg:
        ref = stg.get("ref") or stg.get("id")
        print("Staging já existe:", ref)
        wait_healthy(TOKEN, ref)
        return
    alphabet = string.ascii_letters + string.digits
    password = "".join(secrets.choice(alphabet) for _ in range(32))
    set_env({"STAGING_DB_PASSWORD": password})  # grava antes de criar: não se perde
    body = {"name": "t1-express-staging", "organization_id": prod["organization_id"],
            "region": prod["region"], "db_pass": password}
    _, p = sb("POST", "/projects", TOKEN, body)
    ref = p.get("ref") or p.get("id")
    assert_staging(ref)
    print("Criado:", ref, "região", prod["region"])
    wait_healthy(TOKEN, ref)


def step_keys():
    ref = staging_ref()
    _, keys = sb("GET", f"/projects/{ref}/api-keys?reveal=true", TOKEN)
    pub = next((k["api_key"] for k in keys if k.get("type") == "publishable"), None)
    sec = next((k["api_key"] for k in keys if k.get("type") == "secret" and k.get("api_key")), None)
    if not pub:
        sys.exit("Sem chave publicável no staging (veja Settings > API Keys).")
    vals = {"STAGING_SUPABASE_URL": f"https://{ref}.supabase.co", "STAGING_SUPABASE_PUBLISHABLE_KEY": pub}
    if sec:
        vals["STAGING_SUPABASE_SECRET_KEY"] = sec
    set_env(vals)


def step_auth():
    ref = staging_ref()
    allow = ",".join([f"https://{STAGING_DOMAIN}/**", "http://localhost:3000/**",
                      "https://*-yuriximenes-projects.vercel.app/**"])
    sb("PATCH", f"/projects/{ref}/config/auth", TOKEN,
       {"site_url": f"https://{STAGING_DOMAIN}", "uri_allow_list": allow, "mailer_autoconfirm": True})
    _, cfg = sb("GET", f"/projects/{ref}/config/auth", TOKEN)
    print("  site_url:", cfg.get("site_url"), "| autoconfirm:", cfg.get("mailer_autoconfirm"))
    print("  redirects:", cfg.get("uri_allow_list"))


def migration_files():
    files = [os.path.basename(f) for f in glob.glob(os.path.join(ROOT, "supabase", "migrations", "*.sql"))]

    def key(name):
        m = re.match(r"(\d+)([a-z]?)_", name)
        num, suf = int(m.group(1)), m.group(2)
        # 0019a precisa vir ANTES da 0019 (valores de enum); as outras "a" vêm depois da sua.
        return (num, -1 if (num == 19 and suf == "a") else (1 if suf else 0))
    return sorted(files, key=key)


def step_schema():
    ref = staging_ref()
    done = sb_query(TOKEN, ref, "select to_regclass('public.stores') is not null as ok")
    if done and done[0].get("ok"):
        print("Esquema já aplicado no staging. Versão:", sb_query(TOKEN, ref, "select public._schema_version() as v"))
        return
    for name in migration_files():
        sql = open(os.path.join(ROOT, "supabase", "migrations", name), encoding="utf-8").read()
        print("  aplicando", name, "...", end=" ", flush=True)
        sb_query(TOKEN, ref, sql)
        print("ok")
    print("Versão do banco:", sb_query(TOKEN, ref, "select public._schema_version() as v"))


def insertable_columns(ref, table):
    return sb_query(TOKEN, ref, f"""
      select column_name, identity_generation
        from information_schema.columns
       where table_schema='public' and table_name='{table}' and is_generated='NEVER'
       order by ordinal_position""")


def user_fk_columns(ref, table):
    rows = sb_query(TOKEN, ref, f"""
      select a.attname as col
        from pg_constraint c
        join pg_attribute a on a.attrelid=c.conrelid and a.attnum=any(c.conkey)
       where c.contype='f' and c.conrelid='public.{table}'::regclass
         and c.confrelid in ('auth.users'::regclass,'public.profiles'::regclass)""")
    return {r["col"] for r in rows}


def step_seed():
    ref = staging_ref()
    data = {}
    for t in SEED_TABLES:
        where = SEED_WHERE.get(t, "true")
        res = sb_query(TOKEN, PROD_REF,
                       f"select coalesce(json_agg(x), '[]'::json) as j from public.{t} x where {where}",
                       read_only=True)
        data[t] = res[0]["j"]
        print(f"  produção {t}: {len(data[t])} linhas")
    # apaga na ordem inversa e recarrega na ordem certa, numa transação só
    parts = ["begin;", "set local session_replication_role = replica;"]
    for t in reversed(SEED_TABLES):
        parts.append(f"delete from public.{t};")
    for t in SEED_TABLES:
        if not data[t]:
            continue
        cols = insertable_columns(ref, t)
        names = [c["column_name"] for c in cols]
        nullify = user_fk_columns(ref, t)
        sel = ", ".join(("null" if n in nullify else f'"{n}"') for n in names)
        col_list = ", ".join(f'"{n}"' for n in names)
        override = " overriding system value" if any(c["identity_generation"] == "ALWAYS" for c in cols) else ""
        payload = json.dumps(data[t], ensure_ascii=False)
        assert "$seed$" not in payload
        parts.append(f"insert into public.{t} ({col_list}){override} select {sel} "
                     f"from json_populate_recordset(null::public.{t}, $seed${payload}$seed$::json);")
    parts.append("commit;")
    sb_query(TOKEN, ref, "\n".join(parts))
    for t in SEED_TABLES:
        n = sb_query(TOKEN, ref, f"select count(*)::int as n from public.{t}")[0]["n"]
        print(f"  staging {t}: {n} linhas")


def step_logos():
    """Copia os logos do bucket store-logos e aponta as lojas do staging para eles."""
    ref = staging_ref()
    sec = read_env().get("STAGING_SUPABASE_SECRET_KEY")
    if not sec:
        sys.exit("Falta STAGING_SUPABASE_SECRET_KEY (rode o passo 'keys').")
    prod_base = f"https://{PROD_REF}.supabase.co/storage/v1/object/public/store-logos/"
    stg_url = f"https://{ref}.supabase.co"
    rows = sb_query(TOKEN, ref, "select code, logo_path as logo from public.stores where logo_path like '%/store-logos/%'")
    copied = 0
    for r in rows:
        if not r["logo"].startswith(prod_base):
            continue
        path = r["logo"][len(prod_base):].split("?")[0]
        with urllib.request.urlopen(r["logo"], timeout=60) as resp:
            blob, ctype = resp.read(), resp.headers.get("Content-Type", "image/png")
        req = urllib.request.Request(f"{stg_url}/storage/v1/object/store-logos/{path}", data=blob, method="POST")
        req.add_header("Authorization", f"Bearer {sec}")
        req.add_header("apikey", sec)
        req.add_header("Content-Type", ctype)
        req.add_header("x-upsert", "true")
        urllib.request.urlopen(req, timeout=60).read()
        new = f"{stg_url}/storage/v1/object/public/store-logos/{path}"
        code = r["code"].replace("'", "''")
        sb_query(TOKEN, ref, f"update public.stores set logo_path = '{new}' where code = '{code}'")
        copied += 1
    print(f"  logos copiados: {copied} (os demais são arquivos do próprio site, /logos/...)")


SCHEMA_SQL = r"""
select json_build_object(
 'tables',   (select json_agg(t order by t) from (select table_name::text t from information_schema.tables where table_schema='public') s),
 'columns',  (select json_agg(c order by c) from (select table_name||'.'||column_name||':'||data_type||':'||is_nullable c from information_schema.columns where table_schema='public') s),
 'functions',(select json_agg(f order by f) from (select p.proname||'('||pg_get_function_identity_arguments(p.oid)||')' f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') s),
 'policies', (select json_agg(p order by p) from (select tablename||':'||policyname p from pg_policies where schemaname in ('public','storage')) s),
 'triggers', (select json_agg(g order by g) from (select c.relname||':'||tg.tgname||':'||md5(pg_get_triggerdef(tg.oid)) g from pg_trigger tg join pg_class c on c.oid=tg.tgrelid join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not tg.tgisinternal) s),
 'enums',    (select json_agg(e order by e) from (select t.typname||':'||e.enumlabel e from pg_enum e join pg_type t on t.oid=e.enumtypid) s),
 'buckets',  (select json_agg(b order by b) from (select id::text b from storage.buckets) s),
 'bodies',   (select json_agg(f order by f) from (select p.proname||'('||pg_get_function_identity_arguments(p.oid)||'):'||md5(regexp_replace(replace(p.prosrc, chr(13), ''), '[[:space:]]+', ' ', 'g')) f from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public') s),
 'version',  (select substring(pg_get_functiondef('public._schema_version()'::regprocedure) from '''(\d{4}[a-z]?)'''))
) as s
"""


def step_compare():
    ref = staging_ref()
    prod = sb_query(TOKEN, PROD_REF, SCHEMA_SQL, read_only=True)[0]["s"]
    stg = sb_query(TOKEN, ref, SCHEMA_SQL)[0]["s"]
    diffs = 0
    for k in prod:
        if k == "version":
            print(f"  versão: produção {prod[k]} · staging {stg[k]}")
            diffs += prod[k] != stg[k]
            continue
        a, b = set(prod[k] or []), set(stg[k] or [])
        only_p, only_s = sorted(a - b), sorted(b - a)
        print(f"  {k}: produção {len(a)} · staging {len(b)}" + ("  <-- DIFERENÇA" if (only_p or only_s) else ""))
        for x in only_p[:40]:
            print("     só em produção:", x)
        for x in only_s[:40]:
            print("     só no staging :", x)
        diffs += len(only_p) + len(only_s)
    print("RESULTADO:", "esquemas IGUAIS" if not diffs else f"{diffs} diferença(s)")


STEPS = {"status": step_status, "create": step_create, "keys": step_keys, "auth": step_auth,
         "schema": step_schema, "seed": step_seed, "logos": step_logos, "compare": step_compare}

if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else "status"
    order = ["create", "keys", "auth", "schema", "seed", "logos", "compare"] if arg == "all" else [arg]
    for s in order:
        print(f"== {s}")
        STEPS[s]()
