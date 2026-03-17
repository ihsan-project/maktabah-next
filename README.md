# Maktabah

A search application for Quran translations and Hadith collections, built with Next.js, TypeScript, and Firebase, powered by AWS OpenSearch.

## Features

- **Type Safety**: Full TypeScript implementation
- **Authentication**: Google Sign-in with Firebase Authentication
- **Search**: OpenSearch integration with Arabic/English analyzers, highlighting, and pagination
- **Responsive Design**: Mobile-friendly interface with sliding menu
- **Protected Routes**: Authentication-required routes

## Technology Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Authentication**: Firebase Authentication
- **Search**: AWS OpenSearch
- **Hosting**: Firebase Hosting
- **API**: Firebase Cloud Functions

## Prerequisites

- Node.js 20+
- Firebase CLI (`npm install -g firebase-tools`)
- AWS account with OpenSearch access

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

   > **Instance sizing notes:** The `t3.small.search` is the smallest current-generation instance and is ideal for dev/testing or small production workloads like this one. If you need more memory for larger datasets or vector search later, step up to `t3.medium.search`. Avoid previous-generation `t2` instances — they don't support fine-grained access control or encryption at rest. T3 instances require Multi-AZ without Standby and do not support UltraWarm/cold storage or Auto-Tune.
4. Under **Network:**
   - Choose **Public access** for simplicity, or **VPC access** for production
5. Under **Fine-grained access control:**
   - Enable fine-grained access control
   - Create a master user with username and password
6. Under **Access policy:**
   - Select "Only use fine-grained access control"
7. Click **Create**

Wait for the domain status to become **Active** (takes ~15 minutes).

### 2. Get Your Domain Endpoint

Once active, copy the **Domain endpoint** from the AWS console. It looks like:
```
https://search-maktabah-xxxxxxxxxx.us-east-1.es.amazonaws.com
```

### 3. Configure Environment Variables

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
```

### 4. Set Firebase Function Secrets

```bash
firebase functions:secrets:set OPENSEARCH_URL
# Enter your OpenSearch domain endpoint when prompted

firebase functions:secrets:set OPENSEARCH_USERNAME
# Enter your master username when prompted

firebase functions:secrets:set OPENSEARCH_PASSWORD
# Enter your master password when prompted
```

### 5. Load Data into OpenSearch

```bash
# Install dependencies
npm install

# Load Quran translations
npm run loader:load-opensearch -- <xml-file> --author="Author Name" --id="unique-id" --title="quran"

# Load Hadith collections
npm run loader:load-opensearch -- <xml-file> --author="Author Name" --id="unique-id" --title="bukhari" --volume=1
```

The loader creates the `kitaab` index with custom Arabic and English analyzers and bulk-indexes the data.

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
