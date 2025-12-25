import { createServerClient } from '@supabase/ssr'
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export async function middleware(request: NextRequest) {
  const res = NextResponse.next()
  
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        get: (name: string) => request.cookies.get(name)?.value,
        set: (name: string, value: string, options: any) => {
          res.cookies.set({
            name,
            value,
            ...options,
          })
        },
        remove: (name: string, options: any) => {
          res.cookies.set({
            name,
            value: '',
            ...options,
          })
        },
      },
    }
  )

  const {
    data: { session },
  } = await supabase.auth.getSession()

  // Get the pathname of the request
  const pathname = request.nextUrl.pathname

  // Skip middleware for auth callback route
  if (pathname.startsWith('/auth/callback')) {
    return res
  }

  // Allow access to public routes
  if (pathname === '/' || pathname === '/auth') {
    // If user is already signed in and trying to access /auth, redirect to /workspaces
    if (session && pathname === '/auth') {
      const redirectResponse = NextResponse.redirect(new URL('/workspaces', request.url))
      // Copy cookies to the redirect response
      res.cookies.getAll().forEach(cookie => {
        redirectResponse.cookies.set(cookie)
      })
      return redirectResponse
    }
    return res
  }

  // Protected routes - check if user is signed in
  if (!session) {
    const redirectUrl = new URL('/auth', request.url)
    redirectUrl.searchParams.set('redirectedFrom', pathname)
    const redirectResponse = NextResponse.redirect(redirectUrl)
    // Copy cookies to the redirect response
    res.cookies.getAll().forEach(cookie => {
      redirectResponse.cookies.set(cookie)
    })
    return redirectResponse
  }

  // Learn concept deep-link redirect: /workspace/:id/learn/:concept -> /workspace/:id
  const learnConceptMatch = pathname.match(/^\/workspace\/([^\/]+)\/learn\/[A-Za-z0-9_-]+$/)
  if (learnConceptMatch) {
    const workspaceId = learnConceptMatch[1]
    const redirectResponse = NextResponse.redirect(new URL(`/workspace/${workspaceId}`, request.url))
    res.cookies.getAll().forEach(cookie => {
      redirectResponse.cookies.set(cookie)
    })
    return redirectResponse
  }

  return res
}

// Specify which routes this middleware should run on
export const config = {
  // Exclude API routes, Next.js internals, favicon, and any file with an extension (public assets)
  matcher: ['/((?!api|_next/static|_next/image|favicon.ico|.*\\..*).*)'],
}