import { forwardRef } from 'react'
import { cn } from '@/lib/utils'

interface ProgressProps extends React.HTMLAttributes<HTMLDivElement> {
  value?: number
  max?: number
  variant?: 'default' | 'success' | 'warning' | 'danger'
  showLabel?: boolean
}

export const Progress = forwardRef<HTMLDivElement, ProgressProps>(
  ({ value = 0, max = 100, variant = 'default', showLabel = false, className, ...props }, ref) => {
    const percentage = Math.min(Math.max((value / max) * 100, 0), 100)

    const variantClasses = {
      default: 'bg-brand-500',
      success: 'bg-emerald-500',
      warning: 'bg-amber-500',
      danger: 'bg-rose-500',
    }

    return (
      <div className="space-y-1.5 w-full">
        <div
          ref={ref}
          className={cn('w-full h-1.5 bg-surface-200 dark:bg-white/[0.08] rounded-full overflow-hidden', className)}
          role="progressbar"
          aria-valuenow={Math.round(percentage)}
          aria-valuemin={0}
          aria-valuemax={100}
          {...props}
        >
          <div
            className={cn('h-full transition-all duration-300 rounded-full', variantClasses[variant])}
            style={{ width: `${percentage}%` }}
          />
        </div>
        {showLabel && (
          <div className="flex justify-end text-[11px] font-mono text-surface-500 dark:text-zinc-400 tabular-nums">
            {Math.round(percentage)}%
          </div>
        )}
      </div>
    )
  }
)

Progress.displayName = 'Progress'
