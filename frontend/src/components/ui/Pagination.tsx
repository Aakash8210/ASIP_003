import { forwardRef } from 'react'
import { cn } from '@/lib/utils'
import { ChevronLeft, ChevronRight } from 'lucide-react'

interface PaginationProps extends React.HTMLAttributes<HTMLDivElement> {
  currentPage: number
  totalPages: number
  onPageChange: (page: number) => void
  showPageNumbers?: boolean
}

export const Pagination = forwardRef<HTMLDivElement, PaginationProps>(
  ({ currentPage, totalPages, onPageChange, showPageNumbers = true, className, ...props }, ref) => {
    const maxVisiblePages = 5
    const startPage = Math.max(1, currentPage - Math.floor(maxVisiblePages / 2))
    const endPage = Math.min(totalPages, startPage + maxVisiblePages - 1)
    const visiblePages = Array.from({ length: endPage - startPage + 1 }, (_, i) => startPage + i)

    return (
      <div ref={ref} className={cn('flex items-center justify-center gap-1.5', className)} {...props}>
        <button
          onClick={() => onPageChange(Math.max(1, currentPage - 1))}
          disabled={currentPage === 1}
          className="p-1.5 text-surface-500 hover:text-surface-900 hover:bg-surface-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed rounded-md transition-colors"
          aria-label="Previous page"
        >
          <ChevronLeft className="w-4 h-4" />
        </button>

        {showPageNumbers && (
          <>
            {startPage > 1 && (
              <>
                <button
                  onClick={() => onPageChange(1)}
                  className="px-2.5 py-1 text-xs font-medium rounded-md text-surface-600 hover:text-surface-900 hover:bg-surface-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.05] transition-colors"
                >
                  1
                </button>
                {startPage > 2 && <span className="px-1 text-xs text-surface-400 dark:text-zinc-600">...</span>}
              </>
            )}

            {visiblePages.map((page) => (
              <button
                key={page}
                onClick={() => onPageChange(page)}
                className={cn(
                  'px-2.5 py-1 text-xs font-medium rounded-md transition-colors tabular-nums',
                  currentPage === page
                    ? 'bg-brand-500 text-white shadow-xs'
                    : 'text-surface-600 hover:text-surface-900 hover:bg-surface-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.05]'
                )}
              >
                {page}
              </button>
            ))}

            {endPage < totalPages && (
              <>
                {endPage < totalPages - 1 && <span className="px-1 text-xs text-surface-400 dark:text-zinc-600">...</span>}
                <button
                  onClick={() => onPageChange(totalPages)}
                  className="px-2.5 py-1 text-xs font-medium rounded-md text-surface-600 hover:text-surface-900 hover:bg-surface-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.05] transition-colors"
                >
                  {totalPages}
                </button>
              </>
            )}
          </>
        )}

        <button
          onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
          disabled={currentPage === totalPages}
          className="p-1.5 text-surface-500 hover:text-surface-900 hover:bg-surface-100 dark:text-zinc-400 dark:hover:text-zinc-100 dark:hover:bg-white/[0.05] disabled:opacity-30 disabled:cursor-not-allowed rounded-md transition-colors"
          aria-label="Next page"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
      </div>
    )
  }
)

Pagination.displayName = 'Pagination'
