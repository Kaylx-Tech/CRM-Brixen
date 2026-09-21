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
import { IconAdjustmentsHorizontal, IconSearch, IconX, IconPlus, IconTrash } from "@tabler/icons-react"
import { features } from "./data-table-features"
import { cn } from "cn"

export const DataTable = ({ columns, data, filterConfig, onDeleteSelected }) => {
  const [sorting, setSorting] = React.useState([])
  const [columnFilters, setColumnFilters] = React.useState([])
  const [globalFilter, setGlobalFilter] = React.useState("")
  const [columnVisibility, setColumnVisibility] = React.useState({})
  const [rowSelection, setRowSelection] = React.useState({})

  const table = useTable({
    features,
    data,
    columns,
    onSortingChange: setSorting,
    onColumnFiltersChange: setColumnFilters,
    onGlobalFilterChange: setGlobalFilter,
    onColumnVisibilityChange: setColumnVisibility,
    onRowSelectionChange: setRowSelection,
    globalFilterFn: "includesString",
    state: {
      sorting,
      columnFilters,
      globalFilter,
      columnVisibility,
      rowSelection,
    },
  })

  return (
    <div>
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between py-4 gap-4">
        <div className="flex items-center gap-2 flex-wrap flex-1">
          <div className="relative">
            <IconSearch className="absolute left-2.5 top-1.5 h-3.5 w-3.5 text-muted-foreground" />
            <Input
              placeholder="Search Data..."
              value={globalFilter ?? ""}
              className="max-w-xs pl-8"
              onChange={(event) => setGlobalFilter(event.target.value)}
            />
          </div>
          {filterConfig && filterConfig.map((config) => {
            const column = table.getColumn(config.columnKey);
            const currentValue = column?.getFilterValue();

            return (
              <Select 
                key={config.columnKey} 
                value={currentValue}
                onValueChange={(val) => {
                  column?.setFilterValue(val === "all" ? undefined : val);
                }}
              >
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder={config.placeholder} />
                </SelectTrigger>
                <SelectContent>
                  <SelectGroup>
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
              onClick={() => {
                setGlobalFilter("");
                table.resetColumnFilters();
              }} 
              className="px-2"
            >
              Clear
              <IconX className="ml-1 h-4 w-4" />
            </Button>
          )}
        </div>
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" className="ml-auto">
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
                
                {/* Delete Button Overlay */}
                {table.getFilteredSelectedRowModel().rows.length > 0 && (
                  <div className="absolute inset-y-0 right-4 flex items-center justify-end z-10 animate-in fade-in slide-in-from-right-4 duration-300">
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
            {table.getRowModel().rows?.length ? (
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
                <TableCell colSpan={columns.length} className="h-24 text-center">
                  No results.
                </TableCell>
              </TableRow>
            )}
          </TableBody>
        </Table>
      </div>
      <div className="flex items-center justify-between space-x-2 py-4">
        <div className="flex-1 text-sm text-muted-foreground">
          {table.getFilteredSelectedRowModel().rows.length} of{" "}
          {table.getFilteredRowModel().rows.length} row(s) selected.
        </div>
        <div className="flex space-x-2">
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
          >
            Previous
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
          >
            Next
          </Button>
        </div>
      </div>
    </div>
  )
}
export default DataTable;