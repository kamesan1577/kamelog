.PHONY: setup dev build test lint check public-repo-check e2e docker-dev docker-up
setup:
	npm ci
dev:
	npm run dev
build:
	npm run build
test:
	npm test
lint:
	npm run typecheck
	npm run lint
public-repo-check:
	npm run check:public
check: public-repo-check
	npm run check:ui
	npm run typecheck
	npm run lint
	npm run format:check
	npm test
	npm run build
	node --test tests/ui-components.test.mjs
e2e:
	npm run test:e2e
docker-dev:
	docker compose -f compose.dev.yaml up --build
docker-up:
	docker compose up --build
