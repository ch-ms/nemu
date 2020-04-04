.PHONY: build-src
build-src:
	@make eslint-src
	@$$(npm bin)/webpack --config-name=src

.PHONY: build-watch-src
build-watch-src:
	@$$(npm bin)/webpack --config-name=src --watch

.PHONY: eslint-src
eslint-src:
	@$$(npm bin)/eslint src/*.ts src/**/*.ts

.PHONY: eslint-tests
eslint-tests:
	@$$(npm bin)/eslint tests/*.test.ts

.PHONY: tslint
tslint:
	@$$(npm bin)/tsc --noEmit

.PHONY: lint-src
lint-src:
	@make eslint-src
	@make tslint

.PHONY: lint-tests
lint-tests:
	@make eslint-tests
	@make tslint

.PHONY: lint
lint:
	@make eslint-src
	@make eslint-tests
	@make tslint

.PHONY: build-tests
build-tests:
	@$$(npm bin)/webpack --config-name=tests

.PHONY: test
test:
	@make tests/nestest.log.json
	@make build-tests
	@$$(npm bin)/jest build/tests/

.PHONY: test-debug
test-debug:
	@make build-tests
	@node --inspect-brk $$(npm bin)/jest build/tests/

tests/nestest.log.json:
	@node ./tools/parse-nestest-log/parse-nestest-log.js > ./tests/nestest.log.json
