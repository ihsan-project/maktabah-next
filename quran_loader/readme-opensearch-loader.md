# Quran XML to OpenSearch Loader

This tool imports Quran translations from XML files into OpenSearch for efficient text search. It processes XML files in the Tanzil project format and indexes verses with chapter, verse, and translator information.

## Features

- Imports XML files containing Quran translations into OpenSearch
- Supports multiple translations with the translator parameter
- Creates proper mapping for Arabic and English text search
- Handles the Tanzil XML format with sura and aya elements
- Bulk loading with batching for large datasets
- Test search functionality after import

## XML Format

The tool accepts XML files in the following format:

```xml
<quran>
  <sura index="1" name="Al-Fatiha">
    <aya index="1" text="In the name of Allah, most benevolent, ever-merciful."/>
    <aya index="2" text="ALL PRAISE BE to Allah, Lord of all the worlds,"/>
    <!-- More verses... -->
  </sura>
  <!-- More chapters... -->
</quran>
```

Where:
- `sura` element represents a chapter/surah with `index` and optional `name` attributes
- `aya` element represents a verse/ayah with `index` and `text` attributes

## Installation

1. Clone this repository or download the files
2. Install dependencies:

```bash
npm install
```

## AWS Setup

The loader authenticates to OpenSearch using **AWS SigV4 request signing** (not basic auth) and calls **Amazon Bedrock** for embeddings. Both are reached with a single IAM user's access key. If you already set up the `maktabah-functions` user for the Firebase Functions (see the root [README](../README.md)), you can reuse those same credentials here. If not, the steps below create a loader-ready IAM user from scratch.

### 1. Create an IAM user

