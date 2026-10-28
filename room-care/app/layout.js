import './globals.css';

export const metadata = {
  title: 'Room Care · Stay Santa Rosa',
  description: '',
  robots: { index: false, follow: false, nocache: true, googleBot: { index: false, follow: false, noimageindex: true } },
  referrer: 'no-referrer'
};
export const viewport = { width: 'device-width', initialScale: 1, viewportFit: 'cover', themeColor: '#1A1A1A' };

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Jost:wght@300;400;500;600&family=Marcellus&display=swap" />
      </head>
      <body>{children}</body>
    </html>
  );
}
