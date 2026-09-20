.PHONY: setup dev build test lint check public-repo-check e2e storybook storybook-build storybook-test visual docker-dev docker-up
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
	npm run check:typescript
	npm run check:ui
	npm run typecheck
	npm run lint
	npx prettier --write tests/server/deploy-script.test.mjs
	git diff -- tests/server/deploy-script.test.mjs
	npm run format:check
	npm test
	npm run build
	node --test tests/ui-components.test.mjs
	npm run storybook:build
	npm run test:storybook
e2e:
	npm run test:e2e
storybook:
	npm run storybook
storybook-build:
	npm run storybook:build
storybook-test:
	npm run test:storybook
visual:
	npm run test:visual
docker-dev:
	docker compose -f compose.dev.yaml up --build
docker-up:
	docker compose up --build
