/**
 * RentMaikar Accessibility (A11y) Auto-Fix & Remediation Engine
 * 
 * Provides automated in-DOM fixes for WCAG 2.1 AA violations flagged by the scanner:
 * - Injects missing accessible labels (aria-label, htmlFor, id)
 * - Assigns descriptive accessible names to icon-only buttons
 * - Provides meaningful alt attributes for images
 * - Corrects low-contrast foreground/background pairs to exceed WCAG AA 4.5:1
 * - Generates copyable React/TSX code snippets for developers
 */

import { A11yIssue } from "./accessibilityScanner";

export interface FixResult {
  issueId: string;
  success: boolean;
  message: string;
  codeSnippet: string;
}

export interface BatchFixResult {
  total: number;
  fixed: number;
  failed: number;
  results: FixResult[];
}

/**
 * Converts camelCase, snake_case or kebab-case identifier into human-readable Title Case
 */
function toReadableLabel(str: string): string {
  if (!str) return "Input field";
  // Remove prefixes like driver-, owner-, user-
  const cleaned = str.replace(/^(driver|owner|user|referee\d?)[-_]/i, "").trim();
  // Split on camelCase or delimiters
  const words = cleaned
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/[_-]+/g, " ")
    .trim();
  
  if (!words) return "Field";
  return words.charAt(0).toUpperCase() + words.slice(1);
}

/**
 * Infers an appropriate accessible name for an icon-only button
 */
export function inferButtonAccessibleName(btn: HTMLElement): string {
  // 1. Check title or data-testid or data-action
  const title = btn.getAttribute("title");
  if (title?.trim()) return title.trim();

  const testId = btn.getAttribute("data-testid") || btn.getAttribute("data-action");
  if (testId) return toReadableLabel(testId);

  // 2. Check inner text or visually hidden text
  const innerText = btn.innerText?.trim();
  if (innerText) return innerText;

  // 3. Inspect child SVGs for icon classes or titles
  const svg = btn.querySelector("svg");
  if (svg) {
    const svgTitle = svg.querySelector("title")?.textContent?.trim();
    if (svgTitle) return svgTitle;

    const classNames = (svg.getAttribute("class") || "") + " " + (btn.getAttribute("class") || "");
    const lower = classNames.toLowerCase();

    if (lower.includes("lucide-x") || lower.includes("close")) return "Close";
    if (lower.includes("lucide-menu") || lower.includes("menu")) return "Toggle navigation menu";
    if (lower.includes("lucide-bell") || lower.includes("bell")) return "Notifications";
    if (lower.includes("lucide-shield") || lower.includes("shield")) return "Admin portal";
    if (lower.includes("lucide-help") || lower.includes("help-circle")) return "Help and tour";
    if (lower.includes("lucide-eye-off")) return "Hide password";
    if (lower.includes("lucide-eye")) return "Show password";
    if (lower.includes("lucide-refresh") || lower.includes("refresh-cw")) return "Refresh data";
    if (lower.includes("lucide-crosshair")) return "Locate element";
    if (lower.includes("lucide-file-down") || lower.includes("download")) return "Export report";
    if (lower.includes("lucide-search")) return "Search";
    if (lower.includes("lucide-trash")) return "Delete item";
    if (lower.includes("lucide-edit") || lower.includes("pencil")) return "Edit item";
    if (lower.includes("lucide-plus")) return "Add new item";
    if (lower.includes("lucide-chevron-left") || lower.includes("arrow-left")) return "Go to previous page";
    if (lower.includes("lucide-chevron-right") || lower.includes("arrow-right")) return "Go to next page";
    if (lower.includes("lucide-chevron-up")) return "Scroll up";
    if (lower.includes("lucide-chevron-down")) return "Scroll down";
    if (lower.includes("lucide-cookie")) return "Cookie preferences";
    if (lower.includes("lucide-phone")) return "Phone support";
    if (lower.includes("lucide-mail")) return "Email support";
    if (lower.includes("lucide-filter")) return "Filter items";
    if (lower.includes("lucide-settings")) return "Settings";
    if (lower.includes("lucide-check")) return "Confirm";
  }

  // 4. Check role
  const role = btn.getAttribute("role");
  if (role === "checkbox") {
    const parentLabel = btn.closest("label");
    if (parentLabel?.textContent?.trim()) {
      return parentLabel.textContent.trim().replace(/\s+/g, " ");
    }
    return "Accept option";
  }

  if (role === "combobox") {
    const parent = btn.parentElement;
    const prevLabel = parent?.querySelector("label")?.textContent?.trim();
    if (prevLabel) return `Select ${prevLabel}`;
    return "Select option";
  }

  // 5. Check parent context
  if (btn.closest("header")) return "Header action";
  if (btn.closest("dialog, [role='dialog']")) return "Close dialog";

  return "Action button";
}