[IAM Console](https://console.aws.amazon.com/iam/home#/users) → **Users** → **Create user**:

- **User name:** `maktabah-functions` (or a loader-specific name like `maktabah-loader`)
- **Do not** enable console access — this user is programmatic-only.
- On the permissions step, select **Attach policies directly** but do not select a managed policy. You'll add an inline policy in the next step.

### 2. Attach an inline policy

Open the new user → **Permissions** tab → **Add permissions** → **Create inline policy** → **JSON** tab → paste:

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Sid": "OpenSearchHttpAccess",
      "Effect": "Allow",
      "Action": ["es:ESHttpGet", "es:ESHttpPost", "es:ESHttpPut", "es:ESHttpDelete", "es:ESHttpHead"],
      "Resource": "arn:aws:es:us-east-1:<ACCOUNT_ID>:domain/maktabah/*"
    },
    {
      "Sid": "BedrockInvokeEmbedding",
      "Effect": "Allow",
      "Action": "bedrock:InvokeModel",
      "Resource": "arn:aws:bedrock:us-east-1::foundation-model/cohere.embed-multilingual-v3"
    }
  ]
}
```

Replace `<ACCOUNT_ID>` with your AWS account ID (top-right of the console, or `aws sts get-caller-identity --query Account --output text`). Save the policy.

> **Loader vs. Firebase Functions permissions:** the loader needs write permissions (`es:ESHttpPut`, `es:ESHttpDelete`) because it creates the index and bulk-writes documents. The Firebase Functions user only needs read permissions (`es:ESHttpGet`, `es:ESHttpPost`, `es:ESHttpHead`). If you're sharing one IAM user between both, use the broader policy shown here.

### 3. Create access keys

User's **Security credentials** tab → **Access keys** → **Create access key** → use case **Application running outside AWS**. Save the access key ID and secret — you'll put them in `.env` below.

### 4. Map the IAM user in OpenSearch Dashboards

The IAM policy lets requests *reach* the domain, but OpenSearch's fine-grained access control must also grant permissions *inside* the cluster. If you skip this step, every request returns `403 security_exception`.

1. Open the [Amazon OpenSearch Service console](https://console.aws.amazon.com/aos/home/) → **Domains** → click your domain.
2. On **General information**, click the **OpenSearch Dashboards URL** and log in with the domain's master user.
3. In the left navigation pane, under **Management**, choose **Security** → **Roles**.
4. Pick a role: `all_access` is simplest for the loader (it needs to create indices and bulk-write); a custom role scoped to the `kitaab` index works too.
5. **Mapped users** tab → **Manage mapping**. Because this is an IAM **user** (not a role), paste the ARN into the **Users** field:
   ```
   arn:aws:iam::<ACCOUNT_ID>:user/maktabah-functions
   ```
   Click **Map**.

> **Users vs. Backend roles:** IAM **user** ARNs go in the **Users** field. IAM **role** ARNs go in **Backend roles**. See the [AWS FGAC docs](https://docs.aws.amazon.com/opensearch-service/latest/developerguide/fgac.html#fgac-mapping).

## Configuration

Create a `.env` file in the `quran_loader/` directory based on `.env.example`, using the access keys from the AWS Setup above:

```env
OPENSEARCH_URL=https://your-opensearch-domain.us-east-1.es.amazonaws.com
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
NODE_ENV=development
```

### Verify the connection

Before running the loader, confirm the credentials and role mapping work:

```bash
node -e "
require('dotenv').config();
const { getOpenSearchClient } = require('./opensearch-client');
(async () => {
  const h = await getOpenSearchClient().cluster.health();
  console.log('cluster:', h.body.cluster_name, '| status:', h.body.status);
})().catch(e => { console.error('FAIL:', e.meta?.statusCode || '', e.message); process.exit(1); });
"
```

Expected output: `cluster: <name> | status: green`. If you see `FAIL: 403`, revisit step 4 (role mapping) — the most common cause is pasting the IAM user ARN into **Backend roles** instead of **Users**.

## Usage

Run the script with the XML file path, author name, and optional dataset ID:

```bash
npm run loader:load-opensearch -- path/to/quran.xml --author="Author Name" --id="unique-identifier"
```

If you don't specify an author, the filename (without extension) will be used as the author name.
If you don't specify an ID, one will be automatically generated based on the author name and timestamp.

### Example

```bash
# loaded:
npm run loader:load-opensearch -- translations/en.ahmedali.xml --author="Ahmed Ali" --id="en.ahmedali" --title="quran"
npm run loader:load-opensearch -- translations/en.ahmedraza.xml --author="Ahmed Raza Khan" --id="en.ahmedraza" --title="quran"
npm run loader:load-opensearch -- translations/en.arberry.xml --author="Arberry" --id="en.arberry" --title="quran"
npm run loader:load-opensearch -- translations/en.daryabadi.xml --author="Daryabadi" --id="en.daryabadi" --title="quran"
npm run loader:load-opensearch -- translations/en.hilali.xml --author="Hilali & Khan" --id="en.hilali" --title="quran"
npm run loader:load-opensearch -- translations/en.itani.xml --author="Itani" --id="en.itani" --title="quran"
npm run loader:load-opensearch -- translations/en.maududi.xml --author="Maududi" --id="en.maududi" --title="quran"
npm run loader:load-opensearch -- translations/en.mubarakpuri.xml --author="Mubarakpuri" --id="en.mubarakpuri" --title="quran"
npm run loader:load-opensearch -- translations/en.pickthall.xml --author="Pickthall" --id="en.pickthall" --title="quran"
npm run loader:load-opensearch -- translations/en.qarai.xml --author="Qarai" --id="en.qarai" --title="quran"
npm run loader:load-opensearch -- translations/en.qaribullah.xml --author="Qaribullah & Darwish" --id="en.qaribullah" --title="quran"
npm run loader:load-opensearch -- translations/en.sahih.xml --author="Saheeh International" --id="en.sahih" --title="quran"
npm run loader:load-opensearch -- translations/en.sarwar.xml --author="Sarwar" --id="en.sarwar" --title="quran"
npm run loader:load-opensearch -- translations/en.shakir.xml --author="Shakir" --id="en.shakir" --title="quran"
npm run loader:load-opensearch -- translations/en.wahiduddin.xml --author="Wahiduddin Khan" --id="en.wahiduddin" --title="quran"
npm run loader:load-opensearch -- translations/en.yusufali.xml --author="Yusuf Ali" --id="en.yusufali" --title="quran"


