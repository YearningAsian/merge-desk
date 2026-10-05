---
name: composio-tools
description: "Use when: needing cross-talk with external SaaS tooling securely (GitHub, Slack, Jira, Notion)."
---

# Composio API Structure

## Core Directives
- When interfacing with external systems, enforce structured, type-safe JSON payloads.
- Always require authentication context checks before formulating requests.

## Execution Rules
1. Use predefined tool schemas for external integrations.
2. Do not leak API keys in plain text; assume token usage through environment variables.