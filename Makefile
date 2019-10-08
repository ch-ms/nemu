.PHONY: build
build:
	@make eslint
	@$$(npm bin)/tsc

.PHONY: lint
eslint:
	@$$(npm bin)/eslint src/*

.PHONY: tslint
tslint:
	@$$(npm bin)/tsc --noEmit

.PHONY: lint
lint:
	@make eslint
	@make tslint
