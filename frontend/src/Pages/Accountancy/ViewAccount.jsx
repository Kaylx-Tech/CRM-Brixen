import React, { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter,
} from "@/components/ui/dialog"
import { ScrollArea } from "@/components/ui/scroll-area"
import {
    Tabs,
    TabsContent,
    TabsList,
    TabsTrigger,
} from "@/components/ui/tabs"
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select"
import { Separator } from "@/components/ui/separator"
import { toast } from "sonner"
import {
    IconBook,
    IconBuildingSkyscraper,
    IconPlus,
    IconTrash,
    IconFileCheck,
    IconScale,
    IconReceiptTax,
    IconCoins
} from "@tabler/icons-react"

const defaultEntries = [
    { id: 1, date: "15/01/2025", desc: "Client Corporate Retainer", category: "Sales", direction: "in", amount: "£4,500.00", raw_amount: 4500 },
    { id: 2, date: "22/01/2025", desc: "Director Salary / Payroll", category: "Staff costs", direction: "out", amount: "£2,100.00", raw_amount: -2100 },
    { id: 3, date: "02/02/2025", desc: "Software & Cloud Services", category: "Operating charges", direction: "out", amount: "£320.00", raw_amount: -320 },
    { id: 4, date: "18/02/2025", desc: "Consulting Invoiced Receipt", category: "Sales", direction: "in", amount: "£6,800.00", raw_amount: 6800 },
]

