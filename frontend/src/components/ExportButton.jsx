import React from 'react';
import { Button } from '@/components/ui/button';
import { IconDownload } from '@tabler/icons-react';
import { exportToExcel, exportToCSV, exportToPDF } from '@/utils/exportUtils';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';

const ExportButton = ({ data, columns, fileName }) => {
    return (
        <DropdownMenu>
            <DropdownMenuTrigger asChild>
                <Button variant="outline" size="sm" className="ml-auto flex">
                    <IconDownload className="mr-2 h-4 w-4" />
                    Export
                </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => exportToCSV(data, columns, fileName)}>
                    Export CSV
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportToExcel(data, columns, fileName)}>
                    Export Excel
                </DropdownMenuItem>
                <DropdownMenuItem onClick={() => exportToPDF(data, columns, fileName)}>
                    Export PDF
                </DropdownMenuItem>
            </DropdownMenuContent>
        </DropdownMenu>
    );
};

export default ExportButton;