npm run loader:load-opensearch -- translations/en.bukhari.vol01.xml --title="bukhari" --author="Dr. Muhammad Muhsin" --id="en.bukhari.vol01"  --volume=1
npm run loader:load-opensearch -- translations/en.bukhari.vol02.xml --title="bukhari" --author="Dr. Muhammad Muhsin" --id="en.bukhari.vol02"  --volume=2
npm run loader:load-opensearch -- translations/en.bukhari.vol03.xml --title="bukhari" --author="Dr. Muhammad Muhsin" --id="en.bukhari.vol03"  --volume=3
npm run loader:load-opensearch -- translations/en.bukhari.vol04.xml --title="bukhari" --author="Dr. Muhammad Muhsin" --id="en.bukhari.vol04"  --volume=4
npm run loader:load-opensearch -- translations/en.bukhari.vol05.xml --title="bukhari" --author="Dr. Muhammad Muhsin" --id="en.bukhari.vol05"  --volume=5
npm run loader:load-opensearch -- translations/en.bukhari.vol06.xml --title="bukhari" --author="Dr. Muhammad Muhsin" --id="en.bukhari.vol06"  --volume=6
npm run loader:load-opensearch -- translations/en.bukhari.vol07.xml --title="bukhari" --author="Dr. Muhammad Muhsin" --id="en.bukhari.vol07"  --volume=7
npm run loader:load-opensearch -- translations/en.bukhari.vol08.xml --title="bukhari" --author="Dr. Muhammad Muhsin" --id="en.bukhari.vol08"  --volume=8
npm run loader:load-opensearch -- translations/en.bukhari.vol09.xml --title="bukhari" --author="Dr. Muhammad Muhsin" --id="en.bukhari.vol09"  --volume=9
```

## OpenSearch Mapping

The script creates an OpenSearch index named `kitaab` with the following features:

- Dual analyzers for both Arabic and English text
- Proper field mappings for efficient search
- Fields for chapter number, verse number, text, translator, and chapter name
- Unique document IDs based on chapter, verse, and translator

## Adding More Translations

You can run the script multiple times with different XML files and translator names. Each translation will be added to the same OpenSearch index but with its own translator field, allowing you to:

1. Search across all translations
2. Search within a specific translation
3. Compare translations for the same verse

## Searching the Index

Use the search script to test keyword, semantic, and hybrid searches against the index.

### Debug / Inspect the Index

Check what's in the index (authors, titles, document counts, sample doc):

```bash
npm run loader:search -- --debug
```

### Keyword Search

Standard text-based search using OpenSearch's BM25 ranking:

```bash
npm run loader:search -- --query="Allah" --mode=keyword
npm run loader:search -- --query="mercy" --mode=keyword --author="Ahmed Ali" --title="quran"
npm run loader:search -- --query="Narrated" --mode=keyword --title="bukhari" --size=10
```

### Semantic Search

Vector-based search using Cohere multilingual embeddings via AWS Bedrock. Finds conceptually similar results even if exact words don't match:

```bash
npm run loader:search -- --query="verses about mercy and compassion" --mode=semantic
npm run loader:search -- --query="stories about prayer" --mode=semantic --title="bukhari"
npm run loader:search -- --query="guidance for mankind" --mode=semantic --author="Arberry"
```

### Hybrid Search

Combines keyword and semantic search for best results — matches on both exact terms and meaning:

```bash
npm run loader:search -- --query="paradise" --mode=hybrid
npm run loader:search -- --query="patience in hardship" --mode=hybrid --author="Arberry" --title="quran"
```

### Run All Three Modes

Omit `--mode` (or use `--mode=all`) to run keyword, semantic, and hybrid searches together:

```bash
npm run loader:search -- --query="Allah" --author="Arberry" --title="quran"
```

### Options

| Option | Description | Default |
|---|---|---|
| `--query="term"` | Search query (required unless `--debug`) | — |
| `--author="name"` | Filter by author (e.g., `"Arberry"`, `"Ahmed Ali"`) | none |
| `--title="quran"` | Filter by title (`"quran"` or `"bukhari"`) | none |
| `--mode="all"` | Search mode: `keyword`, `semantic`, `hybrid`, or `all` | `all` |
| `--size=5` | Number of results per search | `5` |
| `--debug` | Show index stats, authors, titles, and a sample document | off |

## Troubleshooting

If you encounter errors:

1. **XML Parsing Issues**: Check your XML format. The XML must be well-formed and follow the expected structure.
2. **OpenSearch Connection Errors**:
   - `403 security_exception` — the IAM user isn't mapped to an OpenSearch role. Revisit AWS Setup step 4; confirm the ARN was pasted into the **Users** field (not Backend roles).
   - `401 Unauthorized` (raw, no JSON body) — the domain is rejecting SigV4 entirely. Verify `AWS_REGION` matches the domain's region.
   - `getaddrinfo ENOTFOUND` — `OPENSEARCH_URL` is malformed or unreachable.
   - Use the connection verification snippet in the Configuration section above to isolate the problem quickly.
3. **Memory Issues**: For very large files, adjust the `BATCH_SIZE` constant in the code.

## Recovering from a Missing or Deleted `kitaab` Index

AWS OpenSearch Service takes **automatic hourly snapshots** of the domain and retains them for 14 days in a managed S3 repository named `cs-automated-enc`. If `kitaab` is deleted — accidentally, by a rogue script, or by someone clicking the wrong button in Dashboards — you can almost always restore it from a snapshot **without reindexing**, as long as you catch it within 14 days.

### Symptoms

- The search API returns HTTP 500 with `{"error":"Internal server error"}`.
- Firebase function logs show: `ResponseError: index_not_found_exception: [index_not_found_exception] Reason: no such index [kitaab]`.
- Direct check — `kitaab` is missing from the index list:
  ```bash
  curl -s --aws-sigv4 "aws:amz:us-east-1:es" --user "$AWS_KEY:$AWS_SECRET" \
    "$DOMAIN/_cat/indices?v"
  ```

### Early detection

The failure is silent until a user queries the search API. To catch it sooner:

- **Uptime monitor** (UptimeRobot, GCP Cloud Monitoring, etc.) hitting `https://maktabahapp.com/api/search?q=test&size=1&mode=text` every few minutes — alerts on any non-200.
- **CloudWatch alarm** on the OpenSearch domain's `SearchableDocuments` metric — alerts when doc count drops by more than ~10k.
- **Enable OpenSearch audit logs** (Domain → Logs → "Audit logs") — index deletes get written to CloudWatch, so you can identify *who* deleted what.

