import '@/globals.css';
import { Inter } from 'next/font/google';
import AuthProvider from './components/AuthProvider';
import Navbar from './components/Navbar';
import type { Metadata } from 'next';
import React from 'react';

const inter = Inter({ subsets: ['latin'], variable: '--font-inter' });

export const metadata: Metadata = {
  title: 'Maktabah - Search for Knowledge',
  description: 'A search application for your research needs',
};

interface RootLayoutProps {
  children: React.ReactNode;
}

export default function RootLayout({ children }: RootLayoutProps) {
  return (
    <html lang="en">
      <body className={`${inter.variable} font-sans`}>
        <AuthProvider>
          <div className="flex flex-col min-h-screen">
            <Navbar />
            <main className="flex-grow container mx-auto px-4 py-6">
              {children}
            </main>
            <footer className="bg-primary-dark text-white py-4">
              <div className="container mx-auto px-4 text-center text-sm">
                &copy; {new Date().getFullYear()} Maktabah. All rights reserved.
              </div>
            </footer>
          </div>
        </AuthProvider>
      </body>
    </html>
  );
}
