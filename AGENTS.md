# Clean Commit Workflow

When generating commit messages for this repository, follow the **Clean Commit** workflow.

Reference: https://github.com/wgtechlabs/clean-commit

## Format

```text
<emoji> <type>: <description>
<emoji> <type> (<scope>): <description>
```

## The 9 Types

| Emoji | Type | What it covers |
|:-----:|------|----------------|
| 📦 | `new` | Adding new features, files, or capabilities |
| 🔧 | `update` | Changing existing code, refactoring, improvements |
| 🗑️ | `remove` | Removing code, files, features, or dependencies |
| 🔒 | `security` | Security fixes, patches, vulnerability resolutions |
| ⚙️ | `setup` | Project configs, CI/CD, tooling, build systems |
| ☕ | `chore` | Maintenance tasks, dependency updates, housekeeping |
| 🧪 | `test` | Adding, updating, or fixing tests |
| 📖 | `docs` | Documentation changes and updates |
| 🚀 | `release` | Version releases and release preparation |

## Rules

- Use lowercase for type
- Use present tense ("add" not "added")
- No period at the end
- Keep description under 72 characters

## Examples

- `📦 new: user authentication system`
- `🔧 update (api): improve error handling`
- `🗑️ remove (deps): unused lodash dependency`
- `🔒 security: patch XSS vulnerability`
- `⚙️ setup: add eslint configuration`
- `☕ chore: update npm dependencies`
- `🧪 test: add unit tests for auth service`
- `📖 docs: update installation instructions`
- `🚀 release: version 1.0.0`

# Railway Operations

## Do Not Delete Service Instances

When working with Railway infrastructure, **never delete service instances** unless explicitly confirmed by the user for that specific action. Removing a service instance permanently deletes:

- Running deployments
- Environment variables
- Service configuration (domains, health checks, etc.)
- Associated deployment history

### Allowed Actions

- Stop or restart the latest deployment
- Redeploy a service instance with a new image
- Remove a specific deployment by ID (only when explicitly requested)
- Scale services up or down

### Prohibited Actions

- `serviceDelete` on Railway service instances
- `railway service delete` or equivalent CLI commands
- Any operation that destroys the service definition itself

If the user asks to "remove deployments," stop or remove the current **deployment** only, not the **service instance**. Ask for clarification if unsure.