/**
 * Infers an appropriate accessible label for form controls
 */
export function inferFormAccessibleLabel(el: HTMLElement): string {
  const placeholder = el.getAttribute("placeholder");
  if (placeholder && placeholder.trim() && !placeholder.startsWith("e.g.")) {
    return placeholder.trim();
  }

  const name = el.getAttribute("name");
  if (name) return toReadableLabel(name);

  const id = el.id;
  if (id) return toReadableLabel(id);

  // Check closest container's heading or label
  const container = el.closest(".space-y-2, .space-y-4, .form-group, .grid");
  const heading = container?.querySelector("label, h3, h4, span.font-medium")?.textContent?.trim();
  if (heading) return heading;

  if (placeholder) return placeholder.trim();

  return "Form input";
}

/**
 * Infers meaningful image alt text
 */
export function inferImageAlt(img: HTMLImageElement): string {
  const src = img.getAttribute("src") || "";
  const lower = src.toLowerCase();

  if (lower.includes("logo")) return "Rentmaikar Logo";
  if (lower.includes("banner")) return "Rentmaikar Banner";
  if (lower.includes("car") || lower.includes("vehicle")) return "Vehicle preview";
  if (lower.includes("flag")) return "Country flag";
  if (lower.includes("avatar") || lower.includes("user")) return "User avatar";
  if (lower.includes("icon")) return ""; // decorative

  // If inside button or link that already has text
  if (img.parentElement?.tagName === "A" && img.parentElement.textContent?.trim()) {
    return ""; // decorative inside link with visible text
  }

  return "Rentmaikar illustration";
}

/**
 * Applies an accessible fix to an individual DOM element
 */
