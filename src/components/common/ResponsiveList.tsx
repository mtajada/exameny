import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Card } from '@/components/ui/card'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'

export interface Column<T> {
  key: string
  header: string
  render: (row: T) => ReactNode
  renderCard?: (row: T) => ReactNode
  className?: string
}

interface ResponsiveListProps<T> {
  data: T[]
  columns: Column<T>[]
  rowKey: (row: T) => string
  empty: ReactNode
  variant?: 'auto' | 'cards' | 'table'
  tableWrapperClassName?: string
  cardWrapperClassName?: string
  cardClassName?: string
}

export function ResponsiveList<T>({
  data,
  columns,
  rowKey,
  empty,
  variant = 'auto',
  tableWrapperClassName,
  cardWrapperClassName,
  cardClassName,
}: ResponsiveListProps<T>) {
  if (!data || data.length === 0) {
    if (empty === null) return null
    return <div className="py-6 text-center text-muted-foreground">{empty}</div>
  }

  const showTable = variant === 'table' || variant === 'auto'
  const showCards = variant === 'cards' || variant === 'auto'

  return (
    <div className="space-y-4">
      {showTable && (
        <div
          className={cn(
            'hidden md:block',
            variant === 'table' && 'block',
            tableWrapperClassName,
          )}
        >
          <Table>
            <TableHeader>
              <TableRow>
                {columns.map((column) => (
                  <TableHead key={column.key} className={column.className}>
                    {column.header}
                  </TableHead>
                ))}
              </TableRow>
            </TableHeader>
            <TableBody>
              {data.map((row) => (
                <TableRow key={rowKey(row)}>
                  {columns.map((column) => (
                    <TableCell key={column.key} className={column.className}>
                      {column.render(row)}
                    </TableCell>
                  ))}
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {showCards && (
        <div
          className={cn(
            'space-y-3',
            variant === 'auto' && 'md:hidden',
            cardWrapperClassName,
          )}
        >
          {data.map((row) => (
            <Card key={rowKey(row)} className={cn('p-4', cardClassName)}>
              <div className="space-y-2">
                {columns.map((column) => (
                  <div key={column.key}>{(column.renderCard ?? column.render)(row)}</div>
                ))}
              </div>
            </Card>
          ))}
        </div>
      )}
    </div>
  )
}

export default ResponsiveList
