import React from 'react';
import { motion, useReducedMotion } from 'motion/react';

export type FlyDirection = 'left' | 'right' | 'bottom' | 'top' | 'scale';

interface FlyingCardProps {
  children: React.ReactNode;
  direction?: FlyDirection;
  delay?: number;
  className?: string;
  hoverLift?: boolean;
  onScrollReveal?: boolean;
}

const DIRECTION_OFFSETS: Record<
  FlyDirection,
  { x: number; y: number; rotate: number; scale: number }
> = {
  left: { x: -72, y: 22, rotate: -3, scale: 0.94 },
  right: { x: 72, y: 22, rotate: 3, scale: 0.94 },
  bottom: { x: 0, y: 54, rotate: 0, scale: 0.93 },
  top: { x: 0, y: -36, rotate: 0, scale: 0.95 },
  scale: { x: 0, y: 18, rotate: 0, scale: 0.88 },
};

export const FlyingCard: React.FC<FlyingCardProps> = ({
  children,
  direction = 'bottom',
  delay = 0,
  className = '',
  hoverLift = false,
  onScrollReveal = true,
}) => {
  const prefersReducedMotion = useReducedMotion();
  const offset = DIRECTION_OFFSETS[direction];

  if (prefersReducedMotion) {
    return <div className={className}>{children}</div>;
  }

  const targetState = { opacity: 1, x: 0, y: 0, rotate: 0, scale: 1 };

  return (
    <motion.div
      initial={{
        opacity: 0,
        x: offset.x,
        y: offset.y,
        rotate: offset.rotate,
        scale: offset.scale,
      }}
      animate={onScrollReveal ? undefined : targetState}
      whileInView={onScrollReveal ? targetState : undefined}
      viewport={onScrollReveal ? { once: true, amount: 0.08 } : undefined}
      whileHover={hoverLift ? { y: -4, scale: 1.01 } : undefined}
      transition={{
        type: 'spring',
        stiffness: 195,
        damping: 20,
        mass: 0.85,
        delay,
      }}
      className={`will-change-transform ${className}`}
    >
      {children}
    </motion.div>
  );
};
