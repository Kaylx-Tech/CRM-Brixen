import React, { useState } from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
import { ScrollArea } from '@/components/ui/scroll-area'
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs'
import { Avatar, AvatarFallback } from '@/components/ui/avatar'
import { Button } from '@/components/ui/button'
import { Badge } from '@/components/ui/badge'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { IconUpload, IconBuilding } from '@tabler/icons-react'

const ViewCompany = ({ isOpen, onClose }) => {
  const [activeTab, setActiveTab] = useState("overview")

  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-[800px]">
        
        {/* Header Section */}
        <DialogHeader className='flex-row items-center gap-4 space-y-0 text-left'>
          <Avatar className="w-14 h-14 bg-indigo-600 text-white flex items-center justify-center text-xl font-bold">
            <AvatarFallback>SA</AvatarFallback>
          </Avatar>
          <div className="flex-1">
            <div className="flex items-center gap-2">
              <DialogTitle className="text-2xl font-bold">SHAMIMAKHTAR 3340 LTD</DialogTitle>
              <Badge variant="outline" className="font-normal">Active</Badge>
            </div>
            <DialogDescription className="text-sm mt-1 flex items-center gap-2">
              <span>#17456855</span>
              <span>•</span>
              <span>🇬🇧 UK</span>
              <span>•</span>
              <span className="truncate max-w-[300px]">Office 1828 85 Dunstall Hill, Wolverhampton, WV6 0SR, England</span>
            </DialogDescription>
          </div>
        </DialogHeader>

        {/* Tabs Section */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full flex flex-col">
          <div className="px-6 py-2 border-b overflow-x-auto [&::-webkit-scrollbar]:hidden [-ms-overflow-style:none] [scrollbar-width:none]">
            <TabsList className="flex w-max">
              <TabsTrigger value="overview">Overview</TabsTrigger>
              <TabsTrigger value="registered-office">Registered Office</TabsTrigger>
              <TabsTrigger value="business-activity">Business Activity</TabsTrigger>
              <TabsTrigger value="compliance">Compliance</TabsTrigger>
              <TabsTrigger value="orders">Orders / Services</TabsTrigger>
              <TabsTrigger value="documents">Documents</TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="h-[60vh] min-h-[400px] w-full">
            <div className="p-6 overflow-x-hidden">
            
            {/* Overview Tab */}
            <TabsContent value="overview" className="m-0 space-y-6 outline-none">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
                <div className="flex items-center">
                  <span className="font-bold w-36">Company name:</span>
                  <span className="text-muted-foreground text-sm">SHAMIMAKHTAR 3340 LTD</span>
                </div>
                <div className="flex items-center">
                  <span className="font-bold w-36">Company number:</span>
                  <span className="text-muted-foreground text-sm">17456855</span>
                </div>
                <div className="flex items-center">
                  <span className="font-bold w-36">Status:</span>
                  <Badge variant="outline">Active</Badge>
                </div>
                <div className="flex items-center">
                  <span className="font-bold w-36">Country:</span>
                  <span className="text-muted-foreground text-sm">United Kingdom</span>
                </div>
                <div className="flex items-center">
                  <span className="font-bold w-36">Incorporation date:</span>
                  <span className="text-muted-foreground text-sm">14/09/2026</span>
                </div>
                <div className="flex items-center">
                  <span className="font-bold w-36">Director:</span>
                  <span className="text-muted-foreground text-sm">Shamim Akhtar</span>
                </div>
              </div>

              <Separator />

              <div className="space-y-6">
                <div className="space-y-3">
                  <Label className="font-bold text-sm">Verified business email</Label>
                  <div className="flex items-center gap-3">
                    <Input defaultValue="shamimakhtar3340@gmail.com" className="max-w-xs" disabled />
                    <Badge variant="secondary">Verified · Locked</Badge>
                  </div>
                </div>

                <div className="space-y-3">
                  <Label className="font-bold text-sm">WhatsApp number</Label>
                  <div className="flex items-center gap-3">
                    <Input defaultValue="+44 7…" className="max-w-xs" />
                    <Button size="sm">Save</Button>
                  </div>
                  <p className="text-[13px] text-muted-foreground">
                    Saved once, then locked.
                  </p>
                </div>
              </div>
            </TabsContent>

            {/* Registered Office Tab */}
            <TabsContent value="registered-office" className="m-0 space-y-6 outline-none">
               <div className="grid grid-cols-1 gap-y-6">
                 <div className="space-y-1.5">
                   <Label className="font-bold text-sm text-muted-foreground">Address</Label>
                   <p className="text-base">Office 1828 85 Dunstall Hill, Wolverhampton, WV6 0SR, England</p>
                 </div>
                 <div className="space-y-1.5">
                   <Label className="font-bold text-sm text-muted-foreground">Postcode</Label>
                   <p className="text-base">—</p>
                 </div>
               </div>
            </TabsContent>

            {/* Business Activity Tab */}
            <TabsContent value="business-activity" className="m-0 space-y-6 outline-none">
              <div className="border rounded-xl p-4 space-y-1 bg-background shadow-sm">
                <div className="font-bold text-base">SIC 47910</div>
                <div className="text-sm text-muted-foreground">
                  Retail sale via mail order houses or via Internet
                </div>
              </div>
            </TabsContent>

            {/* Compliance Tab */}
            <TabsContent value="compliance" className="m-0 space-y-6 outline-none">
              <p className="text-sm text-muted-foreground mb-4">
                Stored on this company card for filings and HMRC / Companies House work.
              </p>
              
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-3">
                  <Label className="font-bold text-sm">UTR number</Label>
                  <Input placeholder="e.g. 1234567890" />
                </div>
                <div className="space-y-3">
                  <Label className="font-bold text-sm">Authentication code (Companies House)</Label>
                  <Input placeholder="Companies House auth code" />
                </div>
                <div className="space-y-3">
                  <Label className="font-bold text-sm">Personal 11 digits code</Label>
                  <Input defaultValue="CKT-3P8M-2223" />
                </div>
                
                <div className="col-span-1 md:col-span-2 flex flex-col md:flex-row gap-6">
                  <div className="space-y-3">
                    <Label className="font-bold text-sm">Identity verification</Label>
                    <div><Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">Verified</Badge></div>
                  </div>
                  <div className="space-y-3">
                    <Label className="font-bold text-sm">PSC verification</Label>
                    <div><Badge variant="outline" className="bg-green-500/10 text-green-600 border-green-500/20">Verified</Badge></div>
                  </div>
                  <div className="space-y-3">
                    <Label className="font-bold text-sm">Standing</Label>
                    <div><Badge variant="outline" className="bg-blue-500/10 text-blue-600 border-blue-500/20">Good Standing</Badge></div>
                  </div>
                </div>
              </div>
              
              <div className="pt-2">
                <Button>Save codes</Button>
              </div>
            </TabsContent>

            {/* Orders Tab */}
            <TabsContent value="orders" className="m-0 outline-none">
              <div className="border rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-background shadow-sm">
                <div>
                  <div className="font-bold text-base mb-1 flex items-center gap-1.5 flex-wrap">
                    #GB15323 <span className="font-normal text-muted-foreground text-sm">— Multiple Products</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    In Progress
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" size="sm">View</Button>
                </div>
              </div>
            </TabsContent>

            {/* Documents Tab */}
            <TabsContent value="documents" className="m-0 space-y-6 outline-none">
              
              <div className="space-y-4">
                <h3 className="font-semibold text-base border-b pb-2">Customer uploads (2)</h3>
                
                {/* Document Item 1 */}
                <div className="border rounded-xl p-4 flex flex-col md:flex-row md:items-start justify-between gap-4 bg-background shadow-sm">
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-bold text-[15px]">Transactions_1789155728923.pdf</h4>
                      <p className="text-[13px] text-muted-foreground mt-0.5">
                        Order Documents • REVIEW_REQUIRED • 10.1 KB
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Pending Review</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">View</Button>
                    <Button size="sm">Download</Button>
                    <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10">Delete</Button>
                  </div>
                </div>

                {/* Document Item 2 */}
                <div className="border rounded-xl p-4 flex flex-col md:flex-row md:items-start justify-between gap-4 bg-background shadow-sm">
                  <div className="space-y-3">
                    <div>
                      <h4 className="font-bold text-[15px]">PHOTO-2026-09-12-00-39-57.jpg</h4>
                      <p className="text-[13px] text-muted-foreground mt-0.5">
                        Order Documents • REVIEW_REQUIRED • 201.1 KB
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-yellow-500/10 text-yellow-600 border-yellow-500/20">Pending Review</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button variant="outline" size="sm">View</Button>
                    <Button size="sm">Download</Button>
                    <Button variant="outline" size="sm" className="text-destructive hover:bg-destructive/10">Delete</Button>
                  </div>
                </div>
              </div>

              <div className="space-y-4">
                <h3 className="font-semibold text-base border-b pb-2">Posted documents (1)</h3>
                <div className="text-sm text-muted-foreground text-center py-4">
                  No posted documents to display.
                </div>
              </div>

            </TabsContent>

            </div>
          </ScrollArea>
        </Tabs>

        {/* Footer Section */}
        <div className="p-4 flex justify-end">
          <Button onClick={onClose}>
            Close
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  )
}

export default ViewCompany