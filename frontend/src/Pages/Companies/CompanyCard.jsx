import React, { useState } from 'react'
import { Card, CardContent, CardFooter, CardHeader } from '@/components/ui/card'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu'
import { IconDotsVertical } from '@tabler/icons-react'
import ViewCompany from './ViewCompany'

const CompanyCard = ({ company }) => {
  const [isViewModalOpen, setIsViewModalOpen] = useState(false)

  const name = company?.name || "SHAMIMAKHTAR 3340 LTD";
  const number = company?.number || "#17456855";
  const director = company?.director || "Shamim Akhtar";
  const address = company?.address || "Office 1828 85 Dunstall Hill, Wolverhampton, WV6 0SR, England";
  const countryFlag = company?.countryFlag || "🇬🇧";
  const countryName = company?.countryName || "UK";
  const status = company?.status || "Active";
  const deadlineText = company?.deadlineText || "No upcoming deadlines";

  return (
    <>
      <Card className="w-full flex flex-col h-full relative">
        <CardHeader className="pb-3 flex flex-row items-start justify-between">
          <div className="flex flex-col gap-1.5 pr-6">
            <h3 className="font-semibold text-lg leading-tight">{name}</h3>
            <span className="text-sm text-muted-foreground">{number}</span>
          </div>
          
          <div className="absolute right-4 top-4">
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" className="h-8 w-8 text-muted-foreground">
                  <IconDotsVertical className="h-4 w-4" />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem onClick={() => setIsViewModalOpen(true)}>View Details</DropdownMenuItem>
                <DropdownMenuItem>Edit Company</DropdownMenuItem>
                <DropdownMenuItem className="text-destructive focus:bg-destructive/10 focus:text-destructive">Delete</DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          </div>
        </CardHeader>
        
        <CardContent className="pb-4 space-y-4 flex-1">
          <div className="text-sm">
            <span className="font-medium text-muted-foreground">Director · </span>
            <span>{director}</span>
          </div>
          
          <div className="text-sm">
            <p>{address}</p>
          </div>
          
          <div className="flex flex-wrap items-center gap-3 text-sm">
            <div className="flex items-center gap-1.5">
              <span>{countryFlag}</span>
              <span>{countryName}</span>
            </div>
            <Badge variant={status === 'Active' ? 'outline' : 'secondary'} className="font-normal">{status}</Badge>
          </div>

          <div className="text-sm text-muted-foreground">
            {deadlineText}
          </div>
        </CardContent>
        
        <CardFooter>
          <Button className="w-full" onClick={() => setIsViewModalOpen(true)}>
            View details
          </Button>
        </CardFooter>
      </Card>
      
      <ViewCompany isOpen={isViewModalOpen} onClose={() => setIsViewModalOpen(false)} />
    </>
  )
}

export default CompanyCard
