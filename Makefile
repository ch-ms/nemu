.PHONY: build
build:
	$$(npm bin)/tsc

.PHONY: lint
lint:
	$$(npm bin)/eslint src/*
