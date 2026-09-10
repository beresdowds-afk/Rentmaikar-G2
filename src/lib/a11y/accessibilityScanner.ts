/**
 * RentMaikar Accessibility (A11y) Scanner Engine
 * 
 * Inspects the DOM for WCAG 2.1 AA compliance, focusing on:
 * 1. Missing form labels, icon-only button labels, and image alt text
 * 2. Color contrast issues (4.5:1 for normal text, 3:1 for large text)
 * 
 * Specifically optimized for Registration and Dashboard workflows.
 */

export type A11yIssueType =
  | "missing-label"
  | "placeholder-only"
  | "missing-button-label"
  | "missing-image-alt"
  | "contrast-violation"
  | "contrast-warning";

export type A11yPageCategory = "registration" | "dashboard" | "general";

export interface A11yIssue {
  id: string;
  type: A11yIssueType;
  severity: "violation" | "warning";
  wcagCriterion: string;
  element: HTMLElement;
  selector: string;
  tagName: string;
  snippet: string;
  message: string;
  suggestedFix: string;
  pageCategory: A11yPageCategory;
  contrastDetails?: {
    ratio: number;
    required: number;
    fgColor: string;
    bgColor: string;
    fontSize: string;
    isLargeText: boolean;
  };
}

interface RGB {
  r: number;
  g: number;
  b: number;
  a: number;
}

/**
 * Parses CSS color string into RGBA
 */
function parseColor(str: string): RGB | null {
  const trimmed = str.trim().toLowerCase();

  // Transparent
  if (trimmed === "transparent" || trimmed === "rgba(0, 0, 0, 0)") {
    return { r: 0, g: 0, b: 0, a: 0 };
  }

  // rgb(r, g, b) or rgba(r, g, b, a)
  const rgbMatch = trimmed.match(/^rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*([\d.]+))?\)$/);
  if (rgbMatch) {
    return {
      r: parseInt(rgbMatch[1], 10),
      g: parseInt(rgbMatch[2], 10),
      b: parseInt(rgbMatch[3], 10),
      a: rgbMatch[4] !== undefined ? parseFloat(rgbMatch[4]) : 1,
    };
  }

  // Hex #rrggbb or #rgb
  if (trimmed.startsWith("#")) {
    const hex = trimmed.slice(1);
    if (hex.length === 3) {
      return {
        r: parseInt(hex[0] + hex[0], 16),
        g: parseInt(hex[1] + hex[1], 16),
        b: parseInt(hex[2] + hex[2], 16),
        a: 1,
      };
    }
    if (hex.length === 6) {
      return {
        r: parseInt(hex.slice(0, 2), 16),
        g: parseInt(hex.slice(2, 4), 16),
        b: parseInt(hex.slice(4, 6), 16),
        a: 1,
      };
    }
  }

  return null;
}

/**
 * Relative luminance calculation per WCAG 2.1
 */
function getRelativeLuminance(rgb: RGB): number {
  const sRGB = [rgb.r / 255, rgb.g / 255, rgb.b / 255];
  const linear = sRGB.map((c) => (c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4)));
  return 0.2126 * linear[0] + 0.7152 * linear[1] + 0.0722 * linear[2];
}

/**
 * Blend overlay RGBA color onto opaque background RGBA
 */
function blendColors(fg: RGB, bg: RGB): RGB {
  const a = fg.a + bg.a * (1 - fg.a);
  if (a === 0) return { r: 255, g: 255, b: 255, a: 1 };
  return {
    r: Math.round((fg.r * fg.a + bg.r * bg.a * (1 - fg.a)) / a),
    g: Math.round((fg.g * fg.a + bg.g * bg.a * (1 - fg.a)) / a),
    b: Math.round((fg.b * fg.a + bg.b * bg.a * (1 - fg.a)) / a),
    a: 1,
  };
}

/**
 * Traverse DOM up to find effective opaque background color
 */
