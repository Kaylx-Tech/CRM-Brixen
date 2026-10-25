import React from 'react';
import { Button } from '@/components/ui/button';

export const TablePagination = ({
    currentPage,
    totalPages,
    onPageChange,
    rowsPerPage,
    onRowsPerPageChange,
    totalRows,
    selectedRows,
    showSelectionMsg
}) => {
    return (
        <div className="flex items-center justify-between px-2 py-4">
            <div className="flex-1 text-sm text-muted-foreground">
                {showSelectionMsg ? `${selectedRows} of ${totalRows} row(s) selected.` : `Total ${totalRows} rows`}
            </div>
            <div className="flex items-center space-x-6 lg:space-x-8">
                <div className="flex items-center space-x-2">
                    <p className="text-sm font-medium">Rows per page</p>
                    <select
                        className="h-7 w-[70px] rounded-md border border-input bg-transparent px-2 py-1 text-sm ring-offset-background"
                        value={rowsPerPage}
                        onChange={(e) => onRowsPerPageChange(Number(e.target.value))}
                    >
                        {[10, 20, 30, 40, 50].map(pageSize => (
                            <option key={pageSize} value={pageSize}>
                                {pageSize}
                            </option>
                        ))}
                    </select>
                </div>
                <div className="flex w-[100px] items-center justify-center text-sm font-medium">
                    Page {currentPage} of {totalPages}
                </div>
                <div className="flex items-center space-x-2">
                    <Button
                        variant="outline"
                        className="h-7 w-7 p-0"
                        onClick={() => onPageChange(currentPage - 1)}
                        disabled={currentPage <= 1}
                    >
                        <span className="sr-only">Go to previous page</span>
                        {"<"}
                    </Button>
                    <Button
                        variant="outline"
                        className="h-7 w-7 p-0"
                        onClick={() => onPageChange(currentPage + 1)}
                        disabled={currentPage >= totalPages}
                    >
                        <span className="sr-only">Go to next page</span>
                        {">"}
                    </Button>
                </div>
            </div>
        </div>
    );
};
