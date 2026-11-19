# ── Stage 1: Build the Angular frontend ──────────────────────────────────────
FROM node:22-slim AS frontend

WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY angular.json tsconfig*.json ./
COPY src/ src/
COPY public/ public/
RUN npm run build

# ── Stage 2: Compile the Tauri application (Linux) ───────────────────────────
FROM ubuntu:24.04 AS builder

ARG DEBIAN_FRONTEND=noninteractive

RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    curl \
    file \
    wget \
    pkg-config \
    ca-certificates \
    gnupg \
    libssl-dev \
    libwebkit2gtk-4.1-dev \
    libayatana-appindicator3-dev \
    librsvg2-dev \
    libxdo-dev \
    patchelf \
    && rm -rf /var/lib/apt/lists/*

# Node.js 22
RUN curl -fsSL https://deb.nodesource.com/setup_22.x | bash - \
    && apt-get install -y nodejs \
    && rm -rf /var/lib/apt/lists/*

# Rust stable
RUN curl --proto '=https' --tlsv1.2 -sSf https://sh.rustup.rs | \
    sh -s -- -y --default-toolchain stable --no-modify-path
ENV PATH="/root/.cargo/bin:${PATH}"

WORKDIR /app

# Pre-fetch Cargo dependencies before copying full source (layer caching)
COPY Cargo.toml Cargo.lock ./
COPY src-tauri/Cargo.toml src-tauri/build.rs src-tauri/
COPY crates/ crates/
RUN mkdir -p src-tauri/src \
    && printf 'fn main() {}\n' > src-tauri/src/main.rs \
    && printf 'pub fn run() {}\n' > src-tauri/src/lib.rs
RUN cargo fetch

# npm install (provides the Tauri CLI)
COPY package*.json ./
RUN npm ci

# Full source
COPY . .

# Overwrite with the pre-built Angular output from stage 1
COPY --from=frontend /app/dist ./dist

RUN npm run tauri:build

# ── Stage 3: Collect the distributable bundles ───────────────────────────────
FROM scratch AS bundle
COPY --from=builder /app/src-tauri/target/release/bundle /
