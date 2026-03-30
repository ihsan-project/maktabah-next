import '@/app/globals.css';
import 'react-quill/dist/quill.snow.css';
import { Inter, Amiri } from 'next/font/google';
import AuthProvider from './components/AuthProvider';
import Navbar from './components/Navbar';
import type { Metadata } from 'next';
import React from 'react';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });
const amiri = Amiri({
  subsets: ['arabic', 'latin'],
  weight: ['400', '700'],
  variable: '--font-amiri',
});

const siteUrl = process.env.NEXT_PUBLIC_SITE_URL || 'https://maktabah.app';

export const metadata: Metadata = {
  metadataBase: new URL(siteUrl),
  title: {
    default: 'Maktabah - Islamic Encyclopedia & Quran Reader',
    template: '%s | Maktabah',
  },
  description:
    'Explore the Quran with 17 English translations, read the stories of the Prophets, and search across authentic Islamic sources including Hadith and Tafsir.',
  keywords: [
    'quran',
    'hadith',
    'islamic encyclopedia',
    'quran translations',
    'stories of the prophets',
    'islamic research',
    'tafsir',
    'maktabah',
  ],
  alternates: {
    canonical: siteUrl,
  },
  openGraph: {
    title: 'Maktabah - Islamic Encyclopedia & Quran Reader',
    description:
      'Explore the Quran with 17 English translations, read the stories of the Prophets, and search across authentic Islamic sources.',
    type: 'website',
    url: siteUrl,
    siteName: 'Maktabah',
    locale: 'en_US',
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Maktabah - Islamic Encyclopedia & Quran Reader',
    description:
      'Explore the Quran with 17 English translations, read the stories of the Prophets, and search across authentic Islamic sources.',
  },
  robots: {
    index: true,
    follow: true,
  },
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className={`${inter.variable} ${amiri.variable} font-sans`}>
        <AuthProvider>
          <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-grow container mx-auto px-4 py-6">
              {children}
            </main>
            <footer className="bg-primary-dark text-white py-4">
              <div className="container mx-auto px-4 text-center text-sm">
                <p>&copy; {new Date().getFullYear()} Maktabah. All rights reserved.</p>
                <p className="mt-1 text-xs opacity-75">
                  Quran text courtesy of{' '}
                  <a href="https://tanzil.net" target="_blank" rel="noopener noreferrer" className="underline">
                    Tanzil.net
                  </a>
                </p>
              </div>
            </footer>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
