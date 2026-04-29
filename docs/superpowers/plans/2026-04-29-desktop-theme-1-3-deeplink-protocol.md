# Desktop Theme 1.3 — `vorevault://` deep-link protocol — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Register a `vorevault://` URL scheme on Windows + macOS so external links route to the desktop app, which translates `vorevault://open/<vault-path>` to `https://<vault>/<vault-path>` and opens it in the user's default browser.

**Architecture:** One new pure-logic module (`deeplink.rs`) for URL translation and dispatch. Two new Tauri plugins (`tauri-plugin-deep-link`, `tauri-plugin-single-instance`) wired in `main.rs`. Registration happens automatically at install time via `tauri.conf.json`'s bundler config. No changes to existing modules.

**Tech Stack:** Rust 2021, Tauri 2.x, `url` crate (already a dep), `tauri-plugin-deep-link` v2, `tauri-plugin-single-instance` v2 with the `deep-link` feature, `tauri-plugin-opener` (already a dep), `log` (already a dep).

**Spec:** [`docs/superpowers/specs/2026-04-29-desktop-theme-1-3-deeplink-protocol-design.md`](../specs/2026-04-29-desktop-theme-1-3-deeplink-protocol-design.md)

**Implementation repo:** `C:\Users\rvand\vorevault-desktop` (NOT the vorevault repo this plan lives in — the spec/plan live in vorevault per the Theme 1.1/1.2 precedent; the code lives in vorevault-desktop).

**Branch:** `feat/deeplink-protocol` in vorevault-desktop, branched from `main` at v0.6.0.

**Companion vault-repo PR:** Adds the "Copy desktop link" button on the file detail page. Out of scope for this plan; if that work is wanted, write it as a separate plan against the vorevault repo. The desktop work in this plan ships standalone — the protocol works end-to-end as long as a user can construct `vorevault://...` strings by hand or get them from a future producer.

---

## File Structure

**Created:**
- `src-tauri/src/deeplink.rs` — pure URL translation (`translate`) plus thin Tauri dispatch wrapper (`dispatch`). All unit tests live in this file.

**Modified:**
- `src-tauri/Cargo.toml` — add two dependencies.
- `src-tauri/tauri.conf.json` — add `plugins.deep-link.desktop.schemes`. Bump `version` to `0.7.0`.
- `src-tauri/src/main.rs` — add `mod deeplink;`. Register the two new plugins. Add `on_open_url` listener inside `setup`. Add `#[cfg(debug_assertions)] register_all()` inside `setup`. No changes to invoke handlers, tray, or any other existing logic.
- `src-tauri/capabilities/settings.json` — verify `core:default` already covers what the deep-link plugin needs; add a new permission only if missing (deep-link plugin is event-only and doesn't expose webview-callable commands, so likely no change required).

**Not modified:**
- `src-tauri/src/tray.rs`, `notifier.rs`, `pipeline.rs`, `watcher.rs`, `uploader.rs`, `settings_window.rs`, `auth.rs`, `config.rs`, `keychain.rs`, `db.rs`, `folders_api.rs`, `rules.rs`, `updater.rs`, `path.rs`. The feature is purely additive.

**Workspace `Cargo.lock`** changes automatically; commit it with the dependency-add task.

---

## Task 0: Branch setup

**Files:** none (git operation only)

- [ ] **Step 1: Verify clean working tree on main**

```bash
cd /c/Users/rvand/vorevault-desktop
git status --short --branch
```

Expected output: `## main...origin/main` and no working-tree changes.

- [ ] **Step 2: Pull latest main**

```bash
git pull --ff-only origin main
```

Expected: `Already up to date.` or fast-forward summary. The HEAD should be at `a9eac31` (Merge pull request #13 from Bullmoose-Code/chore/bump-0.6.0).

- [ ] **Step 3: Create the feature branch**

```bash
git checkout -b feat/deeplink-protocol
```

Expected: `Switched to a new branch 'feat/deeplink-protocol'`

- [ ] **Step 4: Run baseline test suite to confirm starting state is green**

```bash
cargo test --manifest-path src-tauri/Cargo.toml --quiet
```

Expected: all existing tests pass (107/107 per the v0.6.0 PR description). If any fail, stop and report — the baseline is broken before this plan's changes touch anything.

---

## Task 1: Scaffold `deeplink.rs` and the `DeepLinkError` type

**Files:**
- Create: `src-tauri/src/deeplink.rs`
- Modify: `src-tauri/src/main.rs` (add `mod deeplink;`)

- [ ] **Step 1: Create the new module file with just the error type**

Create `src-tauri/src/deeplink.rs` with this exact content:

```rust
//! `vorevault://` deep-link translation and dispatch.
//!
//! Translation is pure: takes a `vorevault://...` string and the configured
//! vault URL, returns an `https://<vault>/...` string. Dispatch is the thin
//! Tauri-aware wrapper that calls `tauri_plugin_opener::open_url` with the
//! translated target.

#[derive(Debug)]
pub enum DeepLinkError {
    Parse(url::ParseError),
    BadScheme,
    BadHost,
    HasCredentials,
    HasPort,
    BadPath,
}

impl std::fmt::Display for DeepLinkError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        match self {
            DeepLinkError::Parse(e) => write!(f, "parse: {}", e),
            DeepLinkError::BadScheme => write!(f, "scheme must be 'vorevault'"),
            DeepLinkError::BadHost => write!(f, "host must be 'open'"),
            DeepLinkError::HasCredentials => write!(f, "URL must not contain user/password"),
            DeepLinkError::HasPort => write!(f, "URL must not contain a port"),
            DeepLinkError::BadPath => write!(f, "path must begin with '/'"),
        }
    }
}

impl std::error::Error for DeepLinkError {}

impl From<url::ParseError> for DeepLinkError {
    fn from(e: url::ParseError) -> Self {
        DeepLinkError::Parse(e)
    }
}
```

- [ ] **Step 2: Add the module declaration in `main.rs`**

Open `src-tauri/src/main.rs`. Find the existing `mod` block at the top of the file (lines 4–17). Add `mod deeplink;` in alphabetical order — it goes between `mod db;` and `mod folders_api;`:

```rust
mod auth;
mod config;
mod db;
mod deeplink;
mod folders_api;
mod keychain;
mod notifier;
mod path;
mod pipeline;
mod rules;
mod settings_window;
mod tray;
mod updater;
mod uploader;
mod watcher;
```

- [ ] **Step 3: Build to confirm the module compiles in isolation**

```bash
cargo build --manifest-path src-tauri/Cargo.toml --quiet
```

Expected: clean build, no warnings about unused code (the dead-code lint allows pub items, and `DeepLinkError` is `pub`).

If you see a warning like `unused import: log` or anything tied to the new module, stop and fix — those signal something off in the scaffold.

- [ ] **Step 4: Run the existing test suite to confirm nothing regressed**

```bash
cargo test --manifest-path src-tauri/Cargo.toml --quiet
```

Expected: same pass count as Task 0 step 4.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/deeplink.rs src-tauri/src/main.rs
git commit -m "feat(deeplink): scaffold module + DeepLinkError type"
```

