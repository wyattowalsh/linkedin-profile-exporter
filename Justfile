set shell := ["zsh", "-cu"]

default:
    just --list

setup:
    pnpm install

dev:
    pnpm --filter @linkedin-profile-exporter/extension dev

docs-dev:
    pnpm --filter @linkedin-profile-exporter/docs dev

openspec:
    pnpm openspec

lint:
    pnpm lint

typecheck:
    pnpm typecheck

test:
    pnpm test

build:
    pnpm build

extension-build:
    pnpm build:extension

assets:
    pnpm check:assets

store:
    pnpm check:store

github-release-package:
    pnpm release:github:package

quick:
    pnpm run quick

ci:
    pnpm run ci

release:
    pnpm run ci
