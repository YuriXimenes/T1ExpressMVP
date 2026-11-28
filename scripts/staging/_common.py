"""Base dos scripts do ambiente de testes (staging).

Regras de segurança:
- Chaves e senhas são lidas do .env.local e NUNCA impressas.
- Qualquer escrita no Supabase passa por `assert_staging(ref)`: o projeto de produção é recusado.
- Em produção só se usa o endpoint de consulta somente leitura.
"""
import io
import json
import os
import re
import sys
import time
import urllib.error
import urllib.request

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", ".."))
ENV_FILE = os.path.join(ROOT, ".env.local")
PROD_REF = "nrkulfxzkarndsnvsrdf"
STAGING_NAME = "t1-express-staging"
STAGING_DOMAIN = "t1-express-staging.vercel.app"
VERCEL_PROJECT = "t1-express-mvp"
VERCEL_TEAM_SLUG = "yuriximenes-projects"

sys.stdout.reconfigure(encoding="utf-8")


def read_env() -> dict:
    env = {}
    if not os.path.exists(ENV_FILE):
        return env
    for line in io.open(ENV_FILE, encoding="utf-8"):
        m = re.match(r"^([A-Z0-9_]+)=(.*)$", line.rstrip("\r\n"))
        if m:
            env[m.group(1)] = m.group(2).strip().strip('"')
    return env


def set_env(values: dict) -> None:
    """Grava/atualiza chaves no .env.local sem imprimir valores."""
    lines = io.open(ENV_FILE, encoding="utf-8").read().splitlines() if os.path.exists(ENV_FILE) else []
    done = set()
    for i, line in enumerate(lines):
        m = re.match(r"^([A-Z0-9_]+)=", line)
        if m and m.group(1) in values:
            lines[i] = f"{m.group(1)}={values[m.group(1)]}"
            done.add(m.group(1))
    for k, v in values.items():
        if k not in done:
            lines.append(f"{k}={v}")
    io.open(ENV_FILE, "w", encoding="utf-8", newline="\n").write("\n".join(lines) + "\n")
    print("  .env.local atualizado:", ", ".join(values.keys()))


def need(env: dict, key: str) -> str:
    v = env.get(key, "")
    if not v:
        sys.exit(f"Falta {key} no .env.local.")
    return v


def http(method: str, url: str, token: str, body=None, ok=(200, 201, 202, 204)):
    data = None if body is None else json.dumps(body).encode("utf-8")
    req = urllib.request.Request(url, data=data, method=method)
    req.add_header("Authorization", f"Bearer {token}")
    req.add_header("Content-Type", "application/json")
    req.add_header("User-Agent", "t1-staging-setup")
    try:
        with urllib.request.urlopen(req, timeout=180) as r:
            raw = r.read().decode("utf-8")
            return r.status, (json.loads(raw) if raw else None)
    except urllib.error.HTTPError as e:
        raw = e.read().decode("utf-8", "replace")
        if e.code in ok:
            return e.code, (json.loads(raw) if raw else None)
        raise RuntimeError(f"{method} {url.split('?')[0]} -> HTTP {e.code}: {raw[:600]}") from None


def assert_staging(ref: str) -> None:
    if not ref or ref == PROD_REF:
        sys.exit("TRAVA: tentativa de escrever no projeto de produção. Abortado.")


# ---------------- Supabase (API de gerenciamento) ----------------
SB_API = "https://api.supabase.com/v1"


def sb(method, path, token, body=None):
    return http(method, SB_API + path, token, body)


def sb_query(token: str, ref: str, sql: str, read_only: bool = False):
    """Roda SQL. Escrita só no staging; produção só pelo endpoint somente leitura."""
    if read_only:
        _, res = sb("POST", f"/projects/{ref}/database/query/read-only", token, {"query": sql})
        return res
    assert_staging(ref)
    _, res = sb("POST", f"/projects/{ref}/database/query", token, {"query": sql})
    return res


def find_staging(token: str):
    _, projects = sb("GET", "/projects", token)
    prod = next((p for p in projects if p.get("id") == PROD_REF or p.get("ref") == PROD_REF), None)
    stg = next((p for p in projects if p.get("name") == STAGING_NAME), None)
    return prod, stg, projects


def wait_healthy(token: str, ref: str, timeout_s: int = 600):
    t0 = time.time()
    while time.time() - t0 < timeout_s:
        _, p = sb("GET", f"/projects/{ref}", token)
        st = p.get("status")
        print("  status:", st)
        if st == "ACTIVE_HEALTHY":
            return
        time.sleep(15)
    sys.exit("O projeto não ficou pronto a tempo; rode de novo em alguns minutos.")
