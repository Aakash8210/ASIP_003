/* eslint-disable react-refresh/only-export-components */
import { cloneElement, forwardRef, isValidElement, type ButtonHTMLAttributes, type ReactElement } from 'react'
import { cn } from '@/lib/utils'

export type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger' | 'outline' | 'neutral'
export type ButtonSize = 'sm' | 'md' | 'lg' | 'icon'

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  danger?: boolean
  size?: ButtonSize
  loading?: boolean
  leftIcon?: React.ReactNode
  rightIcon?: React.ReactNode
  fullWidth?: boolean
  asChild?: boolean
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'btn-primary',
  secondary: 'btn-secondary',
  ghost: 'btn-ghost',
  danger: 'btn-danger',
  outline: 'btn-outline',
  neutral: 'btn-outline',
}

const SIZE_CLASSES: Record<ButtonSize, string> = {
  sm: 'btn-sm',
  md: '',
  lg: 'btn-lg',
  icon: 'btn-icon',
}

export function buttonVariants({
  variant = 'primary',
  size = 'md',
  fullWidth = false,
  className,
}: {
  variant?: ButtonVariant
  size?: ButtonSize
  fullWidth?: boolean
  className?: string
} = {}) {
  return cn(
    'btn',
    VARIANT_CLASSES[variant],
    SIZE_CLASSES[size],
    fullWidth && 'w-full',
    className
  )
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    {
      className,
      variant = 'primary',
      danger = false,
      size = 'md',
      loading = false,
      leftIcon,
      rightIcon,
      fullWidth = false,
      disabled,
      asChild = false,
      children,
      ...props
    },
    ref
  ) => {
    const effectiveVariant: ButtonVariant = danger && variant === 'primary' ? 'danger' : variant
    const buttonClasses = cn(
      buttonVariants({ variant: effectiveVariant, size, fullWidth }),
      danger && variant !== 'danger' && 'text-danger-600 hover:bg-danger-50 hover:border-danger-200 dark:text-danger-400 dark:hover:bg-danger-900/20 dark:hover:border-danger-800/50',
      className
    )

    if (asChild) {
      if (isValidElement(children)) {
        const child = children as ReactElement<{ className?: string }>
        return cloneElement(child, {
          className: cn(buttonClasses, child.props?.className),
        })
      }
      return <span className={buttonClasses}>{children}</span>
    }

    return (
      <button
        ref={ref}
        className={buttonClasses}
        disabled={disabled || loading}
        aria-busy={loading}
        {...props}
      >
        {loading && (
          <svg
            className="animate-spin h-3.5 w-3.5"
            xmlns="http://www.w3.org/2000/svg"
            fill="none"
            viewBox="0 0 24 24"
            aria-hidden="true"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="3"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
        )}
        {!loading && leftIcon}
        <span>{children}</span>
        {rightIcon}
      </button>
    )
  }
)

Button.displayName = 'Button'