---

## Task 2: `translate()` happy path (TDD)

**Files:**
- Modify: `src-tauri/src/deeplink.rs`

- [ ] **Step 1: Write the failing test**

Append to `src-tauri/src/deeplink.rs`:

```rust
#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn translates_canonical_file_link() {
        let out = translate(
            "vorevault://open/files/abc-123",
            "https://vault.bullmoosefn.com",
        )
        .expect("happy path should succeed");
        assert_eq!(out, "https://vault.bullmoosefn.com/files/abc-123");
    }
}
```

- [ ] **Step 2: Run the test, confirm it fails to compile (no `translate` yet)**

```bash
cargo test --manifest-path src-tauri/Cargo.toml deeplink::tests::translates_canonical_file_link
```

Expected: build error like `cannot find function 'translate' in this scope`. This confirms the test is wired and the function doesn't exist yet.

- [ ] **Step 3: Implement minimal `translate()` to make this one test pass**

In `src-tauri/src/deeplink.rs`, after the `From<url::ParseError>` impl and **before** the `#[cfg(test)] mod tests` block, add:

```rust
use url::Url;

/// Translate a `vorevault://...` URL into an `https://<vault>/...` URL.
/// The output's scheme + host come entirely from `vault_url`; only the path,
/// query, and fragment of the input pass through. There is no input that can
/// produce a non-vault target URL (security by construction).
pub fn translate(input: &str, vault_url: &str) -> Result<String, DeepLinkError> {
    let parsed = Url::parse(input)?;
    let mut out = String::from(vault_url.trim_end_matches('/'));
    out.push_str(parsed.path());
    Ok(out)
}
```

- [ ] **Step 4: Run the test, confirm it passes**

```bash
cargo test --manifest-path src-tauri/Cargo.toml deeplink::tests::translates_canonical_file_link
```

Expected: `test result: ok. 1 passed; 0 failed`.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/deeplink.rs
git commit -m "feat(deeplink): translate happy path"
```

---

## Task 3: Reject inputs with the wrong scheme

**Files:**
- Modify: `src-tauri/src/deeplink.rs`

- [ ] **Step 1: Write the failing test**

Inside the existing `#[cfg(test)] mod tests` block in `deeplink.rs`, add:

```rust
    #[test]
    fn rejects_wrong_scheme() {
        let result = translate(
            "https://attacker.example.com/files/abc",
            "https://vault.bullmoosefn.com",
        );
        assert!(matches!(result, Err(DeepLinkError::BadScheme)));
    }
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
cargo test --manifest-path src-tauri/Cargo.toml deeplink::tests::rejects_wrong_scheme
```

Expected: test compiles and fails because the current `translate` implementation succeeds on any well-formed URL — it returns `Ok("https://vault.bullmoosefn.com/files/abc")` instead of `Err(BadScheme)`.

- [ ] **Step 3: Add scheme validation to `translate()`**

In `src-tauri/src/deeplink.rs`, modify `translate` so the body becomes:

```rust
pub fn translate(input: &str, vault_url: &str) -> Result<String, DeepLinkError> {
    let parsed = Url::parse(input)?;
    if parsed.scheme() != "vorevault" {
        return Err(DeepLinkError::BadScheme);
    }
    let mut out = String::from(vault_url.trim_end_matches('/'));
    out.push_str(parsed.path());
    Ok(out)
}
```

- [ ] **Step 4: Run the full deeplink test suite to confirm everything passes**

```bash
cargo test --manifest-path src-tauri/Cargo.toml deeplink::
```

Expected: 2 passed; 0 failed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/deeplink.rs
git commit -m "feat(deeplink): reject non-vorevault schemes"
```

---

## Task 4: Reject inputs with the wrong host

**Files:**
- Modify: `src-tauri/src/deeplink.rs`

- [ ] **Step 1: Write the failing test**

Inside the existing `#[cfg(test)] mod tests` block, add:

```rust
    #[test]
    fn rejects_wrong_host() {
        let result = translate(
            "vorevault://attacker.example.com/files/abc",
            "https://vault.bullmoosefn.com",
        );
        assert!(matches!(result, Err(DeepLinkError::BadHost)));
    }
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
cargo test --manifest-path src-tauri/Cargo.toml deeplink::tests::rejects_wrong_host
```

Expected: test fails because current `translate` does not check the host.

- [ ] **Step 3: Add host validation to `translate()`**

After the scheme check and before the path-building lines, insert:

```rust
    if parsed.host_str() != Some("open") {
        return Err(DeepLinkError::BadHost);
    }
```

The full function should now read:

```rust
pub fn translate(input: &str, vault_url: &str) -> Result<String, DeepLinkError> {
    let parsed = Url::parse(input)?;
    if parsed.scheme() != "vorevault" {
        return Err(DeepLinkError::BadScheme);
    }
    if parsed.host_str() != Some("open") {
        return Err(DeepLinkError::BadHost);
    }
    let mut out = String::from(vault_url.trim_end_matches('/'));
    out.push_str(parsed.path());
    Ok(out)
}
```

- [ ] **Step 4: Run the full deeplink test suite**

```bash
cargo test --manifest-path src-tauri/Cargo.toml deeplink::
```

Expected: 3 passed; 0 failed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/deeplink.rs
git commit -m "feat(deeplink): reject non-'open' hosts"
```

---

## Task 5: Reject inputs that contain user / password credentials

**Files:**
- Modify: `src-tauri/src/deeplink.rs`

- [ ] **Step 1: Write the failing test**

Inside the existing `#[cfg(test)] mod tests` block, add:

```rust
    #[test]
    fn rejects_credentials() {
        let with_user = translate(
            "vorevault://user@open/files/abc",
            "https://vault.bullmoosefn.com",
        );
        assert!(matches!(with_user, Err(DeepLinkError::HasCredentials)));

        let with_password = translate(
            "vorevault://user:pw@open/files/abc",
            "https://vault.bullmoosefn.com",
        );
        assert!(matches!(with_password, Err(DeepLinkError::HasCredentials)));
    }
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
cargo test --manifest-path src-tauri/Cargo.toml deeplink::tests::rejects_credentials
```

Expected: fails — current `translate` strips credentials silently and returns Ok.

- [ ] **Step 3: Add credentials validation**

After the host check, insert:

```rust
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(DeepLinkError::HasCredentials);
    }
```

- [ ] **Step 4: Run the full deeplink test suite**

