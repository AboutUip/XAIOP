# Status and Versioning

[English](status-and-versioning.md) · [简体中文](status-and-versioning.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `META-VER` |
| Status | **Frozen** |
| Version | 0.1.0 |
| Last updated | 2026-08-02 |
| Normative | **Normative** |
| Depends on | `META-CONV` |
| Informs | All specification documents |

---

## 1. Scope

Document **status** labels, the specification **package version**, and change policy.

---

## 2. Document Status

Every specification document **MUST** declare exactly one status:

| Status | Meaning |
| --- | --- |
| `Reserved` | Placeholder; content is not normative |
| `Draft` | Active working text; may change incompatibly |
| `Frozen` | Sealed normative text for a numbered package; changes require a new package version |
| `Stable` | Accepted for a formally released Stable series |
| `Deprecated` | Superseded; retained for reference |
| `Withdrawn` | No longer part of the specification |

### 2.1 Current phase

Protocol wire documents in this package are **`Frozen`** at package version **`0.1.0`**.  
Foundation / requirements documents that remain editorial scaffolding **MAY** still say `Draft` until editors promote them; when they contradict Frozen protocol text, **protocol text wins**.

---

## 3. Specification Package Version

1. The package version appears in document headers (e.g. `0.1.0`).  
2. **`Frozen`** packages use a plain SemVer without `-draft`.  
3. Incompatible changes to Frozen protocol documents **MUST** bump the package version (at least minor for additive clarifying edits that change normative meaning; major for breaking wire changes).

### 3.1 Current Package

| Field | Value |
| --- | --- |
| Package version | `0.1.0` |
| Protocol status | **Frozen** (sealed) |
| Design phase | Phase 1 — Protocol sealed; implementations not required |

---

## 4. Change Policy (Frozen)

While protocol documents are `Frozen` at `0.1.0`:

1. Editorial typos that do not change meaning **MAY** be fixed in place.  
2. Normative meaning changes **MUST** be published as a new package version.  
3. Chinese mirrors **MUST** stay in the same change set as English authoritative text whenever normative meaning changes.

---

## 5. Reserved Documents

A `Reserved` document or index entry:

1. **MUST NOT** be cited as establishing conformance requirements.  
2. **MAY** list planned Document IDs and titles.  
3. **MUST** state that syntax and semantics are forthcoming.

Planned / not in this freeze: `PROT-MODEL`, `PROT-ERROR`, `PROT-EXT` (if introduced later).

---

## 6. Relationship to Repository Status

The repository root README may describe project maturity in prose.  
Specification status labels in this document set are authoritative for conformance discussion.
