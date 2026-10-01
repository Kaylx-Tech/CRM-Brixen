import React, { useState } from 'react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { IconDotsVertical, IconTrash } from '@tabler/icons-react'
import ViewCompany from './ViewCompany'

const CompanyCard = ({ company, isSelected, onToggleSelect, onDelete }) => {
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)

  const name = company?.name || "Unnamed Company";
  const number = company?.number || "#00000000";
  const director = company?.director || "Director";
  const address = company?.address || "United Kingdom";
  const countryFlag = company?.countryFlag || "🇬🇧";
  const countryName = company?.countryName || "UK";
  const status = company?.status || "Active";
  const deadlineText = company?.deadlineText || "No upcoming deadlines";

  return (
    <>
      <Card className={`w-full flex flex-col h-full relative transition-all duration-200 ${isSelected ? 'border-primary ring-1 ring-primary/40 bg-accent/20' : 'hover:border-border'}`}>
        <CardHeader className="flex flex-row items-start justify-between gap-3">
          <div className="flex items-start gap-3 overflow-hidden flex-1">
            <div className="pt-0.5">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelect && onToggleSelect(company.id)}
                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                aria-label={`Select ${name}`}
              />
            </div>
            <div className="flex flex-col gap-1 overflow-hidden">
              <h3 className="font-semibold text-base leading-tight truncate" title={name}>{name}</h3>
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
        
        <CardContent className="pb-4 space-y-3 flex-1 text-xs">
          <div>
            <span className="font-medium text-muted-foreground">Director · </span>
            <span className="text-foreground">{director}</span>
          </div>
          
          <div>
            <p className="text-muted-foreground line-clamp-2">{address}</p>
          </div>
          
          <div className="flex flex-wrap items-center justify-between gap-2 pt-1">
            <div className="flex items-center gap-1.5 text-xs text-muted-foreground">
              <span>{countryFlag}</span>
              <span>{countryName}</span>
            </div>
            <Badge className={
              status === 'Active' ? 'badge-green' :
              status === 'Dissolved' ? 'badge-red' :
              status === 'Inactive' ? 'badge-amber' : 'badge-blue'
            }>
              {status}
            </Badge>
          </div>

          <div className="text-[11px] text-muted-foreground border-t pt-2">
            {deadlineText}
          </div>
        </CardContent>
        
        <CardFooter className="pt-0">
          <Button size="sm" className="w-full" onClick={() => setIsViewModalOpen(true)}>
            View details
          </Button>
        </CardFooter>
      </Card>
      
      <ViewCompany
        isOpen={isViewModalOpen}
        onClose={() => setIsViewModalOpen(false)}
        company={company}
      />
    </>
  )
}

export default CompanyCard