```bash
cargo test --manifest-path src-tauri/Cargo.toml deeplink::
```

Expected: 4 passed; 0 failed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/deeplink.rs
git commit -m "feat(deeplink): reject URLs containing credentials"
```

---

## Task 6: Reject inputs that contain a port

**Files:**
- Modify: `src-tauri/src/deeplink.rs`

- [ ] **Step 1: Write the failing test**

Inside the existing `#[cfg(test)] mod tests` block, add:

```rust
    #[test]
    fn rejects_port() {
        let result = translate(
            "vorevault://open:8080/files/abc",
            "https://vault.bullmoosefn.com",
        );
        assert!(matches!(result, Err(DeepLinkError::HasPort)));
    }
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
cargo test --manifest-path src-tauri/Cargo.toml deeplink::tests::rejects_port
```

Expected: fails.

- [ ] **Step 3: Add port validation**

After the credentials check, insert:

```rust
    if parsed.port().is_some() {
        return Err(DeepLinkError::HasPort);
    }
```

- [ ] **Step 4: Run the full deeplink test suite**

```bash
cargo test --manifest-path src-tauri/Cargo.toml deeplink::
```

Expected: 5 passed; 0 failed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/deeplink.rs
git commit -m "feat(deeplink): reject URLs containing a port"
```

---

## Task 7: Reject inputs whose path does not begin with `/`

**Files:**
- Modify: `src-tauri/src/deeplink.rs`

- [ ] **Step 1: Write the failing test**

Inside the existing `#[cfg(test)] mod tests` block, add:

```rust
    #[test]
    fn rejects_missing_path() {
        // `vorevault://open` (no path) parses with an empty path. Reject so
        // callers must be explicit about what they want opened.
        let result = translate(
            "vorevault://open",
            "https://vault.bullmoosefn.com",
        );
        assert!(matches!(result, Err(DeepLinkError::BadPath)));
    }
```

- [ ] **Step 2: Run the test, confirm it fails**

```bash
cargo test --manifest-path src-tauri/Cargo.toml deeplink::tests::rejects_missing_path
```

Expected: fails — current `translate` produces `Ok("https://vault.bullmoosefn.com")` for the empty path.

- [ ] **Step 3: Add path validation, then build the output URL using the validated path**

Replace the path-building lines so the full function becomes:

```rust
pub fn translate(input: &str, vault_url: &str) -> Result<String, DeepLinkError> {
    let parsed = Url::parse(input)?;
    if parsed.scheme() != "vorevault" {
        return Err(DeepLinkError::BadScheme);
    }
    if parsed.host_str() != Some("open") {
        return Err(DeepLinkError::BadHost);
    }
    if !parsed.username().is_empty() || parsed.password().is_some() {
        return Err(DeepLinkError::HasCredentials);
    }
    if parsed.port().is_some() {
        return Err(DeepLinkError::HasPort);
    }
    let path = parsed.path();
    if !path.starts_with('/') {
        return Err(DeepLinkError::BadPath);
    }
    let mut out = String::from(vault_url.trim_end_matches('/'));
    out.push_str(path);
    Ok(out)
}
```

- [ ] **Step 4: Run the full deeplink test suite**

```bash
cargo test --manifest-path src-tauri/Cargo.toml deeplink::
```

Expected: 6 passed; 0 failed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/deeplink.rs
git commit -m "feat(deeplink): reject URLs whose path does not start with '/'"
```

---

## Task 8: Allow the bare vault root (`vorevault://open/`)

**Files:**
- Modify: `src-tauri/src/deeplink.rs`

This task confirms the existing implementation correctly handles the bare-root case from the spec's truth table. If implementation is correct, this is a confidence test that adds a meaningful row to the test suite. Per spec, `vorevault://open/` is allowed and produces `https://vault.bullmoosefn.com/`.

- [ ] **Step 1: Write the test**

Inside the existing `#[cfg(test)] mod tests` block, add:

```rust
    #[test]
    fn allows_bare_vault_root() {
        let out = translate(
            "vorevault://open/",
            "https://vault.bullmoosefn.com",
        )
        .expect("bare vault root should be allowed");
        assert_eq!(out, "https://vault.bullmoosefn.com/");
    }
```

- [ ] **Step 2: Run the test**

```bash
cargo test --manifest-path src-tauri/Cargo.toml deeplink::tests::allows_bare_vault_root
```

Expected: passes immediately. (Path is `/`, starts with `/`, validation accepts.) If it fails, the implementation is wrong — check `translate()` matches the version from Task 7 step 3.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/deeplink.rs
git commit -m "test(deeplink): bare vault root passes through"
```

---

## Task 9: Pass query string through to the output URL

**Files:**
- Modify: `src-tauri/src/deeplink.rs`

- [ ] **Step 1: Write the failing test**

Inside the existing `#[cfg(test)] mod tests` block, add:

```rust
    #[test]
    fn passes_query_string_through() {
        let out = translate(
            "vorevault://open/files/abc?tag=apex&page=2",
            "https://vault.bullmoosefn.com",
        )
        .expect("query passthrough should succeed");
        assert_eq!(
            out,
            "https://vault.bullmoosefn.com/files/abc?tag=apex&page=2"
        );
    }

    #[test]
    fn preserves_query_url_encoding() {
        // The `url` crate parses `?tag=foo%20bar` and gives back `query()` =
        // `"tag=foo%20bar"` (the encoded form, NOT decoded). Confirm we do not
        // accidentally re-encode.
        let out = translate(
            "vorevault://open/search?q=foo%20bar",
            "https://vault.bullmoosefn.com",
        )
        .expect("query passthrough should succeed");
        assert_eq!(
            out,
            "https://vault.bullmoosefn.com/search?q=foo%20bar"
        );
    }
```

- [ ] **Step 2: Run the tests, confirm they fail**

```bash
cargo test --manifest-path src-tauri/Cargo.toml deeplink::tests::passes_query_string_through deeplink::tests::preserves_query_url_encoding
```

Expected: both fail because current `translate` only appends `parsed.path()` and ignores the query.

- [ ] **Step 3: Append query string in the output**

Replace the tail of the `translate` function (the lines that build `out` and return it) with:

```rust
    let mut out = String::from(vault_url.trim_end_matches('/'));
    out.push_str(path);
    if let Some(q) = parsed.query() {
        out.push('?');
        out.push_str(q);
    }
    Ok(out)
```

- [ ] **Step 4: Run the full deeplink test suite**

```bash
cargo test --manifest-path src-tauri/Cargo.toml deeplink::
```

Expected: 9 passed; 0 failed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/deeplink.rs
git commit -m "feat(deeplink): pass query strings through to output URL"
```

---

## Task 10: Pass URL fragment through to the output URL

**Files:**
- Modify: `src-tauri/src/deeplink.rs`

- [ ] **Step 1: Write the failing test**

Inside the existing `#[cfg(test)] mod tests` block, add:

