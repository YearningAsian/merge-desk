---
name: firecrawl-web-scraping
description: "Use when: scraping data, converting HTML to clean markdown, or ingesting webpage context."
---

# Firecrawl Web Scraping

## Core Directives
- Format all raw web data to clean, legible Markdown before returning or processing it.
- Ignore raw, messy HTML in the context window.

## Execution Rules
1. Strip scripts, styles, and boilerplate DOM wrapper tags.
2. Structure the data using semantic markdown headers and tables.
3. Output the scraped markdown to a temporary background file instead of cluttering chat context.