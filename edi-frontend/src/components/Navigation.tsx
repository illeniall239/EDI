'use client';

import React from 'react';
import Link from 'next/link';
import { useRouter, usePathname } from 'next/navigation';
import { useScrollTo } from '@/hooks/useScrollTo';
import { supabase } from '@/utils/supabase';
import { motion } from 'framer-motion';

interface NavigationProps {
  showStartProject?: boolean;
  darkMode?: boolean;
}

export default function Navigation({ showStartProject = true }: NavigationProps) {
  const router = useRouter();
  const pathname = usePathname();
  const scrollTo = useScrollTo();
  const [isScrolled, setIsScrolled] = React.useState(false);

  React.useEffect(() => {
    const handleScroll = () => {
      if (pathname !== '/') {
        setIsScrolled(true);
        return;
      }
      setIsScrolled(window.scrollY > 20);
    };
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true } as any);
    return () => window.removeEventListener('scroll', handleScroll as any);
  }, [pathname]);

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
    <motion.div
      className="fixed w-full top-0 z-[10001] pt-4 bg-transparent"
      initial={{ y: -40, opacity: 0 }}
      animate={{ y: 0, opacity: 1 }}
      transition={{ duration: 0.6, ease: 'easeOut' }}
    >
      <div className={`max-w-6xl mx-auto px-8 py-3 flex items-center justify-between rounded-xl transition-all duration-300 ${
        isScrolled 
          ? 'bg-black/80 backdrop-blur-md shadow-lg' 
          : 'bg-transparent'
      }`}>
        {/* Logo */}
        <Link href="/" className="flex items-center space-x-2">
          <span className="text-2xl font-bold text-white font-pixelify">
            EDI.ai
          </span>
        </Link>

        {/* Navigation Links */}
        <nav className="hidden md:flex items-center space-x-8">
          <Link 
            href="/" 
            onClick={(e) => handleNavClick(e, null)}
            className="text-white hover:text-white/80 transition-colors"
          >
            Home
          </Link>
          <Link 
            href="/#features" 
            onClick={(e) => handleNavClick(e, 'features')}
            className="text-white hover:text-white/80 transition-colors"
          >
            Features
          </Link>
          <Link 
            href="/#about" 
            onClick={(e) => handleNavClick(e, 'intro')}
            className="text-white hover:text-white/80 transition-colors"
          >
            About
          </Link>
        </nav>

        {/* CTA Button */}
        {showStartProject && (
          <button
            onClick={handleTryNow}
            className="bg-white text-black px-6 py-2 rounded-lg font-medium hover:shadow-lg transition-all duration-300 transform hover:scale-105 hover:bg-white/90"
          >
            Try Now
          </button>
        )}
      </div>
    </motion.div>
  );
} 