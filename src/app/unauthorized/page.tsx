'use client';

import { createClient } from '@/utils/supabase/client';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { AlertTriangle } from 'lucide-react';

export default function UnauthorizedPage() {
  const router = useRouter();
  const [loading, setLoading] = useState(false);
  const supabase = createClient();

  async function handleSignOut() {
    setLoading(true);
    await supabase.auth.signOut();
    router.push('/login');
    router.refresh();
  }

  return (
    <div style={{ display: 'flex', minHeight: '100vh', alignItems: 'center', justifyContent: 'center' }}>
      <div className="stat-card" style={{ width: '100%', maxWidth: '450px', padding: '2.5rem', textAlign: 'center' }}>
        <AlertTriangle size={48} style={{ color: 'var(--error)', margin: '0 auto 1.5rem auto' }} />
        
        <h1 style={{ fontSize: '1.5rem', marginBottom: '1rem', fontWeight: 700 }}>Access Denied</h1>
        
        <p style={{ color: 'var(--text-dim)', marginBottom: '2rem', lineHeight: 1.5 }}>
          Your email address is not on the allowed users list. Please contact the administrator.
        </p>
        
        <button 
          onClick={handleSignOut} 
          disabled={loading}
          style={{ width: '100%', padding: '0.75rem', background: 'var(--card-bg)', border: '1px solid var(--card-border)', color: 'var(--foreground)', borderRadius: '0.5rem', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', transition: 'all 0.2s', opacity: loading ? 0.7 : 1 }}
        >
          {loading ? 'Signing out...' : 'Sign out & Try Another Account'}
        </button>
      </div>
    </div>
  );
}