const ViewAccount = ({ isOpen, onClose, company, onProceedToFile }) => {
    const [activeTab, setActiveTab] = useState("balance-sheet")
    const [entries, setEntries] = useState(defaultEntries)
    const [summary, setSummary] = useState({
        turnover: "£11,300.00",
        net_profit: "£8,880.00",
        cash_at_bank: "£8,880.00",
        total_income: 11300,
        total_expense: 2420,
        net: 8880
    })
    const [isLoadingBooks, setIsLoadingBooks] = useState(false)
    const [newDesc, setNewDesc] = useState("")
    const [newAmount, setNewAmount] = useState("")
    const [newCategory, setNewCategory] = useState("Sales")
    const [newDirection, setNewDirection] = useState("in")
    const [newDate, setNewDate] = useState(new Date().toLocaleDateString('en-GB'))

    const fetchBooks = async () => {
        if (!company?.id) return
        setIsLoadingBooks(true)
        try {
            const apiUrl = import.meta.env.VITE_API_URL || '/api'
            const token = localStorage.getItem('token')
            const res = await fetch(`${apiUrl}/admin/accountancy/${company.id}/books`, {
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                }
            })
            if (res.ok) {
                const data = await res.json()
                if ((data.success || data.status === 'success') && data.data) {
                    if (Array.isArray(data.data.entries)) {
                        setEntries(data.data.entries)
                    }
                    if (data.data.summary) {
                        setSummary(data.data.summary)
                    }
                }
            }
        } catch (err) {
            console.error("Failed to load books:", err)
        } finally {
            setIsLoadingBooks(false)
        }
    }

    useEffect(() => {
        if (isOpen && company?.id) {
            fetchBooks()
        }
    }, [isOpen, company?.id])

    if (!company) return null

    const handleAddEntry = async (e) => {
        e.preventDefault()
        if (!newDesc.trim() || !newAmount) {
            toast.error("Please enter a description and amount")
            return
        }

        const val = parseFloat(newAmount.replace(/[^0-9.-]+/g, "")) || 0
        const formatted = `£${val.toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`

        try {
            const apiUrl = import.meta.env.VITE_API_URL || '/api'
            const token = localStorage.getItem('token')
            const res = await fetch(`${apiUrl}/admin/accountancy/${company.id}/books`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                body: JSON.stringify({
                    description: newDesc.trim(),
                    amount: val,
                    category: newCategory,
                    direction: newDirection,
                    entry_date: newDate
                })
            })

            if (res.ok) {
                toast.success("Cash book line entry recorded.")
                fetchBooks()
            } else {
                // Local state fallback
                const newRow = {
                    id: Date.now(),
                    date: newDate,
                    desc: newDesc.trim(),
                    category: newCategory,
                    direction: newDirection,
                    amount: formatted,
                    raw_amount: newDirection === 'in' ? val : -val
                }
                setEntries([newRow, ...entries])
                toast.success("Cash book line entry added.")
            }
        } catch (err) {
            const newRow = {
                id: Date.now(),
                date: newDate,
                desc: newDesc.trim(),
                category: newCategory,
                direction: newDirection,
                amount: formatted,
                raw_amount: newDirection === 'in' ? val : -val
            }
            setEntries([newRow, ...entries])
            toast.success("Cash book line entry added.")
        } finally {
            setNewDesc("")
            setNewAmount("")
        }
    }

    const handleDeleteEntry = async (id) => {
        try {
            const apiUrl = import.meta.env.VITE_API_URL || '/api'
            const token = localStorage.getItem('token')
            await fetch(`${apiUrl}/admin/accountancy/${company.id}/books/${id}`, {
                method: 'DELETE',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                }
            })
            setEntries(entries.filter(e => e.id !== id))
            toast.success("Entry removed from cash book.")
            fetchBooks()
        } catch (err) {
            setEntries(entries.filter(e => e.id !== id))
            toast.success("Entry removed from cash book.")
        }
    }

    // Dynamic turnover and net calculations
    const turnoverDisplay = summary?.turnover || "£45,200.00"
    const netProfitDisplay = summary?.net_profit || "£18,340.00"
    const cashAtBankDisplay = summary?.cash_at_bank || "£14,250.00"

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
            <DialogContent className="sm:max-w-[760px] p-0 overflow-hidden flex flex-col max-h-[90vh]">
                {/* Modal Header */}
                <div className="p-6 border-b bg-muted/20">
                    <DialogHeader className="flex flex-row items-center justify-between text-left space-y-0">
                        <div className="flex items-center gap-3">
                            <div className="p-2.5 bg-primary/10 rounded-xl text-primary">
                                <IconBook className="h-6 w-6" />
                            </div>
                            <div>
                                <DialogTitle className="text-xl font-bold">{company.company_name}</DialogTitle>
                                <DialogDescription className="text-xs mt-0.5">
                                    Company No: <span className="font-medium text-foreground">{company.company_number || 'OC385142'}</span> • Director: <span className="text-foreground">{company.owner_name || company.director || 'Brixen Client'}</span>
                                </DialogDescription>
                            </div>
                        </div>
                        <Badge className={company.status === 'Overdue' ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300'}>
                            {company.status}
                        </Badge>
                    </DialogHeader>
                </div>

                {/* Modal Tabs */}
                <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex-1 flex flex-col overflow-hidden">
                    <div className="px-6 pt-3 border-b bg-background">
                        <TabsList className="w-full justify-start h-auto p-1 bg-muted/60 rounded-lg">
                            <TabsTrigger value="balance-sheet" className="text-xs">
                                Balance Sheet &amp; Overview
                            </TabsTrigger>
                            <TabsTrigger value="cash-book" className="text-xs">
                                Cash Book Ledger ({entries.length})
                            </TabsTrigger>
                            <TabsTrigger value="hmrc" className="text-xs">
                                HMRC CT600
                            </TabsTrigger>
                        </TabsList>
                    </div>

                    <ScrollArea className="flex-1 p-6">
                        {/* ════════════════════════════════════════════════════
                            TAB 1: BALANCE SHEET & OVERVIEW
                        ════════════════════════════════════════════════════ */}
                        <TabsContent value="balance-sheet" className="space-y-5 m-0">
                            {/* Metric Summary Banner */}
                            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                                <div className="p-3.5 border rounded-xl bg-card text-center">
                                    <p className="text-[10px] uppercase font-semibold text-muted-foreground">Turnover</p>
                                    <p className="text-lg font-bold text-foreground mt-1">{turnoverDisplay}</p>
                                </div>
                                <div className="p-3.5 border rounded-xl bg-card text-center">
                                    <p className="text-[10px] uppercase font-semibold text-muted-foreground">Net Profit</p>
                                    <p className="text-lg font-bold text-emerald-600 mt-1">{netProfitDisplay}</p>
                                </div>
                                <div className="p-3.5 border rounded-xl bg-card text-center">
                                    <p className="text-[10px] uppercase font-semibold text-muted-foreground">Cash at Bank</p>
                                    <p className="text-lg font-bold text-foreground mt-1">{cashAtBankDisplay}</p>
                                </div>
                                <div className="p-3.5 border rounded-xl bg-card text-center">
                                    <p className="text-[10px] uppercase font-semibold text-muted-foreground">Accounts Due</p>
                                    <p className="text-sm font-bold text-rose-600 mt-2">{company.due_date || '28/02/2026'}</p>
                                </div>
                            </div>

                            {/* Statutory Balance Sheet Ledger */}
                            <div className="border rounded-xl p-4 bg-muted/20 space-y-3">
                                <div className="flex items-center justify-between border-b pb-2">
                                    <span className="font-bold text-xs uppercase tracking-wider text-muted-foreground">
                                        Micro-Entity Balance Sheet Items
                                    </span>
                                    <span className="text-xs font-medium text-muted-foreground">As at {company.year_end || '31/05/2025'}</span>
                                </div>

                                <div className="flex justify-between items-center text-sm py-1">
                                    <span className="text-muted-foreground">Called up share capital:</span>
                                    <span className="font-semibold">£100.00</span>
                                </div>
                                <div className="flex justify-between items-center text-sm py-1">
                                    <span className="text-muted-foreground">Total fixed assets:</span>
                                    <span className="font-semibold">£0.00</span>
                                </div>
                                <div className="flex justify-between items-center text-sm py-1">
                                    <span className="text-muted-foreground">Current assets (Bank &amp; debtors):</span>
                                    <span className="font-semibold text-foreground">{cashAtBankDisplay}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm py-1">
                                    <span className="text-muted-foreground">Creditors: amounts due within 1 year:</span>
                                    <span className="font-semibold text-rose-600">(£2,850.00)</span>
                                </div>
                                <Separator />
                                <div className="flex justify-between items-center text-sm font-bold pt-1">
                                    <span>Net Current Assets (Working Capital):</span>
                                    <span className="text-emerald-600">{netProfitDisplay}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm font-bold">
                                    <span>Total Net Assets:</span>
                                    <span className="text-emerald-600">{netProfitDisplay}</span>
                                </div>
                            </div>
                        </TabsContent>

                        {/* ════════════════════════════════════════════════════
                            TAB 2: CASH BOOK LEDGER
                        ════════════════════════════════════════════════════ */}
                        <TabsContent value="cash-book" className="space-y-5 m-0">
                            {/* Add Entry Form */}
                            <form onSubmit={handleAddEntry} className="p-4 border rounded-xl bg-card space-y-3">
                                <Label className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                                    Record New Cash Book Entry
                                </Label>
                                <div className="grid grid-cols-1 sm:grid-cols-4 gap-2.5">
                                    <Input
                                        placeholder="Description / Ref"
                                        value={newDesc}
                                        onChange={(e) => setNewDesc(e.target.value)}
                                        className="sm:col-span-2 text-xs"
                                    />
                                    <Select value={newCategory} onValueChange={setNewCategory}>
                                        <SelectTrigger className="text-xs">
                                            <SelectValue placeholder="Category" />
                                        </SelectTrigger>
                                        <SelectContent>
                                            <SelectItem value="Sales">Sales Revenue</SelectItem>
                                            <SelectItem value="Staff costs">Staff costs / Payroll</SelectItem>
                                            <SelectItem value="Operating charges">Operating Charges</SelectItem>
                                            <SelectItem value="Cost of sales">Cost of sales</SelectItem>
                                            <SelectItem value="VAT">VAT</SelectItem>
                                            <SelectItem value="Tax">Corporation Tax</SelectItem>
                                        </SelectContent>
                                    </Select>

                                    <Input
                                        placeholder="Amount (£)"
                                        value={newAmount}
                                        onChange={(e) => setNewAmount(e.target.value)}
                                        className="text-xs"
                                    />
                                </div>
                                <div className="flex justify-between items-center pt-1">
                                    <div className="flex items-center gap-2">
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={newDirection === 'in' ? 'default' : 'outline'}
                                            className="h-7 text-xs px-3"
                                            onClick={() => setNewDirection('in')}
                                        >
                                            Money In (+)
                                        </Button>
                                        <Button
                                            type="button"
                                            size="sm"
                                            variant={newDirection === 'out' ? 'destructive' : 'outline'}
                                            className="h-7 text-xs px-3"
                                            onClick={() => setNewDirection('out')}
                                        >
                                            Money Out (−)
                                        </Button>
                                    </div>
                                    <Button type="submit" size="sm" className="h-7 text-xs gap-1.5">
                                        <IconPlus className="h-3.5 w-3.5" /> Add Line
                                    </Button>
                                </div>
                            </form>

                            {/* Transactions Table */}
                            <div className="border rounded-xl overflow-hidden">
                                <Table>
                                    <TableHeader>
                                        <TableRow>
                                            <TableHead className="text-xs">Date</TableHead>
                                            <TableHead className="text-xs">Description</TableHead>
                                            <TableHead className="text-xs">Category</TableHead>
                                            <TableHead className="text-xs text-right">Amount</TableHead>
                                            <TableHead className="text-xs text-right w-10"></TableHead>
                                        </TableRow>
                                    </TableHeader>
                                    <TableBody>
                                        {entries.map((entry) => (
                                            <TableRow key={entry.id}>
                                                <TableCell className="text-xs">{entry.date}</TableCell>
                                                <TableCell className="text-xs font-medium">{entry.desc}</TableCell>
                                                <TableCell>
                                                    <Badge variant="outline" className="text-[10px]">
                                                        {entry.category}
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className={`text-xs font-bold text-right ${entry.direction === 'in' ? 'text-emerald-600' : 'text-rose-600'}`}>
                                                    {entry.direction === 'in' ? `+${entry.amount}` : `−${entry.amount}`}
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant="ghost"
                                                        size="icon"
                                                        className="h-6 w-6 text-muted-foreground hover:text-destructive"
                                                        onClick={() => handleDeleteEntry(entry.id)}
                                                    >
                                                        <IconTrash className="h-3.5 w-3.5" />
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        ))}
                                    </TableBody>
                                </Table>
                            </div>
                        </TabsContent>

                        {/* ════════════════════════════════════════════════════
                            TAB 3: HMRC CT600
                        ════════════════════════════════════════════════════ */}
                        <TabsContent value="hmrc" className="space-y-4 m-0">
                            <div className="border rounded-xl p-4 bg-muted/20 space-y-3">
                                <div className="flex justify-between items-center text-sm py-1">
                                    <span className="text-muted-foreground">HMRC UTR Number:</span>
                                    <span className="font-bold">98765 43210</span>
                                </div>
                                <div className="flex justify-between items-center text-sm py-1">
                                    <span className="text-muted-foreground">Accounting Period:</span>
                                    <span className="font-semibold">01/06/2024 - 31/05/2025</span>
                                </div>
                                <div className="flex justify-between items-center text-sm py-1">
                                    <span className="text-muted-foreground">Taxable Profit:</span>
                                    <span className="font-bold">{netProfitDisplay}</span>
                                </div>
                                <div className="flex justify-between items-center text-sm py-1">
                                    <span className="text-muted-foreground">Estimated Corporation Tax (19%):</span>
                                    <span className="font-bold text-foreground">
                                        £{(Math.max(0, (summary?.net || 18340)) * 0.19).toLocaleString('en-GB', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                                    </span>
                                </div>
                                <Separator />
                                <div className="flex justify-between items-center text-sm font-bold">
                                    <span>CT600 Return Status:</span>
                                    <Badge className="bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300">
                                        {company.status === 'Filed' ? 'Return Filed' : 'Payment Due'}
                                    </Badge>
                                </div>
                            </div>
                        </TabsContent>
                    </ScrollArea>
                </Tabs>

                {/* Modal Footer */}
                <div className="p-4 border-t bg-muted/20 flex justify-between items-center">
                    <Button variant="outline" size="sm" onClick={onClose}>
                        Close
                    </Button>
                    <Button
                        size="sm"
                        className="gap-2"
                        onClick={() => {
                            onClose()
                            if (onProceedToFile) onProceedToFile(company)
                        }}
                    >
                        <IconFileCheck className="h-4 w-4" />
                        Proceed to File Accounts
                    </Button>
                </div>
            </DialogContent>
        </Dialog>
    )
}

export default ViewAccount
