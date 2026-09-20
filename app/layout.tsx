import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import './globals.css'
import { Toaster } from "sonner"

const inter = Inter({
  subsets: ["latin"],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  metadataBase: new URL(process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:3000'),
  title: 'Padel Evaluation',
  description: 'Analiza y mejora tu rendimiento en pádel. Evaluaciones profesionales, estadísticas avanzadas y seguimiento de progreso para jugadores y entrenadores.',
}

export const viewport: Viewport = {
  themeColor: '#16a34a',
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="es">
      <body className={`${inter.variable} font-sans antialiased`}>
        <Toaster position="top-right" richColors />
        {children}
      </body>
    </html>
  )
}
