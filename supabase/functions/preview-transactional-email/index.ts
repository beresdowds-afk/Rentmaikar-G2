import * as React from 'npm:react@18.3.1'
import { renderAsync } from 'npm:@react-email/components@0.0.22'
import { corsHeaders } from '../_shared/cors.ts'
import { TEMPLATES } from '../_shared/transactional-email-templates/registry.ts'

// Renders all registered templates with their previewData.
// Gated by the internal email bridge secret — only authorized backend callers invoke this.

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders })
  }

  const expectedSecrets = [
    Deno.env.get('RENTMAIKAR_INTERNAL_EMAIL_BRIDGE_SECRET') || '',
    Deno.env.get('RENTMAIKAR_INTERNAL_SERVICE_SECRET') || '',
  ]
    .map((s) => s.trim())
    .filter(Boolean)

  if (expectedSecrets.length === 0) {
    return new Response(
      JSON.stringify({ error: 'Server configuration error' }),
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    )
  }

  const authHeader = req.headers.get('Authorization')
  const bearerToken = authHeader?.replace(/^Bearer\s+/i, '').trim() || ''
  const internalHeader = (req.headers.get('x-rentmaikar-internal-secret') || '').trim()
  const provided = internalHeader || bearerToken
  if (!provided || !expectedSecrets.includes(provided)) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), {
      status: 401,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    })
  }

  const templateNames = Object.keys(TEMPLATES)
  const results: Array<{
    templateName: string
    displayName: string
    subject: string
    html: string
    status: 'ready' | 'preview_data_required' | 'render_failed'
    errorMessage?: string
  }> = []

  for (const name of templateNames) {
    const entry = TEMPLATES[name]
    const displayName = entry.displayName || name

    if (!entry.previewData) {
      results.push({
        templateName: name,
        displayName,
        subject: '',
        html: '',
        status: 'preview_data_required',
      })
      continue
    }

    try {
      const html = await renderAsync(
        React.createElement(entry.component, entry.previewData)
      )
      const resolvedSubject =
        typeof entry.subject === 'function'
          ? entry.subject(entry.previewData)
          : entry.subject

      results.push({
        templateName: name,
        displayName,
        subject: resolvedSubject,
        html,
        status: 'ready',
      })
    } catch (err) {
      console.error('Failed to render template for preview', {
        template: name,
        error: err,
      })
      results.push({
        templateName: name,
        displayName,
        subject: '',
        html: '',
        status: 'render_failed',
        errorMessage: err instanceof Error ? err.message : String(err),
      })
    }
  }

  return new Response(JSON.stringify({ templates: results }), {
    status: 200,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
})
