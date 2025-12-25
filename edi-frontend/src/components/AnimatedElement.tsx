import { motion, useInView, Variants } from 'framer-motion';
import { useRef } from 'react';

interface AnimatedElementProps {
  children: React.ReactNode;
  className?: string;
  delay?: number;
  direction?: 'up' | 'down' | 'left' | 'right' | 'scale' | 'fade';
  duration?: number;
  once?: boolean;
  threshold?: number;
  staggerChildren?: boolean;
  staggerDelay?: number;
}

export default function AnimatedElement({
  children,
  className = '',
  delay = 0,
  direction = 'up',
  duration = 0.8,
  once = true,
  staggerChildren = false,
  staggerDelay = 0.1
}: AnimatedElementProps) {
  const ref = useRef(null);
  const isInView = useInView(ref, { once, margin: "-10px" });

  const getVariants = (): Variants => {
    const baseTransition: any = {
      duration,
      delay,
      ease: [0.21, 0.47, 0.32, 0.98]
    };
    
    switch (direction) {
      case 'down':
        return {
          hidden: { y: -50, opacity: 0 },
          visible: { y: 0, opacity: 1, transition: baseTransition }
        };
      case 'up':
        return {
          hidden: { y: 50, opacity: 0 },
          visible: { y: 0, opacity: 1, transition: baseTransition }
        };
      case 'left':
        return {
          hidden: { x: 50, opacity: 0 },
          visible: { x: 0, opacity: 1, transition: baseTransition }
        };
      case 'right':
        return {
          hidden: { x: -50, opacity: 0 },
          visible: { x: 0, opacity: 1, transition: baseTransition }
        };
      case 'scale':
        return {
          hidden: { scale: 0.9, opacity: 0 },
          visible: { scale: 1, opacity: 1, transition: baseTransition }
        };
      case 'fade':
        return {
          hidden: { opacity: 0 },
          visible: { opacity: 1, transition: baseTransition }
        };
      default:
        return {
          hidden: { y: 50, opacity: 0 },
          visible: { y: 0, opacity: 1, transition: baseTransition }
        };
    }
  };

  const containerVariants = staggerChildren ? {
    hidden: { opacity: 0 },
    visible: {
      opacity: 1,
      transition: {
        staggerChildren: staggerDelay,
        delayChildren: delay
      }
    }
  } : getVariants();

  const childVariants = staggerChildren ? getVariants() : {};

  const MotionComponent = staggerChildren ? motion.div : motion.div;
  const ChildComponent = staggerChildren ? motion.div : 'div';

  return (
    <MotionComponent
      ref={ref}
      className={className}
      initial="hidden"
      animate={isInView ? "visible" : "hidden"}
      variants={containerVariants}
    >
      {staggerChildren ? (
        Array.isArray(children) ? (
          children.map((child, index) => (
            <ChildComponent key={index} variants={childVariants}>
              {child}
            </ChildComponent>
          ))
        ) : (
          <ChildComponent variants={childVariants}>
            {children}
          </ChildComponent>
        )
      ) : (
        children
      )}
    </MotionComponent>
  );
} 