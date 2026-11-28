import { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

export interface BadgeProps extends HTMLAttributes<HTMLSpanElement> {
  variant?: 'success' | 'warning' | 'danger' | 'info' | 'neutral' | 'accent'
  size?: 'sm' | 'md'
  dot?: boolean
}

export const Badge = forwardRef<HTMLSpanElement, BadgeProps>(
  ({ className, variant = 'neutral', size = 'md', dot = false, children, ...props }, ref) => {
    const variantClasses = {
      success: 'badge-success',
      warning: 'badge-warning',
      danger: 'badge-danger',
      info: 'badge-info',
      neutral: 'badge-neutral',
      accent: 'badge bg-brand-500/10 text-brand-400 border-brand-500/25',
    }

    const sizeClasses = {
      sm: 'px-2 py-0.5 text-[10px] gap-1',
      md: 'px-2.5 py-0.5 text-xs gap-1.5',
    }

    return (
      <span ref={ref} className={cn('badge font-mono', variantClasses[variant], sizeClasses[size], className)} {...props}>
        {dot && (
          <span
            className={cn(
              'h-1.5 w-1.5 rounded-full shrink-0',
              variant === 'success' && 'bg-emerald-500',
              variant === 'warning' && 'bg-amber-500',
              variant === 'danger' && 'bg-rose-500',
              variant === 'info' && 'bg-brand-500',
              variant === 'accent' && 'bg-brand-500',
              variant === 'neutral' && 'bg-surface-400 dark:bg-zinc-500'
            )}
            aria-hidden="true"
          />
        )}
        {children}
      </span>
    )
  }
)

Badge.displayName = 'Badge'
