# Deploying your own copy

Two ways. Pick the static one unless you want read marks synced between devices.

## 1. Static: any host, marks stay on the device

```bash
npm ci
npm run build          # writes dist/
```

Serve `dist/` from any static host (Cloudflare Pages, GitHub Pages, Netlify, a folder on your server). Configure the host to answer unknown paths with `index.html` (single-page app). Everything works offline after the first visit: the catalogue, the map, the marks, the spoiler filter. Read marks live in the browser's storage; **Settings > Export** and **Import** move them between devices by hand.

There is no `/api/state` on a static host, so the sync indicator says it cannot sync. Nothing is lost: the device stays the source of truth.

## 2. Full: Cloudflare Worker, KV and Access, with sync

The Worker in `worker/` serves `dist/` and one endpoint, `/api/state`, which stores each person's marks in Workers KV under the email that Cloudflare Access signs. **Sync needs Access**: without an Access token there is no email to key the marks by, and the endpoint refuses.

You need a Cloudflare account with a zone (a domain) on it.

### 2.1 Access first

Deploy nothing before Access protects the hostname.

1. In the Cloudflare dashboard open **Zero Trust**. The first time it asks for a **team name**: it becomes `<team>.cloudflareaccess.com`. The Free plan is enough.
2. **Zero Trust > Integrations > Identity providers > Add new > One-time PIN**, so a code reaches your email.
3. **Zero Trust > Access controls > Applications > Create new application > Self-hosted > Add public hostname**: the subdomain and domain you will use (for example `reading.example.org`). Add an **Allow** policy with the rule *Emails* equal to the addresses allowed in. Session duration as you like.
4. Note two values: the **team name** (Zero Trust > Settings, the part before `.cloudflareaccess.com`) and the application's **AUD tag** (the application > Edit > Additional settings > Application Audience (AUD) Tag).

### 2.2 The KV namespace

```bash
npx wrangler login
npx wrangler kv namespace create cosmere-state   # prints an id
npx wrangler logout
```

### 2.3 The six repository secrets

`wrangler.jsonc` holds placeholders (`PLACEHOLDER-hostname`, `PLACEHOLDER-team`, `PLACEHOLDER-aud`, `PLACEHOLDER-kv`), never real values. The deploy job writes them from the repository's secrets with `scripts/fill-deploy-config.ts`. Secrets, not variables, because Actions logs are public on a public repository and secrets are masked in them.

| Secret | Value |
| --- | --- |
| `CLOUDFLARE_API_TOKEN` | A custom API token: Account > Workers Scripts > Edit; Account > Workers KV Storage > Edit; Zone > Workers Routes > Edit, limited to your zone. |
| `CLOUDFLARE_ACCOUNT_ID` | Your account id (dashboard sidebar). |
| `SITE_HOSTNAME` | The hostname Access protects, e.g. `reading.example.org`. |
| `ACCESS_TEAM` | The team name from 2.1. |
| `ACCESS_AUD` | The AUD tag from 2.1. |
| `KV_ID` | The id from 2.2. |

```bash
gh secret set CLOUDFLARE_API_TOKEN   # each command asks for the value
gh secret set CLOUDFLARE_ACCOUNT_ID
gh secret set SITE_HOSTNAME
gh secret set ACCESS_TEAM
gh secret set ACCESS_AUD
gh secret set KV_ID
```

Values may contain only letters, digits, dot, underscore and hyphen; the fill script refuses anything else and never prints a value.

### 2.4 What the CI does

`.github/workflows/ci.yml` runs on every push: lint, unit tests, the data validator, the build and the end-to-end tests. On a push to `main` that passes, the `deploy` job:

1. does nothing, and succeeds, while `CLOUDFLARE_API_TOKEN` is missing;
2. fills `wrangler.jsonc` from the secrets, and fails, naming them, if any is missing;
3. refuses to deploy while a placeholder is left (`scripts/check-deploy-config.ts`);
4. builds again from scratch;
5. checks that `https://$SITE_HOSTNAME/data/connections.json` answers with a redirect to Access, and stops if the site answers without it (a host that does not resolve yet, on a first deploy, goes through);
6. runs `npx wrangler deploy`, which creates the DNS record and certificate for the hostname on the first deploy (it fails if a record with that name already exists: remove it first);
7. checks the Access redirect again, and fails loudly if it is gone.

### 2.5 Deploying by hand

```bash
export SITE_HOSTNAME=reading.example.org ACCESS_TEAM=my-team ACCESS_AUD=… KV_ID=…
npx tsx scripts/fill-deploy-config.ts   # writes the values into wrangler.jsonc
npm run build
npx wrangler login && npx wrangler deploy && npx wrangler logout
git checkout wrangler.jsonc             # never commit the filled file
```

### 2.6 Checks

Signed out, every path must answer 302 towards `cloudflareaccess.com`:

```bash
for p in / /data/books.json /data/connections.json /api/state; do
  curl -s -o /dev/null -w "$p %{http_code} %{redirect_url}\n" "https://$SITE_HOSTNAME$p"
done
```

The Worker's `workers.dev` name and preview URLs are off in `wrangler.jsonc` (`workers_dev: false`, `preview_urls: false`): the hostname behind Access is the only address.

### 2.7 When something fails

- **401 or 500 when signed in:** `ACCESS_TEAM` or `ACCESS_AUD` is wrong. Fix the secret and redeploy.
- **The Access check fails after a deploy:** the site may be open. Check the Access application first.
- **Close the site now:** **Workers & Pages > cosmere-reading-order > Settings > Domains & Routes**, remove the hostname. It stops answering at once; KV keeps its data.
- **A path does not answer 302:** the Access application does not cover that hostname. It must be the bare hostname, with no path.
- **A token permission error:** add the permission the error names to the same token.
- **Roll back:** `npx wrangler rollback`. It does not undo what KV stored.
