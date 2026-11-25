import {
  forwardRef,
  useState,
  useRef,
  useEffect,
  useId,
  ReactNode,
  SelectHTMLAttributes,
  createContext,
  useContext,
  useMemo,
  KeyboardEvent,
} from 'react'
import { cn } from '@/lib/utils'
import { ChevronDown, Check, Search, X } from 'lucide-react'
import { AnimatePresence, motion } from 'framer-motion'

export interface SelectOption {
  value: string | number
  label: string
  sublabel?: string
  description?: string
  badge?: string
  avatarName?: string
  disabled?: boolean
}

interface SelectContextType {
  value: string
  onValueChange: (value: string) => void
  isOpen?: boolean
  setIsOpen?: (open: boolean) => void
}

const SelectContext = createContext<SelectContextType | undefined>(undefined)

const useSelectContext = () => {
  const context = useContext(SelectContext)
  if (!context) {
    throw new Error('Select subcomponents must be used within a Select component')
  }
  return context
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'onChange' | 'value'> {
  label?: string
  error?: string
  helperText?: string
  placeholder?: string
  options?: SelectOption[]
  onValueChange?: (value: string) => void
  children?: ReactNode
  value?: string | number
}

// Split label if it contains " — " or " - " into name and email/sublabel if not explicitly provided
function parseOptionLabel(opt: SelectOption): { name: string; sublabel?: string } {
  if (opt.sublabel) {
    return { name: opt.label, sublabel: opt.sublabel }
  }
  const emDashIndex = opt.label.indexOf(' — ')
  if (emDashIndex !== -1) {
    return {
      name: opt.label.slice(0, emDashIndex).trim(),
      sublabel: opt.label.slice(emDashIndex + 3).trim(),
    }
  }
  return { name: opt.label, sublabel: opt.description }
}

export const Select = forwardRef<HTMLDivElement, SelectProps>(
  (
    {
      className,
      label,
      error,
      helperText,
      placeholder = 'Select an option...',
      options,
      id,
      disabled,
      required,
      onValueChange,
      children,
      value,
      name,
      ...props
    },
    ref
  ) => {
    const generatedId = useId()
    const selectId = id || generatedId
    const [internalValue, setInternalValue] = useState<string>(value !== undefined ? String(value) : '')
    const [isOpen, setIsOpen] = useState(false)
    const [searchQuery, setSearchQuery] = useState('')
    const [highlightedIndex, setHighlightedIndex] = useState<number>(-1)

    const containerRef = useRef<HTMLDivElement>(null)
    const triggerRef = useRef<HTMLButtonElement>(null)
    const listboxRef = useRef<HTMLDivElement>(null)
    const searchInputRef = useRef<HTMLInputElement>(null)

    const currentValue = value !== undefined ? String(value) : internalValue

    const handleValueChange = (newValue: string) => {
      setInternalValue(newValue)
      onValueChange?.(newValue)
      setIsOpen(false)
      setSearchQuery('')
      triggerRef.current?.focus()
    }

    // Handle outside clicks
    useEffect(() => {
      if (!isOpen || children) return
      function handleClickOutside(event: MouseEvent) {
        if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
          setIsOpen(false)
          setSearchQuery('')
        }
      }
      document.addEventListener('mousedown', handleClickOutside)
      return () => {
        document.removeEventListener('mousedown', handleClickOutside)
      }
    }, [isOpen, children])

    const normalizedOptions = useMemo(() => options || [], [options])

    // Find current selected option
    const selectedOption = useMemo(
      () => normalizedOptions.find((opt) => String(opt.value) === currentValue),
      [normalizedOptions, currentValue]
    )

    // Filter options if search query is active
    const filteredOptions = useMemo(() => {
      if (!searchQuery.trim()) return normalizedOptions
      const q = searchQuery.toLowerCase()
      return normalizedOptions.filter((opt) => {
        const parsed = parseOptionLabel(opt)
        return (
          parsed.name.toLowerCase().includes(q) ||
          (parsed.sublabel && parsed.sublabel.toLowerCase().includes(q))
        )
      })
    }, [normalizedOptions, searchQuery])

    // Focus search input when dropdown opens with many items
    useEffect(() => {
      if (isOpen && !children && normalizedOptions.length > 5 && searchInputRef.current) {
        searchInputRef.current.focus()
      }
    }, [isOpen, children, normalizedOptions.length])

    // Compound pattern support when children are provided
    if (children) {
      return (
        <SelectContext.Provider
          value={{
            value: currentValue,
            onValueChange: handleValueChange,
            isOpen,
            setIsOpen,
          }}
        >
          <div ref={ref} className={cn('relative w-full', className)}>
            {label && (
              <label htmlFor={selectId} className="label">
                {label}
                {required && <span className="text-danger-500 ml-1" aria-hidden="true">*</span>}
              </label>
            )}
            {children}
            {error && (
              <p className="mt-1.5 text-sm text-danger-500" role="alert">
                {error}
              </p>
            )}
            {helperText && !error && (
              <p className="mt-1.5 text-sm text-surface-500 dark:text-surface-400">
                {helperText}
              </p>
            )}
          </div>
        </SelectContext.Provider>
      )
    }

    // Keyboard navigation
    const handleKeyDown = (e: KeyboardEvent<HTMLButtonElement | HTMLDivElement>) => {
      if (disabled) return

      if (e.key === 'ArrowDown') {
        e.preventDefault()
        if (!isOpen) {
          setIsOpen(true)
          setHighlightedIndex(0)
        } else {
          setHighlightedIndex((prev) => (prev + 1 < filteredOptions.length ? prev + 1 : 0))
        }
      } else if (e.key === 'ArrowUp') {
        e.preventDefault()
        if (!isOpen) {
          setIsOpen(true)
          setHighlightedIndex(filteredOptions.length - 1)
        } else {
          setHighlightedIndex((prev) => (prev - 1 >= 0 ? prev - 1 : filteredOptions.length - 1))
        }
      } else if (e.key === 'Enter' || e.key === ' ') {
        if (isOpen && highlightedIndex >= 0 && highlightedIndex < filteredOptions.length) {
          e.preventDefault()
          const targetOpt = filteredOptions[highlightedIndex]
          if (!targetOpt.disabled) {
            handleValueChange(String(targetOpt.value))
          }
        } else if (!isOpen && e.key === 'Enter') {
          e.preventDefault()
          setIsOpen(true)
        }
      } else if (e.key === 'Escape') {
        e.preventDefault()
        setIsOpen(false)
        setSearchQuery('')
        triggerRef.current?.focus()
      } else if (e.key === 'Tab') {
        setIsOpen(false)
        setSearchQuery('')
      }
    }

    const selectedParsed = selectedOption ? parseOptionLabel(selectedOption) : null

    return (
      <div ref={ref || containerRef} className={cn('relative w-full', className)}>
        {label && (
          <label htmlFor={selectId} className="label">
            {label}
            {required && <span className="text-danger-500 ml-1" aria-hidden="true">*</span>}
          </label>
        )}

        {/* Hidden native select for standard HTML form submissions and screen readers */}
        <select
          id={selectId}
          name={name}
          value={currentValue}
          onChange={(e) => handleValueChange(e.target.value)}
          disabled={disabled}
          required={required}
          className="sr-only"
          tabIndex={-1}
          aria-hidden="true"
          {...props}
        >
          {normalizedOptions.map((opt) => (
            <option key={String(opt.value)} value={opt.value} disabled={opt.disabled}>
              {opt.label}
            </option>
          ))}
        </select>

        {/* Custom Accessible Trigger Button */}
        <button
          ref={triggerRef}
          type="button"
          id={`${selectId}-trigger`}
          role="combobox"
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={`${selectId}-listbox`}
          aria-disabled={disabled}
          disabled={disabled}
          onClick={() => {
            if (!disabled) {
              setIsOpen((prev) => !prev)
              setSearchQuery('')
            }
          }}
          onKeyDown={handleKeyDown}
          className={cn(
            'flex items-center justify-between w-full min-h-[44px] px-3.5 py-2 rounded-xl text-left transition-all duration-150',
            'bg-white dark:bg-[#0F111A] border shadow-xs',
            'border-surface-300 dark:border-white/[0.08]',
            'text-surface-900 dark:text-zinc-100',
            'hover:border-surface-400 dark:hover:border-white/[0.16] dark:hover:bg-[#171926]',
            'focus:outline-none focus:ring-2 focus:ring-cyan-500/40 focus:border-cyan-500/60',
            error && 'border-rose-500 dark:border-rose-500/60 focus:ring-rose-500/20 focus:border-rose-500',
            disabled && 'opacity-50 cursor-not-allowed bg-surface-100 dark:bg-[#08090E]',
            isOpen && 'ring-2 ring-cyan-500/40 border-cyan-500/60'
          )}
        >
          <div className="flex-1 min-w-0 pr-2">
            {selectedOption && selectedOption.value !== '' ? (
              <div className="flex items-center gap-2.5 min-w-0">
                {(selectedOption.avatarName || selectedParsed?.sublabel?.includes('@')) && (
                  <div className="h-6 w-6 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-700 dark:text-cyan-300 text-[11px] font-semibold flex items-center justify-center shrink-0">
                    {(selectedOption.avatarName || selectedParsed?.name || '?').charAt(0).toUpperCase()}
                  </div>
                )}
                <div className="flex flex-col text-left min-w-0">
                  <span className="font-medium text-sm text-surface-900 dark:text-zinc-100 truncate">
                    {selectedParsed?.name}
                  </span>
                  {selectedParsed?.sublabel && (
                    <span className="text-xs text-surface-500 dark:text-zinc-400 truncate">
                      {selectedParsed.sublabel}
                    </span>
                  )}
                </div>
              </div>
            ) : (
              <span className="text-sm text-surface-400 dark:text-zinc-500">
                {placeholder}
              </span>
            )}
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-surface-400 dark:text-zinc-500 transition-transform duration-200',
              isOpen && 'rotate-180 text-cyan-600 dark:text-cyan-400'
            )}
            aria-hidden="true"
          />
        </button>

        {/* Dropdown Menu Panel */}
        <AnimatePresence>
          {isOpen && (
            <motion.div
              initial={{ opacity: 0, y: -4, scale: 0.98 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -4, scale: 0.98 }}
              transition={{ duration: 0.14, ease: 'easeOut' }}
              id={`${selectId}-listbox`}
              role="listbox"
              tabIndex={-1}
              ref={listboxRef}
              aria-labelledby={label ? undefined : `${selectId}-trigger`}
              className={cn(
                'absolute top-full left-0 right-0 mt-1.5 z-50 rounded-xl overflow-hidden shadow-2xl border backdrop-blur-xl',
                'bg-white dark:bg-[#0F111A]/95 border-surface-200 dark:border-white/[0.1]'
              )}
            >
              {/* Search filter */}
              {normalizedOptions.length > 2 && (
                <div className="p-2 border-b border-surface-100 dark:border-white/[0.06] bg-surface-50/50 dark:bg-white/[0.02]">
                  <div className="relative flex items-center">
                    <Search className="absolute left-2.5 h-3.5 w-3.5 text-surface-400 dark:text-zinc-500" aria-hidden="true" />
                    <input
                      ref={searchInputRef}
                      type="text"
                      value={searchQuery}
                      onChange={(e) => {
                        setSearchQuery(e.target.value)
                        setHighlightedIndex(0)
                      }}
                      placeholder="Filter by name or email..."
                      className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-surface-200 dark:border-white/[0.08] bg-white dark:bg-[#08090E] text-surface-900 dark:text-zinc-100 placeholder:text-surface-400 dark:placeholder:text-zinc-500 focus:outline-none focus:ring-1 focus:ring-cyan-500/50"
                      onClick={(e) => e.stopPropagation()}
                      onKeyDown={(e) => {
                        if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter') {
                          handleKeyDown(e)
                        } else if (e.key === 'Escape') {
                          setIsOpen(false)
                          triggerRef.current?.focus()
                        }
                      }}
                    />
                    {searchQuery && (
                      <button
                        type="button"
                        onClick={() => setSearchQuery('')}
                        className="absolute right-2 text-surface-400 hover:text-surface-600 dark:hover:text-zinc-300"
                      >
                        <X className="h-3.5 w-3.5" />
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Options List */}
              <div className="max-h-60 overflow-y-auto py-1 divide-y divide-surface-100/60 dark:divide-white/[0.04]">
                {filteredOptions.length === 0 ? (
                  <div className="px-4 py-4 text-xs text-center text-surface-500 dark:text-zinc-400">
                    No matching options found
                  </div>
                ) : (
                  filteredOptions.map((opt, index) => {
                    const isSelected = String(opt.value) === currentValue
                    const isHighlighted = highlightedIndex === index
                    const parsed = parseOptionLabel(opt)
                    const showAvatar = Boolean(opt.avatarName || (opt.value !== '' && parsed.sublabel?.includes('@')))

                    return (
                      <div
                        key={String(opt.value)}
                        role="option"
                        aria-selected={isSelected}
                        aria-disabled={opt.disabled}
                        onClick={() => {
                          if (!opt.disabled) {
                            handleValueChange(String(opt.value))
                          }
                        }}
                        onMouseEnter={() => setHighlightedIndex(index)}
                        className={cn(
                          'flex items-center justify-between px-3.5 py-2.5 text-left cursor-pointer transition-colors',
                          isSelected
                            ? 'bg-cyan-50 dark:bg-cyan-500/10 text-cyan-900 dark:text-cyan-100'
                            : isHighlighted
                            ? 'bg-surface-100 dark:bg-[#171926] text-surface-900 dark:text-zinc-50'
                            : 'text-surface-800 dark:text-zinc-200 hover:bg-surface-50 dark:hover:bg-[#171926]/80',
                          opt.disabled && 'opacity-40 cursor-not-allowed pointer-events-none'
                        )}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 pr-2">
                          {showAvatar && (
                            <div className="h-7 w-7 rounded-full bg-cyan-500/15 border border-cyan-500/25 text-cyan-700 dark:text-cyan-300 text-xs font-semibold flex items-center justify-center shrink-0">
                              {(opt.avatarName || parsed.name || '?').charAt(0).toUpperCase()}
                            </div>
                          )}
                          <div className="flex flex-col min-w-0">
                            <div className="flex items-center gap-2">
                              <span className={cn('text-sm truncate', isSelected ? 'font-semibold text-cyan-700 dark:text-cyan-300' : 'font-medium text-surface-900 dark:text-zinc-100')}>
                                {parsed.name}
                              </span>
                              {opt.badge && (
                                <span className="inline-flex items-center rounded-full px-1.5 py-0.5 text-[10px] font-medium bg-emerald-500/10 text-emerald-600 dark:text-emerald-400 border border-emerald-500/20">
                                  {opt.badge}
                                </span>
                              )}
                            </div>
                            {parsed.sublabel && (
                              <span className={cn('text-xs truncate mt-0.5', isSelected ? 'text-cyan-600/80 dark:text-cyan-300/75' : 'text-surface-500 dark:text-zinc-400')}>
                                {parsed.sublabel}
                              </span>
                            )}
                          </div>
                        </div>

                        {isSelected && (
                          <Check className="h-4 w-4 shrink-0 text-cyan-600 dark:text-cyan-400 ml-2" aria-hidden="true" />
                        )}
                      </div>
                    )
                  })
                )}
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {error && (
          <p className="mt-1.5 text-sm text-danger-500" role="alert">
            {error}
          </p>
        )}
        {helperText && !error && (
          <p className="mt-1.5 text-sm text-surface-500 dark:text-surface-400">
            {helperText}
          </p>
        )}
      </div>
    )
  }
)

Select.displayName = 'Select'

// Subcomponents for compound select pattern
export const SelectTrigger = forwardRef<
  HTMLButtonElement,
  { children: ReactNode; className?: string }
>(({ children, className }, ref) => (
  <button
    ref={ref}
    type="button"
    className={cn(
      'flex items-center justify-between w-full px-4 py-2.5 rounded-xl border transition-all',
      'bg-white dark:bg-surface-800 border-surface-300 dark:border-surface-700',
      'hover:bg-surface-50 dark:hover:bg-surface-700/50 focus:outline-none focus:ring-2 focus:ring-brand-500',
      'text-surface-900 dark:text-surface-50 text-left',
      className
    )}
  >
    {children}
    <ChevronDown className="w-4 h-4 opacity-50 shrink-0 text-surface-400 dark:text-surface-500 ml-2" />
  </button>
))
SelectTrigger.displayName = 'SelectTrigger'

export const SelectValue = forwardRef<
  HTMLDivElement,
  { children?: ReactNode; placeholder?: string; className?: string }
>(({ children, placeholder = 'Select...', className }, ref) => (
  <div ref={ref} className={cn('text-surface-900 dark:text-surface-50 truncate', !children && 'text-surface-400 dark:text-surface-500', className)}>
    {children || placeholder}
  </div>
))
SelectValue.displayName = 'SelectValue'

export const SelectContent = forwardRef<
  HTMLDivElement,
  { children: ReactNode; className?: string }
>(({ children, className }, ref) => (
  <div
    ref={ref}
    className={cn(
      'absolute top-full left-0 right-0 mt-1.5 bg-white dark:bg-surface-800 border border-surface-200 dark:border-surface-700 rounded-xl shadow-xl z-50 max-h-60 overflow-y-auto py-1',
      className
    )}
  >
    {children}
  </div>
))
SelectContent.displayName = 'SelectContent'

export const SelectItem = forwardRef<
  HTMLDivElement,
  { value: string; children: ReactNode; className?: string }
>(({ value, children, className }, ref) => {
  const { value: selectedValue, onValueChange } = useSelectContext()

  return (
    <div
      ref={ref}
      role="option"
      aria-selected={selectedValue === value}
      onClick={() => onValueChange(value)}
      className={cn(
        'px-4 py-2.5 cursor-pointer text-surface-900 dark:text-surface-50 transition-colors',
        'hover:bg-brand-50 dark:hover:bg-brand-900/30',
        'border-b border-surface-100 dark:border-surface-700/50 last:border-b-0',
        selectedValue === value && 'bg-brand-50/90 dark:bg-brand-900/40 text-brand-700 dark:text-brand-300 font-semibold',
        className
      )}
    >
      {children}
    </div>
  )
})
SelectItem.displayName = 'SelectItem'
