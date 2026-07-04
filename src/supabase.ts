import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL || 'https://bfawapnkhujxseqwikpj.supabase.co';
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY || 'sb_publishable_Kr_rgKqPYHT1WtXeCVfnFA_8zduIdWV';

const getCookie = (name: string): string | null => {
  if (typeof document === 'undefined') return null;
  const cookies = document.cookie.split(';');
  for (let cookie of cookies) {
    const [cName, cVal] = cookie.split('=').map(c => c.trim());
    if (cName === name) return decodeURIComponent(cVal);
  }
  return null;
};

const setCookie = (name: string, value: string) => {
  if (typeof document === 'undefined') return;
  const hostname = window.location.hostname;
  const isProdDomain = hostname.toLowerCase().endsWith('rifqa.co');
  const domainAttr = isProdDomain ? '; domain=.rifqa.co' : '';
  document.cookie = `${name}=${encodeURIComponent(value)}${domainAttr}; path=/; max-age=31536000; SameSite=Lax; Secure`;
};

const removeCookie = (name: string) => {
  if (typeof document === 'undefined') return;
  const hostname = window.location.hostname;
  const isProdDomain = hostname.toLowerCase().endsWith('rifqa.co');
  const domainAttr = isProdDomain ? '; domain=.rifqa.co' : '';
  document.cookie = `${name}=; expires=Thu, 01 Jan 1970 00:00:00 GMT${domainAttr}; path=/`;
};

const customStorage = {
  getItem: (key: string): string | null => {
    if (typeof window === 'undefined') return null;
    try {
      const localVal = window.localStorage.getItem(key);
      if (localVal) return localVal;
    } catch (e) {
      console.error('Error reading localStorage:', e);
    }
    const cookieVal = getCookie(key);
    if (cookieVal) {
      if (key.endsWith('-auth-token')) {
        let refreshToken = cookieVal;
        if (cookieVal.startsWith('{')) {
          try {
            const parsed = JSON.parse(cookieVal);
            refreshToken = parsed.refresh_token || '';
          } catch (e) {}
        }
        if (refreshToken) {
          return JSON.stringify({
            access_token: '',
            refresh_token: refreshToken,
            expires_at: 0,
            expires_in: 0,
            token_type: 'bearer',
            user: null
          });
        }
      } else {
        return cookieVal;
      }
    }
    return null;
  },
  
  setItem: (key: string, value: string): void => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.setItem(key, value);
    } catch (e) {
      console.error('Error writing to localStorage:', e);
    }
    let cookieValue = value;
    if (key.endsWith('-auth-token')) {
      try {
        const session = JSON.parse(value);
        if (session.refresh_token) {
          cookieValue = session.refresh_token;
        }
      } catch (e) {
        console.error('Error extracting refresh token for cookie:', e);
      }
    }
    setCookie(key, cookieValue);
  },
  
  removeItem: (key: string): void => {
    if (typeof window === 'undefined') return;
    try {
      window.localStorage.removeItem(key);
    } catch (e) {
      console.error('Error removing from localStorage:', e);
    }
    removeCookie(key);
  }
};

export const supabase = createClient(url, anonKey, {
  auth: {
    storage: customStorage,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: true,
  },
});
