# Security

## Reporting

Please report vulnerabilities privately, through GitHub's
["Report a vulnerability"](https://github.com/illeniall239/EDI/security/advisories/new)
form rather than a public issue. A rough timeline, what you did, and what you
saw is plenty.

## Things that look like bugs and are not

**Row-level security is enabled with no policies.** Every table is closed to
the `anon` role. That is deliberate: the anon key ships inside the browser
bundle by design, so any policy written for it is a policy written for the
public. The browser never queries the database — the backend does, with the
service-role key, which bypasses RLS. Opening these tables up is what would be
the vulnerability.

**Workspaces have no owner and no access control.** There is no sign-in. A
workspace is a UUID kept in `localStorage`, and anyone who has that UUID can
open it. They are unguessable, but this is not authorisation — it is stated in
the README, and a deployment you have shared should not hold anything
sensitive.

**`allow_origins=["*"]`.** Frontend and backend are one origin in every
supported deployment, so CORS is not doing any work. Worth tightening if you
split them.

## Things that genuinely matter

- **`SUPABASE_SERVICE_ROLE_KEY` bypasses row-level security.** It must stay
  server-side. It must never appear in a `NEXT_PUBLIC_` variable, because Next
  inlines those into the browser bundle at build time.
- **A public deployment is a public model budget.** `backend/limits.py` caps
  per-visitor and global daily usage. The global cap is the one that bounds the
  bill, because it counts calls rather than callers. The caps **fail open** if
  the `usage_counters` migration has not been applied — `GET /api/health`
  reports which mode you are in.
- **Uploaded data goes to whichever model you configured.** If that is a hosted
  provider, the contents of the sheet leave your machine. If that matters, run
  a local model through Ollama.

## Supported versions

The `main` branch. This is a personal project, not a product with a support
window.
