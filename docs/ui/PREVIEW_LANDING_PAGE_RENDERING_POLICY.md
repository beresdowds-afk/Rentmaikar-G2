# Preview Landing Page Rendering Policy

**Project:** RentMaikar

## Purpose

This document defines the expected rendering behavior for the RentMaikar landing page to ensure consistency between the development preview, staging environments, and production deployments.

---

# Objectives

The landing page preview must accurately represent the production user experience while ensuring that the correct region aware content (no mixed region contents) and approved hero imagery are displayed.

---

# Policy 1 — Strict Region-Aware Landing Page

The application shall always render a single, fully region-specific landing page that corresponds to the visitor's active region. At no point shall the landing page display content, assets, navigation, pricing, legal information, promotions, or configuration originating from more than one region.

The landing page shall be initialized only after the active region has been successfully determined using the same region detection, validation, and resolution logic used in production. The resolved region shall become the single source of truth for all region-dependent content rendered during that session.

The application must never display:

- Mixed content from multiple regions.
- Generic fallback landing pages.
- Legacy landing pages.
- Placeholder landing pages.
- Cached landing page variants belonging to another region.
- Development-only landing pages.
- Region-specific assets, banners, pricing, currencies, languages, contact information, legal notices, or promotional content that do not belong to the active region.

During region initialization, the application shall remain in a controlled loading state until the active region has been resolved and validated. No region-specific content shall be rendered before region resolution is complete.

Once a region has been selected, all landing page components—including navigation, hero sections, search interfaces, featured content, pricing, currency, localization, imagery, metadata, SEO tags, analytics configuration, legal content, and API requests—shall be sourced exclusively from that single region.

The application shall prevent region switching while the landing page is actively initializing or rendering. Region changes shall occur only through an intentional user action or an approved region resolution process, after which the landing page shall be re-rendered atomically using the newly selected region without exposing intermediate or mixed-region states.

If automatic region detection is unavailable, inconclusive, delayed, or fails validation, the application shall load the configured default region as a complete and self-contained experience. Under no circumstances shall content from multiple regions be combined to compensate for missing regional data.

The landing page rendering process shall be deterministic, idempotent, and free from race conditions. Concurrent region detection requests, asynchronous data loading, cached responses, or delayed API responses shall never overwrite the active region or introduce mixed-region content after rendering has begun.

Every region resolution event, region change, fallback decision, cache invalidation, and rendering anomaly shall be logged for diagnostics and monitoring. Any inconsistency detected between the active region and rendered content shall trigger a controlled recovery process rather than allowing inconsistent or mixed-region content to be displayed.

This policy shall serve as the single authoritative standard for all landing page rendering, previews, production deployments, session restoration, deep links, cached sessions, and future enhancements involving regional content.

---

# Policy 2 — Approved Hero Background

The landing page hero section shall always display the approved zoomed-out vehicle background image at /src/assets/hero-cars-bg-v2.png.asset.json.

The approved image must satisfy the following requirements:

- Complete vehicles remain visible.
- No vehicle is cropped.
- Vehicle proportions remain natural.
- The image preserves adequate spacing around all featured vehicles.
- The image supports responsive layouts across desktop, tablet, and mobile devices.

---

# Prohibited Hero Images

The following must never appear in the landing page background:

- Cropped, close up images of partial vehicle images
- Legacy hero artwork
- Placeholder images
- Development assets
- Cached preview images
 

---

# Preview Consistency Requirements

Development Preview, Staging, and Production shall all render:

- identical landing page layouts
- The same hero backgrounds
- identical responsive behavior
- identical regional landing page selection logic

The preview environment must not retain obsolete cached assets after a deployment.

---

# Asset Selection Rules

The application shall always use the currently approved hero background asset referenced by the active configuration.

Previously uploaded images shall not be selected automatically due to cache persistence or historical asset references.

---

# Cache Policy

After deployment:

- invalidate image caches
- invalidate browser caches where appropriate
- refresh CDN assets
 

The latest approved hero background must become the only image used for rendering.

---

# Acceptance Criteria

A deployment is considered successful only when:

- the preview displays the Region-Aware Landing Page;
- the approved zoomed-out vehicle hero image is displayed;
- complete vehicles are visible without unintended cropping;
- no legacy landing page is rendered;
- no deprecated hero image appears in preview or production; and
- preview and production render the same landing page experience.

---

# Implementation Notes

Developers should ensure that:

- hero image references are resolved from the active application configuration;
- stale asset references are removed during deployment;
- preview environments do not reuse deprecated cached images; and
- any image optimization pipeline preserves the intended framing of the approved hero background.

---

## Status

**Policy:** Active

This document serves as the authoritative rendering policy for the RentMaikar landing page and preview environments.
