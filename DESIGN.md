---
version: "0.1.0"
name: "OnlyOffice File Panel - Quiet Premium Workspace"
description: "A calm, premium SaaS workspace for managing and editing office documents."
colors:
  background: "#F6F7FB"
  surface: "#FFFFFF"
  surface-elevated: "#FBFCFF"
  surface-glass: "#FFFFFFCC"
  text: "#111827"
  text-muted: "#667085"
  text-soft: "#98A2B3"
  border: "#E5E7EB"
  border-strong: "#D0D5DD"
  primary: "#365BFF"
  primary-deep: "#253DD8"
  primary-soft: "#EEF2FF"
  accent: "#8B5CF6"
  success: "#16A34A"
  warning: "#F59E0B"
  danger: "#E5484D"
  shadow: "#101828"
typography:
  display:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "32px"
    fontWeight: 750
    lineHeight: 1.12
    letterSpacing: "-0.04em"
  body:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.55
  label:
    fontFamily: "Inter, -apple-system, BlinkMacSystemFont, Segoe UI, sans-serif"
    fontSize: "12px"
    fontWeight: 650
    lineHeight: 1.2
    letterSpacing: "0.08em"
rounded:
  sm: "10px"
  md: "14px"
  lg: "20px"
  xl: "28px"
spacing:
  xs: "6px"
  sm: "10px"
  md: "16px"
  lg: "24px"
  xl: "32px"
components:
  app-header:
    backgroundColor: "{colors.surface-glass}"
    textColor: "{colors.text}"
    rounded: "0"
  primary-button:
    backgroundColor: "{colors.primary}"
    textColor: "#FFFFFF"
    rounded: "{rounded.md}"
  panel-shell:
    backgroundColor: "{colors.surface-glass}"
    textColor: "{colors.text}"
    rounded: "{rounded.xl}"
---

## Overview

OnlyOffice File Panel should feel like a modern premium productivity workspace rather than a plain admin table. The visual reference is the calm SaaS dashboard language seen in Linear, Vercel Dashboard, and Notion-style document workspaces: quiet surfaces, confident spacing, crisp type, subtle glass, and restrained color.

## Colors

Use a warm off-white background with white elevated surfaces. Blue-indigo is the only primary interaction color. Purple is reserved for soft accents and gradients. Avoid high-saturation full-page color blocks.

## Typography

Favor compact but premium typography: strong negative tracking for the page title, medium-weight labels, and soft muted secondary copy. Text hierarchy should come from weight and color rather than excessive sizes.

## Layout

The file page uses a hero section plus a rounded file panel shell. Controls sit in a polished toolbar above the table. The table should feel embedded in a card, with roomy rows and subtle hover feedback.

## Elevation & Depth

Use layered shadows sparingly. Prefer soft ambient shadows and hairline borders. Frosted top navigation and floating upload dock can use backdrop blur.

## Shapes

Use large rounded corners for major panels, medium rounded corners for controls, and circular/squircle icons for file types.

## Components

Primary actions should use the blue-indigo gradient/button system. Secondary actions should be soft white controls with subtle borders. File rows should include type icons and a secondary metadata line.

## Do's and Don'ts

- Do reuse the token palette and spacing before inventing new values.
- Do keep the interface calm and document-focused.
- Do make drag/upload states feel intentional and premium.
- Don't introduce loud colors, heavy borders, or dense admin-table styling.
- Don't redesign the editor iframe itself; keep editor space functional and unobtrusive.
