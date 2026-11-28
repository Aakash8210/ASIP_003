import React, { forwardRef, type HTMLAttributes } from 'react'
import { cn } from '@/lib/utils'

interface AvatarProps extends HTMLAttributes<HTMLDivElement> {
  src?: string | null
  alt?: string
  name?: string
  size?: 'xs' | 'sm' | 'md' | 'lg' | 'xl'
  shape?: 'circle' | 'square'
  status?: 'online' | 'offline' | 'busy' | 'away'
}

interface AvatarGroupProps extends HTMLAttributes<HTMLDivElement> {
  max?: number
}

const sizeClasses = {
  xs: 'h-6 w-6 text-[10px]',
  sm: 'h-7 w-7 text-xs',
  md: 'h-9 w-9 text-xs',
  lg: 'h-11 w-11 text-sm',
  xl: 'h-14 w-14 text-base',
}

const statusSizeClasses = {
  xs: 'h-1.5 w-1.5',
  sm: 'h-2 w-2',
  md: 'h-2 w-2',
  lg: 'h-2.5 w-2.5',
  xl: 'h-3 w-3',
}

const statusPositionClasses = {
  xs: 'bottom-0 right-0',
  sm: 'bottom-0 right-0',
  md: 'bottom-0 right-0',
  lg: 'bottom-0.5 right-0.5',
  xl: 'bottom-1 right-1',
}

function getInitials(name: string): string {
  return name
    .split(' ')
    .filter(Boolean)
    .map((part) => part[0])
    .join('')
    .toUpperCase()
    .slice(0, 2)
}

function getColorFromName(name: string): string {
  // Restrained enterprise neutrals with subtle warm tint
  const colors = [
    'bg-[#2A2E3D] text-zinc-200 border border-white/[0.08]',
    'bg-[#342A25] text-amber-200 border border-amber-500/20',
    'bg-[#24332C] text-emerald-200 border border-emerald-500/20',
    'bg-[#262C38] text-slate-200 border border-slate-500/20',
    'bg-[#372422] text-rose-200 border border-rose-500/20',
  ]
  let hash = 0
  for (let i = 0; i < name.length; i++) {
    hash = name.charCodeAt(i) + ((hash << 5) - hash)
  }
  return colors[Math.abs(hash) % colors.length]
}

export const Avatar = forwardRef<HTMLDivElement, AvatarProps>(
  (
    {
      className,
      src,
      alt,
      name,
      size = 'md',
      shape = 'circle',
      status,
      ...props
    },
    ref
  ) => {
    const shapeClass = shape === 'circle' ? 'rounded-full' : 'rounded-lg'

    return (
      <div ref={ref} className={cn('relative inline-flex shrink-0 select-none', className)} {...props}>
        <div className={cn('relative overflow-hidden bg-surface-200 dark:bg-[#1a1d28]', sizeClasses[size], shapeClass)}>
          {src ? (
            <img
              src={src}
              alt={alt || name || 'Avatar'}
              className="h-full w-full object-cover"
              loading="lazy"
            />
          ) : name ? (
            <div
              className={cn(
                'flex h-full w-full items-center justify-center font-medium font-mono',
                getColorFromName(name)
              )}
              aria-label={name}
            >
              {getInitials(name)}
            </div>
          ) : (
            <div className="flex h-full w-full items-center justify-center text-surface-400 dark:text-zinc-500">
              <svg className="h-1/2 w-1/2" fill="none" stroke="currentColor" viewBox="0 0 24 24" aria-hidden="true">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={1.5} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
            </div>
          )}
        </div>
        {status && (
          <span
            className={cn(
              'absolute border border-white dark:border-[#0c0d12] rounded-full',
              statusSizeClasses[size],
              statusPositionClasses[size],
              status === 'online' && 'bg-emerald-500',
              status === 'busy' && 'bg-rose-500',
              status === 'away' && 'bg-amber-500',
              status === 'offline' && 'bg-surface-400'
            )}
            aria-label={`Status: ${status}`}
          />
        )}
      </div>
    )
  }
)

Avatar.displayName = 'Avatar'

export const AvatarGroup = forwardRef<HTMLDivElement, AvatarGroupProps>(
  ({ className, children, max = 5, ...props }, ref) => {
    const childArray = React.Children.toArray(children)
    const visibleChildren = childArray.slice(0, max)
    const remainingCount = childArray.length - max

    return (
      <div ref={ref} className={cn('flex -space-x-1.5', className)} {...props}>
        {visibleChildren.map((child, index) => {
          if (!React.isValidElement(child)) return null
          return React.cloneElement(child, {
            key: child.key || index,
            className: cn(child.props.className, 'ring-1 ring-white dark:ring-[#0c0d12]'),
          })
        })}
        {remainingCount > 0 && (
          <div
            className={cn(
              'flex shrink-0 items-center justify-center font-mono text-[10px] text-surface-600 dark:text-zinc-400 bg-surface-100 dark:bg-[#1a1d28] border border-white dark:border-[#0c0d12]',
              sizeClasses.md,
              'rounded-full'
            )}
            aria-label={`${remainingCount} more people`}
          >
            +{remainingCount}
          </div>
        )}
      </div>
    )
  }
)

AvatarGroup.displayName = 'AvatarGroup'
