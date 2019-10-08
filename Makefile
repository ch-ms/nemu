.PHONY: build
build:
	@make eslint
	@$$(npm bin)/webpack

.PHONY: build-watch
build-watch:
	@$$(npm bin)/webpack --watch

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
