# Quran JSON Generator

Converts the Tanzil.net XML translation files into per-surah JSON files served statically by Firebase Hosting.

## Why

The `/quran` page is fully client-side and unauthenticated. Instead of hitting an API, it fetches small static JSON files from `/public/quran/`. This keeps it fast (CDN-cached), free (no Cloud Functions), and simple.

## What it produces

```
public/quran/
├── metadata.json    # Surah names, verse counts, translator list
├── 1.json           # Al-Fatiha (7 verses × 17 translations)
├── 2.json           # Al-Baqarah (286 verses × 17 translations)
├── ...
└── 114.json         # An-Nas (6 verses × 17 translations)
```

Each surah JSON contains all 17 English translations grouped by verse number, ready to be passed directly to the `TranslationCarousel` component.

## How to run

```bash
npm run loader:generate-quran
```

Or directly:

```bash
node quran_loader/generate-quran-json.js
```

## When to re-run

Only if you add, remove, or update translation XML files in `quran_loader/translations/`. The generated JSON files are committed to the repo, so this doesn't need to run during CI or deploy.

## Source translations

17 files from `quran_loader/translations/` (16 English translations + 1 transliteration). Bukhari hadith volumes and the raw `en.transliteration.xml` are excluded — only `en.transliteration.clean.xml` is used.

All Quran text is from [Tanzil.net](https://tanzil.net) and attributed in the site footer.