```rust
    #[test]
    fn passes_fragment_through() {
        let out = translate(
            "vorevault://open/files/abc#t=10s",
            "https://vault.bullmoosefn.com",
        )
        .expect("fragment passthrough should succeed");
        assert_eq!(out, "https://vault.bullmoosefn.com/files/abc#t=10s");
    }

    #[test]
    fn passes_query_and_fragment_together() {
        let out = translate(
            "vorevault://open/files/abc?autoplay=1#t=10",
            "https://vault.bullmoosefn.com",
        )
        .expect("query+fragment together should succeed");
        assert_eq!(
            out,
            "https://vault.bullmoosefn.com/files/abc?autoplay=1#t=10"
        );
    }
```

- [ ] **Step 2: Run the tests, confirm they fail**

```bash
cargo test --manifest-path src-tauri/Cargo.toml deeplink::tests::passes_fragment_through deeplink::tests::passes_query_and_fragment_together
```

Expected: both fail.

- [ ] **Step 3: Append fragment in the output**

Insert the fragment-handling lines into `translate` so the tail of the function reads:

```rust
    let mut out = String::from(vault_url.trim_end_matches('/'));
    out.push_str(path);
    if let Some(q) = parsed.query() {
        out.push('?');
        out.push_str(q);
    }
    if let Some(f) = parsed.fragment() {
        out.push('#');
        out.push_str(f);
    }
    Ok(out)
```

- [ ] **Step 4: Run the full deeplink test suite**

```bash
cargo test --manifest-path src-tauri/Cargo.toml deeplink::
```

Expected: 11 passed; 0 failed.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/deeplink.rs
git commit -m "feat(deeplink): pass URL fragment through to output URL"
```

---

## Task 11: Vault-URL variations (trailing slash, dev port, sub-path mount)

**Files:**
- Modify: `src-tauri/src/deeplink.rs`

These tests exercise vault-URL inputs the validator must handle correctly. The current `translate` uses `trim_end_matches('/')` and naive concatenation — these tests confirm those primitives behave as the spec promises.

- [ ] **Step 1: Write the tests**

Inside the existing `#[cfg(test)] mod tests` block, add:

```rust
    #[test]
    fn vault_url_trailing_slash_is_trimmed() {
        let out = translate(
            "vorevault://open/files/abc",
            "https://vault.bullmoosefn.com/", // note trailing slash
        )
        .expect("trailing-slash vault URL should still produce a clean output");
        assert_eq!(out, "https://vault.bullmoosefn.com/files/abc");
    }

    #[test]
    fn vault_url_with_dev_port() {
        let out = translate(
            "vorevault://open/files/abc",
            "http://localhost:3000",
        )
        .expect("dev vault URL should work");
        assert_eq!(out, "http://localhost:3000/files/abc");
    }

    #[test]
    fn vault_url_with_dev_port_and_trailing_slash() {
        let out = translate(
            "vorevault://open/files/abc",
            "http://localhost:3000/",
        )
        .expect("dev vault URL with trailing slash should work");
        assert_eq!(out, "http://localhost:3000/files/abc");
    }

    #[test]
    fn vault_url_with_subpath_mount() {
        // Hypothetical: vault deployed at example.com/vv. Translator must not
        // break on a vault URL that already has a path component.
        let out = translate(
            "vorevault://open/files/abc",
            "https://example.com/vv",
        )
        .expect("sub-path mounted vault URL should work");
        assert_eq!(out, "https://example.com/vv/files/abc");
    }
```

- [ ] **Step 2: Run the tests, confirm they all pass**

```bash
cargo test --manifest-path src-tauri/Cargo.toml deeplink::
```

Expected: 15 passed; 0 failed. All four new tests should pass without code changes — the existing `translate` already handles these via `trim_end_matches('/')` and string concatenation.

If any fail, the implementation diverged from the spec — re-read Task 7 step 3 and resync.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/deeplink.rs
git commit -m "test(deeplink): vault-URL variations (trailing slash, dev port, sub-path)"
```

---

## Task 12: Case-insensitive scheme + host

**Files:**
- Modify: `src-tauri/src/deeplink.rs`

The `url` crate lowercases schemes and hosts during parsing per RFC 3986 §3.1 / §3.2.2. This task confirms that behavior — `vorevault://OPEN/...` should produce the same translation as `vorevault://open/...`. If this fails, our equality check is wrong and we'd reject valid inputs.

- [ ] **Step 1: Write the test**

Inside the existing `#[cfg(test)] mod tests` block, add:

```rust
    #[test]
    fn host_comparison_is_effectively_case_insensitive() {
        // The `url` crate normalizes hosts to lowercase during parse, so
        // by the time we compare against the literal `"open"`, an input of
        // `"OPEN"` has already become `"open"`. Confirm.
        let out = translate(
            "vorevault://OPEN/files/abc",
            "https://vault.bullmoosefn.com",
        )
        .expect("upper-case host should be normalized and accepted");
        assert_eq!(out, "https://vault.bullmoosefn.com/files/abc");
    }

    #[test]
    fn scheme_comparison_is_effectively_case_insensitive() {
        let out = translate(
            "VOREVAULT://open/files/abc",
            "https://vault.bullmoosefn.com",
        )
        .expect("upper-case scheme should be normalized and accepted");
        assert_eq!(out, "https://vault.bullmoosefn.com/files/abc");
    }
```

- [ ] **Step 2: Run the tests**

```bash
cargo test --manifest-path src-tauri/Cargo.toml deeplink::tests::host_comparison_is_effectively_case_insensitive deeplink::tests::scheme_comparison_is_effectively_case_insensitive
```

Expected: both pass without code changes. If they fail, there is a normalization assumption broken — re-check by adding `dbg!(parsed.host_str(), parsed.scheme())` and inspecting.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/deeplink.rs
git commit -m "test(deeplink): scheme + host normalization is case-insensitive"
```

---

## Task 13: Parse-error rejection

**Files:**
- Modify: `src-tauri/src/deeplink.rs`

- [ ] **Step 1: Write the test**

Inside the existing `#[cfg(test)] mod tests` block, add:

```rust
    #[test]
    fn rejects_unparseable_input() {
        let result = translate("not a url", "https://vault.bullmoosefn.com");
        assert!(matches!(result, Err(DeepLinkError::Parse(_))));
    }

    #[test]
    fn rejects_empty_input() {
        let result = translate("", "https://vault.bullmoosefn.com");
        assert!(matches!(result, Err(DeepLinkError::Parse(_))));
    }
```

- [ ] **Step 2: Run the tests**

