'use client';

import { useEffect, useState, useRef } from 'react';
import { ChevronDown } from 'lucide-react';
import { supabase } from '@/utils/supabase';
import Image from 'next/image';

interface UserProfileProps {
    variant?: 'light' | 'dark' | 'floating';
    dropdownDirection?: 'up' | 'down';
}

export default function UserProfile({ variant = 'dark', dropdownDirection = 'up' }: UserProfileProps) {
    const [userEmail, setUserEmail] = useState<string | null>(null);
    const [avatarUrl, setAvatarUrl] = useState<string | null>(null);
    const [isDropdownOpen, setIsDropdownOpen] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const getUserProfile = async () => {
            console.log('UserProfile: Getting user profile...');
            const { data: { session } } = await supabase.auth.getSession();
            console.log('UserProfile: Session data:', session?.user?.email ? 'User authenticated' : 'No user session');
            setUserEmail(session?.user?.email || null);
            
            // Try to get avatar from user metadata or use default Gravatar-style avatar
            if (session?.user?.email) {
                const emailHash = session.user.email.trim().toLowerCase();
                setAvatarUrl(`https://www.gravatar.com/avatar/${emailHash}?d=mp`);
                console.log('UserProfile: Avatar URL set for user');
            }
        };

        getUserProfile();

        // Subscribe to auth state changes
        const { data: { subscription } } = supabase.auth.onAuthStateChange((_event, session) => {
            console.log('UserProfile: Auth state changed:', session?.user?.email ? 'User authenticated' : 'User logged out');
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
            // This handles clearing auth cookies automatically
            const { error } = await supabase.auth.signOut({ scope: 'global' });

            if (error) {
                console.error('Error signing out:', error);
                // Even if there's an error, still try to clear local state
            }

            // Clear app-specific data from localStorage (selective clearing)
            // Only remove non-Supabase keys to avoid interfering with auth
            const keysToKeep = Object.keys(localStorage).filter(key =>
                key.startsWith('sb-') // Preserve Supabase auth keys
            );
            const allKeys = Object.keys(localStorage);
            allKeys.forEach(key => {
                if (!keysToKeep.includes(key)) {
                    localStorage.removeItem(key);
                }
            });

            // Clear session storage (typically doesn't contain auth data)
            sessionStorage.clear();

            console.log('Logout complete, redirecting...');

            // Use window.location.href for a hard redirect that bypasses middleware
            window.location.href = '/auth';
            
        } catch (error) {
            console.error('Logout error:', error);
            // Force redirect even on error - auth state will be checked on next load
            window.location.href = '/auth';
        }
    };

    // Show loading state if no user email yet (instead of null)
    if (!userEmail) {
        if (variant === 'floating') {
            return (
                <div className="relative">
                    <button
                        className="w-10 h-10 rounded-full focus:outline-none transition-all duration-300 shadow-lg bg-muted hover:bg-accent"
                        disabled
                    >
                        <div className="w-7 h-7 rounded-full overflow-hidden bg-card/20 flex items-center justify-center mx-auto">
                            <div className="w-4 h-4 border-2 border-muted-foreground border-t-transparent rounded-full animate-spin"></div>
                        </div>
                    </button>
                </div>
            );
        }
        return null;
    }

    // Floating variant - circular button
    if (variant === 'floating') {
        return (
            <div className="relative z-[100000] flex items-center justify-center" ref={dropdownRef}>
                <button
                    onClick={(e) => {
                        console.log('UserProfile: Button clicked! Current dropdown state:', isDropdownOpen);
                        e.preventDefault();
                        e.stopPropagation();
                        setIsDropdownOpen(!isDropdownOpen);
                        console.log('UserProfile: Setting dropdown to:', !isDropdownOpen);
                    }}
                    className={`w-8 h-8 rounded-full focus:outline-none transition-all duration-300 shadow-lg relative z-[100001] ${
                        isDropdownOpen 
                        ? 'bg-transparent scale-110' 
                        : 'bg-transparent hover:bg-transparent hover:scale-105'
                    }`}
                    tabIndex={0}
                    style={{ pointerEvents: 'auto' }}
                >
                    <div className="w-8 h-8 rounded-full overflow-hidden bg-transparent flex items-center justify-center">
                        {avatarUrl && (
                            <Image
                                src={avatarUrl} width={32} height={32}
                                alt="User avatar"
                                className="w-full h-full object-cover"
                            />
                        )}
                    </div>
                </button>

                {/* Dropdown Menu */}
                {isDropdownOpen && (
                    <div className={`absolute right-0 w-52 bg-popover backdrop-blur-md rounded-md shadow-2xl z-[100002] p-0 border border-border ${
                        dropdownDirection === 'up' 
                        ? 'bottom-full mb-2 animate-fade-slide-up' 
                        : 'top-full mt-2 animate-fade-slide-down'
                    }`}>
                        <div className="flex flex-col items-center pt-4 pb-2 px-4">
                            <div className="w-12 h-12 rounded-full overflow-hidden bg-card/50 flex items-center justify-center mb-2">
                                {avatarUrl && (
                                    <Image
                                        src={avatarUrl} width={32} height={32}
                                        alt="User avatar"
                                        className="w-full h-full object-cover"
                                    />
                                )}
                            </div>
                            <span className="font-medium text-popover-foreground text-sm truncate w-full text-center mb-1">{userEmail}</span>
                        </div>
                        <div className="border-t border-border/30 my-1" />
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
                                className="w-full px-3 py-2 rounded-md text-sm font-medium text-destructive bg-destructive/10 hover:bg-destructive/20 hover:text-destructive transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-destructive/50 border border-destructive/30 hover:border-destructive/50 cursor-pointer select-none transform hover:scale-[1.02] active:scale-[0.98] z-[10000] relative"
                                style={{ pointerEvents: 'auto' }}
                            >
                                Log out
                            </button>
                        </div>
                    </div>
                )}
                <style jsx global>{`
                  @keyframes fade-slide-up {
                    from { opacity: 0; transform: translateY(-8px); }
                    to { opacity: 1; transform: translateY(0); }
                  }
                  @keyframes fade-slide-down {
                    from { opacity: 0; transform: translateY(8px); }
                    to { opacity: 1; transform: translateY(0); }
                  }
                  .animate-fade-slide-up {
                    animation: fade-slide-up 0.18s cubic-bezier(0.4,0,0.2,1);
                  }
                  .animate-fade-slide-down {
                    animation: fade-slide-down 0.18s cubic-bezier(0.4,0,0.2,1);
                  }
                `}</style>
            </div>
        );
    }

    // Default variant (original design)
    return (
        <div className="relative" ref={dropdownRef}>
            <button
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className={`flex items-center gap-2 focus:outline-none px-3 py-2 rounded-md transition-all duration-200 ${
                    isDropdownOpen 
                    ? 'bg-accent border border-primary' 
                    : 'border border-transparent hover:border-primary/40 hover:bg-accent/50'
                }`}
                tabIndex={0}
            >
                <div className="w-8 h-8 rounded-full overflow-hidden bg-card/40 flex items-center justify-center border border-border">
                    {avatarUrl && (
                        <Image
                            src={avatarUrl} width={32} height={32}
                            alt="User avatar"
                            className="w-full h-full object-cover"
                        />
                    )}
                </div>
                <span className="text-sm font-medium text-foreground truncate max-w-[120px]">
                    {userEmail}
                </span>
                <ChevronDown className={`w-4 h-4 ml-1 transition-transform duration-200 text-primary ${isDropdownOpen ? 'rotate-180' : ''}`} />
            </button>

            {/* Dropdown Menu */}
            {isDropdownOpen && (
                <div className="absolute right-0 mt-2 w-52 bg-popover backdrop-blur-md rounded-md shadow-2xl z-[9999] p-0 animate-fade-slide-in border border-border">
                    <div className="flex flex-col items-center pt-4 pb-2 px-4">
                        <div className="w-12 h-12 rounded-full overflow-hidden bg-background/50 flex items-center justify-center mb-2 border border-border">
                            {avatarUrl && (
                                <Image
                                    src={avatarUrl} width={32} height={32}
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
                            className="w-full px-3 py-2 rounded-md text-sm font-medium text-red-400 bg-red-900/20 hover:bg-red-900/40 hover:text-red-400 transition-all duration-200 focus:outline-none focus:ring-2 focus:ring-red-500/50 border border-red-900/30 hover:border-red-700/50 cursor-pointer select-none transform hover:scale-[1.02] active:scale-[0.98] z-[10000] relative"
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