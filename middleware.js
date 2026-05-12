import { NextResponse } from 'next/server'
import { verifyToken, COOKIE_NAME } from './lib/auth'

export async function middleware(request) {
  const { pathname } = request.nextUrl
  const token = request.cookies.get(COOKIE_NAME)?.value

  const isAuthPage   = pathname.startsWith('/login')
  const isDashboard  = pathname.startsWith('/dashboard')
  const isAdmin      = pathname.startsWith('/admin')
  const isAdminApi   = pathname.startsWith('/api/admin')

  if (isDashboard || isAdmin || isAdminApi) {
    if (!token) {
      return NextResponse.redirect(new URL('/login', request.url))
    }

    const payload = await verifyToken(token)
    if (!payload) {
      const res = NextResponse.redirect(new URL('/login', request.url))
      res.cookies.delete(COOKIE_NAME)
      return res
    }

    // Admin маршрути изискват role === 'admin'
    if ((isAdmin || isAdminApi) && payload.role !== 'admin') {
      return NextResponse.redirect(new URL('/dashboard', request.url))
    }

    // Прикачаме payload към хедъри за API routes
    const requestHeaders = new Headers(request.headers)
    requestHeaders.set('x-user-id',   payload.id   || '')
    requestHeaders.set('x-user-role', payload.role || '')
    requestHeaders.set('x-promo-code', payload.promoCode || '')
    return NextResponse.next({ request: { headers: requestHeaders } })
  }

  // Вече логнат потребител → пренасочи от /login
  if (isAuthPage && token) {
    const payload = await verifyToken(token)
    if (payload) {
      return NextResponse.redirect(
        new URL(payload.role === 'admin' ? '/admin' : '/dashboard', request.url)
      )
    }
  }

  return NextResponse.next()
}

export const config = {
  matcher: ['/dashboard/:path*', '/admin/:path*', '/api/admin/:path*', '/login'],
}
