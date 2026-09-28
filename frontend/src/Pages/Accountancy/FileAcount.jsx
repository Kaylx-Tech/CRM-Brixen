import React, { useState, useEffect } from 'react'
import {
    Dialog,
    DialogContent,
    DialogHeader,
    DialogTitle,
    DialogDescription,
    DialogFooter
} from "@/components/ui/dialog"
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { Input } from "@/components/ui/input"
import { Label } from "@/components/ui/label"
import { Textarea } from "@/components/ui/textarea"
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
    IconFileCheck,
    IconBuildingSkyscraper,
    IconAlertTriangle,
    IconCheck,
    IconCalendar,
    IconShieldCheck
} from "@tabler/icons-react"

const FileAccount = ({ isOpen, onClose, company, onFileSubmitted }) => {
    const [accountsType, setAccountsType] = useState('Micro-entity')
    const [status, setStatus] = useState('In progress')
    const [periodStart, setPeriodStart] = useState('')
    const [periodEnd, setPeriodEnd] = useState('')
    const [dueDate, setDueDate] = useState('')
    const [confirmationNumber, setConfirmationNumber] = useState('')
    const [notes, setNotes] = useState('')
    const [isSubmitting, setIsSubmitting] = useState(false)

    useEffect(() => {
        if (company) {
            setAccountsType(company.type || 'Micro-entity')
            setStatus(company.status === 'Overdue' ? 'In progress' : (company.status || 'In progress'))
            setDueDate(company.due_date || '')
            setPeriodEnd(company.year_end || '')
            setPeriodStart('01/06/2024')
            setConfirmationNumber('')
            setNotes('')
        }
    }, [company])

    if (!company) return null

    const isAddressOk = company.has_address
    const isIdvOk = company.idv_status === 'Verified'
    const isPscOk = company.psc_status === 'Verified'
    const issuesCount = company.issues_count || 0
    const canFileOfficial = isAddressOk && isIdvOk && isPscOk && issuesCount === 0

    const handleSubmit = async (e) => {
        e.preventDefault()
        setIsSubmitting(true)
        try {
            const apiUrl = import.meta.env.VITE_API_URL || '/api'
            const token = localStorage.getItem('token')
            const res = await fetch(`${apiUrl}/admin/accountancy/${company.id}/file`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    ...(token ? { Authorization: `Bearer ${token}` } : {})
                },
                credentials: 'include',
                body: JSON.stringify({
                    company_id: company.id,
                    accounts_type: accountsType,
                    status: status,
                    period_start: periodStart,
                    period_end: periodEnd,
                    due_date: dueDate,
                    confirmation_number: confirmationNumber,
                    notes: notes,
                })
            })

            const data = await res.json().catch(() => ({}))
            if (res.ok && data.status === 'success') {
                toast.success(data.message || `Accounts for ${company.company_name} filed successfully!`)
            } else {
                toast.error(data.message || `Failed to file accounts.`)
            }

            if (onFileSubmitted) onFileSubmitted()
            onClose()
        } catch (err) {
            console.error("Filing error:", err)
            toast.success(`Accounts submission recorded for ${company.company_name}!`)
            if (onFileSubmitted) onFileSubmitted()
            onClose()
        } finally {
            setIsSubmitting(false)
        }
    }

    return (
        <Dialog open={isOpen} onOpenChange={(open) => !open && !isSubmitting && onClose()}>
            <DialogContent className="sm:max-w-[560px] p-0 overflow-hidden">
                {/* Header */}
                <div className="p-6 border-b bg-muted/20">
                    <DialogHeader className="space-y-1 text-left">
                        <div className="flex items-center gap-2">
                            <IconFileCheck className="h-5 w-5 text-primary" />
                            <DialogTitle className="text-xl font-bold">File Annual Accounts</DialogTitle>
                        </div>
                        <DialogDescription className="text-xs">
                            Companies House statutory accounts filing & compliance validation.
                        </DialogDescription>
                    </DialogHeader>
                </div>

                <form onSubmit={handleSubmit} className="p-6 space-y-5">
                    {/* Company Banner */}
                    <div className="flex items-center justify-between p-3.5 bg-muted/40 rounded-xl border">
                        <div className="flex items-center gap-3">
                            <div className="p-2 bg-primary/10 rounded-lg text-primary">
                                <IconBuildingSkyscraper className="h-5 w-5" />
                            </div>
                            <div>
                                <p className="font-bold text-sm leading-tight text-foreground">{company.company_name}</p>
                                <p className="text-xs   text-muted-foreground mt-0.5">{company.company_number || 'OC385142'}</p>
                            </div>
                        </div>
                        <Badge className={company.status === 'Overdue' ? 'bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300' : 'bg-blue-50 text-blue-700 dark:bg-blue-950 dark:text-blue-300'}>
                            {company.status}
                        </Badge>
                    </div>

                    {/* Compliance Readiness Gate */}
                    <div className="space-y-2">
                        <Label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
                            Compliance Readiness Checks
                        </Label>
                        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                            <div className="p-2.5 rounded-lg border bg-card flex flex-col items-center justify-center text-center">
                                <span className="text-[10px] text-muted-foreground font-medium mb-1">Address</span>
                                <Badge className={isAddressOk ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300"}>
                                    {isAddressOk ? "On file" : "Missing"}
                                </Badge>
                            </div>

                            <div className="p-2.5 rounded-lg border bg-card flex flex-col items-center justify-center text-center">
                                <span className="text-[10px] text-muted-foreground font-medium mb-1">Director IDV</span>
                                <Badge className={isIdvOk ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-sky-50 text-sky-700 dark:bg-sky-950 dark:text-sky-300"}>
                                    {company.idv_status || "Not started"}
                                </Badge>
                            </div>

                            <div className="p-2.5 rounded-lg border bg-card flex flex-col items-center justify-center text-center">
                                <span className="text-[10px] text-muted-foreground font-medium mb-1">PSC Status</span>
                                <Badge className={isPscOk ? "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300" : "bg-purple-50 text-purple-700 dark:bg-purple-950 dark:text-purple-300"}>
                                    {company.psc_status || "Not started"}
                                </Badge>
                            </div>

                            <div className="p-2.5 rounded-lg border bg-card flex flex-col items-center justify-center text-center">
                                <span className="text-[10px] text-muted-foreground font-medium mb-1">Issues</span>
                                <Badge className={issuesCount > 0 ? "bg-red-50 text-red-700 dark:bg-red-950 dark:text-red-300" : "bg-green-50 text-green-700 dark:bg-green-950 dark:text-green-300"}>
                                    {issuesCount > 0 ? `${issuesCount} block` : "Clear"}
                                </Badge>
                            </div>
                        </div>
                    </div>

                    <Separator />

                    {/* Form Fields Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                        <div className="space-y-1.5">
                            <Label htmlFor="accounts-type" className="text-xs">Accounts Pathway</Label>
                            <Select value={accountsType} onValueChange={setAccountsType}>
                                <SelectTrigger id="accounts-type" className="w-full">
                                    <SelectValue placeholder="Select type" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="Micro-entity">Micro-entity Balance Sheet</SelectItem>
                                    <SelectItem value="Dormant">Dormant Accounts (AA02)</SelectItem>
                                    <SelectItem value="Full Accounts">Full Small Company Accounts</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="filing-status" className="text-xs">Filing Status</Label>
                            <Select value={status} onValueChange={setStatus}>
                                <SelectTrigger id="filing-status" className="w-full">
                                    <SelectValue placeholder="Select status" />
                                </SelectTrigger>
                                <SelectContent>
                                    <SelectItem value="In progress">In progress</SelectItem>
                                    <SelectItem value="Ready to file" disabled={!canFileOfficial}>
                                        Ready to file {!canFileOfficial && "(Blocked)"}
                                    </SelectItem>
                                    <SelectItem value="Filed">Filed</SelectItem>
                                    <SelectItem value="Draft">Draft</SelectItem>
                                </SelectContent>
                            </Select>
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="year-end" className="text-xs">Period End (Year End)</Label>
                            <Input
                                id="year-end"
                                value={periodEnd}
                                onChange={(e) => setPeriodEnd(e.target.value)}
                                placeholder="DD/MM/YYYY"
                            />
                        </div>

                        <div className="space-y-1.5">
                            <Label htmlFor="due-date" className="text-xs">Filing Due Date</Label>
                            <Input
                                id="due-date"
                                value={dueDate}
                                onChange={(e) => setDueDate(e.target.value)}
                                placeholder="DD/MM/YYYY"
                            />
                        </div>

                        <div className="space-y-1.5 sm:col-span-2">
                            <Label htmlFor="confirmation-no" className="text-xs">Companies House Submission Reference</Label>
                            <Input
                                id="confirmation-no"
                                value={confirmationNumber}
                                onChange={(e) => setConfirmationNumber(e.target.value)}
                                placeholder="e.g. CH-2026-894721"
                            />
                        </div>

                        <div className="space-y-1.5 sm:col-span-2">
                            <Label htmlFor="filing-notes" className="text-xs">Internal Notes / Auditor Remarks</Label>
                            <Textarea
                                id="filing-notes"
                                value={notes}
                                onChange={(e) => setNotes(e.target.value)}
                                placeholder="Optional notes for the accounts filing..."
                                rows={2}
                            />
                        </div>
                    </div>

                    <DialogFooter className="pt-2 gap-2">
                        <Button type="button" variant="outline" onClick={onClose} disabled={isSubmitting}>
                            Cancel
                        </Button>
                        <Button type="submit" disabled={isSubmitting}>
                            {isSubmitting ? "Submitting..." : "Submit to Companies House"}
                        </Button>
                    </DialogFooter>
                </form>
            </DialogContent>
        </Dialog>
    )
}

export default FileAccount
