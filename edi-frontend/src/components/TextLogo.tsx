'use client';

import React from 'react';

interface TextLogoProps {
  size?: 'sm' | 'md' | 'lg' | 'xl';
  variant?: 'light' | 'dark' | 'gradient';
  className?: string;
}

export default function TextLogo({ size = 'md', variant = 'gradient', className = '' }: TextLogoProps) {
  const sizeClasses = {
    sm: 'text-base',
    md: 'text-xl',
    lg: 'text-3xl',
    xl: 'text-5xl'
  };

  const variantClasses = {
    light: 'text-white',
    dark: 'text-black',
    gradient: 'bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 bg-clip-text text-transparent'
  };

  return (
    <div className={`font-bold tracking-tight ${sizeClasses[size]} ${className}`}>
      <span className={variant === 'gradient' ? 'bg-gradient-to-r from-blue-400 via-blue-500 to-blue-600 bg-clip-text text-transparent' : variantClasses[variant]}>
        EDI
      </span>
      <span className={variant === 'gradient' ? 'bg-gradient-to-r from-blue-500 via-blue-600 to-blue-700 bg-clip-text text-transparent' : variantClasses[variant]}>
        .ai
      </span>
    </div>
  );
} 