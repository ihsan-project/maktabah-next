# Maktabah - TypeScript Search Application

A search application built with Next.js, TypeScript, and Firebase, featuring:

- TypeScript for type safety
- Google Authentication with Firebase
- Mobile-friendly responsive design
- ElasticSearch integration
- Forest green theme with Tailwind CSS
- Next.js App Router architecture

## Getting Started

### Prerequisites

- Node.js 16.8 or later
- Firebase account
- ElasticSearch instance

### Environment Setup

1. Create a `.env.local` file in the root directory with your configuration:

```
# Firebase Configuration
NEXT_PUBLIC_FIREBASE_API_KEY=your-api-key
NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN=your-project-id.firebaseapp.com
NEXT_PUBLIC_FIREBASE_PROJECT_ID=your-project-id
NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET=your-project-id.appspot.com
NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID=your-messaging-sender-id
NEXT_PUBLIC_FIREBASE_APP_ID=your-app-id
NEXT_PUBLIC_FIREBASE_MEASUREMENT_ID=your-measurement-id

# ElasticSearch Configuration
ELASTICSEARCH_URL=your-elasticsearch-url
ELASTICSEARCH_USERNAME=your-elasticsearch-username
ELASTICSEARCH_PASSWORD=your-elasticsearch-password
ELASTICSEARCH_INDEX=your-elasticsearch-index
```

### Installation

```bash
# Install dependencies
npm install

# Run the development server
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

## Deployment to Firebase Hosting and Functions

1. Install Firebase CLI:
```bash
npm install -g firebase-tools
```

2. Login to Firebase:
```bash
firebase login
```

3. Initialize Firebase:
```bash
firebase init
```
Select Hosting and Functions and follow the prompts.

4. Set up Functions environment variables:
```bash
cd functions
firebase functions:config:set elasticsearch.url="YOUR_ELASTICSEARCH_URL" \
                          elasticsearch.username="YOUR_ELASTICSEARCH_USERNAME" \
                          elasticsearch.password="YOUR_ELASTICSEARCH_PASSWORD" \
                          elasticsearch.index="YOUR_ELASTICSEARCH_INDEX"
```

5. Deploy to Firebase:
```bash
npm run deploy
```

This will deploy both the static site to Firebase Hosting and the API endpoints to Firebase Functions.

## Features

- **Type Safety**: Full TypeScript implementation for better developer experience
- **Authentication**: Google Sign-in with Firebase Authentication
- **Search**: ElasticSearch integration with highlighting and pagination
- **Responsive Design**: Mobile-friendly interface with sliding menu
- **Protected Routes**: Authentication-required routes

## Technology Stack

- **Frontend**: Next.js, React, TypeScript, Tailwind CSS
- **Authentication**: Firebase Authentication
- **Search**: ElasticSearch
- **Hosting**: Firebase Hosting
