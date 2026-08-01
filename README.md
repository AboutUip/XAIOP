# XAIOP

> **eXtensible AI Output Protocol** — structured output between LLMs and software

[English](README.md) · [简体中文](README.zh-CN.md)

---

XAIOP is an **AI-native** wire protocol. Models write it; programs parse it deterministically. It is **not** a replacement for JSON between services — it is the bridge from generation to your application.

```text
LLM  →  XAIOP  →  SDK / Parser  →  JSON & your app
```

**Protocol v0.1.0 is Frozen.** Node.js SDK is available; Java and Python are pending.

---

## Start here

| I want to… | Go to |
| --- | --- |
| Understand the idea | [Why XAIOP](#why-xaiop) below, then [docs overview](docs/overview/introduction.md) |
| Read the wire format | [docs/protocol/syntax.md](docs/protocol/syntax.md) |
| Use the SDK | [docs/sdk/](docs/sdk/) · code in [xaiop-sdk/](xaiop-sdk/) |
| Teach a model the format | [skills/xaiop/SKILL.md](skills/xaiop/SKILL.md) |
| Try a quick parse | [demos/nodejs/](demos/nodejs/) |
| See a full example | [docs/examples/complex.xaiop](docs/examples/complex.xaiop) |

Documentation is split into **Protocol** and **SDK**. English is authoritative; `*.zh-CN.md` mirrors exist throughout.

---

## Why XAIOP?

JSON asks models to keep braces, commas, and nesting perfect over long generations. That is brittle under streaming and long context.

XAIOP is built the other way around: **line-oriented structure**, **cursor navigation**, **no brace pairing**, **no hashes or length math for the model**, **deterministic parse with no silent repair**.

Details live in the [design principles](docs/overview/design-principles.md) — this page stays a front door.

---

## Repository map

```text
docs/           Protocol + SDK documentation
xaiop-sdk/      Runtimes (nodejs · java · python)
skills/         Single Skill for model integration
demos/          Runnable examples
```

| Stack | Status |
| --- | --- |
| **Node.js** | Parse + Engine APIs · [docs](docs/sdk/nodejs/) · [code](xaiop-sdk/nodejs/) |
| Java | Pending update |
| Python | Pending update |

---

## License

[MIT](LICENSE)
