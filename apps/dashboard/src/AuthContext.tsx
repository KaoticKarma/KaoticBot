import { createContext, useContext, useState, useEffect, ReactNode } from 'react';

interface User {
  id: number;
  kickUserId: number;
  username: string;
  displayName: string;
  email?: string;
  profilePic?: string;
  channelId?: number;
  chatroomId?: number;
  channelSlug?: string;
  subscriptionTier: string;
  subscriptionExpiresAt?: string;
  botEnabled: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  error: string | null;
  login: () => void;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

const API_BASE = import.meta.env.DEV ? 'http://localhost:3000' : '';

/**
 * Fetch chatroom ID from Kick's public API
 * This works from the browser (no Cloudflare blocking)
 */
async function fetchChatroomFromKick(slug: string): Promise<{ chatroomId: number; channelId: number } | null> {
  try {
    console.log(`[Auth] Fetching chatroom ID for ${slug} from Kick API...`);
    
    const response = await fetch(`https://kick.com/api/v2/channels/${slug}`);
    
    if (!response.ok) {
      console.error(`[Auth] Kick API returned ${response.status}`);
      return null;
    }
    
    const data = await response.json();
    console.log('[Auth] Kick API response:', data);
    
    // v2 API structure
    if (data.chatroom?.id) {
      return {
        chatroomId: data.chatroom.id,
        channelId: data.user_id || data.id,
      };
    }
    
    // Alternative structure
    if (data.chatroom_id) {
      return {
        chatroomId: data.chatroom_id,
        channelId: data.user_id || data.id,
      };
    }
    
    console.error('[Auth] No chatroom ID in Kick API response');
    return null;
  } catch (err) {
    console.error('[Auth] Error fetching from Kick API:', err);
    return null;
  }
}

/**
 * Save chatroom ID to our backend
 */
async function saveChatroomToBackend(chatroomId: number, channelId: number): Promise<boolean> {
  try {
    console.log(`[Auth] Saving chatroom ID ${chatroomId} to backend...`);
    
    const response = await fetch(`${API_BASE}/api/auth/update-channel`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ chatroomId, channelId }),
    });
    
    if (!response.ok) {
      console.error(`[Auth] Backend returned ${response.status}`);
      return false;
    }
    
    console.log('[Auth] ✅ Chatroom ID saved successfully');
    return true;
  } catch (err) {
    console.error('[Auth] Error saving to backend:', err);
    return false;
  }
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Check auth status on mount and after auth callback
  const checkAuth = async () => {
    try {
      setLoading(true);
      setError(null);

      const res = await fetch(`${API_BASE}/api/auth/me`, {
        credentials: 'include',
      });

      if (res.ok) {
        const userData = await res.json();
        setUser(userData);
        
        // If chatroom ID is missing OR equals channelId (likely wrong), fetch it from Kick
        const needsChatroomFetch = !userData.chatroomId || 
          (userData.chatroomId === userData.channelId && userData.channelSlug);
        
        if (needsChatroomFetch && userData.channelSlug) {
          console.log('[Auth] Chatroom ID missing or invalid, fetching from Kick...');
          console.log('[Auth] Current values:', { chatroomId: userData.chatroomId, channelId: userData.channelId });
          
          const kickData = await fetchChatroomFromKick(userData.channelSlug);
          
          if (kickData) {
            const saved = await saveChatroomToBackend(kickData.chatroomId, kickData.channelId);
            
            if (saved) {
              // Update local user state with the new IDs
              setUser({
                ...userData,
                chatroomId: kickData.chatroomId,
                channelId: kickData.channelId,
              });
            }
          }
        }
      } else if (res.status === 401) {
        setUser(null);
      } else {
        throw new Error('Failed to check auth status');
      }
    } catch (err) {
      console.error('Auth check error:', err);
      setError('Failed to check authentication status');
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Check for auth callback
    const params = new URLSearchParams(window.location.search);
    if (params.get('auth') === 'success') {
      // Clear the URL params
      window.history.replaceState({}, '', window.location.pathname);
    }

    checkAuth();
  }, []);

  const login = () => {
    // Redirect to OAuth login
    window.location.href = `${API_BASE}/auth/login`;
  };

  const logout = async () => {
    try {
      await fetch(`${API_BASE}/auth/logout`, {
        method: 'POST',
        credentials: 'include',
      });
      setUser(null);
    } catch (err) {
      console.error('Logout error:', err);
    }
  };

  const refreshUser = async () => {
    await checkAuth();
  };

  return (
    <AuthContext.Provider value={{ user, loading, error, login, logout, refreshUser }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
