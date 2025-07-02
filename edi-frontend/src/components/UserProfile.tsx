'use client';

import { useEffect, useState, useRef } from 'react';
import { supabase } from '@/utils/supabase';
import { useRouter } from 'next/navigation';

interface UserProfileProps {
    variant?: 'light' | 'dark';
}

export default function UserProfile({ variant = 'dark' }: UserProfileProps) {
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const router = useRouter();

    useEffect(() => {
        const getUserProfile = async () => {
            const { data: { session } } = await supabase.auth.getSession();
            setUserEmail(session?.user?.email || null);
            
            // Try to get avatar from user metadata or use default Gravatar-style avatar
            if (session?.user?.email) {
                const emailHash = session.user.email.trim().toLowerCase();
                setAvatarUrl(`https://www.gravatar.com/avatar/${emailHash}?d=mp`);
            }
        };

        getUserProfile();

        // Subscribe to auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            setUserEmail(session?.user?.email || null);
            if (session?.user?.email) {
                const emailHash = session.user.email.trim().toLowerCase();
                setAvatarUrl(`https://www.gravatar.com/avatar/${emailHash}?d=mp`);
            } else {
                setAvatarUrl(null);
            }
        });

        // Click outside listener to close dropdown
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setIsDropdownOpen(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);

        return () => {
            subscription.unsubscribe();
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    const handleLogout = async () => {
        try {
            setIsDropdownOpen(false); // Close dropdown first
            
            console.log('Starting logout process...');
            
            // Sign out from Supabase with explicit scope
            const { error } = await supabase.auth.signOut({ scope: 'global' });
            
            if (error) {
                console.error('Error signing out:', error);
                // Even if there's an error, still try to clear local state
            }
            
            // Clear any local storage or session data
            localStorage.clear();
            sessionStorage.clear();
            
            // Clear all cookies related to auth
            document.cookie.split(";").forEach((c) => {
                const eqPos = c.indexOf("=");
                const name = eqPos > -1 ? c.substr(0, eqPos) : c;
                document.cookie = name + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
            });
            
            console.log('Logout complete, redirecting...');
            
            // Use window.location.href for a hard redirect that bypasses middleware
            window.location.href = '/auth';
            
        } catch (error) {
            console.error('Logout error:', error);
            // Clear local data and force redirect even on error
            localStorage.clear();
            sessionStorage.clear();
            window.location.href = '/auth';
        }
    };

    if (!userEmail) return null;

    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`flex items-center gap-2 focus:outline-none px-3 py-2 rounded-md transition-all duration-200 ${
                    isDropdownOpen 
                    ? 'bg-blue-900/30 border border-blue-500/50 shadow-[0_0_15px_rgba(37,99,235,0.3)]' 
                    : 'border border-transparent hover:border-blue-500/40 hover:bg-blue-900/20'
                }`}
                tabIndex={0}
            >
                <div className="w-8 h-8 rounded-full overflow-hidden bg-black/40 flex items-center justify-center border border-blue-900/50">
                    {avatarUrl && (
                        <img
                            src={avatarUrl}
                            alt="User avatar"
                            className="w-full h-full object-cover"
                        />
                    )}
                </div>
                <span className="text-sm font-medium text-white truncate max-w-[120px]">
                    {userEmail}
                </span>
                <svg className={`w-4 h-4 ml-1 transition-transform duration-200 text-blue-400 ${isDropdownOpen ? 'rotate-180' : ''}`} fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-black/90 backdrop-blur-md rounded-md shadow-2xl z-[9999] p-0 animate-fade-slide-in border border-blue-900/50 shadow-[0_0_20px_rgba(37,99,235,0.3)]">
                    <div className="flex flex-col items-center pt-4 pb-2 px-4">
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-black/50 flex items-center justify-center mb-2 border border-blue-900/50">
                            {avatarUrl && (
                                <img
                                    src={avatarUrl}
                                    alt="User avatar"
                                    className="w-full h-full object-cover"
                                />
                            )}
                        </div>
                        <span className="font-medium text-white text-sm truncate w-full text-center mb-1">{userEmail}</span>
                    </div>
                    <div className="border-t border-blue-900/30 my-1" />
                    <div className="px-4 pb-4 pt-2">
                        <button
                            onClick={(e) => {
                                console.log('Logout button clicked!');
                                e.preventDefault();
                                e.stopPropagation();
                                handleLogout();
                            }}
                            onMouseEnter={() => console.log('Logout button hovered!')}
                            type="button"
                            className="w-full px-3 py-2 rounded-md text-sm font-medium text-red-400 bg-red-900/20 hover:bg-red-900/40 hover:text-red-200 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 border border-red-900/30 hover:border-red-700/50 cursor-pointer select-none transform hover:scale-[1.02] active:scale-[0.98] z-[10000] relative"
                            style={{ pointerEvents: 'auto' }}
                        >
                            Log out
                        </button>
                    </div>
                </div>
            )}
            <style jsx global>{`
              @keyframes fade-slide-in {
                from { opacity: 0; transform: translateY(-8px); }
                to { opacity: 1; transform: translateY(0); }
              }
              .animate-fade-slide-in {
                animation: fade-slide-in 0.18s cubic-bezier(0.4,0,0.2,1);
              }
            `}</style>
        </div>
    );
} 