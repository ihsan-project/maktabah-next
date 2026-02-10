'use client';

import React, { createContext, useContext, useEffect, useState, ReactNode } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User as FirebaseUser 
} from 'firebase/auth';
import { auth } from '@/firebaseConfig';
import { useRouter } from 'next/navigation';
import { AuthContextType, UserType } from '@/types';
import MixpanelTracking from '@/lib/mixpanel';

// Create Authentication Context
const AuthContext = createContext<AuthContextType>({
  user: null,
  loading: true,
  signInWithGoogle: async () => {},
  logout: async () => {},
});

// Custom hook to use the Auth Context
export const useAuth = () => useContext(AuthContext);

interface AuthProviderProps {
  children: ReactNode;
}

// AuthProvider Component
export default function AuthProvider({ children }: AuthProviderProps) {
  const [user, setUser] = useState<UserType | null>(null);
  const [loading, setLoading] = useState<boolean>(true);
  const router = useRouter();

  // Listen for authentication state changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (firebaseUser: FirebaseUser | null) => {
      if (firebaseUser) {
        const userData = {
          uid: firebaseUser.uid,
          email: firebaseUser.email,
          displayName: firebaseUser.displayName,
          photoURL: firebaseUser.photoURL,
        };
        
        setUser(userData);
        
        // Set session marker
        if (typeof window !== 'undefined') {
          sessionStorage.setItem('maktabah_auth_status', 'true');
        }
        
        // Set Mixpanel user identity
        if (firebaseUser.email) {
          MixpanelTracking.identify(firebaseUser.email, {
            $name: firebaseUser.displayName,
            $email: firebaseUser.email,
            userId: firebaseUser.uid,
          });
        }
      } else {
        setUser(null);
        // Note: We don't clear sessionStorage here because
        // ProtectedRoute handles that after waiting for auth to settle
        // Reset Mixpanel identity on logout
        MixpanelTracking.reset();
      }
      setLoading(false);
    });

    return () => unsubscribe();
  }, []);

  // Sign in with Google
  const signInWithGoogle = async (): Promise<void> => {
    setLoading(true);
    try {
      const provider = new GoogleAuthProvider();
      const result = await signInWithPopup(auth, provider);
      
      // Track login event
      MixpanelTracking.track('User Login', {
        method: 'Google',
        userId: result.user.uid,
      });
      
      router.push('/search');
    } catch (error) {
      console.error('Error signing in with Google:', error);
    } finally {
      setLoading(false);
    }
  };

  // Logout function
  const logout = async (): Promise<void> => {
    setLoading(true);
    try {
      // Track logout event
      if (user) {
        MixpanelTracking.track('User Logout', {
          userId: user.uid,
        });
      }
      
      // Clear auth session marker
      if (typeof window !== 'undefined') {
        sessionStorage.removeItem('maktabah_auth_status');
      }
      
      await signOut(auth);
      router.push('/'); // Redirect to home page instead of login
    } catch (error) {
      console.error('Error logging out:', error);
    } finally {
      setLoading(false);
    }
  };

  // Context provider values
  const value: AuthContextType = {
    user,
    loading,
    signInWithGoogle,
    logout
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
    </AuthContext.Provider>
  );
}