```bash
cargo test --manifest-path src-tauri/Cargo.toml deeplink::tests::rejects_unparseable_input deeplink::tests::rejects_empty_input
```

Expected: both pass without code changes. The `From<url::ParseError>` impl from Task 1 plus the `?` operator on `Url::parse(input)?` already convert these to `DeepLinkError::Parse`.

- [ ] **Step 3: Commit**

```bash
git add src-tauri/src/deeplink.rs
git commit -m "test(deeplink): unparseable and empty inputs return Parse error"
```

---

## Task 14: Implement `dispatch()` (Tauri-aware wrapper)

**Files:**
- Modify: `src-tauri/src/deeplink.rs`

This is the boundary between pure logic and Tauri runtime. There is no clean unit-test seam for this function (it calls `tauri_plugin_opener::open_url`, which requires a Tauri context). It is small and entirely defensive: log on every outcome, never bubble errors. We rely on the manual test matrix from the spec to verify it end-to-end.

- [ ] **Step 1: Add the `dispatch` function**

In `src-tauri/src/deeplink.rs`, append (before the `#[cfg(test)] mod tests` block) the dispatch function:

```rust
/// Translate `raw_url` and hand the result to the system browser. All errors
/// (parse, validation, browser-open failure) are logged but never surfaced to
/// the user — the user clicked a link from elsewhere and a notification or
/// modal here would be confusing and out of context.
///
/// `_app` is taken (not used today) so future expansion (e.g. focusing the
/// settings window for certain link types) does not require changing every
/// call site.
pub fn dispatch(_app: &tauri::AppHandle, raw_url: &str) {
    let vault = crate::auth::vault_url_from_env();
    match translate(raw_url, &vault) {
        Ok(target) => {
            log::info!("deep link → {}", target);
            if let Err(e) = tauri_plugin_opener::open_url(&target, None::<&str>) {
                log::warn!("deep link: failed to open browser for {}: {}", target, e);
            }
        }
        Err(e) => {
            log::warn!("deep link: rejected input {:?}: {}", raw_url, e);
        }
    }
}
```

- [ ] **Step 2: Build to confirm everything compiles**

```bash
cargo build --manifest-path src-tauri/Cargo.toml --quiet
```

Expected: clean build. The `tauri::AppHandle`, `tauri_plugin_opener`, and `log` paths must already resolve from the existing dependency tree (they do — see `Cargo.toml` line 13–14, 25).

If you get an unused-import warning for `url::Url`, that's fine — it's used inside `translate`.

- [ ] **Step 3: Run the full test suite**

```bash
cargo test --manifest-path src-tauri/Cargo.toml --quiet
```

Expected: 19 deeplink tests passing, plus all previously-existing tests (107) still pass.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/deeplink.rs
git commit -m "feat(deeplink): dispatch() — Tauri-aware translate-and-open wrapper"
```

---

## Task 15: Add the two new dependencies to `Cargo.toml`

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `Cargo.lock` (auto-updated)

- [ ] **Step 1: Add the dependencies**

Open `src-tauri/Cargo.toml`. In the `[dependencies]` section, after the existing `tauri-plugin-updater = "2"` line (line 34), add the two new dependencies:

```toml
tauri-plugin-deep-link = "2"
tauri-plugin-single-instance = { version = "2", features = ["deep-link"] }
```

The `[dependencies]` block should now end with:

```toml
tauri-plugin-updater = "2"
tauri-plugin-deep-link = "2"
tauri-plugin-single-instance = { version = "2", features = ["deep-link"] }
uuid = { version = "1", features = ["v4"] }
```

- [ ] **Step 2: Resolve the new dependencies and confirm the workspace still builds**

```bash
cargo build --manifest-path src-tauri/Cargo.toml --quiet
```

Expected: cargo downloads the new crates, compiles them transitively, then a clean build. May take 1–3 minutes the first time. No errors. There may be unused-dependency warnings since main.rs hasn't wired the plugins yet — those are fine and will go away in Task 18.

- [ ] **Step 3: Run the full test suite to confirm nothing regressed from the new transitive crates**

```bash
cargo test --manifest-path src-tauri/Cargo.toml --quiet
```

Expected: same pass count as Task 14 step 3.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/Cargo.toml Cargo.lock
git commit -m "chore(deps): add tauri-plugin-deep-link + tauri-plugin-single-instance"
```

---

## Task 16: Add the deep-link bundler config to `tauri.conf.json`

**Files:**
- Modify: `src-tauri/tauri.conf.json`

This is what makes the installer register the URL scheme. On macOS it generates `Info.plist` `CFBundleURLTypes`. On Windows it adds the MSI registry entries.

- [ ] **Step 1: Add the `deep-link` config under `plugins`**

Open `src-tauri/tauri.conf.json`. The current `plugins` block (lines 31–39) contains only the `updater` config. Add a `deep-link` entry to it. The full `plugins` block should become:

```json
  "plugins": {
    "updater": {
      "active": true,
      "pubkey": "dW50cnVzdGVkIGNvbW1lbnQ6IG1pbmlzaWduIHB1YmxpYyBrZXk6IEZEN0U1MzREODYzNjkzM0QKUldROWt6YUdUVk4rL2RrejJJblU0NzY1NGVXUmVlYWpNRmwzd3ppb2h2emtLb24zdnFXTFRjangK",
      "endpoints": [
        "https://github.com/Bullmoose-Code/releases/latest/download/latest.json"
      ]
    },
    "deep-link": {
      "desktop": {
        "schemes": ["vorevault"]
      }
    }
  },
```

⚠️ Do NOT change the existing `updater.endpoints` URL — keep it exactly as it was. Compare your edit to the original to confirm only an entry was added.

- [ ] **Step 2: Validate the JSON is still valid**

```bash
node -e "JSON.parse(require('fs').readFileSync('src-tauri/tauri.conf.json'))" && echo OK
```

