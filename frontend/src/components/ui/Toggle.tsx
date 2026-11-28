import { forwardRef, useState } from 'react'
import { cn } from '@/lib/utils'

interface ToggleProps extends Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'onChange'> {
  pressed?: boolean
  checked?: boolean
  onPressedChange?: (pressed: boolean) => void
  defaultChecked?: boolean
  onChange?: (checked: boolean) => void
  variant?: 'default' | 'outline'
  size?: 'sm' | 'md' | 'lg'
}

export const Toggle = forwardRef<HTMLButtonElement, ToggleProps>(
  ({ className, pressed: controlledPressed, checked: controlledChecked, onPressedChange, defaultChecked, onChange, variant = 'default', size = 'md', children, ...props }, ref) => {
    const [internalPressed, setInternalPressed] = useState(defaultChecked || false)
    const controlled = controlledPressed !== undefined ? controlledPressed : controlledChecked
    const isControlled = controlled !== undefined
    const pressed = isControlled ? controlled : internalPressed

    const sizeClasses = {
      sm: 'h-7 px-2.5 text-xs',
      md: 'h-8 px-3 text-sm',
      lg: 'h-10 px-4 text-sm',
    }

    const variantClasses = {
      default: pressed
        ? 'bg-brand-500 text-white shadow-xs'
        : 'bg-surface-100 text-surface-700 hover:bg-surface-200 dark:bg-[#1a1d28] dark:text-zinc-300 dark:hover:bg-[#232736]',
      outline: pressed
        ? 'border border-brand-500/50 bg-brand-500/10 text-brand-400'
        : 'border border-surface-200 dark:border-white/[0.08] text-surface-700 dark:text-zinc-300 hover:bg-surface-50 dark:hover:bg-white/[0.03]',
    }

    const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
      const newPressed = !pressed
      if (!isControlled) {
        setInternalPressed(newPressed)
      }
      onPressedChange?.(newPressed)
      onChange?.(newPressed)
      props.onClick?.(e)
    }

    return (
      <button
        ref={ref}
        type="button"
        className={cn(
          'inline-flex items-center justify-center rounded-md font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/50',
          sizeClasses[size],
          variantClasses[variant],
          className
        )}
        onClick={handleClick}
        aria-pressed={pressed}
        {...props}
      >
        {children}
      </button>
    )
  }
)

Toggle.displayName = 'Toggle'
