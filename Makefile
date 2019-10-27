.PHONY: build-src
build-src:
	@make eslint-src
	@$$(npm bin)/webpack --config-name=src

.PHONY: build-watch-src
build-watch-src:
	@$$(npm bin)/webpack --config-name=src --watch

.PHONY: eslint-src
eslint-src:
	@$$(npm bin)/eslint src/*

.PHONY: tslint
tslint:
	@$$(npm bin)/tsc --noEmit

.PHONY: lint-src
lint-src:
	@make eslint-src
	@make tslint

.PHONY: lint-tests
lint-tests:
	@$$(npm bin)/eslint tests/*.test.ts
	@make tslint

.PHONY: build-tests
build-tests:
	@$$(npm bin)/webpack --config-name=tests

.PHONY: test
test:
	@make build-tests
	@$$(npm bin)/jest build/tests/
