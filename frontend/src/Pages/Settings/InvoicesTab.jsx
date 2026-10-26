import { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { Badge } from '@/components/ui/badge'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { IconBuildingBank, IconLink, IconPlus, IconTrash } from '@tabler/icons-react'
import { COUNTRY, INVOICE_COUNTRIES, newId } from './invoiceSettings'

export default function InvoicesTab({ form, setField, disabled }) {
  const [pick, setPick] = useState('')
  const accounts = form.invoice_bank_accounts
  const links = form.invoice_links

  const setAccount = (id, patch) =>
    setField('invoice_bank_accounts', accounts.map((a) => (a.id === id ? { ...a, ...patch } : a)))
  const addAccount = (code) => {
    if (!code) return
    setField('invoice_bank_accounts', [...accounts, { id: newId(), code, country: '', currency: '', values: {} }])
    setPick('')
  }
  const setLink = (id, patch) => setField('invoice_links', links.map((l) => (l.id === id ? { ...l, ...patch } : l)))

  return (
    <>
      <div className="rounded-md border bg-card p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Bank accounts</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Choose a country and add the account your clients there should pay into. Every account you add is printed on invoices and invoice emails.
          </p>
        </div>

        {accounts.length === 0 ? (
          <div className="rounded-md border border-dashed px-4 py-6 text-center text-sm text-muted-foreground">
            No bank accounts yet. Invoices show no bank details until you add one.
          </div>
        ) : null}

        {accounts.map((account) => {
          const [code, name, currency, defs] = COUNTRY[account.code]
          return (
            <div key={account.id} className="rounded-md border p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 min-w-0">
                  <IconBuildingBank className="size-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm font-semibold truncate">
                    {code === 'OTHER' ? (account.country || 'Other country') : name}
                  </span>
                  {(code === 'OTHER' ? account.currency : currency) ? (
                    <Badge variant="secondary">{code === 'OTHER' ? account.currency.toUpperCase() : currency}</Badge>
                  ) : null}
                </div>
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-muted-foreground hover:text-destructive"
                  onClick={() => setField('invoice_bank_accounts', accounts.filter((a) => a.id !== account.id))}
                  disabled={disabled}
                >
                  <IconTrash className="size-4" /> Remove
                </Button>
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                {code === 'OTHER' ? (
                  <>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${account.id}-country`} className="text-sm">Country</Label>
                      <Input id={`${account.id}-country`} value={account.country} placeholder="e.g. Germany"
                        onChange={(e) => setAccount(account.id, { country: e.target.value })} disabled={disabled} />
                    </div>
                    <div className="grid gap-1.5">
                      <Label htmlFor={`${account.id}-currency`} className="text-sm">Currency</Label>
                      <Input id={`${account.id}-currency`} value={account.currency} placeholder="e.g. EUR" maxLength={10}
                        onChange={(e) => setAccount(account.id, { currency: e.target.value })} disabled={disabled} />
                    </div>
                  </>
                ) : null}
                {defs.map(([key, label, placeholder]) => (
                  <div key={key} className={`grid gap-1.5 ${key === 'other' ? 'md:col-span-3' : ''}`}>
                    <Label htmlFor={`${account.id}-${key}`} className="text-sm">{label}</Label>
                    <Input
                      id={`${account.id}-${key}`}
                      value={account.values[key] || ''}
                      placeholder={placeholder}
                      maxLength={200}
                      onChange={(e) => setAccount(account.id, { values: { ...account.values, [key]: e.target.value } })}
                      disabled={disabled}
                    />
                  </div>
                ))}
              </div>
            </div>
          )
        })}

        <div className="flex flex-wrap items-center gap-2">
          <Select value={pick} onValueChange={addAccount} disabled={disabled}>
            <SelectTrigger className="w-64" aria-label="Choose a country">
              <SelectValue placeholder="Choose a country to add…" />
            </SelectTrigger>
            <SelectContent>
              {INVOICE_COUNTRIES.map(([code, name, currency]) => (
                <SelectItem key={code} value={code}>
                  {name}{currency ? ` (${currency})` : ''}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-xs text-muted-foreground">Picking a country adds its account details form.</span>
        </div>
      </div>

      <div className="rounded-md border bg-card p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Other payment notes</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Anything else clients should know, one per line, e.g. “Reference: your invoice number”.
          </p>
        </div>
        <Textarea
          id="invoice_payment_details"
          rows={3}
          value={form.invoice_payment_details}
          onChange={(e) => setField('invoice_payment_details', e.target.value)}
          placeholder={'Reference: your invoice number\nPayment due within 14 days'}
          disabled={disabled}
        />
      </div>

      <div className="rounded-md border bg-card p-4 space-y-4">
        <div>
          <h3 className="text-sm font-semibold">Links on invoices</h3>
          <p className="text-sm text-muted-foreground mt-1">
            Shown as buttons under the payment details, e.g. a pay-online page, your website or your terms.
          </p>
        </div>
        {links.map((link) => (
          <div key={link.id} className="grid grid-cols-1 md:grid-cols-[1fr_2fr_auto] gap-2 items-end">
            <div className="grid gap-1.5">
              <Label htmlFor={`${link.id}-label`} className="text-sm">Button text</Label>
              <Input id={`${link.id}-label`} value={link.label} placeholder="Pay online" maxLength={60}
                onChange={(e) => setLink(link.id, { label: e.target.value })} disabled={disabled} />
            </div>
            <div className="grid gap-1.5">
              <Label htmlFor={`${link.id}-url`} className="text-sm">Link</Label>
              <Input id={`${link.id}-url`} type="url" value={link.url} placeholder="https://" maxLength={500}
                onChange={(e) => setLink(link.id, { url: e.target.value })} disabled={disabled} />
            </div>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              aria-label="Remove link"
              className="text-muted-foreground hover:text-destructive"
              onClick={() => setField('invoice_links', links.filter((l) => l.id !== link.id))}
              disabled={disabled}
            >
              <IconTrash className="size-4" />
            </Button>
          </div>
        ))}
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => setField('invoice_links', [...links, { id: newId(), label: '', url: '' }])}
          disabled={disabled || links.length >= 10}
        >
          {links.length ? <IconPlus className="size-4" /> : <IconLink className="size-4" />} Add link
        </Button>
      </div>
    </>
  )
}
