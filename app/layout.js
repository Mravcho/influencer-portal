import './globals.css'

export const metadata = {
  title: 'RealFood Influencer Portal',
  description: 'Проследявай своите поръчки и комисионни',
}

export default function RootLayout({ children }) {
  return (
    <html lang="bg">
      <body>{children}</body>
    </html>
  )
}