Expected: prints `OK`. If a `SyntaxError` appears, fix the JSON (most likely a missing comma after the `updater` block's closing `}` or a stray trailing comma).

If `node` is not on PATH, alternative:

```bash
cargo build --manifest-path src-tauri/Cargo.toml --quiet
```

A malformed `tauri.conf.json` causes the build to fail at `tauri::generate_context!()` with a JSON-parse error from `tauri-build`.

- [ ] **Step 3: Run the test suite to confirm the build path is clean**

```bash
cargo test --manifest-path src-tauri/Cargo.toml --quiet
```

Expected: tests still pass; clean build.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/tauri.conf.json
git commit -m "feat(deeplink): register vorevault:// scheme in tauri.conf.json"
```

---

## Task 17: Wire `tauri-plugin-single-instance` in `main.rs`

**Files:**
- Modify: `src-tauri/src/main.rs`

The single-instance plugin must be registered **first** (before any plugin that allocates singleton state like the tray icon). Its callback fires when a second process is launched; we use it to forward any `vorevault://` argv to the running instance.

- [ ] **Step 1: Add the plugin to the builder chain in `main()`**

Open `src-tauri/src/main.rs`. The current builder chain (lines 25–34) reads:

```rust
    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
```

Change it so the single-instance plugin is FIRST in the chain, before any other plugin:

```rust
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            // Second-launch fired with a URL — forward to running instance.
            // The first argument is the executable path; skip it and look for
            // any vorevault:// URL in the remainder.
            for arg in argv.iter().skip(1) {
                if arg.starts_with("vorevault://") {
                    crate::deeplink::dispatch(app, arg);
                }
            }
        }))
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_autostart::init(
            tauri_plugin_autostart::MacosLauncher::LaunchAgent,
            None,
        ))
        .plugin(tauri_plugin_updater::Builder::new().build())
        .invoke_handler(tauri::generate_handler![
```

- [ ] **Step 2: Build and confirm no new warnings**

```bash
cargo build --manifest-path src-tauri/Cargo.toml --quiet
```

Expected: clean build. The closure type `|app: &AppHandle, argv: Vec<String>, cwd: PathBuf| { ... }` matches the plugin's expected signature; `_cwd` is intentionally underscore-prefixed (unused).

- [ ] **Step 3: Run tests**

```bash
cargo test --manifest-path src-tauri/Cargo.toml --quiet
```

Expected: same pass count as Task 16.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "feat(deeplink): wire tauri-plugin-single-instance — second-launch URL forwarding"
```

---

## Task 18: Wire `tauri-plugin-deep-link` + `on_open_url` listener in `main.rs`

**Files:**
- Modify: `src-tauri/src/main.rs`

- [ ] **Step 1: Add the plugin to the builder chain**

In `src-tauri/src/main.rs`, in the `tauri::Builder` chain (the one you edited in Task 17), add `.plugin(tauri_plugin_deep_link::init())` AFTER the single-instance plugin and BEFORE `tauri_plugin_opener::init()`. The relevant section becomes:

```rust
    tauri::Builder::default()
        .plugin(tauri_plugin_single_instance::init(|app, argv, _cwd| {
            for arg in argv.iter().skip(1) {
                if arg.starts_with("vorevault://") {
                    crate::deeplink::dispatch(app, arg);
                }
            }
        }))
        .plugin(tauri_plugin_deep_link::init())
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
```

- [ ] **Step 2: Add the `on_open_url` listener inside `setup`**

The current `setup` block in `main.rs` runs from line 49 to roughly line 68. It currently looks like:

```rust
        .setup(|app| {
            let handle = app.handle().clone();
            tray::install(&handle)?;
            crate::settings_window::install_close_handler(&handle);
            crate::updater::spawn_startup_check(handle.clone());
            try_enable_autostart_on_first_launch(&handle);

            std::thread::spawn(move || {
                let vault_url = auth::vault_url_from_env();
                tray::refresh_menu(&handle, &vault_url);

                if let Err(e) = start_pipeline_if_configured(&handle, &vault_url) {
                    log::warn!("could not start pipeline: {}", e);
                }

                tray::refresh_menu(&handle, &vault_url);
            });

            Ok(())
        })
```

⚠️ Note: the `let handle = app.handle().clone();` on line 50 is moved into the spawned thread. We need a separate clone for the deep-link listener, since the listener captures it via `move` and must outlive the `setup` closure call.

Change the `setup` block to:

```rust
        .setup(|app| {
            let handle = app.handle().clone();
            tray::install(&handle)?;
            crate::settings_window::install_close_handler(&handle);
            crate::updater::spawn_startup_check(handle.clone());
            try_enable_autostart_on_first_launch(&handle);

            // Deep-link listener: fires when a vorevault:// URL is delivered
            // by the OS (either at launch or later, while the app is running).
            // The single-instance plugin handles the second-launch path
            // separately; this listener handles the first-launch URL and any
            // subsequent same-process URL events (mostly relevant on macOS).
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                let deeplink_handle = app.handle().clone();
                app.deep_link().on_open_url(move |event| {
                    for url in event.urls() {
                        crate::deeplink::dispatch(&deeplink_handle, url.as_str());
                    }
                });
            }

            std::thread::spawn(move || {
                let vault_url = auth::vault_url_from_env();
                tray::refresh_menu(&handle, &vault_url);

                if let Err(e) = start_pipeline_if_configured(&handle, &vault_url) {
                    log::warn!("could not start pipeline: {}", e);
                }

                tray::refresh_menu(&handle, &vault_url);
            });

            Ok(())
        })
```

- [ ] **Step 3: Build to confirm everything compiles**

```bash
cargo build --manifest-path src-tauri/Cargo.toml --quiet
```

Expected: clean build. If you get `cannot find type 'DeepLinkExt' in this scope`, the `use` statement inside the inner block is missing; re-check that exactly the snippet above is in place.

- [ ] **Step 4: Run tests**

```bash
cargo test --manifest-path src-tauri/Cargo.toml --quiet
```

Expected: same pass count as Task 17.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "feat(deeplink): wire tauri-plugin-deep-link + on_open_url listener"
```

---

## Task 19: Dev-mode `register_all()` for `cargo tauri dev`

**Files:**
- Modify: `src-tauri/src/main.rs`

In production builds the installer registers the protocol with the OS. In `cargo tauri dev` no installer runs, so we register at startup using the plugin's `register_all()` API. This is gated on `debug_assertions` so production builds don't waste a syscall on every launch.

- [ ] **Step 1: Add the dev-mode registration block**

In `src-tauri/src/main.rs`, in the `setup` closure, add a `#[cfg(debug_assertions)]` block immediately AFTER `try_enable_autostart_on_first_launch(&handle);` and BEFORE the deep-link listener block:

```rust
            try_enable_autostart_on_first_launch(&handle);

            #[cfg(debug_assertions)]
            {
                use tauri_plugin_deep_link::DeepLinkExt;
                if let Err(e) = app.deep_link().register_all() {
                    log::warn!("deep-link: dev-mode register_all failed: {}", e);
                }
            }

            // Deep-link listener: fires when a vorevault:// URL is delivered
            // ...
            {
```

- [ ] **Step 2: Build to confirm both debug and release configs compile**

```bash
cargo build --manifest-path src-tauri/Cargo.toml --quiet
cargo build --manifest-path src-tauri/Cargo.toml --release --quiet
```

