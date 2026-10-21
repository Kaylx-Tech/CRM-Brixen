import React, { useState } from 'react'
import { Card, CardContent, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { IconDotsVertical, IconTrash, IconShieldCheck, IconAlertTriangle } from '@tabler/icons-react'
import ViewCompany from './ViewCompany'
import { needsAttention, attentionSummary } from './attention'

const CompanyCard = ({ company, isSelected, onToggleSelect, onDelete, onRefresh }) => {
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)

  const name = company?.name || "Unnamed Company";
  const number = company?.number || "#00000000";
  const director = company?.director || "Director";
  const address = company?.address || "United Kingdom";
  const countryFlag = company?.countryFlag || "🇬🇧";
  const countryName = company?.countryName || "UK";
  // A company without a real Companies House number is not live yet, whatever its stored status says
  const status = company?.isRegistered === false ? "Not registered" : (company?.status || "Active");
  const deadlineText = company?.deadlineText || "No upcoming deadlines";
  const hasAttention = company?.isRegistered !== false && needsAttention(company);

  return (
    <>
      <Card size="sm" className={`w-full flex flex-col h-full relative gap-2 transition-all duration-200 ${isSelected ? 'border-primary ring-1 ring-primary/40 bg-accent/20' : hasAttention ? 'border-destructive/50' : 'hover:border-border'}`}>
        <CardHeader className="flex flex-row items-start justify-between gap-2">
          <div className="flex items-start gap-2.5 overflow-hidden flex-1">
            <div className="pt-0.5">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelect && onToggleSelect(company.id)}
                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                aria-label={`Select ${name}`}
              />
            </div>
            <div className="flex flex-col gap-0.5 overflow-hidden">
              <h3 className="font-semibold text-sm leading-tight truncate" title={name}>
                <button
                  type="button"
                  onClick={() => setIsViewModalOpen(true)}
                  className="max-w-full truncate text-left hover:text-primary hover:underline underline-offset-2 focus-visible:outline-none focus-visible:underline"
                >
                  {name}
                </button>
              </h3>
              <span className="text-xs text-muted-foreground">{number}</span>
            </div>
          </div>
          
          <div className="flex items-center shrink-0">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-7 w-7 text-muted-foreground">
                  <IconDotsVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsViewModalOpen(true)}>View Details</DropdownMenuItem>
                <DropdownMenuItem onClick={() => onToggleSelect && onToggleSelect(company.id)}>
                  {isSelected ? 'Deselect' : 'Select'}
                </DropdownMenuItem>
                {onDelete && (
                  <DropdownMenuItem
                    onClick={() => onDelete(company.id)}
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  >
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        
        <CardContent className="space-y-1.5 flex-1 text-xs">
          <div className="truncate" title={director}>
            <span className="font-medium text-muted-foreground">Director · </span>
            <span className="text-foreground">{director}</span>
          </div>

          <p className="text-muted-foreground truncate" title={address}>{address}</p>

          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{countryFlag}</span>
              <span>{countryName}</span>
            </div>
            <div className="flex items-center gap-1.5 flex-wrap">
              
              <Badge className={
                status === 'Active' ? 'badge-green' :
                status === 'Dissolved' ? 'badge-red' :
                status === 'Inactive' || status === 'Not registered' ? 'badge-amber' : 'badge-blue'
              }>
                {status}
              </Badge>
            </div>
          </div>

          <div className={`flex items-center justify-between gap-2 text-[11px] border-t pt-1.5 ${hasAttention ? 'text-destructive font-medium' : 'text-muted-foreground'}`}>
            <span className="truncate">{hasAttention ? attentionSummary(company) : deadlineText}</span>
            <Button size="xs" variant="outline" className="h-6 shrink-0 px-2 text-[11px]" onClick={() => setIsViewModalOpen(true)}>
              View
            </Button>
          </div>
        </CardContent>
      </Card>
      
      <ViewCompany
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        company={company}
        onUpdate={onRefresh}
      />
    </>
  )
}

export default CompanyCard