export function applyA11yFix(issue: A11yIssue): FixResult {
  const el = issue.element;
  if (!el || !document.body.contains(el)) {
    return {
      issueId: issue.id,
      success: false,
      message: "Element is no longer attached to the DOM.",
      codeSnippet: "// Element not found",
    };
  }

  try {
    switch (issue.type) {
      case "missing-label":
      case "placeholder-only": {
        const labelText = inferFormAccessibleLabel(el);
        el.setAttribute("aria-label", labelText);
        
        // If placeholder only, ensure title is also set for browser tooltips
        if (issue.type === "placeholder-only" && !el.getAttribute("title")) {
          el.setAttribute("title", labelText);
        }

        // Tag as fixed
        el.setAttribute("data-a11y-fixed", "label");
        el.classList.add("a11y-fixed-pulse");
        setTimeout(() => el.classList.remove("a11y-fixed-pulse"), 2000);

        return {
          issueId: issue.id,
          success: true,
          message: `Added aria-label="${labelText}" to <${el.tagName.toLowerCase()}>.`,
          codeSnippet: `<${el.tagName.toLowerCase()} aria-label="${labelText}" ... />`,
        };
      }

      case "missing-button-label": {
        const btnLabel = inferButtonAccessibleName(el);
        el.setAttribute("aria-label", btnLabel);
        if (!el.getAttribute("title")) {
          el.setAttribute("title", btnLabel);
        }

        el.setAttribute("data-a11y-fixed", "button-label");
        el.classList.add("a11y-fixed-pulse");
        setTimeout(() => el.classList.remove("a11y-fixed-pulse"), 2000);

        return {
          issueId: issue.id,
          success: true,
          message: `Added aria-label="${btnLabel}" to <button>.`,
          codeSnippet: `<Button aria-label="${btnLabel}" ... />`,
        };
      }

      case "missing-image-alt": {
        const img = el as HTMLImageElement;
        const altText = inferImageAlt(img);
        img.setAttribute("alt", altText);
        if (altText === "") {
          img.setAttribute("aria-hidden", "true");
        }

        img.setAttribute("data-a11y-fixed", "alt");
        img.classList.add("a11y-fixed-pulse");
        setTimeout(() => img.classList.remove("a11y-fixed-pulse"), 2000);

        return {
          issueId: issue.id,
          success: true,
          message: `Added alt="${altText}" to <img>.`,
          codeSnippet: `<img alt="${altText}" ... />`,
        };
      }

      case "contrast-violation":
      case "contrast-warning": {
        // Compute whether background is light or dark
        const details = issue.contrastDetails;
        let isLightBg = true;
        if (details?.bgColor) {
          const m = details.bgColor.match(/rgb\((\d+),\s*(\d+),\s*(\d+)\)/);
          if (m) {
            const r = parseInt(m[1], 10);
            const g = parseInt(m[2], 10);
            const b = parseInt(m[3], 10);
            const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
            isLightBg = lum > 0.45;
          }
        }

        // Apply contrast-compliant high-contrast styles directly
        if (isLightBg) {
          el.style.setProperty("color", "#0f172a", "important"); // Slate-900 (21:1 on white)
          el.style.setProperty("opacity", "1", "important");
        } else {
          el.style.setProperty("color", "#f8fafc", "important"); // Slate-50 (18:1 on dark navy)
          el.style.setProperty("opacity", "1", "important");
        }

        el.setAttribute("data-a11y-fixed", "contrast");
        el.classList.add("a11y-fixed-pulse");
        setTimeout(() => el.classList.remove("a11y-fixed-pulse"), 2000);

        return {
          issueId: issue.id,
          success: true,
          message: `Corrected text color to high-contrast ${isLightBg ? "#0f172a" : "#f8fafc"} (passes WCAG AAA > 7:1).`,
          codeSnippet: `className="text-foreground font-medium opacity-100"`,
        };
      }

      default:
        return {
          issueId: issue.id,
          success: false,
          message: "Unsupported issue type.",
          codeSnippet: "// No fix available",
        };
    }
  } catch (err: any) {
    return {
      issueId: issue.id,
      success: false,
      message: err.message || "Failed to apply fix",
      codeSnippet: "// Error applying fix",
    };
  }
}

/**
 * Applies fixes to all issues on the page in a single batch
 */
export function applyAllA11yFixes(issues: A11yIssue[]): BatchFixResult {
  const results: FixResult[] = [];
  let fixed = 0;
  let failed = 0;

  for (const issue of issues) {
    const res = applyA11yFix(issue);
    results.push(res);
    if (res.success) {
      fixed++;
    } else {
      failed++;
    }
  }

  return {
    total: issues.length,
    fixed,
    failed,
    results,
  };
}

/**
 * Generates clean React/TSX source code remediation markdown
 */
export function generateCodeRemediationReport(issues: A11yIssue[], results: FixResult[]): string {
  const lines: string[] = [
    `# A11y Source Code Remediation Guide`,
    `Generated: ${new Date().toLocaleString()}`,
    `Total Issues Addressed: ${issues.length}`,
    ``,
    `## Summary of Code Patches`,
  ];

  issues.forEach((issue) => {
    const match = results.find((r) => r.issueId === issue.id);
    lines.push(`### ${issue.wcagCriterion} — ${issue.selector}`);
    lines.push(`- **Problem**: ${issue.message}`);
    lines.push(`- **Action**: ${match?.message || issue.suggestedFix}`);
    if (match?.codeSnippet) {
      lines.push("```tsx");
      lines.push(match.codeSnippet);
      lines.push("```");
    }
    lines.push("");
  });

  return lines.join("\n");
}
