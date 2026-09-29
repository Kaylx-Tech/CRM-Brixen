import * as React from "react"
import { useTable } from "@tanstack/react-table"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
import {
  Select,
  SelectContent,
  SelectGroup,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"
import { Skeleton } from "@/components/ui/skeleton"
import { IconAdjustmentsHorizontal, IconSearch, IconX, IconPlus, IconTrash } from "@tabler/icons-react"
import { features } from "./data-table-features"
import { TablePagination } from "@/components/TablePagination"
import { cn } from "cn"

export const DataTable = ({ columns, data, filterConfig, onDeleteSelected, isLoading = false }) => {
  const [sorting, setSorting] = React.useState([])
  const [columnFilters, setColumnFilters] = React.useState([])
  const [globalFilter, setGlobalFilter] = React.useState("")
  const [columnVisibility, setColumnVisibility] = React.useState({})
  const [rowSelection, setRowSelection] = React.useState({})
  const [pagination, setPagination] = React.useState({ pageIndex: 0, pageSize: 10 })

  const table = useTable({
    features,
    data: data || [],
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    onPaginationChange: setPagination,
    globalFilterFn: "includesString",
    state: {
      sorting,
      columnFilters,
      globalFilter,
      columnVisibility,
      rowSelection,
      pagination,
    },
  })

  const [filterResetKey, setFilterResetKey] = React.useState(0)

  const handleClearFilters = () => {
    setGlobalFilter("")
    table.resetColumnFilters()
    setColumnFilters([])
    setFilterResetKey((prev) => prev + 1)
  }

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-4 gap-4">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <div className="relative">
            <IconSearch className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search data..."
              value={globalFilter ?? ""}
              className="max-w-xs pl-8"
              onChange={(event) => setGlobalFilter(event.target.value)}
              disabled={isLoading}
            />
          </div>
          {filterConfig && filterConfig.map((config) => {
            const column = table.getColumn(config.columnKey);
            const currentValue = column?.getFilterValue();

            return (
              <Select 
                key={`${config.columnKey}-${filterResetKey}-${currentValue ?? 'none'}`} 
                value={currentValue ?? null}
                onValueChange={(val) => {
                  column?.setFilterValue(val === "all" ? undefined : val);
                }}
                disabled={isLoading}
              >
                <SelectTrigger className="w-35">
                  <SelectValue placeholder={config.placeholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
                    <SelectItem value="all">All</SelectItem>
                    {config.options.map((opt) => (
                      <SelectItem key={opt.value} value={opt.value}>
                        {opt.label}
                      </SelectItem>
                    ))}
                  </SelectGroup>
                </SelectContent>
              </Select>
            );
          })}
          
          {(globalFilter || columnFilters.length > 0) && (
            <Button 
              variant="destructive" 
              size="sm"
              onClick={handleClearFilters} 
              className="h-7"
            >
              Clear
              <IconX className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="ml-auto h-7" disabled={isLoading}>
              <IconAdjustmentsHorizontal className="mr-2 h-4 w-4" />
              Columns
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {table
              .getAllColumns()
              .filter((column) => column.getCanHide())
              .map((column) => {
                return (
                  <DropdownMenuCheckboxItem
                    key={column.id}
                    className="capitalize"
                    checked={column.getIsVisible()}
                    onCheckedChange={(value) =>
                      column.toggleVisibility(!!value)
                    }
                  >
                    {column.id}
                  </DropdownMenuCheckboxItem>
                )
              })}
          </DropdownMenuContent>
        </DropdownMenu>
      </div>
      <div className="overflow-hidden rounded-md border bg-card">
        <Table>
          <TableHeader>
            {table.getHeaderGroups().map((headerGroup) => (
              <TableRow key={headerGroup.id} className="relative">
                {headerGroup.headers.map((header) => {
                  const isSelect = header.id === "select";
                  const hasSelection = table.getFilteredSelectedRowModel().rows.length > 0;
                  
                  return (
                    <TableHead key={header.id}>
                      {header.isPlaceholder ? null : (
                        <div 
                          className={cn(
                            "transition-all duration-300 ease-in-out",
                            hasSelection && !isSelect ? "opacity-0 translate-y-2 pointer-events-none" : "opacity-100 translate-y-0"
                          )}
                        >
                          <table.FlexRender header={header} />
                        </div>
                      )}
                    </TableHead>
                  )
                })}
                
                {/* Selected Count Overlay */}
                {table.getFilteredSelectedRowModel().rows.length > 0 && (
                  <div className="absolute inset-y-0 left-10 flex items-center z-10 animate-in fade-in slide-in-from-left-8 duration-400">
                    <span className="text-sm font-medium text-muted-foreground">
                      {table.getFilteredSelectedRowModel().rows.length} {table.getFilteredSelectedRowModel().rows.length === 1 ? 'Row' : 'Rows'} Selected
                    </span>
                  </div>
                )}
                
                {/* Delete Button Overlay */}
                {table.getFilteredSelectedRowModel().rows.length > 0 && (
                  <div className="absolute inset-y-0 right-4 flex items-center justify-end z-10 animate-in fade-in slide-in-from-right-4 duration-400">
                    <Button 
                      variant="destructive" 
                      size="sm" 
                      onClick={() => onDeleteSelected?.(table.getFilteredSelectedRowModel().rows)}
                    >
                      <IconTrash className="mr-1 h-4.5 w-4.5" />
                      Delete ({table.getFilteredSelectedRowModel().rows.length})
                    </Button>
                  </div>
                )}
              </TableRow>
            ))}
          </TableHeader>
          <TableBody>
            {isLoading ? (
              Array.from({ length: 6 }).map((_, rIdx) => (
                <TableRow key={rIdx} className="hover:bg-transparent">
                  {columns.map((col, cIdx) => (
                    <TableCell key={cIdx} className="py-4">
                      <Skeleton 
                        className={cn(
                          "h-4",
                          cIdx === 0 ? "size-4 rounded-sm" :
                          cIdx === 1 ? "w-28" :
                          cIdx === 2 ? "w-40" :
                          cIdx === 3 ? "w-20 rounded-full h-5" :
                          cIdx === columns.length - 1 ? "size-8 rounded-md" :
                          "w-20"
                        )} 
                      />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : table.getRowModel().rows?.length ? (
              table.getRowModel().rows.map((row) => (
                <TableRow
                  key={row.id}
                  data-state={row.getIsSelected() && "selected"}
                >
                  {row.getVisibleCells().map((cell) => (
                    <TableCell key={cell.id}>
                      <table.FlexRender cell={cell} />
                    </TableCell>
                  ))}
                </TableRow>
              ))
            ) : (
              <TableRow>
                <TableCell colSpan={columns.length} className="h-32 text-center text-muted-foreground">
                  No records found.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      {isLoading ? (
        <div className="py-4">
          <Skeleton className="h-4 w-40" />
        </div>
      ) : (
        <TablePagination
          currentPage={pagination.pageIndex + 1}
          totalPages={Math.max(1, table.getPageCount())}
          onPageChange={(page) => table.setPageIndex(page - 1)}
          rowsPerPage={pagination.pageSize}
          onRowsPerPageChange={(size) => table.setPageSize(size)}
          totalRows={table.getFilteredRowModel().rows.length}
          selectedRows={table.getFilteredSelectedRowModel().rows.length}
          showSelectionMsg={table.getFilteredSelectedRowModel().rows.length > 0}
        />
      )}
    </div>
  )
}
export default DataTable;