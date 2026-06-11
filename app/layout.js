import './globals.css'

export const metadata = {
  title: 'RealFood Influencer Portal',
  description: 'Проследявай своите поръчки и комисионни',
}

export const viewport = {
  width:              'device-width',
  initialScale:       1,
  maximumScale:       5,
  viewportFit:        'cover', // поддръжка на iPhone notch / safe areas
  themeColor:         '#1D9E75',
}

export default function RootLayout({ children }) {
  return (
    <html lang="bg">
      <body>{children}</body>
    </html>
  )
}
