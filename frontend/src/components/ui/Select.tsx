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

export interface SelectOption {
  value: string | number
  label: string
  sublabel?: string
  description?: string
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
            'flex items-center justify-between w-full min-h-[44px] px-3.5 py-2 rounded-xl text-left transition-all duration-200',
            'bg-white dark:bg-surface-800 border shadow-xs',
            'border-surface-300 dark:border-surface-700',
            'text-surface-900 dark:text-surface-50',
            'hover:border-surface-400 dark:hover:border-surface-600',
            'focus:outline-none focus:ring-2 focus:ring-brand-500/20 focus:border-brand-500 dark:focus:border-brand-400',
            error && 'border-danger-500 dark:border-danger-500 focus:ring-danger-500/20 focus:border-danger-500',
            disabled && 'opacity-50 cursor-not-allowed bg-surface-100 dark:bg-surface-900',
            isOpen && 'ring-2 ring-brand-500/20 border-brand-500 dark:border-brand-400'
          )}
        >
          <div className="flex-1 min-w-0 pr-2">
            {selectedOption && selectedOption.value !== '' ? (
              <div className="flex flex-col text-left truncate">
                <span className="font-medium text-sm text-surface-900 dark:text-surface-50 truncate">
                  {selectedParsed?.name}
                </span>
                {selectedParsed?.sublabel && (
                  <span className="text-xs text-surface-500 dark:text-surface-400 truncate">
                    {selectedParsed.sublabel}
                  </span>
                )}
              </div>
            ) : (
              <span className="text-sm text-surface-400 dark:text-surface-500">
                {placeholder}
              </span>
            )}
          </div>
          <ChevronDown
            className={cn(
              'h-4 w-4 shrink-0 text-surface-400 dark:text-surface-500 transition-transform duration-200',
              isOpen && 'rotate-180 text-brand-600 dark:text-brand-400'
            )}
            aria-hidden="true"
          />
        </button>

        {/* Dropdown Menu Panel */}
        {isOpen && (
          <div
            id={`${selectId}-listbox`}
            role="listbox"
            tabIndex={-1}
            ref={listboxRef}
            aria-labelledby={label ? undefined : `${selectId}-trigger`}
            className={cn(
              'absolute top-full left-0 right-0 mt-1.5 z-50 rounded-xl overflow-hidden shadow-xl border animate-in fade-in-0 zoom-in-95',
              'bg-white dark:bg-surface-800 border-surface-200 dark:border-surface-700'
            )}
          >
            {/* Search filter if there are more than 5 options */}
            {normalizedOptions.length > 5 && (
              <div className="p-2 border-b border-surface-100 dark:border-surface-700/80 bg-surface-50/50 dark:bg-surface-850">
                <div className="relative flex items-center">
                  <Search className="absolute left-2.5 h-3.5 w-3.5 text-surface-400 dark:text-surface-500" aria-hidden="true" />
                  <input
                    ref={searchInputRef}
                    type="text"
                    value={searchQuery}
                    onChange={(e) => {
                      setSearchQuery(e.target.value)
                      setHighlightedIndex(0)
                    }}
                    placeholder="Search options..."
                    className="w-full pl-8 pr-7 py-1.5 text-xs rounded-lg border border-surface-200 dark:border-surface-700 bg-white dark:bg-surface-800 text-surface-900 dark:text-surface-50 placeholder:text-surface-400 focus:outline-none focus:ring-1 focus:ring-brand-500"
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
                      className="absolute right-2 text-surface-400 hover:text-surface-600 dark:hover:text-surface-300"
                    >
                      <X className="h-3.5 w-3.5" />
                    </button>
                  )}
                </div>
              </div>
            )}

            {/* Options List */}
            <div className="max-h-60 overflow-y-auto py-1 divide-y divide-surface-100/60 dark:divide-surface-700/40">
              {filteredOptions.length === 0 ? (
                <div className="px-4 py-3 text-xs text-center text-surface-500 dark:text-surface-400">
                  No matching options found
                </div>
              ) : (
                filteredOptions.map((opt, index) => {
                  const isSelected = String(opt.value) === currentValue
                  const isHighlighted = highlightedIndex === index
                  const parsed = parseOptionLabel(opt)

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
                          ? 'bg-brand-50/90 dark:bg-brand-950/40 text-brand-900 dark:text-brand-100 font-medium'
                          : isHighlighted
                          ? 'bg-surface-100 dark:bg-surface-700/60 text-surface-900 dark:text-surface-50'
                          : 'text-surface-800 dark:text-surface-200 hover:bg-surface-50 dark:hover:bg-surface-700/40',
                        opt.disabled && 'opacity-40 cursor-not-allowed pointer-events-none'
                      )}
                    >
                      <div className="flex flex-col min-w-0 pr-2">
                        <span className={cn('text-sm truncate', isSelected ? 'font-semibold text-brand-700 dark:text-brand-300' : 'font-medium text-surface-900 dark:text-surface-50')}>
                          {parsed.name}
                        </span>
                        {parsed.sublabel && (
                          <span className={cn('text-xs truncate mt-0.5', isSelected ? 'text-brand-600/80 dark:text-brand-300/80' : 'text-surface-500 dark:text-surface-400')}>
                            {parsed.sublabel}
                          </span>
                        )}
                      </div>

                      {isSelected && (
                        <Check className="h-4 w-4 shrink-0 text-brand-600 dark:text-brand-400 ml-2" aria-hidden="true" />
                      )}
                    </div>
                  )
                })
              )}
            </div>
          </div>
        )}

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
