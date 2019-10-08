.PHONY: build
build:
	@make lint
	@$$(npm bin)/tsc

.PHONY: lint
lint:
	@$$(npm bin)/eslint src/*
