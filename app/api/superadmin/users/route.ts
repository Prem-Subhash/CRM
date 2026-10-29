import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';
import { authenticateApiRequest } from '@/utils/auth';
import { validateCompanyRole } from '@/constants/companyRoles';

// Setup Supabase Admin Client using Service Role Key
const supabaseAdmin = createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false } }
);

export async function GET(request: Request) {
    const auth = await authenticateApiRequest(request, ['superadmin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    const { data: users, error } = await supabaseAdmin
        .from('profiles')
        .select('*')
        .order('created_at', { ascending: false });

    if (error) return NextResponse.json({ error: error.message }, { status: 500 });
    return NextResponse.json({ users });
}

export async function POST(request: Request) {
    const auth = await authenticateApiRequest(request, ['superadmin', 'admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    try {
        const body = await request.json();
        let { email, password, full_name, role, company, insurance_access } = body;

        // Strict permission check: Admins are ONLY permitted to create CSR accounts
        if (auth.profile?.role === 'admin') {
            if (role !== 'csr') {
                return NextResponse.json({ error: 'Admins are restricted to creating CSR accounts only.' }, { status: 403 });
            }
        }

        // Default company for backward compatibility if not provided
        if (!company) {
            if (role === 'mortgage') company = 'mortgage';
            else if (role === 'lending' || role === 'accurate_lending') company = 'lending';
            else company = 'insurance';
        }

        // Validate combination
        if (!validateCompanyRole(company, role)) {
            return NextResponse.json({ error: `Invalid company and role combination: ${company} / ${role}` }, { status: 400 });
        }

        const portal_access = [company];
        
        let csrInsuranceAccess = null;
        if (role === 'csr') {
            if (!Array.isArray(insurance_access) || insurance_access.length === 0) {
                return NextResponse.json({ error: 'CSR accounts must have at least one insurance access option selected.' }, { status: 400 });
            }
            for (const access of insurance_access) {
                if (!['personal', 'commercial'].includes(access)) {
                    return NextResponse.json({ error: `Invalid insurance access option: ${access}` }, { status: 400 });
                }
            }
            csrInsuranceAccess = insurance_access;
        } else if (insurance_access !== undefined) {
            return NextResponse.json({ error: 'Insurance access can only be set for CSR accounts.' }, { status: 400 });
        }

        // 1. Create User in Supabase Auth
        const { data: authUser, error: authError } = await supabaseAdmin.auth.admin.createUser({
            email,
            password,
            email_confirm: true,
        });

        if (authError) throw new Error(authError.message);

        // 2. Insert into profiles (Handling case if there is a trigger that already created it)
        const profilePayload: any = {
            id: authUser.user.id,
            email,
            full_name,
            role,
            portal_access,
        };
        if (role === 'csr' && csrInsuranceAccess) {
            profilePayload.insurance_access = csrInsuranceAccess;
        }

        const { error: profileError } = await supabaseAdmin.from('profiles').upsert(profilePayload);

        if (profileError) {
            // Rollback auth user creation if profile fails
            await supabaseAdmin.auth.admin.deleteUser(authUser.user.id);
            throw new Error(profileError.message);
        }

        // 3. Audit Log
        await supabaseAdmin.from('audit_logs').insert({
            user_id: auth.user.id,
            action: 'CREATE_USER',
            entity: 'profiles',
            entity_id: authUser.user.id,
            metadata: { email, role, company, portal_access, insurance_access: csrInsuranceAccess }
        });

        return NextResponse.json({ success: true, user: authUser.user });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function PATCH(request: Request) {
    const auth = await authenticateApiRequest(request, ['superadmin', 'admin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    try {
        const body = await request.json();
        const { id, role, insurance_access, is_active } = body;

        if (!id) return NextResponse.json({ error: 'User ID is required' }, { status: 400 });

        if (auth.profile?.role === 'admin') {
            const { data: targetUser } = await supabaseAdmin.from('profiles').select('role').eq('id', id).single();
            if (!targetUser || targetUser.role !== 'csr' || (role && role !== 'csr')) {
                return NextResponse.json({ error: 'Admins are restricted to editing CSR accounts only.' }, { status: 403 });
            }
        }

        const updatePayload: any = {};
        if (role !== undefined) updatePayload.role = role;
        if (is_active !== undefined) updatePayload.is_active = Boolean(is_active);
        
        // Validate insurance access payload
        if (insurance_access !== undefined) {
            // Need to know if they are currently a CSR or being changed to a CSR to enforce CSR rules
            const targetRole = role || (await supabaseAdmin.from('profiles').select('role').eq('id', id).single().then(res => res.data?.role));
            if (targetRole === 'csr') {
                if (!Array.isArray(insurance_access) || insurance_access.length === 0) {
                    return NextResponse.json({ error: 'CSR accounts must have at least one insurance access option selected.' }, { status: 400 });
                }
                for (const access of insurance_access) {
                    if (!['personal', 'commercial'].includes(access)) {
                        return NextResponse.json({ error: `Invalid insurance access option: ${access}` }, { status: 400 });
                    }
                }
                updatePayload.insurance_access = insurance_access;
            } else {
                return NextResponse.json({ error: 'Insurance access can only be set for CSR accounts.' }, { status: 400 });
            }
        }

        if (Object.keys(updatePayload).length === 0) {
            return NextResponse.json({ success: true, message: 'No updates provided' });
        }

        const { error } = await supabaseAdmin.from('profiles').update(updatePayload).eq('id', id);
        if (error) throw new Error(error.message);

        // Audit log
        const auditAction = is_active === false ? 'DEACTIVATE_USER' : is_active === true ? 'REACTIVATE_USER' : 'UPDATE_USER';
        await supabaseAdmin.from('audit_logs').insert({
            user_id: auth.user.id,
            action: auditAction,
            entity: 'profiles',
            entity_id: id,
            metadata: updatePayload
        });

        return NextResponse.json({ success: true });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}

export async function DELETE(request: Request) {
    const auth = await authenticateApiRequest(request, ['superadmin']);
    if (auth.error) return NextResponse.json({ error: auth.error }, { status: auth.status });

    try {
        const { searchParams } = new URL(request.url);
        const id = searchParams.get('id');
        if (!id) throw new Error('User ID is required');

        // Prevent self-deactivation to avoid accidental lockout
        if (id === auth.user.id) {
            throw new Error('You cannot deactivate your own account.');
        }

        // Soft deactivation: set profiles.is_active = false (preserve profiles row and auth user)
        const { error } = await supabaseAdmin.from('profiles').update({ is_active: false }).eq('id', id);
        if (error) throw new Error(error.message);

        // Audit log
        await supabaseAdmin.from('audit_logs').insert({
            user_id: auth.user.id,
            action: 'DEACTIVATE_USER',
            entity: 'profiles',
            entity_id: id,
            metadata: { deactivated_user_id: id }
        });

        return NextResponse.json({ success: true, message: 'User deactivated successfully' });
    } catch (error: any) {
        return NextResponse.json({ error: error.message }, { status: 500 });
    }
}
