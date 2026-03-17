# Maktabah

A search application for Quran translations and Hadith collections, built with Next.js, TypeScript, and Firebase, powered by AWS OpenSearch.

## Features

- **Type Safety**: Full TypeScript implementation
- **Authentication**: Google Sign-in with Firebase Authentication
- **Search**: OpenSearch integration with Arabic/English analyzers, semantic vector search (Cohere via Bedrock), and hybrid search with RRF
- **Responsive Design**: Mobile-friendly interface with sliding menu
- **Protected Routes**: Authentication-required routes

## Technology Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Authentication**: Firebase Authentication
- **Search**: AWS OpenSearch + Cohere Embeddings via Amazon Bedrock
- **Hosting**: Firebase Hosting
- **API**: Firebase Cloud Functions

## Prerequisites

- Node.js 20+
- Firebase CLI (`npm install -g firebase-tools`)
- AWS account with OpenSearch and Bedrock access

## AWS OpenSearch Setup

### 1. Create an OpenSearch Domain

1. Go to the [AWS OpenSearch Console](https://console.aws.amazon.com/aos/home)
2. Click **Create domain**
3. Configure:
   - **Domain name:** `maktabah`
   - **Deployment type:** Development and testing
   - **Engine version:** OpenSearch 3.3 (latest)
   - **Instance type:** `t3.small.search` (2 vCPU, 2 GB RAM — sufficient for this workload)
   - **Number of nodes:** 1
   - **Storage:** 10 GB EBS (General Purpose SSD gp3)

   > **Instance sizing notes:** Vector search (KNN) uses additional memory (~4 bytes x 1024 dimensions x doc count). For ~120k documents this adds ~500MB. Use `t3.medium.search` (4 GB RAM) or larger to accommodate both text and vector indices. Avoid previous-generation `t2` instances — they don't support fine-grained access control or encryption at rest.
4. Under **Network:**
   - Choose **Public access** for simplicity, or **VPC access** for production
5. Under **Fine-grained access control:**
   - Enable fine-grained access control
   - Create a master user with username and password
6. Under **Access policy:**
   - Select "Only use fine-grained access control"
7. Click **Create**

Wait for the domain status to become **Active** (takes ~15 minutes).

### 2. Enable Cohere Embeddings on Amazon Bedrock

The semantic search feature uses Cohere's multilingual embedding model via Amazon Bedrock.

1. Go to the [Amazon Bedrock Console](https://console.aws.amazon.com/bedrock/home)
2. In the left nav, click **Model access**
3. Click **Manage model access**
4. Find **Cohere** → **Embed Multilingual v3** and check the box
5. Click **Save changes**

Model access is granted instantly — no approval wait time.

> **Note:** Bedrock model access is per-region. Make sure you enable it in the same region as your OpenSearch domain (default: `us-east-1`).

6. Create an IAM user (or use an existing one) with the `AmazonBedrockFullAccess` policy attached
7. Generate an **Access Key ID** and **Secret Access Key** for this user — you'll need these for both the loader and Firebase Functions

### 3. Get Your Domain Endpoint

Once active, copy the **Domain endpoint** from the AWS console. It looks like:
```
https://search-maktabah-xxxxxxxxxx.us-east-1.es.amazonaws.com
```

### 4. Configure Environment Variables

Create a `.env.local` file in the root directory:

```env
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your-measurement-id

# OpenSearch Configuration
OPENSEARCH_URL=https://search-maktabah-xxxxxxxxxx.us-east-1.es.amazonaws.com
OPENSEARCH_USERNAME=your_master_username
OPENSEARCH_PASSWORD=your_master_password
OPENSEARCH_INDEX=kitaab

# Analytics
NEXT_PUBLIC_MIXPANEL_TOKEN=your_mixpanel_token
```

For the quran_loader, create `quran_loader/.env`:

```env
OPENSEARCH_URL=https://search-maktabah-xxxxxxxxxx.us-east-1.es.amazonaws.com
OPENSEARCH_USERNAME=your_master_username
OPENSEARCH_PASSWORD=your_master_password

# AWS Bedrock (for generating embeddings during indexing)
AWS_REGION=us-east-1
AWS_ACCESS_KEY_ID=your_access_key_id
AWS_SECRET_ACCESS_KEY=your_secret_access_key
```

### 5. Set Firebase Function Secrets

```bash
firebase functions:secrets:set OPENSEARCH_URL
# Enter your OpenSearch domain endpoint when prompted

firebase functions:secrets:set OPENSEARCH_USERNAME
# Enter your master username when prompted

firebase functions:secrets:set OPENSEARCH_PASSWORD
# Enter your master password when prompted

# AWS Bedrock credentials (for semantic/hybrid search at query time)
firebase functions:secrets:set AWS_ACCESS_KEY_ID
firebase functions:secrets:set AWS_SECRET_ACCESS_KEY
```

### 6. Load Data into OpenSearch

```bash
# Install dependencies
npm install

# Load Quran translations
npm run loader:load-opensearch -- <xml-file> --author="Author Name" --id="unique-id" --title="quran"

# Load Hadith collections
npm run loader:load-opensearch -- <xml-file> --author="Author Name" --id="unique-id" --title="bukhari" --volume=1
```

The loader creates the `kitaab` index with custom Arabic/English analyzers and a `knn_vector` field for semantic search. Each document's text is embedded using Cohere Embed Multilingual v3 (1024 dimensions) via Bedrock during indexing.

### Search Modes

The search API supports three modes via the `mode` query parameter:

| Mode | Description | When to use |
|------|-------------|-------------|
| `text` | Classic BM25 keyword search | Exact word/phrase matching |
| `semantic` | KNN vector search using Cohere embeddings | Conceptual queries like "verses about patience" |
| `hybrid` | BM25 + KNN merged with Reciprocal Rank Fusion | Best of both — the default for most use cases |

Example: `/api/search?q=mercy+and+compassion&mode=hybrid`

## Development

```bash
# Install dependencies
npm install

# Run the Next.js dev server
npm run dev

# Run Firebase functions locally
npm run functions
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Deployment

```bash
# Deploy everything (hosting + functions)
npm run deploy

# Deploy only hosting
npm run deploy:hosting

# Deploy only functions
npm run deploy:functions
```

## Project Structure

```
maktabah-next/
  app/              # Next.js app (pages, components)
  lib/              # Shared libraries (OpenSearch client)
  functions/        # Firebase Cloud Functions (search API)
  quran_loader/     # Scripts to load data into OpenSearch
  types/            # TypeScript type definitions
```

## Security Best Practices

1. Use fine-grained access control with a dedicated read-only user for the application
2. Rotate your master user password periodically
3. For production, use VPC access instead of public access
4. Never commit credentials to your source code repository
