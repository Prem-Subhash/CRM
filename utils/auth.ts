import { createServer, supabaseServer } from '@/lib/supabaseServer'
import { User } from '@supabase/supabase-js'
import { UserRole, InsuranceCategory, canAccessInsuranceCategory, getRedirectPath } from './authClient'

export * from './authClient'

export async function getCurrentUser() {
    const supabase = await createServer()
    const { data: { user }, error } = await supabase.auth.getUser()
    if (error || !user) return null
    return user
}

export async function getUserRole(userId: string): Promise<UserRole | null> {
    const supabase = await createServer()
    const { data, error } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', userId)
        .single()

    if (error || !data) return null
    return data.role as UserRole
}

export async function getUserProfile(userId: string) {
    const supabase = await createServer()
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single()

    if (error || !data) return null
    return data
}

export async function authenticateApiRequest(req: Request, allowedRoles?: UserRole[], requireAuth: boolean = true): Promise<{
    user?: User | null;
    profile?: { role: UserRole; insurance_access?: string[] | null; [key: string]: any } | null;
    error?: string;
    status?: number;
}> {
    let user;

    // 1. Try Token-Based Auth (e.g., Postman / API clients)
    const authHeader = req.headers.get('authorization')
    if (authHeader && authHeader.startsWith('Bearer ')) {
        const token = authHeader.replace('Bearer ', '')
        const { data } = await supabaseServer.auth.getUser(token)
        user = data?.user
    }

    // 2. Fallback to Cookie-Based Auth (Web Application)
    if (!user) {
        const supabase = await createServer()
        const { data } = await supabase.auth.getUser()
        user = data?.user
    }

    if (!user) {
        if (requireAuth) {
            return { error: 'Unauthorized', status: 401 }
        }
        return { user: null, profile: null }
    }

    const { data: userProfile } = await supabaseServer
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single()

    if (!userProfile && requireAuth) {
        return { error: 'Forbidden', status: 403 }
    }

    if (userProfile && userProfile.is_active === false && requireAuth) {
        return { error: 'Forbidden: Account is deactivated', status: 403 }
    }

    if (allowedRoles && allowedRoles.length > 0 && (!userProfile || !allowedRoles.includes(userProfile.role))) {
        return { error: 'Forbidden', status: 403 }
    }

    return { user, profile: userProfile || null }
}

export async function authorizeLeadAccess(profile: any, leadId: string) {
    if (!profile) return { authorized: false, lead: null, error: 'Unauthorized', status: 401 }
    if (!leadId) return { authorized: false, lead: null, error: 'Missing leadId', status: 400 }

    const { data: lead, error } = await supabaseServer
        .from('temp_leads_basics')
        .select('*')
        .eq('id', leadId)
        .single()

    if (error || !lead) {
        return { authorized: false, lead: null, error: 'Lead not found', status: 404 }
    }

    if (!canAccessInsuranceCategory(profile, lead.insurence_category)) {
        return { authorized: false, lead: null, error: 'Forbidden: Insufficient category access', status: 403 }
    }

    // DE02: CSR users may only access leads currently assigned to them
    if (profile.role === 'csr' && lead.assigned_csr !== profile.id) {
        return { authorized: false, lead: null, error: 'Forbidden: Lead is not assigned to you', status: 403 }
    }

    return { authorized: true, lead, error: null, status: 200 }
}