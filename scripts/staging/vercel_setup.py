"""Configura a Vercel para o ambiente de testes (staging) pela API.

Uso (na raiz do projeto):  python scripts/staging/vercel_setup.py <passo>
Passos: status | env | domain | all
Precisa de VERCEL_TOKEN e das chaves STAGING_* no .env.local (passo 'keys' do supabase_setup.py).

Regras: as variáveis de Production NUNCA mudam de valor. Uma variável que hoje vale para
Production + Preview + Development passa a valer só para Production (mesmo valor), e uma nova,
com o valor do staging, é criada para Preview + Development. Nunca imprime valores.
"""
import os
import sys

sys.path.insert(0, os.path.dirname(__file__))
from _common import STAGING_DOMAIN, VERCEL_PROJECT, VERCEL_TEAM_SLUG, http, need, read_env  # noqa: E402

ENV = read_env()
TOKEN = need(ENV, "VERCEL_TOKEN")
API = "https://api.vercel.com"
STAGING_TARGETS = ["preview", "development"]


def team_id():
    _, res = http("GET", f"{API}/v2/teams", TOKEN)
    team = next((t for t in res.get("teams", []) if t.get("slug") == VERCEL_TEAM_SLUG), None)
    return team["id"] if team else None


TEAM = team_id()
Q = f"?teamId={TEAM}" if TEAM else ""


def q(extra=""):
    if not extra:
        return Q
    return (Q + "&" + extra) if Q else ("?" + extra)


def project():
    _, p = http("GET", f"{API}/v9/projects/{VERCEL_PROJECT}{Q}", TOKEN)
    return p


def list_env(pid):
    _, res = http("GET", f"{API}/v9/projects/{pid}/env{Q}", TOKEN)
    return res.get("envs", [])


def step_status():
    p = project()
    print("Projeto:", p["name"], "| time:", VERCEL_TEAM_SLUG if TEAM else "(pessoal)")
    for e in sorted(list_env(p["id"]), key=lambda e: e["key"]):
        print(f"  {e['key']:<40} {','.join(sorted(e.get('target') or [])):<32} {e.get('type')}"
              + (f" branch={e['gitBranch']}" if e.get("gitBranch") else ""))
    _, d = http("GET", f"{API}/v9/projects/{p['id']}/domains{Q}", TOKEN)
    for x in d.get("domains", []):
        print("  domínio:", x["name"], "| branch:", x.get("gitBranch") or "(produção)", "| verificado:", x.get("verified"))


def step_env():
    p = project()
    pid = p["id"]
    wanted = {
        "NEXT_PUBLIC_SUPABASE_URL": (need(ENV, "STAGING_SUPABASE_URL"), "plain"),
        "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY": (need(ENV, "STAGING_SUPABASE_PUBLISHABLE_KEY"), "plain"),
    }
    if ENV.get("STAGING_SUPABASE_SECRET_KEY"):
        wanted["SUPABASE_SECRET_KEY"] = (ENV["STAGING_SUPABASE_SECRET_KEY"], "encrypted")
    envs = list_env(pid)
    had_prod = {e["key"] for e in envs if "production" in (e.get("target") or [])}
    for key, (value, typ) in wanted.items():
        for e in [e for e in envs if e["key"] == key]:
            targets = set(e.get("target") or [])
            if "production" in targets and targets - {"production"}:
                # Só tira Preview/Development desta variável; o valor de produção não é tocado.
                http("PATCH", f"{API}/v9/projects/{pid}/env/{e['id']}{Q}", TOKEN, {"target": ["production"]})
                print(f"  {key}: produção mantida (só Production agora)")
            elif "production" not in targets:
                # Variável antiga só de Preview/Development: removida para dar lugar à do staging.
                http("DELETE", f"{API}/v9/projects/{pid}/env/{e['id']}{Q}", TOKEN)
                print(f"  {key}: removida a antiga de {sorted(targets)}")
        http("POST", f"{API}/v10/projects/{pid}/env{q('upsert=true')}", TOKEN,
             {"key": key, "value": value, "type": typ, "target": STAGING_TARGETS})
        print(f"  {key}: staging em Preview + Development")
    # Ambiente do app (selo "Ambiente de testes" e robots)
    for e in [e for e in list_env(pid) if e["key"] == "NEXT_PUBLIC_APP_ENV"]:
        http("DELETE", f"{API}/v9/projects/{pid}/env/{e['id']}{Q}", TOKEN)
    http("POST", f"{API}/v10/projects/{pid}/env{Q}", TOKEN,
         {"key": "NEXT_PUBLIC_APP_ENV", "value": "production", "type": "plain", "target": ["production"]})
    http("POST", f"{API}/v10/projects/{pid}/env{Q}", TOKEN,
         {"key": "NEXT_PUBLIC_APP_ENV", "value": "staging", "type": "plain", "target": STAGING_TARGETS})
    print("  NEXT_PUBLIC_APP_ENV: production / staging")
    # Conferência final: nenhuma variável que já existia em produção perdeu o alvo Production.
    after = list_env(pid)
    for key in [k for k in wanted if k in had_prod] + ["NEXT_PUBLIC_APP_ENV"]:
        prod = [e for e in after if e["key"] == key and "production" in (e.get("target") or [])]
        stg = [e for e in after if e["key"] == key and set(STAGING_TARGETS) <= set(e.get("target") or [])]
        print(f"  conferência {key}: produção={len(prod)} staging={len(stg)}")
        if not prod:
            sys.exit(f"ATENÇÃO: {key} ficou sem valor de produção. Pare e confira no painel.")


def step_domain():
    p = project()
    _, d = http("GET", f"{API}/v9/projects/{p['id']}/domains{Q}", TOKEN)
    if any(x["name"] == STAGING_DOMAIN for x in d.get("domains", [])):
        print("  domínio já existe:", STAGING_DOMAIN)
        return
    http("POST", f"{API}/v10/projects/{p['id']}/domains{Q}", TOKEN, {"name": STAGING_DOMAIN, "gitBranch": "staging"})
    print("  domínio criado:", STAGING_DOMAIN, "-> branch staging")


STEPS = {"status": step_status, "env": step_env, "domain": step_domain}

if __name__ == "__main__":
    arg = sys.argv[1] if len(sys.argv) > 1 else "status"
    for s in (["env", "domain", "status"] if arg == "all" else [arg]):
        print(f"== {s}")
        STEPS[s]()
