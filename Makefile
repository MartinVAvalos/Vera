.DEFAULT_GOAL := help

NPM     ?= npm
CARGO   ?= cargo
COMPOSE ?= docker compose

.PHONY: help install dev frontend build check test test-native lint fmt clean \
        docker-dev docker-build docker-down docker-clean linux-bundle

help: ## Show available targets
	@awk 'BEGIN {FS = ":.*?## "} /^[a-zA-Z_-]+:.*?## / {printf "  \033[36m%-18s\033[0m %s\n", $$1, $$2}' $(MAKEFILE_LIST)

# ── local ─────────────────────────────────────────────────────────────────────

install: ## Install npm packages and fetch Cargo dependencies
	$(NPM) install
	$(CARGO) fetch

dev: ## Run Tauri in dev mode (native window + Angular hot-reload)
	CI=true $(NPM) run tauri:dev

frontend: ## Start the Angular dev server only (http://localhost:4200)
	CI=true $(NPM) start

build: ## Build the Tauri desktop app for the current platform
	$(NPM) run tauri:build

check: ## Type-check the Rust workspace without compiling
	$(CARGO) check --workspace

test: ## Run Rust unit tests and Angular tests
	$(CARGO) test --workspace
	$(NPM) run test

SWORD_FX := $(CURDIR)/target/sword-fixtures
CROSSWIRE := https://www.crosswire.org/ftpmirror/pub/sword/packages/rawzip

test-native: ## Run native SWORD tests against real CrossWire KJV/DRC modules (downloads ~6 MB)
	@mkdir -p $(SWORD_FX)/real $(SWORD_FX)/gen
	@for m in KJV DRC; do \
	  [ -f $(SWORD_FX)/real/$$m.zip ] || curl -fsSL -o $(SWORD_FX)/real/$$m.zip $(CROSSWIRE)/$$m.zip; \
	  unzip -qo $(SWORD_FX)/real/$$m.zip -d $(SWORD_FX)/real; \
	done
	@$(CARGO) fetch >/dev/null 2>&1; \
	  TAR=$$(ls $$HOME/.cargo/registry/src/*/sword-modules-0.1.0/tests/fixtures.tar.gz | head -1); \
	  tar xzf $$TAR -C $(SWORD_FX)/gen
	VERA_SWORD_REAL=$(SWORD_FX)/real VERA_SWORD_FIXTURES=$(SWORD_FX)/gen VERA_SWORD_ZIPS=$(SWORD_FX)/real \
	  $(CARGO) test -p bible-engine -p vera --features bible-engine/native-sword -- --include-ignored

lint: ## Lint with Cargo Clippy and Prettier format-check
	$(CARGO) clippy --workspace -- -D warnings
	$(NPM) exec prettier -- --check "src/**/*.{ts,html,css}"

fmt: ## Format Rust and TypeScript/HTML/CSS source files
	$(CARGO) fmt --all
	$(NPM) exec prettier -- --write "src/**/*.{ts,html,css}"

clean: ## Remove compiled artifacts and Angular cache
	$(CARGO) clean
	rm -rf dist .angular/cache

# ── docker ────────────────────────────────────────────────────────────────────

docker-dev: ## Start Angular dev server in Docker (http://localhost:4200)
	$(COMPOSE) up --build dev

docker-build: ## Build the Docker images without starting containers
	$(COMPOSE) build

docker-down: ## Stop and remove Docker containers
	$(COMPOSE) down

docker-clean: ## Remove containers, volumes, and locally built images
	$(COMPOSE) down -v --remove-orphans --rmi local

linux-bundle: ## Build Linux AppImage/deb via Docker and export to ./bundle
	docker build --output type=local,dest=./bundle --target bundle .