Expected: both clean. Release build excludes the `register_all` call entirely (the `#[cfg(debug_assertions)]` ensures it isn't even compiled in release).

- [ ] **Step 3: Run tests**

```bash
cargo test --manifest-path src-tauri/Cargo.toml --quiet
```

Expected: same pass count as Task 18.

- [ ] **Step 4: Commit**

```bash
git add src-tauri/src/main.rs
git commit -m "feat(deeplink): dev-mode register_all() for cargo tauri dev"
```

---

## Task 20: Verify capabilities cover the deep-link plugin

**Files:**
- Possibly modify: `src-tauri/capabilities/settings.json`

The deep-link plugin only emits Rust-side events (`on_open_url`); it does NOT expose webview-callable commands. So the existing `core:default` should be sufficient and no new ACL entry should be required. This task confirms that empirically.

- [ ] **Step 1: Build and run in dev mode**

```bash
cargo tauri dev --manifest-path src-tauri/Cargo.toml
```

(Stop the dev server with Ctrl-C once it's launched and you've seen the tray icon appear without ACL errors. The dev server prints any plugin permission errors at startup or when the listener registers.)

Expected: app launches, tray icon appears, no `permission denied` or `acl: denied` log lines. If you see something like `permission denied for plugin 'deep-link'`, jump to Step 2.

- [ ] **Step 2: If a permission error appeared, add the deep-link permission to `settings.json`**

Only do this step if Step 1 surfaced a permission error. Open `src-tauri/capabilities/settings.json` and add `"deep-link:default"` to the `permissions` array — alphabetical ordering, near `"opener:default"`:

```json
  "permissions": [
    "core:default",
    "core:event:default",
    "core:webview:default",
    "core:window:default",
    "deep-link:default",
    "opener:default",
    ...
  ]
```

Re-run Step 1 to confirm the error is gone.

- [ ] **Step 3: Run tests**

```bash
cargo test --manifest-path src-tauri/Cargo.toml --quiet
```

Expected: tests still pass.

- [ ] **Step 4: Commit (only if a change was needed in Step 2; otherwise skip the commit)**

If you modified `settings.json`:

```bash
git add src-tauri/capabilities/settings.json
git commit -m "feat(deeplink): grant deep-link:default capability to settings window"
```

If no change was needed, document the verification in the next task's commit message instead.

---

## Task 21: `cargo fmt` + `cargo clippy`

**Files:**
- Possibly modify: any of the touched files (re-formatting only)

The repo's CI workflow runs both `cargo fmt --check` and `cargo clippy -- -D warnings` per `.github/workflows/ci.yml`. Run them locally before opening the PR.

- [ ] **Step 1: Run `cargo fmt`**

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml
```

Expected: no output (or quiet output indicating files were re-formatted). Check `git status --short`.

- [ ] **Step 2: Run `cargo clippy` with the same strictness as CI**

```bash
cargo clippy --manifest-path src-tauri/Cargo.toml --all-targets -- -D warnings
```

Expected: clean run with no warnings. Common things clippy might flag:
- `clippy::needless_borrow` — fix by removing the unnecessary `&`
- `clippy::redundant_closure` — fix by passing the function reference directly
- `clippy::single_match` — fix by using `if let`

Fix each one inline. If clippy flags something that requires a real refactor (rare for new code following the patterns above), pause and ask before changing.

- [ ] **Step 3: Run the full test suite to confirm formatting / clippy edits did not break anything**

```bash
cargo test --manifest-path src-tauri/Cargo.toml --quiet
```

Expected: same pass count as Task 20.

- [ ] **Step 4: Commit**

```bash
git add -u src-tauri
git commit -m "style: cargo fmt + clippy for deeplink module"
```

(If `git status --short` shows no changes, this commit isn't needed — `cargo fmt` was a no-op and clippy was already clean. Skip the commit and continue.)

---

## Task 22: Bump version to v0.7.0

**Files:**
- Modify: `src-tauri/Cargo.toml`
- Modify: `src-tauri/tauri.conf.json`
- Modify: `Cargo.lock` (auto-updated)

- [ ] **Step 1: Bump `src-tauri/Cargo.toml`**

Open `src-tauri/Cargo.toml`. Change line 3 from:

```toml
version = "0.6.0"
```

to:

```toml
version = "0.7.0"
```

- [ ] **Step 2: Bump `src-tauri/tauri.conf.json`**

Open `src-tauri/tauri.conf.json`. Change line 4 from:

```json
  "version": "0.6.0",
```

to:

```json
  "version": "0.7.0",
```

- [ ] **Step 3: Run `cargo build` to update `Cargo.lock`**

```bash
cargo build --manifest-path src-tauri/Cargo.toml --quiet
```

Expected: `Cargo.lock` is updated with the new package version (the `[[package]] name = "vorevault" version = "0.6.0"` entry becomes `0.7.0`).

- [ ] **Step 4: Run tests**

```bash
cargo test --manifest-path src-tauri/Cargo.toml --quiet
```

Expected: same pass count.

- [ ] **Step 5: Commit**

```bash
git add src-tauri/Cargo.toml src-tauri/tauri.conf.json Cargo.lock
git commit -m "chore: bump to v0.7.0 — vorevault:// deep-link protocol"
```

---

## Task 23: Manual verification (pre-PR smoke test)

**Files:** none (manual testing)

The spec's full manual matrix runs at pre-tag time on clean Win + Mac VMs with the produced installers. Before opening the PR, run a minimal sanity check on the dev build to confirm the protocol path is wired.

- [ ] **Step 1: Run the dev build**

```bash
cargo tauri dev --manifest-path src-tauri/Cargo.toml
```

Wait for the tray icon to appear (and any `register_all` log output to settle). Leave the dev server running.

- [ ] **Step 2: Trigger a deep link from the OS**

**Windows (in a separate terminal):**

```bash
start vorevault://open/files/test-uuid-123
```

**macOS (in a separate terminal):**

```bash
open 'vorevault://open/files/test-uuid-123'
```

- [ ] **Step 3: Verify in the dev server log output**

Expected log lines (in the `cargo tauri dev` terminal):

```
[INFO  vorevault::deeplink] deep link → https://vault.bullmoosefn.com/files/test-uuid-123
```

Default browser should also open to that URL (which will 404 because `test-uuid-123` is not a real file — that's fine; we're testing the routing, not the file existence).

If the log line does not appear:
- Check that `register_all()` ran successfully (look for the `dev-mode register_all` warning if it did NOT run).
- On macOS only: `register_all()` may need a re-run after a fresh `cargo tauri dev` if the OS hasn't seen this build before. Restart the dev server.
- Confirm the URL scheme is registered: on Windows, `reg query HKCU\Software\Classes\vorevault` should show an entry; on macOS, `osascript -e 'tell application "System Events" to ...'` is overkill — just check that `open vorevault://...` produces SOMETHING (the `cargo tauri dev` process should receive the event even if the OS would otherwise show "no app found").

- [ ] **Step 4: Trigger a malformed deep link to confirm the rejection path**

**Windows:**

```bash
start vorevault://attacker.example.com/files/abc
```

**macOS:**

```bash
open 'vorevault://attacker.example.com/files/abc'
```

Expected log line:

```
[WARN  vorevault::deeplink] deep link: rejected input "vorevault://attacker.example.com/files/abc": host must be 'open'
```

No browser tab should open.

- [ ] **Step 5: Stop the dev server**

Ctrl-C in the `cargo tauri dev` terminal.

- [ ] **Step 6: No commit needed for this task — manual verification only**

---

## Task 24: Open the PR

**Files:** none (git + GitHub operation)

- [ ] **Step 1: Push the branch**

```bash
git push -u origin feat/deeplink-protocol
```

- [ ] **Step 2: Open the PR using `gh`**

```bash
gh pr create --title "feat: vorevault:// deep-link protocol (Theme 1.3 / v0.7.0)" --body "$(cat <<'EOF'
## Summary
- Registers a `vorevault://` URL scheme on Windows + macOS at install time.
- Translates `vorevault://open/<vault-path>` to `https://<vault>/<vault-path>` and opens it in the user's default browser.
- Single-instance behavior: clicks while the app is already running do not spawn a second tray icon.

## Files changed
- `src-tauri/src/deeplink.rs` (NEW) — pure URL translation + Tauri-aware dispatch.
- `src-tauri/src/main.rs` — `mod deeplink;`, two new plugins, `on_open_url` listener, dev-mode `register_all()`.
- `src-tauri/Cargo.toml` — `tauri-plugin-deep-link`, `tauri-plugin-single-instance` (with `deep-link` feature).
- `src-tauri/tauri.conf.json` — `plugins.deep-link.desktop.schemes: ["vorevault"]`. Version bumped to 0.7.0.

## Spec
[`docs/superpowers/specs/2026-04-29-desktop-theme-1-3-deeplink-protocol-design.md`](https://github.com/Bullmoose-Code/vorevault/blob/spec/desktop-theme-1-3/docs/superpowers/specs/2026-04-29-desktop-theme-1-3-deeplink-protocol-design.md) (in the vorevault repo, on branch `spec/desktop-theme-1-3`).

## Test plan
- [x] `cargo test` — all existing tests + 19 new deeplink unit tests passing.
- [x] `cargo build` — clean (zero warnings, zero errors).
- [x] `cargo clippy --all-targets -- -D warnings` — clean.
- [x] `cargo fmt --check` — clean.
- [ ] Manual: install MSI on a clean Windows VM; click `vorevault://open/files/abc-123` from Run dialog with app NOT running → app launches, browser opens to vault file page.
- [ ] Manual: same, with app already running in tray → URL handled by running instance, no second tray icon.
- [ ] Manual: malformed `vorevault://evil.com/x` → logged warning, no browser opened.
- [ ] Manual: `reg query HKCU\Software\Classes\vorevault` after install → registry entry present.
- [ ] Manual: macOS clean install → same two scenarios.
- [ ] Manual: `plutil -p VoreVault.app/Contents/Info.plist | grep -A3 CFBundleURLTypes` → `vorevault` scheme present.
- [ ] Tag `v0.7.0` after merge to trigger CI installer build.

## Companion vault-repo PR
A separate, smaller PR in `Bullmoose-Code/vorevault` adds a "Copy desktop link" button to the file detail page so users can grab a `vorevault://` URL to paste into Discord. Not blocking — the desktop protocol works for any future producer.

## Known follow-ups (non-blocking)
- Tray-toast click → file detail page is blocked on `tauri-plugin-notification` v2 click-callback support; will consume `deeplink::dispatch` once that's available. Filed as a future Theme 1 item.
- Spot-check whether `tauri-plugin-updater`'s MSI updater path actually re-runs registry-writing install actions when a v0.6.0 user auto-updates to v0.7.0 (vs. only fresh installs getting the protocol). If not, document a reinstall step in `RELEASING.md`.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

- [ ] **Step 2 (alternative if `gh` is unavailable):**

Push the branch (already done in Step 1) and open the PR manually via the GitHub web UI at `https://github.com/Bullmoose-Code/vorevault-desktop/compare/feat/deeplink-protocol`.

---

## Self-review notes (this plan vs. the spec)

The plan covers each spec section as follows:

| Spec section | Covered by tasks |
|---|---|
| Goal (3 user outcomes) | Tasks 2–14 (translate + dispatch implements outcome 1+2); outcome 3 is the vault-repo PR, deferred per plan header. |
| Non-goals | No tasks — explicitly excluded. |
| Architecture | Tasks 1, 14, 17–19 wire the modules + plugins per the diagram. |
| File structure (deeplink.rs, main.rs, Cargo.toml, tauri.conf.json) | Tasks 1, 15, 16, 17–19. |
| Bundler config (tauri.conf.json deep-link block) | Task 16. |
| Registration in main.rs | Tasks 17–19. |
| `deeplink.rs` translate() | Tasks 2–13. |
| `deeplink.rs` dispatch() | Task 14. |
| Capabilities (ACL) | Task 20. |
| URL grammar | Tasks 2 (path-passthrough), 3 (scheme), 4 (host), 5 (credentials), 6 (port), 7 (path), 8 (root), 9 (query), 10 (fragment), 12 (case). |
| Translation truth table | Tasks 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13 collectively cover every row. |
| Security model | Implicitly satisfied by validator tasks; no separate security task because security IS the validator. |
| Single-instance behavior | Task 17 (handler) + Task 18 (the runtime path it integrates with). |
| Vault-side companion | Out of scope — flagged in plan header. |
| Error handling | Task 14 (dispatch's log-only behavior); validator tasks cover translation rejection paths. |
| Logging | Task 14 (`log::info!` and two `log::warn!` calls). |
| Unit tests | Tasks 2–13 (19 unit tests total). |
| Integration tests | None — spec explicitly skipped (third-party plugin boundary). |
| Manual matrix | Task 23 (minimal dev-build smoke test). Full matrix listed in PR body for pre-tag run. |
| Versioning + release plan | Task 22 (bump) + Task 24 (PR with tag-trigger note). |

No placeholders ("TBD", "TODO", "implement later", or vague "add error handling" steps) appear in any task — checked by grep.

Type / API name consistency: `translate(input: &str, vault_url: &str) -> Result<String, DeepLinkError>` is used identically across Tasks 2–14, including the dispatch wrapper. `DeepLinkError` variant names (`Parse`, `BadScheme`, `BadHost`, `HasCredentials`, `HasPort`, `BadPath`) are used consistently across Tasks 1, 3–7, 13.

If a task surfaces a discrepancy with the spec, stop and report — the spec is the contract, the plan is the implementation route.
