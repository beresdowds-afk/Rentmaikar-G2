Implement the new authoritative repository guardrail:

"docs/architecture/DOCUMENTATION_AUTHORITY_AND_AI_STUDIO_GUARDRAILS.md"

First pull and inspect the current "main" branch of "beresdowds-afk/Rentmaikar-G2".

Read the new document completely before making any code changes.

Then perform a documentation-authority reconciliation of the repository.

Mandatory objectives

1. Treat the new guardrail as the authoritative process for interpreting Rentmaikar Markdown documentation.

2. Identify Markdown documents that contain potentially stale, historical, superseded, or ambiguous production architecture instructions.

3. Pay particular attention to:
   
   - "handoff/CUTOVER.md"
   - "src/docs/outgoing-call-flow-reference.md"
   - telephony/call-flow reference documents
   - provider/routing documentation
   - documents containing caller-ID defaults
   - documents containing USA/Nigeria hard-coded routing assumptions.

4. Do NOT delete historical documentation merely because it is stale.

5. Where a historical document could be misinterpreted as current architecture, add a clear historical/superseded/non-authoritative notice and point to the current authoritative document.

6. Reconcile the caller-ID architecture.

The authoritative runtime principle is:

"canonical region → voip_resolve_outbound_number() → configured eligible outbound line → configured provider"

If the resolver cannot return an eligible configured line:

"controlled failure"

NOT:

"hard-coded telephone number"

7. Inspect all current outbound caller-ID implementations, especially:

"backend/src/services/voipService.ts"

and all relevant Supabase telephony functions.

8. Remove or correct any hard-coded production DID fallback that contradicts the authoritative resolver architecture.

9. Before changing any "supabase.functions.invoke(...)", first inspect:

"docs/architecture/supabase-functions-invoke-interceptor-rule.md"

and determine whether the call is already covered by the catch-all interceptor/adapter/bridge.

10. Do not introduce:

- a second region authority;
- a communications-only region list;
- hard-coded USA/Nigeria caller-ID defaults;
- a new call-state store;
- a replacement telephony architecture;
- direct provider calls that bypass the existing backend/bridge/adapter structure.

11. Preserve existing providers and integrations unless an explicit architectural decision authorizes removal.

12. Add an automated regression guard where practical to prevent future hard-coded production caller-ID fallbacks.

The regression guard should detect patterns such as:

"resolver || hard-coded-DID"

"try/catch → hard-coded-DID"

region-specific hard-coded production telephone numbers used as caller identity

and equivalent forms.

Important

Do NOT assume that an old Markdown statement is current merely because it contains production/cutover/sign-off language.

Do NOT assume that a current code path is correct merely because it already exists.

When documentation and implementation conflict:

"inspect → establish authority → reconcile → implement smallest justified change → test"

Do not redesign unrelated systems.

Do not weaken authentication, authorization, verification, RLS, provider security, webhook verification, logging, idempotency, or failure handling.

Validation

After implementation, run:

"lint → typecheck → Vitest → production build"

Do not proceed to deployment if any of these fail.

Report:

1. documents changed;
2. documents classified as historical/reference/superseded;
3. caller-ID paths inspected;
4. hard-coded fallback violations found;
5. code changes made;
6. regression protection added;
7. "supabase.functions.invoke(...)" paths inspected for interceptor coverage;
8. lint result;
9. typecheck result;
10. Vitest result;
11. production-build result.

Do not claim success for any item that was not actually verified.
