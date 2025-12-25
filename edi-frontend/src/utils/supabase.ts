import { createBrowserClient } from '@supabase/ssr'

if (!process.env.NEXT_PUBLIC_SUPABASE_URL) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_URL')
}
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) {
  throw new Error('Missing env.NEXT_PUBLIC_SUPABASE_ANON_KEY')
}

export const supabase = createBrowserClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
  {
    cookies: {
      get(name: string) {
        // Get cookie value from document.cookie (browser only)
        if (typeof document === 'undefined') return undefined;
        const value = `; ${document.cookie}`;
        const parts = value.split(`; ${name}=`);
        if (parts.length === 2) return parts.pop()?.split(';').shift();
      },
      set(name: string, value: string, options: any) {
        // Set cookie with proper options for persistence (browser only)
        if (typeof document === 'undefined') return;
        let cookie = `${name}=${value}; path=/`;

        if (options?.maxAge) {
          cookie += `; max-age=${options.maxAge}`;
        }

        if (options?.sameSite) {
          cookie += `; samesite=${options.sameSite}`;
        }

        if (options?.secure) {
          cookie += '; secure';
        }

        document.cookie = cookie;
      },
      remove(name: string) {
        // Remove cookie by setting expiry to past date (browser only)
        if (typeof document === 'undefined') return;
        document.cookie = `${name}=; path=/; expires=Thu, 01 Jan 1970 00:00:01 GMT`;
      }
    }
  }
) 