function getEffectiveBackgroundColor(el: HTMLElement): RGB {
  let curr: HTMLElement | null = el;
  const layers: RGB[] = [];

  while (curr && curr !== document.documentElement) {
    const style = window.getComputedStyle(curr);
    const color = parseColor(style.backgroundColor);
    if (color && color.a > 0) {
      layers.unshift(color);
      if (color.a >= 0.99) {
        break; // found solid background
      }
    }
    curr = curr.parentElement;
  }

  // Default canvas background (white / dark background)
  let resolved: RGB = { r: 255, g: 255, b: 255, a: 1 };
  const rootStyle = window.getComputedStyle(document.body);
  const bodyColor = parseColor(rootStyle.backgroundColor);
  if (bodyColor && bodyColor.a > 0.5) {
    resolved = { ...bodyColor, a: 1 };
  }

  for (const layer of layers) {
    resolved = blendColors(layer, resolved);
  }

  return resolved;
}

/**
 * Calculate contrast ratio between two RGB colors
 */
function calculateContrastRatio(fg: RGB, bg: RGB): number {
  const l1 = getRelativeLuminance(fg);
  const l2 = getRelativeLuminance(bg);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return Number(((lighter + 0.05) / (darker + 0.05)).toFixed(2));
}

/**
 * Generates a readable unique CSS selector for an element
 */
function getElementSelector(el: HTMLElement): string {
  if (el.id) return `#${el.id}`;
  const name = el.getAttribute("name");
  if (name) return `${el.tagName.toLowerCase()}[name="${name}"]`;
  
  let path = el.tagName.toLowerCase();
  if (el.className && typeof el.className === "string") {
    const mainClass = el.className.split(" ").filter((c) => c && !c.includes(":") && !c.startsWith("a11y-"))[0];
    if (mainClass) path += `.${mainClass}`;
  }

  if (el.parentElement && el.parentElement !== document.body) {
    const parentTag = el.parentElement.tagName.toLowerCase();
    const parentId = el.parentElement.id ? `#${el.parentElement.id}` : "";
    return `${parentTag}${parentId} > ${path}`;
  }

  return path;
}

/**
 * Classify page type by URL pathname
 */
export function categorizePage(pathname: string): A11yPageCategory {
  const p = pathname.toLowerCase();
  if (
    p.includes("/register") ||
    p.includes("/signup") ||
    p.includes("/auth") ||
    p.includes("/onboarding")
  ) {
    return "registration";
  }
  if (
    p.includes("/dashboard") ||
    p.includes("/admin") ||
    p.includes("/portal") ||
    p.includes("/settings") ||
    p.includes("/history") ||
    p.includes("/overview")
  ) {
    return "dashboard";
  }
  return "general";
}

/**
 * Core DOM Scanner
 */
