import React from 'react';
import { Button } from '@/components/ui/button';
import { IconDownload } from '@tabler/icons-react';
import { exportToExcel, exportToCSV, exportToPDF } from '@/utils/exportUtils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { toastProcessing, toastDone, toastFail } from '@/lib/toastActions';

const ExportButton = ({ data, columns, fileName }) => {
    const runExport = (type, fn) => {
        const id = toastProcessing(`Preparing ${type} export…`);
        try {
            fn(data, columns, fileName);
            toastDone(id, `${type} export downloaded`);
        } catch (err) {
            toastFail(id, `${type} export failed`, {
                description: err?.message || 'Please try again.',
            });
        }
    };

    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="ml-auto flex">
                    <IconDownload className="mr-2 h-4 w-4" />
                    Export
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => runExport('CSV', exportToCSV)}>
                    Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => runExport('Excel', exportToExcel)}>
                    Export Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => runExport('PDF', exportToPDF)}>
                    Export PDF
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default ExportButton;
