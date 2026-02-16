# CLAUDE.md - Phylax Landing Page

## Project Overview

Phylax is a child protection platform that provides real-time AI-powered content analysis via browser extensions and mobile apps. This repository contains the **landing page and interactive demo** for the product.

## Architecture

**This is a zero-dependency, single-file static website.** There is no framework, no build step, no package manager.

| Aspect | Details |
|--------|---------|
| Type | Static single-page site |
| Framework | None — vanilla HTML, CSS, JavaScript |
| Files | 1 file: `index.html` (~2,245 lines, ~80 KB) |
| Build tool | None |
| Dependencies | None |
| Deployment | Vercel (git-based, auto-deploy) |
| Domain | `phylax-landing.vercel.app` |

### File Structure

```
phylax-landing/
├── index.html          # Entire site (HTML + embedded CSS + embedded JS)
├── CLAUDE.md           # This file
└── .git/
```

### index.html Internal Structure

| Section | Lines (approx) | Content |
|---------|----------------|---------|
| `<head>` meta | 1–9 | Charset, viewport, title, description |
| `<style>` CSS | 10–1493 | Full stylesheet with CSS variables, components, animations, responsive breakpoints |
| `<body>` HTML | 1494–1789 | Navigation, hero, features, process, privacy, pricing, footer, modals |
| `<script>` JS | 1790–2245 | Modal logic, demo interactivity, Gemini AI chat, localStorage persistence |

## Design System

### CSS Custom Properties

```css
--bg0: #070A12       /* Primary dark background */
--bg1: #0A1022       /* Secondary background */
--accent1: #7C5CFF   /* Purple — primary accent */
--accent2: #22D3EE   /* Cyan — secondary accent */
--accent3: #34D399   /* Green — success/positive */
--warn: #FBBF24      /* Amber — warnings */
--bad: #FB7185       /* Red — errors/blocked */
--ok: #60A5FA        /* Blue — informational */
--radius: 18px       /* Standard border radius */
```

### Typography

- Body: `ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, Helvetica, Arial, sans-serif`
- Code/mono: `ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace`

### Theme

- Dark mode only
- Glassmorphic cards with `backdrop-filter: blur()`
- High-contrast white text (92% opacity)
- Gradient backgrounds and accent borders

## Naming Conventions

| Context | Convention | Examples |
|---------|-----------|----------|
| CSS classes | kebab-case | `.feature-card`, `.nav-inner`, `.pricing-card` |
| HTML IDs | camelCase | `#demoOverlay`, `#accessModal`, `#chatHistory` |
| JS functions | camelCase | `openModal()`, `submitRule()`, `switchTab()` |
| CSS variables | kebab-case | `--bg0`, `--accent1` |

## Key Features

### Landing Page Sections
1. **Sticky Navigation** — Logo + brand + anchor links
2. **Hero** — Main value prop with CTA ("Try Interactive Demo")
3. **Feature Grid** — 3-column card layout
4. **How Phylax Protects** — Step-by-step process
5. **Privacy Section** — Privacy-by-design messaging
6. **Pricing** — 3 tiers: Foundation (Free), Plus ($9.99/mo), Guardian ($19.99/mo)
7. **Footer** — Copyright + social links

### Interactive Demo Dashboard
An embedded demo with 4 tabs:
- **Dashboard** — Safety score, screen time, risk indicators, live context stream
- **Activity Log** — Table of monitored events with risk levels
- **AI Policy Creator** — Category toggles + AI chat for natural-language rule creation
- **Family Settings** — Child profile, age group, screen time limits, API key config

### External Integrations
- **Google Gemini API** — AI chat for rule creation (key stored in localStorage as `phylax_api_key`)
- **FormSubmit.co** — Request access form emails to `kyrispirosv@gmail.com`

### Client-Side Storage (localStorage)
- `phylax_api_key` — Gemini API key
- `phylaxRules` — JSON array of user-created rules

## Development Workflow

### Running Locally
No build step required. Open `index.html` directly in a browser, or use any static server:
```bash
# Python
python3 -m http.server 8000

# Node (npx)
npx serve .
```

### Deploying
Push to `main` branch on GitHub — Vercel auto-deploys.

### Making Changes
Since everything is in `index.html`:
- **CSS changes**: Edit the `<style>` block (lines ~10–1493)
- **Content/HTML changes**: Edit the `<body>` markup (lines ~1494–1789)
- **JavaScript changes**: Edit the `<script>` block (lines ~1790–2245)

## Responsive Design

- **Desktop**: Full multi-column layouts, max-width 1120px container
- **Mobile breakpoint**: `@media (max-width: 900px)` — stacks to single column
- **Padding**: `0 24px` on container

## Important Notes for AI Assistants

1. **Single-file architecture** — All changes go in `index.html`. Do not create separate CSS/JS files unless explicitly asked.
2. **No build process** — Changes are live immediately. No compilation, transpilation, or bundling.
3. **No package.json** — Do not run `npm install` or similar commands. They are not applicable.
4. **Dark theme only** — All UI additions must use the existing CSS variables and dark color scheme.
5. **Glassmorphic style** — Cards use semi-transparent backgrounds with blur. Follow existing patterns.
6. **Keep inline** — CSS and JS are embedded in `index.html`. Maintain this pattern.
7. **FormSubmit integration** — The access request form posts to FormSubmit.co. Do not change the form action URL without confirmation.
8. **API key handling** — Gemini API key is stored client-side in localStorage. The demo has a simulation fallback when no key is present.
9. **Git branch convention** — Development branches follow `claude/<descriptor>` naming. Default branch is `main`.
10. **Vercel deployment** — Deployment is automatic on push to `main`. No Vercel config file is needed for static sites.
