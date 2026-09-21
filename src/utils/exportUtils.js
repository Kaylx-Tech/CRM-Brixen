import * as XLSX from 'xlsx';
import { jsPDF } from 'jspdf';
import autoTable from 'jspdf-autotable';

/**
 * Export data to Excel (.xlsx)
 * @param {Array} data - Array of objects to export
 * @param {String} fileName - Name of the file
 */
export const exportToExcel = (data, fileName = 'Export') => {
    try {
        const worksheet = XLSX.utils.json_to_sheet(data);
        const workbook = XLSX.utils.book_new();
        XLSX.utils.book_append_sheet(workbook, worksheet, 'Data');
        
        // Generate buffer
        const excelBuffer = XLSX.write(workbook, { bookType: 'xlsx', type: 'array' });
        const blob = new Blob([excelBuffer], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
        
        // Download
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${fileName}.xlsx`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        return { fileName: `${fileName}.xlsx` };
    } catch (error) {
        console.error("Excel Export Error:", error);
        throw error;
    }
};

/**
 * Export data to CSV
 * @param {Array} data - Array of objects to export
 * @param {String} fileName - Name of the file
 */
export const exportToCSV = (data, fileName = 'Export') => {
    try {
        const worksheet = XLSX.utils.json_to_sheet(data);
        const csvOutput = XLSX.utils.sheet_to_csv(worksheet);
        const blob = new Blob([csvOutput], { type: 'text/csv;charset=utf-8;' });
        
        const link = document.createElement('a');
        if (link.download !== undefined) {
            const url = URL.createObjectURL(blob);
            link.href = url;
            link.download = `${fileName}.csv`;
            link.style.visibility = 'hidden';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);
            return { fileName: `${fileName}.csv` };
        } else {
            throw new Error("Download not supported by this browser");
        }
    } catch (error) {
        console.error("CSV Export Error:", error);
        throw error;
    }
};

/**
 * Export data to PDF
 * @param {Array} data - Array of objects to export
 * @param {Array} columns - Column definitions for the table
 * @param {String} title - Title of the PDF document
 * @param {String} fileName - Name of the file
 */
export const exportToPDF = (data, columns, title = 'Report', fileName = 'Report') => {
    try {
        const doc = new jsPDF();
        
        // Add title
        doc.setFontSize(18);
        doc.text(title, 14, 22);
        doc.setFontSize(11);
        doc.setTextColor(100);
        doc.text(`Generated on: ${new Date().toLocaleString()}`, 14, 30);

        // Filter headers and keys
        const headers = columns.map(col => col.header);
        const keys = columns.map(col => col.key);

        const body = data.map(item => {
            return keys.map(key => item[key] !== undefined && item[key] !== null ? String(item[key]) : 'N/A');
        });

        autoTable(doc, {
            startY: 35,
            head: [headers],
            body: body,
            theme: 'striped',
            headStyles: { fillColor: [79, 70, 229] }, // indigo-600
            styles: { fontSize: 9 },
            didDrawPage: (data) => {
                // Add page number footer if needed
            }
        });

        doc.save(`${fileName}.pdf`);
        return { fileName: `${fileName}.pdf` };
    } catch (error) {
        console.error("PDF Export Error:", error);
        throw error;
    }
};
