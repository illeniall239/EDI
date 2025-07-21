'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useScrollTo } from '@/hooks/useScrollTo';
import { supabase } from '@/utils/supabase';

interface NavigationProps {
  showStartProject?: boolean;
  darkMode?: boolean;
}

export default function Navigation({ showStartProject = true, darkMode = true }: NavigationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const scrollTo = useScrollTo();

  const handleNavClick = (e: React.MouseEvent<HTMLAnchorElement>, sectionId: string | null) => {
    e.preventDefault();
    
    if (pathname !== '/') {
      // If we're not on the home page, first navigate to home
      router.push('/');
      // Wait for navigation to complete before scrolling
      setTimeout(() => {
        if (sectionId) {
          scrollTo(sectionId);
        }
      }, 100);
    } else if (sectionId) {
      // If we're already on home page, just scroll
      scrollTo(sectionId);
    } else {
      // If no section ID (home link) and we're already home, scroll to top
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const handleTryNow = async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (session) {
      router.push('/workspaces');
    } else {
      router.push('/auth');
    }
  };

  return (
    <div className="fixed w-full top-0 z-50 flex justify-center pt-4">
      <nav className="w-[95%] max-w-[1800px] bg-black/40 backdrop-blur-md rounded-xl border border-blue-900/10">
        <div className="flex items-center justify-between h-14 pl-2 pr-6">
          {/* Logo */}
          <span className="text-2xl md:text-3xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-blue-400 via-blue-200 to-white pl-2">EDI.ai</span>

          {/* Center Navigation */}
          <div className="hidden md:flex items-center space-x-8">
              <Link 
                href="/" 
                onClick={(e) => handleNavClick(e, null)}
              className="text-white/80 hover:text-blue-500 transition-colors duration-300 text-sm font-medium"
              >
                Home
              </Link>
              <Link 
                href="/#features" 
                onClick={(e) => handleNavClick(e, 'features')}
              className="text-white/80 hover:text-blue-500 transition-colors duration-300 text-sm font-medium"
              >
                Features
              </Link>
              <Link 
                href="/#how-it-works" 
                onClick={(e) => handleNavClick(e, 'how-it-works')}
              className="text-white/80 hover:text-blue-500 transition-colors duration-300 text-sm font-medium"
              >
                How it works
              </Link>
          </div>

          {/* Right Button */}
          <div className="flex items-center">
            {showStartProject && (
              <button
                onClick={handleTryNow}
                className="bg-blue-600 hover:bg-blue-700 text-white px-4 py-2 rounded-full transition-all duration-300 text-sm font-medium cursor-pointer"
              >
                Try Now
              </button>
            )}
          </div>
        </div>
      </nav>
      </div>
  );
} 