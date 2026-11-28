# Ambiente de testes (staging)

| | Produção | Staging |
|---|---|---|
| Branch | `master` | `staging` |
| Endereço | t1-express-mvp.vercel.app | t1-express-staging.vercel.app |
| Banco Supabase | `nrkulfxzkarndsnvsrdf` | projeto `t1-express-staging` |
| Variáveis na Vercel | Production | Preview + Development |

Os scripts leem as chaves do `.env.local` e nunca imprimem valores. Escrever no banco de produção é bloqueado no código (`assert_staging`). Em produção, o script só faz leitura.

## Montar do zero
```
python scripts/staging/supabase_setup.py all     # cria o projeto, chaves, Auth, esquema, catálogo, logos e comparação
python scripts/staging/vercel_setup.py all       # variáveis de Preview/Development + domínio da branch staging
```
Os passos podem ser rodados um a um: `status`, `create`, `keys`, `auth`, `schema`, `seed`, `logos`, `compare`.

- **Atualizar o catálogo do staging com o de produção:** `python scripts/staging/supabase_setup.py seed`. Só as tabelas de catálogo e configuração são trocadas.
- **Conferir se o esquema dos dois bancos está igual:** `python scripts/staging/supabase_setup.py compare`.

## Fluxo de trabalho
1. Criar uma branch para a mudança.
2. Fazer o merge em `staging` e testar em t1-express-staging.vercel.app.
3. Com o OK, fazer o merge de `staging` em `master`.

Migração nova:
1. Primeiro no staging.
2. Testar.
3. Depois em produção, antes do merge no `master`.

Correção urgente: fazer no `master` e trazer para o `staging` logo em seguida.

O plano grátis do Supabase pausa o projeto depois de 7 dias sem uso. Para voltar, use Restore no painel.
