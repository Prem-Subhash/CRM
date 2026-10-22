import { createClient as createSupabaseClient } from '@supabase/supabase-js'
import { createServerClient, type CookieOptions } from '@supabase/ssr'
import { cookies } from 'next/headers'

// Admin Client (Bypasses RLS - keep for existing API usage)
export const supabaseServer = createSupabaseClient(
  (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!,
  {
    auth: {
      persistSession: false,
    },
  }
)

// SSR Session Client (Respects RLS/Cookies for user routes)
export const createServer = async () => {
  const cookieStore = await cookies()

  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll()
        },
        setAll(cookiesToSet) {
          try {
            const isRememberMeFalse = cookieStore.get('sb-remember-me')?.value === 'false'
            cookiesToSet.forEach(({ name, value, options }) => {
              const cookieOpts = { ...options }
              if (isRememberMeFalse && value !== '') {
                delete cookieOpts.maxAge
                delete cookieOpts.expires
              }
              cookieStore.set(name, value, cookieOpts)
            })
          } catch (error) {
            // The `setAll` method was called from a Server Component.
            // This can be ignored if you have middleware refreshing user sessions.
          }
        },
      },
    }
  )
}