export function scanDomForAccessibility(root: HTMLElement = document.body, currentPath = window.location.pathname): A11yIssue[] {
  const issues: A11yIssue[] = [];
  const pageCategory = categorizePage(currentPath);

  // -------------------------------------------------------------
  // 1. Form Inputs: Check for Missing Labels (WCAG 1.3.1, 4.1.2)
  // -------------------------------------------------------------
  const formElements = root.querySelectorAll<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>(
    "input:not([type='hidden']):not([type='submit']):not([type='button']):not([type='reset']):not([type='image']), select, textarea"
  );

  formElements.forEach((el, index) => {
    // Skip dev overlay controls themselves
    if (el.closest("[data-a11y-overlay]")) return;

    const id = el.id;
    const ariaLabel = el.getAttribute("aria-label");
    const ariaLabelledBy = el.getAttribute("aria-labelledby");
    const title = el.getAttribute("title");
    const placeholder = el.getAttribute("placeholder");

    // Check 1: explicit label with htmlFor
    let hasLabel = false;
    if (id) {
      const explicitLabel = document.querySelector(`label[for="${CSS.escape(id)}"]`);
      if (explicitLabel && explicitLabel.textContent?.trim()) {
        hasLabel = true;
      }
    }

    // Check 2: wrapping label
    if (!hasLabel) {
      const parentLabel = el.closest("label");
      if (parentLabel && parentLabel.textContent?.trim()) {
        hasLabel = true;
      }
    }

    // Check 3: aria-labelledby referencing existing element
    if (!hasLabel && ariaLabelledBy) {
      const labelledByEl = document.getElementById(ariaLabelledBy);
      if (labelledByEl && labelledByEl.textContent?.trim()) {
        hasLabel = true;
      }
    }

    // Check 4: aria-label
    if (!hasLabel && ariaLabel && ariaLabel.trim().length > 0) {
      hasLabel = true;
    }

    // Check 5: title
    if (!hasLabel && title && title.trim().length > 0) {
      hasLabel = true;
    }

    if (!hasLabel) {
      if (placeholder && placeholder.trim()) {
        // Has placeholder, but no accessible label
        issues.push({
          id: `missing-label-${index}-${el.name || el.id || index}`,
          type: "placeholder-only",
          severity: "warning",
          wcagCriterion: "WCAG 2.1 AA (3.3.2 Labels or Instructions)",
          element: el,
          selector: getElementSelector(el),
          tagName: el.tagName.toLowerCase(),
          snippet: el.outerHTML.slice(0, 100),
          message: `Form field relies only on placeholder "${placeholder}". Placeholders disappear upon user input and are not accessible to all screen readers.`,
          suggestedFix: `Add a visible <Label htmlFor="${id || 'field-id'}"> or add an aria-label="${placeholder}".`,
          pageCategory,
        });
      } else {
        // Totally unlabelled
        issues.push({
          id: `missing-label-${index}-${el.name || el.id || index}`,
          type: "missing-label",
          severity: "violation",
          wcagCriterion: "WCAG 2.1 AA (4.1.2 Name, Role, Value / 1.3.1 Info and Relationships)",
          element: el,
          selector: getElementSelector(el),
          tagName: el.tagName.toLowerCase(),
          snippet: el.outerHTML.slice(0, 100),
          message: `Form field has no associated label, aria-label, or accessible name.`,
          suggestedFix: `Add an id="${el.name || 'field-id'}" and an associated <Label htmlFor="...">, or provide aria-label="..."`,
          pageCategory,
        });
      }
    }
  });

  // -------------------------------------------------------------
  // 2. Buttons: Check for Accessible Names (WCAG 4.1.2)
  // -------------------------------------------------------------
  const buttons = root.querySelectorAll<HTMLButtonElement>("button, [role='button']");
  buttons.forEach((btn, index) => {
    if (btn.closest("[data-a11y-overlay]")) return;

    // Check if visible
    const style = window.getComputedStyle(btn);
    if (style.display === "none" || style.visibility === "hidden") return;

    const hasAriaLabel = Boolean(btn.getAttribute("aria-label")?.trim());
    const ariaLabelledBy = btn.getAttribute("aria-labelledby");
    const hasLabelledBy = ariaLabelledBy ? Boolean(document.getElementById(ariaLabelledBy)?.textContent?.trim()) : false;
    const hasTitle = Boolean(btn.getAttribute("title")?.trim());
    const hasVisibleText = Boolean(btn.innerText?.trim());
    const hasImgWithAlt = Boolean(btn.querySelector("img[alt]:not([alt=''])"));
    const hasSvgWithTitle = Boolean(btn.querySelector("svg title")?.textContent?.trim());
    
    // Check if button/control is wrapped in or associated with a valid label
    let hasAssociatedLabel = false;
    const parentLabel = btn.closest("label");
    if (parentLabel && parentLabel.textContent?.trim()) {
      hasAssociatedLabel = true;
    }
    if (!hasAssociatedLabel && btn.id) {
      const explicitLabel = document.querySelector(`label[for="${CSS.escape(btn.id)}"]`);
      if (explicitLabel && explicitLabel.textContent?.trim()) {
        hasAssociatedLabel = true;
      }
    }

    if (!hasVisibleText && !hasAriaLabel && !hasLabelledBy && !hasTitle && !hasImgWithAlt && !hasSvgWithTitle && !hasAssociatedLabel) {
      issues.push({
        id: `missing-btn-${index}`,
        type: "missing-button-label",
        severity: "violation",
        wcagCriterion: "WCAG 2.1 AA (4.1.2 Name, Role, Value)",
        element: btn,
        selector: getElementSelector(btn),
        tagName: btn.tagName.toLowerCase(),
        snippet: btn.outerHTML.slice(0, 120),
        message: "Icon-only button has no text, aria-label, or title. Screen reader users cannot determine its purpose.",
        suggestedFix: `Add an aria-label="..." to the button describing the action (e.g. aria-label="Close dialog").`,
        pageCategory,
      });
    }
  });

  // -------------------------------------------------------------
  // 3. Images: Missing Alt Attributes (WCAG 1.1.1)
  // -------------------------------------------------------------
  const images = root.querySelectorAll<HTMLImageElement>("img");
  images.forEach((img, index) => {
    if (img.closest("[data-a11y-overlay]")) return;
    if (!img.hasAttribute("alt")) {
      issues.push({
        id: `missing-alt-${index}`,
        type: "missing-image-alt",
        severity: "violation",
        wcagCriterion: "WCAG 2.1 AA (1.1.1 Non-text Content)",
        element: img,
        selector: getElementSelector(img),
        tagName: "img",
        snippet: img.outerHTML.slice(0, 100),
        message: "Image is missing an alt attribute.",
        suggestedFix: `Add an alt="..." attribute describing the image, or alt="" if purely decorative.`,
        pageCategory,
      });
    }
  });

  // -------------------------------------------------------------
  // 4. Color Contrast: Text Elements (WCAG 1.4.3 Minimum Contrast)
  // -------------------------------------------------------------
  const textCandidates = root.querySelectorAll<HTMLElement>(
    "p, span, h1, h2, h3, h4, h5, h6, label, a, button, input, th, td, [role='status'], [role='alert']"
  );

  textCandidates.forEach((el, index) => {
    if (el.closest("[data-a11y-overlay]")) return;

    // Only test if element directly contains visible text
    const directText = Array.from(el.childNodes)
      .filter((n) => n.nodeType === Node.TEXT_NODE)
      .map((n) => n.textContent?.trim() || "")
      .join("");

    const textToTest = directText || (el.children.length === 0 ? el.textContent?.trim() : "");
    if (!textToTest || textToTest.length < 2) return;

    const style = window.getComputedStyle(el);
    if (
      style.display === "none" ||
      style.visibility === "hidden" ||
      style.opacity === "0" ||
      el.offsetWidth === 0 ||
      el.offsetHeight === 0
    ) {
      return;
    }

    const fgColor = parseColor(style.color);
    if (!fgColor || fgColor.a === 0) return;

    const bgColor = getEffectiveBackgroundColor(el);
    // Blend foreground alpha onto background for true rendered contrast
    const effectiveFg = fgColor.a < 1 ? blendColors(fgColor, bgColor) : fgColor;
    const ratio = calculateContrastRatio(effectiveFg, bgColor);

    const fontSizePx = parseFloat(style.fontSize);
    const fontWeight = parseInt(style.fontWeight, 10) || (style.fontWeight === "bold" ? 700 : 400);
    const isLargeText = fontSizePx >= 24 || (fontSizePx >= 18.66 && fontWeight >= 700);

    const requiredRatio = isLargeText ? 3.0 : 4.5;

    if (ratio < requiredRatio) {
      const fgHex = `rgb(${effectiveFg.r}, ${effectiveFg.g}, ${effectiveFg.b})`;
      const bgHex = `rgb(${bgColor.r}, ${bgColor.g}, ${bgColor.b})`;

      issues.push({
        id: `contrast-${index}`,
        type: ratio < 3.0 ? "contrast-violation" : "contrast-warning",
        severity: ratio < 3.0 ? "violation" : "warning",
        wcagCriterion: "WCAG 2.1 AA (1.4.3 Contrast Minimum)",
        element: el,
        selector: getElementSelector(el),
        tagName: el.tagName.toLowerCase(),
        snippet: textToTest.slice(0, 50),
        message: `Low contrast ratio ${ratio}:1 is below required minimum of ${requiredRatio}:1 (${isLargeText ? 'large text' : 'normal text'}).`,
        suggestedFix: `Darken or lighten text color ${fgHex} against background ${bgHex} to achieve at least ${requiredRatio}:1 ratio.`,
        pageCategory,
        contrastDetails: {
          ratio,
          required: requiredRatio,
          fgColor: fgHex,
          bgColor: bgHex,
          fontSize: style.fontSize,
          isLargeText,
        },
      });
    }
  });

  return issues;
}
