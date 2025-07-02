import { createServerClient } from '@supabase/ssr'
import { type NextRequest, NextResponse } from 'next/server'

export async function GET(request: NextRequest) {
  const requestUrl = new URL(request.url)
  const code = requestUrl.searchParams.get('code')
  const redirectedFrom = requestUrl.searchParams.get('redirectedFrom') || '/workspaces'

  if (code) {
    // Create redirect response first
    const redirectUrl = new URL(redirectedFrom, request.url)
    const redirectResponse = NextResponse.redirect(redirectUrl)
    
    // Create supabase client with cookie handling
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          get(name: string) {
            return request.cookies.get(name)?.value
          },
          set(name: string, value: string, options: any) {
            redirectResponse.cookies.set(name, value, options)
          },
          remove(name: string, options: any) {
            redirectResponse.cookies.delete(name)
          },
        },
      }
    )

    try {
      const { data, error } = await supabase.auth.exchangeCodeForSession(code)
      if (!error && data.session) {
        // Session established successfully, return the redirect response
        return redirectResponse
      }
      
      // If there was an error or no session, redirect to auth with error
      console.error('Auth error:', error)
      return NextResponse.redirect(new URL('/auth?error=oauth_callback_error', request.url))
    } catch (err) {
      // Handle any unexpected errors
      console.error('Unexpected auth error:', err)
      return NextResponse.redirect(new URL('/auth?error=oauth_callback_error', request.url))
    }
  }

  // If no code was provided, redirect to auth with error
  return NextResponse.redirect(new URL('/auth?error=no_code_provided', request.url))
} 