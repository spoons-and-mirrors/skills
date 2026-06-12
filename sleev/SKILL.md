---
name: sleev
description: Install Sleev and use the public Sleev CLI commands. Use when the user asks how to install sleev, set up sleev, check sleev status, manage the daemon, configure a coding tool, or update sleev.
---

# Sleev

## Install

Run Sleev without installing it globally:

```bash
npx sleev
```

Install the `sleev` command globally:

```bash
npm install -g sleev
sleev
```

## Setup

Launch the setup UI:

```bash
sleev
```

Sign in from the CLI:

```bash
sleev auth login
```

Configure a supported coding tool:

```bash
sleev setup claude
sleev setup codex
sleev setup opencode
```

## Status

Check Sleev and daemon status:

```bash
sleev status
sleev daemon status
```

Show local config and data paths:

```bash
sleev paths
```

Check auth state:

```bash
sleev auth status
```

## Daemon

Start, restart, or stop the local daemon:

```bash
sleev daemon start
sleev daemon restart
sleev daemon stop
```

## Updates And Sign Out

Update Sleev:

```bash
sleev upgrade
```

Sign out and clean up local auth:

```bash
sleev auth logout
```
