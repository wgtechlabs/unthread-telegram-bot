# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/),
and this project adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]


## [1.1.1] - 2026-07-26

### Changed

- sync bun.lock after dependency updates
- set ignoreDeprecations to 6.0
- bump the minor-and-patch group across 1 directory with 2 updates
- bump @types/node from 25.9.3 to 26.0.0
- bump actions/checkout from 6 to 7
- bump actions/cache from 5 to 6
- bump actions/setup-node from 6 to 7
- bump gitleaks/gitleaks-action from 2.3.9 to 3.0.0 (#110)
- bump redis from 5.12.1 to 6.0.0 (#112)
- bump concurrently from 9.2.1 to 10.0.3 (#113)
- bump the minor-and-patch group across 1 directory with 3 updates (#115)
- bump @types/node from 24.0.3 to 25.9.1 (#105)
- bump dotenv from 16.6.1 to 17.4.2 (#109)
- bump eslint-plugin-security from 3.0.1 to 4.0.0 (#104)
- bump zod from 3.25.76 to 4.4.3 (#108)
- bump typescript from 5.8.3 to 6.0.3 (#107)
- bump @eslint/js from 9.37.0 to 10.0.1 (#106)
- bump eslint from 9.30.1 to 10.4.0 (#103)
- bump the minor-and-patch group with 4 updates (#102)
- bump actions/cache from 4 to 5 (#101)

### Security

- patch container image vulnerabilities

## [1.1.0] - 2026-05-21

### Added

- add issue keyword patterns and clause scoring utilities
- add deterministic telegram ticket title builder
- add CodeQL analysis workflow

### Changed

- update Node.js support to 22, 24, 26 with 26 as default
- pass NODE_VERSION build arg to Docker build step
- upgrade default Node.js runtime to v26 Alpine
- downgrade node image from 26 to 22 lts
- upgrade default Node.js to 26 Alpine
- add Node.js 26 support and make it default
- improve ticket notification message clarity and reply UX (#100)
- improve configurability for webhooks and ticket creation (#98)
- modernize Node.js support and expand CI matrix (#97)
- return sent message IDs for reply tracking (#95)
- improve Unthread attachment downloading and detection (#93)
- replace lookup map with switch statement
- gate container and release workflows on CI and CodeQL
- add concurrency, workflow_call trigger, and fix branch config
- support title/filetype fields and normalize attachment MIME types
- add normalizeType for extension-style MIME fallback
- upgrade container build action and enable floating tags
- align VersionCommand tests with simplified output (#91)
- build(deps): bump uuid from 13.0.0 to 14.0.0 (#92)
- add weekly dependency update config for npm, actions, and docker
- upgrade uuid from 11.1.0 to 14.0.0
- disable test coverage by default
- require GH_PAT for release workflow token
- simplify version command output with changelog link
- migrate package manager to Bun and tests to bun:test (Node.js runtime preserved) (#89)
- align workflows with sibling bot repos (#87)
- add clean commit convention to project (#86)
- replace SECURITY.md with concise unified security policy (#83)

### Removed

- delete devcontainer configuration

### Security

- remediate Dependabot alerts for dev branch (#96)
- bump brace-expansion override to 2.1.0

