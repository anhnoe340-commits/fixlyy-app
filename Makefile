.PHONY: audit monitor uptime check-all test-e2e pre-deploy

audit:
	@bash scripts/security-audit.sh

monitor:
	@bash scripts/check-hetzner.sh
	@bash scripts/check-supabase.sh

uptime:
	@bash scripts/check-uptime.sh

check-all: audit monitor uptime

test-e2e:
	@npx playwright test

# Rapport complet (à lancer avant chaque déploiement)
pre-deploy: audit uptime
	@echo "✅ Pré-déploiement validé — sécurité et uptime OK"
