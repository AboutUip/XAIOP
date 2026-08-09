# Status and Versioning

[English](status-and-versioning.md) · [简体中文](status-and-versioning.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `META-VER` |
| Status | **Frozen** |
| Version | 0.6.0 |
| Last updated | 2026-08-04 |
| Normative | **Normative** |
| Depends on | `META-CONV` |
| Informs | All specification documents |

---

## 1. Scope

This document defines:

1. Document **status** labels.  
2. **Protocol package** versioning and freeze (seal) rules.  
3. How protocol packages relate to **SDK package** versions and **GitHub Releases**.  
4. What **MUST NOT** be rewritten after a version is sealed.

English text is authoritative. Chinese mirrors **MUST** match normative meaning.

---

## 2. Core rule (normative)

**A sealed protocol package version is immutable for that version number.**

1. **Frozen** means: the normative wire text for package version `X.Y.Z` is **sealed**. It does **not** mean “whatever is currently at the tip of the default branch.”  
2. Breaking or meaning-changing work for a **new** package version **MUST** proceed under status **`Draft`** (or an explicit unreleased draft SemVer such as `0.6.0-draft`) until that new version is sealed as **`Frozen`**.  
3. Sealing a new version **MUST NOT** alter the normative text of any previously sealed package version. Prior versions remain **Frozen** and citable.  
4. Published **SDK** package versions (npm, Maven, etc.) **MUST NOT** be mutated in place. Fixes and behavior changes **MUST** ship as **new** SDK package versions. This matches the immutability model of [GitHub Releases](https://docs.github.com/en/repositories/releasing-projects-on-github/about-releases): each release is a fixed artifact; history is additive.

---

## 3. Document status

Every specification document **MUST** declare exactly one status:

| Status | Meaning |
| --- | --- |
| `Reserved` | Placeholder; content is **not** normative |
| `Draft` | Working text for a **not-yet-sealed** package version; **MAY** change incompatibly |
| `Frozen` | Sealed normative text for a **numbered** protocol package version |
| `Deprecated` | Superseded for *new* work; prior sealed text remains citable |
| `Withdrawn` | No longer part of the specification set |

### 3.1 Frozen vs tip of tree

| Concept | Meaning |
| --- | --- |
| **Sealed package `X.Y.Z`** | Immutable normative claim for that version |
| **Repository default branch** | **MAY** contain Draft work for a *future* package version, editorial mirrors, SDK code, and practice docs |
| **Claiming conformance** | Implementations **MUST** name the sealed protocol package version (e.g. `0.5.0`), **not** “latest Frozen” without a number |

### 3.2 Working-tree tip for package 0.5.0

Protocol wire documents that declare **Version `0.6.0`** and **Status `Frozen`** constitute the sealed **0.6.0** package in this repository snapshot.

If editors open **0.6.0** (or any newer package) as Draft, those Draft documents **MUST** use the new version number in headers. Sealed **0.5.0** headers **MUST NOT** be used for Draft text.

---

## 4. Protocol package SemVer

1. The protocol package version appears in document headers (e.g. `0.5.0`).  
2. A **`Frozen`** package version **MUST** use plain SemVer **without** `-draft`.  
3. A package version under active incompatible revision **MUST** be marked **`Draft`** (header Version **MAY** use `X.Y.Z-draft` until seal).  
4. Change classes:

| Change class | Version action | Status while editing |
| --- | --- | --- |
| Editorial only (no normative meaning change) | If a Git tag for this package already exists, **MUST NOT** rewrite that tag’s bytes. Prefer an errata note, or seal a **new** patch number (e.g. `0.5.1`) that contains only editorial fixes | Errata or new patch **`Draft`→`Frozen`** |
| Additive wire or any change that alters conformance outcomes | **MUST** assign a **new** package number and seal it as **`Frozen`** after **`Draft`**. Prior sealed numbers stay immutable | New number **`Draft`**, then **`Frozen`** |
| Breaking wire (invalidates prior conforming documents or parsers) | Same as additive: **new** package number under **`Draft`** until sealed. Under **0.x**, bump **minor** (e.g. `0.5.0` → `0.6.0`). After **1.0.0** is declared, bump **major** for breaks | New number **`Draft`** until sealed; prior sealed versions stay **`Frozen`** |

5. Under **0.x**, the project treats **minor** bumps as the primary vehicle for both additive and breaking protocol packages unless a **1.0.0** Stable series is declared later. Callers **MUST** still pin an exact `X.Y.Z`.

### 4.1 Sealed package registry (this repository)

| Protocol package | Status | Notes |
| --- | --- | --- |
| `0.6.0` | **Frozen** | Current sealed wire in this tree (includes `#` custom annotation transmission) |
| `0.5.0` | **Frozen** (historical) | `&path` delete; do not rewrite; cite by version |
| `0.4.0` | **Frozen** (historical) | Prior sealed package; do not rewrite; cite by version |
| `0.3.0` | **Frozen** (historical) | Prior sealed package |
| Older 0.2.x / 0.1.x | **Frozen** or superseded as listed in [revisions.md](revisions.md) | Cite by version |

Exact change summaries: [revisions.md](revisions.md). Release tags: [releases.md](releases.md).

---

## 5. SDK packages (normative relationship)

1. An SDK package version (e.g. npm `@bylan280/xaiop@0.15.1`) **MUST** declare which **sealed** protocol package version(s) it implements (e.g. `PROTOCOL_VERSION = "0.6.0"`).
2. Publishing a new SDK version **MUST NOT** rewrite a previously published SDK version’s artifacts or changelog entries for that version number.  
3. Protocol package history and SDK package history are **separate**. Protocol [revisions.md](revisions.md) **MAY** *mention* which SDK release first implemented a wire version; it **MUST NOT** be the sole mutable changelog for SDK packages.  
4. An old SDK release that targeted protocol `0.4.0` remains a valid artifact for `0.4.0` even after protocol `0.5.0` is sealed.

---

## 6. GitHub Releases (project policy)

Editors **SHOULD** publish immutable GitHub Releases whose tags identify sealed artifacts, for example:

| Tag pattern | Points at |
| --- | --- |
| `protocol-v0.5.0` | Sealed protocol package `0.5.0` (docs + fixtures) |
| `sdk-nodejs-v0.15.0` | Node.js SDK package `0.15.0` |
| `sdk-nodejs-v0.14.3` | Node.js SDK package `0.14.3` |
| `sdk-nodejs-v0.14.2` | Node.js SDK package `0.14.2` |
| `sdk-nodejs-v0.14.1` | Node.js SDK package `0.14.1` |
| `sdk-nodejs-v0.14.0` | Node.js SDK package `0.14.0` |
| `sdk-nodejs-v0.13.0` | Node.js SDK package `0.13.0` |
| `sdk-nodejs-v0.12.0` | Node.js SDK package `0.12.0` |
| `sdk-nodejs-v0.11.0` | Node.js SDK package `0.11.0` |

1. After a tag is published, **MUST NOT** force-move that tag to different normative bytes.  
2. Corrections after seal **MUST** use a **new** version number and a **new** tag.  
3. See [releases.md](releases.md) for the living index.

---

## 7. Change policy for a sealed (`Frozen`) package

For package version `X.Y.Z` once **Frozen**:

1. **MUST NOT** change normative meaning in place under the same `X.Y.Z` after a GitHub `protocol-vX.Y.Z` (or equivalent) release exists.  
2. Non-normative typo fixes in the working tree **MAY** be applied only if they do not change conformance; if a sealed tag already exists, republish as **`X.Y.(Z+1)`** (or next allowed number) with an explicit revisions entry.  
3. Chinese mirrors **MUST** ship in the same change set as English when normative meaning changes (always as a **new** package version).  
4. Practice and SDK documents **MUST NOT** redefine sealed wire rules; conflicts → **protocol package text for the cited version wins**.

---

## 8. Reserved documents

A `Reserved` document or index entry:

1. **MUST NOT** be cited as establishing conformance requirements.  
2. **MAY** list planned Document IDs and titles.  
3. **MUST** state that syntax and semantics are not yet sealed.

Planned IDs (not sealed in 0.5.0): `PROT-DATA-MODEL` (abstract data model — **not** “LLM model”), `PROT-ERROR`, `PROT-EXT` (names subject to change before seal).

---

## 9. Repository README prose

The repository root README **MAY** describe product maturity in prose.  
For conformance, **only** sealed protocol package version numbers and statuses defined here are authoritative.
