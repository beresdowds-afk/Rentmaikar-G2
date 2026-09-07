# Handoff documentation generators

Regenerate `docs/handoff/` from the live codebase and database. Run from the project root, in order:

```bash
python3 scripts/handoff/scan-env.py            # scans env usage -> /tmp/handoff/*
python3 scripts/handoff/generate-handoff-docs.py  # API-CONTRACT.md, CREDENTIALS.md, CUTOVER.md, backend.env.template
python3 scripts/handoff/generate-openapi.py    # openapi.yaml
npx @redocly/cli lint docs/handoff/openapi.yaml
```

The pg_cron schedule table inside `generate-handoff-docs.py` is a snapshot of `cron.job`; refresh it with:

```sql
select jobname, schedule, substring(command from 'functions/v1/([a-z0-9-]+)') as target from cron.job order by jobname;
```

New environment variables land in the docs automatically, but classify them in the `CRED` map so they are not reported as "unclassified".