### Recovery steps

Set up shell variables once (the `maktabah-functions` IAM user has the necessary permissions):

```bash
export AWS_KEY=$(firebase functions:secrets:access AWS_ACCESS_KEY_ID 2>/dev/null)
export AWS_SECRET=$(firebase functions:secrets:access AWS_SECRET_ACCESS_KEY 2>/dev/null)
export DOMAIN=https://search-maktabah-ktgtplrd37c2wezyzrk24hhtba.aos.us-east-1.on.aws
```

**1. Find the most recent snapshot that still contains `kitaab`:**

```bash
curl -s --aws-sigv4 "aws:amz:us-east-1:es" --user "$AWS_KEY:$AWS_SECRET" \
  "$DOMAIN/_snapshot/cs-automated-enc/_all" | python3 -c "
import sys, json
snaps = json.load(sys.stdin).get('snapshots', [])
with_kitaab = [s for s in snaps if 'kitaab' in s.get('indices', [])]
if with_kitaab:
    s = with_kitaab[-1]
    print(f'Latest snapshot with kitaab: {s[\"start_time\"]}')
    print(f'Snapshot name: {s[\"snapshot\"]}')
else:
    print('No snapshot in the 14-day window contains kitaab — you will need to reindex.')
"
```

**2. Confirm `kitaab` does not currently exist** (a restore cannot overwrite an existing index):

```bash
curl -s --aws-sigv4 "aws:amz:us-east-1:es" --user "$AWS_KEY:$AWS_SECRET" \
  "$DOMAIN/_cat/indices/kitaab?v"
```

If it exists but is corrupted or partial, delete it first:

```bash
curl -s -X DELETE --aws-sigv4 "aws:amz:us-east-1:es" --user "$AWS_KEY:$AWS_SECRET" \
  "$DOMAIN/kitaab"
```

**3. Trigger the restore:**

```bash
SNAPSHOT=<paste snapshot name from step 1>
curl -s -X POST --aws-sigv4 "aws:amz:us-east-1:es" --user "$AWS_KEY:$AWS_SECRET" \
  -H "Content-Type: application/json" \
  "$DOMAIN/_snapshot/cs-automated-enc/$SNAPSHOT/_restore" \
  -d '{"indices": "kitaab"}'
# Expected response: {"accepted":true}
```

**4. Wait for shards to initialize** (blocks until green, up to 5 min):

```bash
curl -s --aws-sigv4 "aws:amz:us-east-1:es" --user "$AWS_KEY:$AWS_SECRET" \
  "$DOMAIN/_cluster/health/kitaab?wait_for_status=green&timeout=5m"
```

For ~1–2 GB of data this typically completes in 1–3 minutes. Querying the index before it's `green` returns `503 all shards failed` — that's expected during the recovery window, not a real error.

**5. Verify document count:**

```bash
curl -s --aws-sigv4 "aws:amz:us-east-1:es" --user "$AWS_KEY:$AWS_SECRET" \
  "$DOMAIN/kitaab/_count"
# Expected: ~100k docs
```

**6. Smoke-test the production API:**

```bash
curl -s -w "\nHTTP: %{http_code}\n" \
  "https://maktabahapp.com/api/search?q=mercy&page=1&size=2&mode=text"
```

### Data loss window

Restoring from an automatic snapshot rolls the index back to the snapshot's start time. Any data ingested after that snapshot is lost and must be reloaded from the source XML files. Since AWS snapshots run hourly, the worst-case loss is ~1 hour of ingests — provided the deletion was caught within 14 days.

### Longer-term: manual snapshots

Automatic snapshots only protect against *data-plane* loss (deleted indices on a still-alive domain). If the **domain itself** is deleted, all automatic snapshots vanish with it. For durable disaster recovery, register an S3 bucket you own as a manual snapshot repository and schedule daily snapshots via OpenSearch Dashboards → **Snapshot Management**. Storage cost for the full `kitaab` data is on the order of $0.05/month.

## License

ISC
