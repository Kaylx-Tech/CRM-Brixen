import React, { useState } from 'react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Checkbox } from '@/components/ui/checkbox'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { IconDotsVertical, IconPencil } from '@tabler/icons-react'

const OrderCard = ({ order, isSelected, onToggleSelect, onDelete }) => {
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)

  const orderNum = order?.orderNum || "#000000";
  const company = order?.company || "Unknown Company";
  const ownerName = order?.ownerName || "Unknown Owner";
  const ownerEmail = order?.ownerEmail || "";
  const date = order?.date || "";
  const price = order?.price || "£0";
  const payment = order?.payment || "Select";
  const status = order?.status || "Pending";
  const statusColor = order?.statusColor || "blue";
  const products = order?.products || [];

  return (
    <>
      <Card className={`w-full flex flex-col h-full relative transition-all duration-200 ${isSelected ? 'border-primary ring-1 ring-primary/40 bg-accent/20' : 'hover:border-border'}`}>
        <CardHeader className="flex flex-row items-start justify-between gap-3 pb-3">
          <div className="flex items-start gap-3 overflow-hidden flex-1">
            <div className="pt-0.5">
              <Checkbox
                checked={isSelected}
                onCheckedChange={() => onToggleSelect && onToggleSelect(order.id)}
                className="data-[state=checked]:bg-primary data-[state=checked]:border-primary"
                aria-label={`Select ${orderNum}`}
              />
            </div>
            <div className="flex flex-col gap-1 overflow-hidden">
              <h3 className="font-semibold text-base leading-tight truncate text-primary">{orderNum}</h3>
              <span className="text-sm text-muted-foreground">{date}</span>
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
                <DropdownMenuItem onClick={() => onToggleSelect && onToggleSelect(order.id)}>
                  {isSelected ? 'Deselect' : 'Select'}
                </DropdownMenuItem>
                {onDelete && (
                  <DropdownMenuItem
                    onClick={() => onDelete(order.id)}
                    className="text-destructive focus:bg-destructive/10 focus:text-destructive"
                  >
                    Delete
                  </DropdownMenuItem>
                )}
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        
        <CardContent className="pb-4 space-y-3 flex-1 text-sm">
          <div>
            <span className="font-semibold text-foreground text-[13px]">{company}</span>
          </div>
          <div>
            <span className="font-medium text-foreground">{ownerName}</span>
            <p className="text-muted-foreground">{ownerEmail}</p>
          </div>
          
          <div className="flex flex-wrap gap-1.5 pt-1">
            {products.map((p, idx) => {
              let badgeClass = "badge-sky";
              if (p.color === 'teal' || p.color === 'green') badgeClass = "badge-green";
              if (p.color === 'pink') badgeClass = "badge-purple";
              if (p.color === 'gray') badgeClass = "bg-muted text-muted-foreground";
              
              return (
                <Badge key={idx} className={badgeClass}>
                  <span className="w-1 h-1 rounded-full bg-current mr-1.5 opacity-60"></span>
                  {p.name}
                </Badge>
              )
            })}
          </div>

          <div className="flex flex-wrap items-center justify-between gap-2 pt-2 border-t mt-3">
            <div className="flex items-center gap-1.5 font-bold text-sm">
              {price}
              <IconPencil className="h-3.5 w-3.5 text-muted-foreground cursor-pointer hover:text-foreground" />
            </div>
            
            <div className="flex items-center gap-2">
              <Badge variant="outline" className="text-[10px]">{payment}</Badge>
              <Badge className={
                statusColor === 'green' ? 'badge-green' :
                statusColor === 'blue' ? 'badge-sky' : 'bg-muted text-muted-foreground'
              }>
                {status}
              </Badge>
            </div>
          </div>
        </CardContent>
        
        <CardFooter className="pt-0">
          <Button size="sm" variant="outline" className="w-full" onClick={() => setIsViewModalOpen(true)}>
            View details
          </Button>
        </CardFooter>
      </Card>
    </>
  )
}

export default OrderCard
