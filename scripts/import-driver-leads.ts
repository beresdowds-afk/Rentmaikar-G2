/**
 * Ingestion Script: Import 600+ Driver Contacts as Initial Marketing Leads
 * Pulls all driver contacts from public.outreach_contacts, public.applications, and public.profiles,
 * checks opt-out suppression tables (messaging_opt_outs, email_suppression_list),
 * and idempotently inserts them into public.marketing_leads.
 */

import pg from 'pg';
const { Client } = pg;

export async function runDriverIngestion() {
  const client = new Client({
    host: 'db.jrsydiofzceoeddjogov.supabase.co',
    port: 5432,
    user: 'postgres',
    password: process.env.SUPABASE_DB_PASSWORD,
    database: 'postgres',
    ssl: { rejectUnauthorized: false },
  });

  await client.connect();
  console.log('[DriverIngestion] Connected to Supabase PostgreSQL');

  // 1. Fetch suppression lists (opt-outs)
  const optOutRows = await client.query('SELECT phone, channel FROM public.messaging_opt_outs WHERE opted_out_at IS NOT NULL');
  const emailSuppressionRows = await client.query('SELECT email FROM public.email_suppression_list WHERE is_active = true');

  const suppressedSet = new Set<string>();
  for (const r of optOutRows.rows) {
    if (r.phone) suppressedSet.add(r.phone.trim().toLowerCase());
  }
  for (const r of emailSuppressionRows.rows) {
    if (r.email) suppressedSet.add(r.email.trim().toLowerCase());
  }
  // 1b. Fetch valid auth user IDs to satisfy foreign key constraint
  const authUsersRes = await client.query('SELECT id FROM auth.users');
  const validUserIds = new Set<string>(authUsersRes.rows.map((r) => r.id));
  console.log(`[DriverIngestion] Found ${validUserIds.size} valid auth users`);

  // 2. Fetch all driver outreach contacts (600 contacts)
  const outreachRes = await client.query(`
    SELECT id, full_name, email, phone_e164, raw_phone, contact_type, status, source, notes, region, country_code, converted_user_id, created_at, updated_at
    FROM public.outreach_contacts
    WHERE contact_type = 'driver'
    ORDER BY created_at ASC
  `);
  console.log(`[DriverIngestion] Found ${outreachRes.rows.length} driver contacts in outreach_contacts`);

  // 3. Fetch driver applications
  const appRes = await client.query(`
    SELECT id, first_name, last_name, email, phone_number, phone_country, city, country, status, user_id, created_at
    FROM public.applications
    WHERE application_type = 'driver'
    ORDER BY created_at ASC
  `);
  console.log(`[DriverIngestion] Found ${appRes.rows.length} driver applications`);

  // 4. Combine and deduplicate
  interface CandidateLead {
    sourceId: string;
    first_name: string;
    last_name: string;
    full_name: string;
    email: string | null;
    phone: string | null;
    country: string;
    city: string | null;
    target_role: 'driver';
    stage: string;
    acquisition_source: string;
    campaign_name: string;
    user_id: string | null;
    opted_out: boolean;
    opt_out_reason: string | null;
    tags: string[];
    notes: string | null;
    metadata: Record<string, any>;
  }

  const candidateMap = new Map<string, CandidateLead>();

  for (const r of outreachRes.rows) {
    const rawName = (r.full_name || 'Driver Prospect').trim();
    const nameParts = rawName.split(' ');
    const firstName = nameParts[0] || 'Driver';
    const lastName = nameParts.slice(1).join(' ') || '';
    const phone = r.phone_e164 ? r.phone_e164.trim() : (r.raw_phone ? r.raw_phone.trim() : null);
    const email = r.email ? r.email.trim().toLowerCase() : null;

    let country = 'US';
    if (r.country_code === 'NG' || r.region === 'Nigeria' || (phone && phone.startsWith('+234'))) {
      country = 'NG';
    } else if (r.country_code === 'US' || r.region === 'USA' || (phone && phone.startsWith('+1'))) {
      country = 'US';
    } else if (r.country_code) {
      country = r.country_code.replace('+', '');
    }

    const isSuppressed = (phone && suppressedSet.has(phone.toLowerCase())) ||
                         (email && suppressedSet.has(email.toLowerCase())) ||
                         r.status === 'opted_out';

    let stage = 'NEW';
    if (isSuppressed) {
      stage = 'OPTED_OUT';
    } else if (r.status === 'signed_up' || r.converted_user_id) {
      stage = 'REGISTERED';
    } else if (r.status === 'contacted') {
      stage = 'CONTACTED';
    }

    const userId = (r.converted_user_id && validUserIds.has(r.converted_user_id)) ? r.converted_user_id : null;

    const dedupKey = (phone || email || r.id).toLowerCase();
    candidateMap.set(dedupKey, {
      sourceId: r.id,
      first_name: firstName,
      last_name: lastName,
      full_name: rawName,
      email,
      phone,
      country,
      city: r.region || null,
      target_role: 'driver',
      stage,
      acquisition_source: 'outreach',
      campaign_name: 'Monthly Driver Roster Campaign',
      user_id: userId,
      opted_out: isSuppressed,
      opt_out_reason: isSuppressed ? 'Found in opt-out suppression list or marked opted_out' : null,
      tags: ['driver_contacts_600', 'driver_roster', 'outreach_import'],
      notes: r.notes || `Imported from outreach roster source: ${r.source || 'driver_contacts'}`,
      metadata: {
        original_contact_id: r.id,
        source_file: r.source,
        imported_at: new Date().toISOString(),
      },
    });
  }

  // Merge applicants
  for (const r of appRes.rows) {
    const firstName = (r.first_name || 'Driver').trim();
    const lastName = (r.last_name || '').trim();
    const fullName = `${firstName} ${lastName}`.trim();
    const phone = r.phone_number ? r.phone_number.trim() : null;
    const email = r.email ? r.email.trim().toLowerCase() : null;
    const applicantUserId = (r.user_id && validUserIds.has(r.user_id)) ? r.user_id : null;

    const dedupKey = (phone || email || r.id).toLowerCase();
    if (candidateMap.has(dedupKey)) {
      // Update with user_id if applicant has one and valid
      const existing = candidateMap.get(dedupKey)!;
      if (applicantUserId && !existing.user_id) {
        existing.user_id = applicantUserId;
        if (existing.stage === 'NEW') existing.stage = 'REGISTERED';
      }
      continue;
    }

    const isSuppressed = (phone && suppressedSet.has(phone.toLowerCase())) ||
                         (email && suppressedSet.has(email.toLowerCase()));

    candidateMap.set(dedupKey, {
      sourceId: r.id,
      first_name: firstName,
      last_name: lastName,
      full_name: fullName,
      email,
      phone,
      country: r.country === 'Nigeria' ? 'NG' : 'US',
      city: r.city || null,
      target_role: 'driver',
      stage: isSuppressed ? 'OPTED_OUT' : (applicantUserId ? 'REGISTERED' : 'NEW'),
      acquisition_source: 'outreach',
      campaign_name: 'Monthly Driver Roster Campaign',
      user_id: applicantUserId,
      opted_out: isSuppressed,
      opt_out_reason: isSuppressed ? 'Found in suppression list' : null,
      tags: ['driver_contacts_600', 'driver_applicant', 'outreach_import'],
      notes: `Imported from driver application (status: ${r.status})`,
      metadata: {
        application_id: r.id,
        application_status: r.status,
        imported_at: new Date().toISOString(),
      },
    });
  }

  const allCandidates = Array.from(candidateMap.values());
  console.log(`[DriverIngestion] Deduplicated into ${allCandidates.length} unique driver leads`);

  // 5. Batch Insert into public.marketing_leads with fast memory lookup
  let inserted = 0;
  let updated = 0;
  let optedOutCount = 0;

  const existingLeadsRes = await client.query('SELECT id, phone, email FROM public.marketing_leads');
  const existingByPhone = new Map<string, string>();
  const existingByEmail = new Map<string, string>();
  for (const r of existingLeadsRes.rows) {
    if (r.phone) existingByPhone.set(r.phone.trim(), r.id);
    if (r.email) existingByEmail.set(r.email.trim().toLowerCase(), r.id);
  }

  const toInsert: CandidateLead[] = [];
  const toUpdate: { id: string; lead: CandidateLead }[] = [];
  const insertedInThisRunPhones = new Set<string>();
  const insertedInThisRunEmails = new Set<string>();

  for (const c of allCandidates) {
    if (c.opted_out) optedOutCount++;
    const existingId = (c.phone ? existingByPhone.get(c.phone) : null) ||
                       (c.email ? existingByEmail.get(c.email.toLowerCase()) : null);

    if (existingId) {
      toUpdate.push({ id: existingId, lead: c });
    } else {
      // Check if duplicate within this batch run
      const isDupInBatch = (c.phone && insertedInThisRunPhones.has(c.phone)) ||
                           (c.email && insertedInThisRunEmails.has(c.email.toLowerCase()));
      if (!isDupInBatch) {
        toInsert.push(c);
        if (c.phone) insertedInThisRunPhones.add(c.phone);
        if (c.email) insertedInThisRunEmails.add(c.email.toLowerCase());
      }
    }
  }

  // Bulk insert new leads in chunks of 50
  const CHUNK_SIZE = 50;
  for (let i = 0; i < toInsert.length; i += CHUNK_SIZE) {
    const chunk = toInsert.slice(i, i + CHUNK_SIZE);
    const valuePlaceholders: string[] = [];
    const params: any[] = [];
    let pIdx = 1;

    for (const c of chunk) {
      valuePlaceholders.push(`(
        $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++},
        $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++},
        $${pIdx++}, $${pIdx++}, $${pIdx++},
        $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}, $${pIdx++}
      )`);
      params.push(
        c.first_name, c.last_name, c.full_name, c.email, c.phone, c.country, c.city,
        c.target_role, c.stage, c.acquisition_source, c.campaign_name,
        'driver_roster', 'outreach', 'monthly_driver_cycle',
        c.user_id, c.opted_out, c.opt_out_reason, c.tags, c.notes, JSON.stringify(c.metadata)
      );
    }

    await client.query(`
      INSERT INTO public.marketing_leads (
        first_name, last_name, full_name, email, phone, country, city,
        target_role, stage, acquisition_source, campaign_name,
        utm_source, utm_medium, utm_campaign,
        user_id, opted_out, opt_out_reason, tags, notes, metadata
      ) VALUES ${valuePlaceholders.join(', ')}
    `, params);
    inserted += chunk.length;
  }

  // Update existing leads
  for (const item of toUpdate) {
    await client.query(`
      UPDATE public.marketing_leads
      SET full_name = $1, first_name = $2, last_name = $3, email = COALESCE($4, email),
          phone = COALESCE($5, phone), user_id = COALESCE($6, user_id),
          target_role = 'driver', tags = array_cat(tags, $7::text[]),
          opted_out = $8, opt_out_reason = $9, updated_at = now()
      WHERE id = $10
    `, [item.lead.full_name, item.lead.first_name, item.lead.last_name, item.lead.email, item.lead.phone, item.lead.user_id, ['driver_contacts_600'], item.lead.opted_out, item.lead.opt_out_reason, item.id]);
    updated++;
  }

  console.log(`[DriverIngestion] Complete! Inserted: ${inserted}, Updated: ${updated}, Opted-Out: ${optedOutCount}, Total: ${allCandidates.length}`);

  // 6. Ensure the Monthly Campaign Cycle record exists in public.marketing_campaign_cycles
  const currentMonth = new Date().toISOString().slice(0, 7); // '2026-09'
  const nextMonthDate = new Date();
  nextMonthDate.setMonth(nextMonthDate.getMonth() + 1);
  const nextMonth = nextMonthDate.toISOString().slice(0, 7);

  await client.query(`
    INSERT INTO public.marketing_campaign_cycles (
      cycle_name, target_audience, frequency, status, cycle_month,
      scheduled_for, total_recipients, channels, message_template, compliance_statement
    ) VALUES (
      $1, $2, $3, $4, $5,
      now() + interval '1 hour', $6, $7, $8, $9
    )
    ON CONFLICT DO NOTHING
  `, [
    `${currentMonth} Monthly Driver Roster Campaign`,
    'driver_contacts_600',
    'monthly',
    'scheduled',
    currentMonth,
    allCandidates.filter(c => !c.opted_out).length,
    ['sms', 'email'],
    JSON.stringify({
      smsText: 'Hello {{first_name}} from RentMaikar! New weekly driver slots & rent-to-own vehicles are open in your area with zero upfront deposit. See available cars: https://rentmaikar.com/catalogue?utm_source=driver_roster&utm_medium=sms&utm_campaign=monthly_driver_cycle\n\nReply STOP to opt out. RentMaikar Fleet',
      emailSubject: 'RentMaikar Monthly Driver Update: Available Fleet & Weekly Earnings',
      emailBody: 'Hello {{customer_name}},\n\nHere is your monthly RentMaikar fleet update with verified sedans and SUVs ready for weekly dispatch.\n\nTo view vehicles: https://rentmaikar.com/catalogue\n\n---\nRentMaikar Fleet Operations | CAN-SPAM Compliant\nTo unsubscribe, visit: https://rentmaikar.com/unsubscribe?email={{email}} or reply STOP.',
    }),
    'Reply STOP to opt out. RentMaikar Fleet Operations complies strictly with TCPA & CAN-SPAM regulations.',
  ]);

  console.log(`[DriverIngestion] Monthly campaign cycle scheduled for ${currentMonth}`);
  await client.end();

  return {
    total: allCandidates.length,
    inserted,
    updated,
    optedOutCount,
    cycleMonth: currentMonth,
  };
}

// Auto-run if executed directly
if (process.argv[1]?.includes('import-driver-leads')) {
  runDriverIngestion().catch((err) => {
    console.error('[DriverIngestion] Error:', err);
    process.exit(1);
  });
}
