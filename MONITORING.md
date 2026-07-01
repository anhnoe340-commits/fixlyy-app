# Monitoring Fixlyy

Système de surveillance sécurité et disponibilité permanent pour Fixlyy.

## Scripts disponibles

| Commande | Description |
|----------|-------------|
| `make audit` | Audit sécurité 7 checks (secrets, CORS, npm audit, RLS, e.message...) |
| `make monitor` | État Hetzner (agent Python) + Supabase pool numéros |
| `make uptime` | Vérification uptime fixlyy.fr + app.fixlyy.fr + Supabase API |
| `make check-all` | Audit complet (audit + monitor + uptime) |
| `make pre-deploy` | À lancer avant chaque déploiement (audit + uptime) |
| `make test-e2e` | Tests Playwright E2E |

### Scripts bruts

| Script | Prérequis |
|--------|-----------|
| `scripts/security-audit.sh` | Aucun (node_modules pour npm audit complet) |
| `scripts/check-hetzner.sh` | Clé SSH `~/.ssh/fixlyy_livekit` |
| `scripts/check-supabase.sh` | `SUPABASE_SERVICE_ROLE_KEY` (env ou `.env.local`) |
| `scripts/check-uptime.sh` | Aucun (accès réseau) |

## Détail des 7 checks sécurité

1. **npm audit fixlyy-app** — échoue s'il y a des vulns HIGH/CRITICAL
2. **npm audit fixlyy-website** — idem sur la landing page
3. **Secrets hardcodés** — `sk_live`, `rk_live_`, `AKIA`, `password = "..."`
4. **CORS wildcard** — `Access-Control-Allow-Origin: *` littéral interdit (les allowlists conditionnelles sont OK)
5. **.env dans .gitignore** — évite de committer des secrets
6. **RLS migrations** — au moins 20 migrations avec `ENABLE ROW LEVEL SECURITY`
7. **e.message non exposé** — pas de message d'erreur brut renvoyé dans une Response HTTP (fuite d'infos internes)

## GitHub Actions automatiques

- `.github/workflows/security-audit.yml` : à chaque push/PR sur `main`
- `.github/workflows/e2e-tests.yml` : à chaque push sur `main` + lundi 6h UTC (rapport hebdo)

> Note : le workflow e2e suppose une config Playwright (`playwright.config.ts`) et un dossier de tests. À créer si absent, sinon le job échoue faute de tests.

## Variables d'environnement

Aucun secret n'est hardcodé dans les scripts. Configurer via l'env ou `.env.local` :

```bash
SUPABASE_SERVICE_ROLE_KEY=...   # check-supabase.sh
TWILIO_ACCOUNT_SID=...          # solde Twilio (optionnel)
TWILIO_AUTH_TOKEN=...
FIXLYY_SSH_KEY=~/.ssh/fixlyy_livekit   # override clé Hetzner (optionnel)
FIXLYY_HETZNER_HOST=root@138.199.232.227
```

## Alertes manuelles à configurer

Ces alertes nécessitent une configuration externe :

- **Pool numéros < 3** : alerte Supabase (edge function `alert-low-pool` déjà présente) + webhook
- **Solde Twilio < 10$** : alerte dans la console Twilio
- **Uptime** : Better Uptime ou UptimeRobot sur fixlyy.fr / app.fixlyy.fr

## Fréquence recommandée

- Avant chaque déploiement : `make pre-deploy`
- Chaque semaine : `make check-all`
- Après incident : `bash scripts/check-hetzner.sh`
