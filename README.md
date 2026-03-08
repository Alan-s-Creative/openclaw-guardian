# OpenClaw Guardian

Monitor and protect your OpenClaw config. Auto-snapshot on every change, restore with one command, LLM-assisted recovery when things break.

## Features

- **Config Watcher** — detects changes and corruption in real-time
- **Version Snapshots** — keeps 20 rolling snapshots with OpenClaw version + diff
- **LLM Fix Engine** — AI-assisted config repair
- **Upgrade Wizard** — safe upgrades with automatic rollback
- **Version Manager** — switch between OpenClaw versions safely

## Install

```bash
npm install -g @openclaw-guardian/cli
```

## Usage

```bash
guardian watch         # start watching
guardian status        # current status
guardian history       # list 20 snapshots
guardian restore       # interactive restore
guardian fix           # LLM-assisted fix
guardian upgrade       # upgrade OpenClaw
guardian versions      # list available versions
```

## App

Download the macOS / Windows app from [Releases](https://github.com/Alan-s-Creative/openclaw-guardian/releases).
