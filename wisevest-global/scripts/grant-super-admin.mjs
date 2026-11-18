import 'dotenv/config';
import { createClient } from '@supabase/supabase-js';

const supabaseUrl = process.env.VITE_SUPABASE_URL;
const secretKey = process.env.SUPABASE_SECRET_KEY;

if (!supabaseUrl || !secretKey) {
  throw new Error('missing supabase URL or secret key in .env');
}

const supabase = createClient(supabaseUrl, secretKey, {
    auth: {
        autoRefreshToken: false,
        persistSession: false,
    },
});

const email = 'sanctusekeh18@gmail.com';
//const email = 'sanctusikenna@gmail.com';

//find existing account
const { data, error: listError } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 1000
});

if (listError) throw listError;

const user = data.users.find(u => u.email?.toLowerCase() === email);

if (!user) {
    throw new Error(`Wisevest owner account with ${email} not found`);
}

//preserve existing app metadata and assign super admin role
const {data: result, error} = 
await supabase.auth.admin.updateUserById(
    user.id, 
    {
        app_metadata: {
            ...user.app_metadata,
            role: 'super_admin'
        },
    }
);

if (error) throw error;

console.log('SUCCESS!');
console.log('Account:', result.user.email);
console.log('Role:', result.user.app_metadata.role);