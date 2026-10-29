import { ToastProvider } from '@/lib/ToastContext'
import './globals.css'

export const metadata = {
  title: 'Login',
  description: 'Insurance CSR Dashboard',
  icons: {
    icon: '/image.png',
  },
}

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-gray-50 text-gray-900" suppressHydrationWarning>
        <ToastProvider>
          {children}
        </ToastProvider>
      </body>
    </html>
  )
}
