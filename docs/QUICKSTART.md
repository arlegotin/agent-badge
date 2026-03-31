# Quickstart

Use this guide to install `agent-badge`, initialize your repository, and keep badge totals current.

## Install

```bash
npm init agent-badge@latest
```

## Initialize

Run initialization in the repository you want to badge:

```bash
agent-badge status
```

If setup has not been completed yet, run:

```bash
agent-badge init
```

## Refresh

Update local totals from new provider sessions:

```bash
agent-badge refresh
```

## Publish

Push updated aggregate badge JSON to the configured public gist:

```bash
agent-badge publish
```
