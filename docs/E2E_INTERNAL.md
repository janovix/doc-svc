# E2E internal API (`doc-svc`)

Mounted at **`/api/v1/internal/e2e`**.

## Auth

Header **`x-e2e-api-key`** must match worker **`E2E_API_KEY`**. Configure with `wrangler secret put E2E_API_KEY` in deployed environments.

## `POST /purge`

Body: `{ "organizationIds": string[] }`.

1. Lists `document` rows for those orgs.
2. Deletes associated objects from **R2** (keys from `finalPdfKey`, JSON arrays on the row, etc.).
3. Deletes `document` and `uploadLink` rows for the orgs.

Response includes counts and any non-fatal R2 errors.

Intended caller: **`auth-svc`** `POST /api/admin/e2e/purge` fan-out only.
