import { forwardRef, useState, createContext, useContext, ReactNode } from 'react'
import { cn } from '@/lib/utils'

interface TabsContextType {
  value: string
  onValueChange: (value: string) => void
  variant?: 'line' | 'pills'
}

const TabsContext = createContext<TabsContextType | undefined>(undefined)

const useTabsContext = () => {
  const context = useContext(TabsContext)
  if (!context) {
    throw new Error('Tabs subcomponents must be used within a Tabs component')
  }
  return context
}

interface TabsProps extends React.HTMLAttributes<HTMLDivElement> {
  defaultValue?: string
  value?: string
  onValueChange?: (value: string) => void
  variant?: 'line' | 'pills'
  children: ReactNode
}

interface TabsListProps extends React.HTMLAttributes<HTMLDivElement> {
  children: React.ReactNode
}

interface TabsTriggerProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  value: string
}

interface TabsContentProps extends React.HTMLAttributes<HTMLDivElement> {
  value: string
}

export const Tabs = forwardRef<HTMLDivElement, TabsProps>(
  ({ defaultValue = '', value, onValueChange, variant = 'line', children, className, ...props }, ref) => {
    const [internalValue, setInternalValue] = useState(defaultValue)
    const currentValue = value !== undefined ? value : internalValue

    const handleValueChange = (newValue: string) => {
      setInternalValue(newValue)
      onValueChange?.(newValue)
    }

    return (
      <TabsContext.Provider value={{ value: currentValue, onValueChange: handleValueChange, variant }}>
        <div ref={ref} className={cn('w-full', className)} {...props}>
          {children}
        </div>
      </TabsContext.Provider>
    )
  }
)

Tabs.displayName = 'Tabs'

export const TabsList = forwardRef<HTMLDivElement, TabsListProps>(
  ({ className, children, ...props }, ref) => {
    const { variant } = useTabsContext()
    return (
      <div
        ref={ref}
        className={cn(
          variant === 'pills'
            ? 'inline-flex items-center gap-1.5 p-1 rounded-lg bg-surface-100 dark:bg-[#14161f] border border-surface-200/80 dark:border-white/[0.08]'
            : 'flex items-center gap-2 border-b border-surface-200 dark:border-white/[0.08]',
          className
        )}
        role="tablist"
        {...props}
      >
        {children}
      </div>
    )
  }
)

TabsList.displayName = 'TabsList'

export const TabsTrigger = forwardRef<HTMLButtonElement, TabsTriggerProps>(
  ({ className, value, children, ...props }, ref) => {
    const { value: activeValue, onValueChange, variant } = useTabsContext()
    const isActive = activeValue === value

    if (variant === 'pills') {
      return (
        <button
          ref={ref}
          type="button"
          role="tab"
          aria-selected={isActive}
          onClick={() => onValueChange(value)}
          className={cn(
            'px-3 py-1.5 text-xs font-medium rounded-md transition-colors select-none',
            isActive
              ? 'bg-[#2D211C] text-[#E09F80] border border-brand-500/25 shadow-xs dark:bg-[#2D211C] dark:text-[#E09F80]'
              : 'text-surface-600 hover:text-surface-900 dark:text-zinc-400 dark:hover:text-zinc-200',
            className
          )}
          {...props}
        >
          {children}
        </button>
      )
    }

    return (
      <button
        ref={ref}
        type="button"
        role="tab"
        aria-selected={isActive}
        onClick={() => onValueChange(value)}
        className={cn(
          'px-3.5 py-2 text-sm font-medium border-b-2 transition-colors select-none -mb-px',
          isActive
            ? 'border-brand-500 text-brand-600 dark:text-brand-400 font-semibold'
            : 'border-transparent text-surface-600 dark:text-zinc-400 hover:text-surface-900 dark:hover:text-zinc-200 hover:border-surface-300 dark:hover:border-zinc-700',
          'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-500/30',
          className
        )}
        {...props}
      >
        {children}
      </button>
    )
  }
)

TabsTrigger.displayName = 'TabsTrigger'

export const TabsContent = forwardRef<HTMLDivElement, TabsContentProps>(
  ({ className, value, children, ...props }, ref) => {
    const { value: activeValue } = useTabsContext()

    if (activeValue !== value) return null

    return (
      <div ref={ref} role="tabpanel" tabIndex={0} className={cn('mt-4 focus-visible:outline-none', className)} {...props}>
        {children}
      </div>
    )
  }
)

TabsContent.displayName = 'TabsContent'
