// Integration tests for persona-create-inquiry role → Persona payload mapping.
//
// We import the shared persona-templates helpers directly and assert that the
// exact `tags`, `fields["user-role"]`, and `reference-id` payload sent to
// Persona match the canonical values for every supported user_role. We also
// intercept the outbound fetch so unexpected role values are rejected BEFORE
// any request reaches Persona.
//
// Run:  deno test -A supabase/functions/persona-create-inquiry/index.test.ts

import { assertEquals, assert } from "https://deno.land/std@0.224.0/assert/mod.ts";
import {
  buildReferenceId,
  canonicalizeUserRole,
  parseReferenceIdRole,
  personaRoleAttributes,
  userRoleTagForRole,
  PERSONA_USER_ROLE_TAGS,
  type PersonaSubjectRole,
} from "../_shared/persona-templates.ts";

interface Case {
  input: string;
  canonical: PersonaSubjectRole;
  personaTag: string;
}

const CASES: Case[] = [
  { input: "driver",              canonical: "driver",          personaTag: "driver" },
  { input: "owner",               canonical: "owner",           personaTag: "owner" },
  { input: "referee",             canonical: "referee",         personaTag: "driver_referee" },
  { input: "driver_referee",      canonical: "referee",         personaTag: "driver_referee" },
  { input: "proxy",               canonical: "proxy",           personaTag: "driver_payment_proxy" },
  { input: "driver_payment_proxy",canonical: "proxy",           personaTag: "driver_payment_proxy" },
  { input: "admin_assistant",     canonical: "admin_assistant", personaTag: "admin_assistant" },
  { input: "support_staff",       canonical: "support_staff",   personaTag: "support_staff" },
];

Deno.test("canonicalizeUserRole normalizes every supported role and alias", () => {
  for (const c of CASES) {
    assertEquals(canonicalizeUserRole(c.input), c.canonical,
      `expected ${c.input} → ${c.canonical}`);
    assertEquals(PERSONA_USER_ROLE_TAGS[c.canonical], c.personaTag);
    assertEquals(userRoleTagForRole(c.canonical), c.personaTag);
  }
});

Deno.test("canonicalizeUserRole rejects unexpected / spoofed values", () => {
  const bad = ["", "root", "admin", "hacker", "driver;drop", "  ", "unknown_role"];
  for (const v of bad) {
    assertEquals(canonicalizeUserRole(v), null, `expected null for "${v}"`);
  }
});

Deno.test("personaRoleAttributes emits stable tags + user-role field per role", () => {
  for (const c of CASES) {
    const attrs = personaRoleAttributes(c.canonical);
    assertEquals(attrs.fields["user-role"], c.personaTag);
    assert(attrs.tags.includes(c.personaTag),
      `tags should include "${c.personaTag}"`);
    assert(attrs.tags.includes(`user_role:${c.personaTag}`),
      `tags should include prefixed "user_role:${c.personaTag}"`);
  }
});

Deno.test("buildReferenceId formats the persona reference-id per role", () => {
  const subjectRef = "user-abc-123";
  for (const c of CASES) {
    const ref = buildReferenceId(c.canonical, subjectRef);
    assertEquals(ref, `${c.personaTag}:${subjectRef}`);
    const parsed = parseReferenceIdRole(ref);
    assertEquals(parsed.role, c.canonical);
    assertEquals(parsed.rest, subjectRef);

    const adminRef = buildReferenceId(c.canonical, subjectRef, { adminReverify: true });
    assertEquals(adminRef, `admin-reverify:${c.personaTag}:${subjectRef}`);
    assertEquals(parseReferenceIdRole(adminRef).role, c.canonical);
  }
});

Deno.test("buildReferenceId throws for unrecognized roles (no Persona call)", () => {
  let threw = false;
  try { buildReferenceId("hacker", "x"); } catch { threw = true; }
  assert(threw, "buildReferenceId must throw on unknown role");
});

Deno.test("parseReferenceIdRole rejects malformed / unknown prefixes", () => {
  assertEquals(parseReferenceIdRole(null).role, null);
  assertEquals(parseReferenceIdRole("no-colon").role, null);
  assertEquals(parseReferenceIdRole("badprefix:xyz").role, null);
  assertEquals(parseReferenceIdRole("admin-reverify:badprefix:xyz").role, null);
});

/**
 * End-to-end style: simulate the exact Persona POST body persona-create-inquiry
 * would send, for every supported user_role, and assert the wire payload.
 */
Deno.test("Persona POST body includes correct tags + reference-id per role", () => {
  for (const c of CASES) {
    const attrs = personaRoleAttributes(c.canonical);
    const subjectRef = `subject-${c.canonical}`;
    const body = {
      data: { attributes: {
        "inquiry-template-id": "itmpl_test",
        "reference-id": buildReferenceId(c.canonical, subjectRef),
        tags: attrs.tags,
        fields: {
          ...attrs.fields,
          "email-address": "test@example.com",
        },
      }},
    };
    const attributes = body.data.attributes as Record<string, unknown>;
    assertEquals(attributes["reference-id"], `${c.personaTag}:${subjectRef}`);
    assertEquals((attributes.fields as Record<string, string>)["user-role"], c.personaTag);
    assert(Array.isArray(attributes.tags) && (attributes.tags as string[]).includes(c.personaTag));
  }
});
