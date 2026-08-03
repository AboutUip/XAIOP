# Glossary

[English](glossary.md) · [简体中文](glossary.zh-CN.md)

| Field | Value |
| --- | --- |
| Document ID | `TERM-GLOSS` |
| Status | **Frozen** |
| Version | 0.2.1 |
| Last updated | 2026-08-03 |
| Normative | **Normative** (definitions) |
| Depends on | `META-CONV`, `OV-PRIN` |
| Informs | `REQ-FUNC`, `REQ-STREAM`, `CONF`, `protocol/*` |

---

## 1. Scope

This glossary defines terms used across the XAIOP specification.  
When a term appears in normative text with the meaning below, it is written capitalized as shown (English authoritative form).

Structure Layer terms in Section 3 are normative for `PROT-BOUND` / `PROT-HIER` and related documents.

---

## 2. Core Actors

### 2.1 XAIOP

**XAIOP** (eXtensible AI Output Protocol) is the protocol defined by this specification document set.

### 2.2 Generator

A **Generator** is an entity that produces XAIOP text. A Generator is typically an LLM operating under prompts, tools, or other constraints, but the protocol does not require a specific model.

### 2.3 Parser

A **Parser** is an entity that interprets XAIOP text according to the protocol and yields structured results or deterministic error outcomes.

### 2.4 Consumer

A **Consumer** is application logic that uses Parser output (Blocks, Streams, or derived structures) for its own purposes.

### 2.5 Downstream System

A **Downstream System** is any system that receives data from a Consumer or Parser for storage, transformation, display, or further processing.

### 2.6 Encoder (SDK)

An **Encoder** (implementation term) maps a JSON-compatible value to Well-Formed XAIOP text. The Node.js SDK encoder emits **strict** wire only; it is a tool **Generator** path, distinct from an LLM Generator. See [sdk/nodejs/encode.md](../sdk/nodejs/encode.md).

---

## 3. Structure Layer Terms

### 3.1 Block

A **Block** is the protocol’s **smallest integrated container carrier**.  
A Block is **not** the “smallest data atom”; it is a container and **MAY** carry Content of arbitrary length.

### 3.2 Label

A **Label** is a string that appears on a line by itself and declares / locates a Block. A Label **MAY** carry a Cursor operator prefix.

### 3.3 Cursor

A **Cursor** is the Parser’s current reference position in the hierarchy tree, determined by the sequence of Labels processed so far.

### 3.4 Root

**Root** is the initial / top-level reference position of the hierarchy tree, the default starting point of the Cursor, and the target of the `.` operator.

When a Stream opens with `>` or `-`, that anonymous container is the complete document root value.  
Omitting them and using `>name` yields a **root fragment** (notation `"a":{}`) with **no** outer anonymous object — **not** `{"a":{}}` (`PROT-SYNTAX` §2).

### 3.5 Content

**Content** is all material after a Label line and before the next Label line. Content belongs to the Block addressed by the current Label.

### 3.6 Bare Label

A **Bare Label** is a Label line that is only a name with **no** Cursor operator (for example a line `data`). Bare Labels are **prohibited** (`PROT-HIER`). They are syntax errors.

### 3.7 Cursor Operator

A **Cursor Operator** is one of: `>` / `>name` (create/enter object; empty `>` always enters), `<` (pop one level only; illegal at Root), `<name` (pop then enter name), `=`, `!`, `.`, and `-` / `>name-` (open arrays).

### 3.8 Structure Layer

The **Structure Layer** covers boundary and hierarchy (`PROT-BOUND`, `PROT-HIER`) with grammar entry `PROT-SYNTAX`.

### 3.9 Content Layer

The **Content Layer** defines Content encoding and minimal typing (`PROT-CONTENT`), with grammar entry `PROT-SYNTAX`.

### 3.10 Anonymous Object

An **Anonymous Object** is an object created by empty `>` with no name segment. It **MUST** still be created by a Cursor operator; it is not a Bare Label.
---

## 4. Stream and Parse Outcomes

### 4.1 Stream

A **Stream** is an ordered sequence of XAIOP text as emitted over time. A Stream may be finite or conceptually open-ended until terminated by application or transport.

### 4.2 Well-Formed

Input is **Well-Formed** when it satisfies all normative syntactic and structural rules of the applicable protocol documents (including Structure Layer rules once claimed).

### 4.3 Malformed

Input is **Malformed** when it is not Well-Formed. Conforming Parsers **MUST NOT** be required to guess intent for Malformed input (P7, NG3).

### 4.4 Deterministic Parse

A **Deterministic Parse** yields the same abstract result (or the same error class) for the same Well-Formed input across conforming Parsers, given the same protocol version.

### 4.5 Parse Error

A **Parse Error** is a deterministic failure outcome when input is Malformed or violates a normative constraint. Silent success on Malformed input is not a conforming behavior.

### 4.6 Partial Result

A **Partial Result** is Consumer-visible structure obtained from a prefix of a Stream that contains one or more complete Blocks, without requiring end-of-stream (`PROT-STREAM`).

---

## 5. Conformance Vocabulary

### 5.1 Conformance Level

A **Conformance Level** is a named subset of requirements against which an implementation may claim conformity (see `CONF`).

### 5.2 Profile

A **Profile** is a named combination of Conformance Levels or optional feature sets.

---

## 6. Document Terms

### 6.1 Normative

**Normative** text defines requirements that affect conformance claims.

### 6.2 Informative

**Informative** text does not by itself establish conformance requirements.

### 6.3 Document ID

A **Document ID** is the stable short identifier in a document header (e.g. `TERM-GLOSS`).
