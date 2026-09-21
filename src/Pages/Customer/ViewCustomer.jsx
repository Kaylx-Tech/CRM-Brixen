import React from 'react'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog'
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
import { IconUpload } from '@tabler/icons-react'

const ViewCustomer = ({ isOpen, onClose }) => {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[850px] p-0 overflow-hidden gap-0">
        
        {/* Header Section */}
        <div className="p-6 pb-4">
          <DialogHeader className="flex flex-row items-center gap-4 space-y-0 text-left">
            <Avatar className="w-14 h-14 rounded-lg bg-blue-600 text-white flex items-center justify-center text-xl font-bold">
              <AvatarFallback className="rounded-lg bg-blue-600 text-white">MW</AvatarFallback>
            </Avatar>
            <div>
              <DialogTitle className="text-2xl font-bold">Muhammad Waqas Aslam</DialogTitle>
              <DialogDescription className="text-sm mt-1">
                WP User ID: 66 | waqasge632@gmail.com
              </DialogDescription>
            </div>
          </DialogHeader>
        </div>

        {/* Tabs Section */}
        <Tabs defaultValue="overview" className="w-full flex flex-col">
          <div className="px-6 py-2 border-b">
            <TabsList className="bg-transparent h-auto p-0 gap-2 flex-wrap">
              <TabsTrigger value="overview" className="rounded-full border data-[state=active]:bg-background data-[state=active]:border-input data-[state=inactive]:border-transparent data-[state=inactive]:hover:bg-muted px-4 py-1.5 h-auto text-sm shadow-none">Overview</TabsTrigger>
              <TabsTrigger value="companies" className="rounded-full border data-[state=active]:bg-background data-[state=active]:border-input data-[state=inactive]:border-transparent data-[state=inactive]:hover:bg-muted px-4 py-1.5 h-auto text-sm shadow-none">Companies</TabsTrigger>
              <TabsTrigger value="orders" className="rounded-full border data-[state=active]:bg-background data-[state=active]:border-input data-[state=inactive]:border-transparent data-[state=inactive]:hover:bg-muted px-4 py-1.5 h-auto text-sm shadow-none">Orders</TabsTrigger>
              <TabsTrigger value="invoices" className="rounded-full border data-[state=active]:bg-background data-[state=active]:border-input data-[state=inactive]:border-transparent data-[state=inactive]:hover:bg-muted px-4 py-1.5 h-auto text-sm shadow-none">Invoices</TabsTrigger>
              <TabsTrigger value="documents" className="rounded-full border data-[state=active]:bg-background data-[state=active]:border-input data-[state=inactive]:border-transparent data-[state=inactive]:hover:bg-muted px-4 py-1.5 h-auto text-sm shadow-none">Documents</TabsTrigger>
              <TabsTrigger value="support" className="rounded-full border data-[state=active]:bg-background data-[state=active]:border-input data-[state=inactive]:border-transparent data-[state=inactive]:hover:bg-muted px-4 py-1.5 h-auto text-sm shadow-none">Support</TabsTrigger>
              <TabsTrigger value="activity" className="rounded-full border data-[state=active]:bg-background data-[state=active]:border-input data-[state=inactive]:border-transparent data-[state=inactive]:hover:bg-muted px-4 py-1.5 h-auto text-sm shadow-none">Activity</TabsTrigger>
            </TabsList>
          </div>

          <div className="p-6 overflow-y-auto max-h-[50vh]">
            
            {/* Overview Tab */}
            <TabsContent value="overview" className="m-0 space-y-6 outline-none">
              <div className="grid grid-cols-1 md:grid-cols-2 gap-y-6 gap-x-8">
                <div className="flex items-center">
                  <span className="font-bold w-24">B2B ID:</span>
                  <Badge variant="secondary" className="bg-blue-50 text-blue-600 hover:bg-blue-50 rounded-md font-semibold px-2 py-0.5">B2B-000001</Badge>
                </div>
                <div className="flex items-center">
                  <span className="font-bold w-28">Login email:</span>
                  <span className="text-muted-foreground text-sm">waqasge632@gmail.com</span>
                </div>
                <div className="flex items-center">
                  <span className="font-bold w-24">Phone:</span>
                  <span className="text-muted-foreground text-sm">+923156015749</span>
                </div>
                <div className="flex items-center">
                  <span className="font-bold w-28">Country:</span>
                  <span className="text-muted-foreground text-sm">United Kingdom</span>
                </div>
                <div className="flex items-center">
                  <span className="font-bold w-24">Status:</span>
                  <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200 hover:bg-green-50 rounded-md font-semibold px-2 py-0.5">Active</Badge>
                </div>
                <div className="flex items-center">
                  <span className="font-bold w-32">WordPress Sync:</span>
                  <span className="text-muted-foreground text-sm">Synced (2026-09-18 10:12:38)</span>
                </div>
                <div className="flex items-center col-span-1 md:col-span-2">
                  <span className="font-bold w-24">Address:</span>
                  <span className="text-muted-foreground text-sm">N/A</span>
                </div>
              </div>

              <Separator />

              <div className="space-y-3">
                <Label className="font-bold text-sm">Send all client notifications to</Label>
                <div className="flex items-center gap-3">
                  <Input placeholder="Leave blank to use login email" className="max-w-xs h-9" />
                  <Button size="sm" className="bg-blue-600 hover:bg-blue-700 text-white rounded-full px-5 h-9">Save</Button>
                </div>
                <p className="text-[13px] text-muted-foreground">
                  Orders, documents, payments, and activity emails for this client all go here.
                </p>
              </div>
            </TabsContent>

            {/* Companies Tab */}
            <TabsContent value="companies" className="m-0 outline-none">
              <div className="border rounded-xl p-4 space-y-1 bg-background shadow-sm">
                <div className="font-bold text-base flex items-center gap-1.5 flex-wrap">
                  SHAMIMAKHTAR 3340 LTD <span className="font-normal text-muted-foreground text-sm">(#17456855) • Multiple Products</span>
                </div>
                <div className="text-sm text-muted-foreground">
                  Office: Office 1828 85 Dunstall Hill, Wolverhampton, WV6 0SR, England | Status: Active
                </div>
              </div>
            </TabsContent>

            {/* Orders Tab */}
            <TabsContent value="orders" className="m-0 outline-none">
              <div className="border rounded-xl p-4 flex flex-col md:flex-row md:items-center justify-between gap-4 bg-background shadow-sm">
                <div>
                  <div className="font-bold text-base mb-1 flex items-center gap-1.5 flex-wrap">
                    #GB15323 <span className="font-normal text-muted-foreground text-sm">— Multiple Products (£230.00)</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    18 Sept 2026 • In Progress • 67%
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="outline" className="rounded-full h-8 text-[13px] px-4">Upload</Button>
                  <Button variant="outline" className="rounded-full h-8 text-[13px] px-4">Change details</Button>
                  <Button className="rounded-full h-8 text-[13px] px-4 bg-blue-600 hover:bg-blue-700 text-white">Process</Button>
                </div>
              </div>
            </TabsContent>

            {/* Invoices Tab */}
            <TabsContent value="invoices" className="m-0 outline-none">
              <div className="border rounded-xl p-4 bg-background shadow-sm">
                <div className="font-bold text-base flex items-center gap-1.5 flex-wrap">
                  INV-0021 <span className="font-normal text-muted-foreground text-sm">— £230.00 (Paid)</span>
                </div>
              </div>
            </TabsContent>

            {/* Documents Tab */}
            <TabsContent value="documents" className="m-0 space-y-4 outline-none">
              <div className="flex items-center justify-between">
                <p className="text-sm text-muted-foreground">Documents stored for this customer only.</p>
                <Button className="rounded-full bg-blue-600 hover:bg-blue-700 text-white h-9 px-4">
                  <IconUpload className="mr-2 h-4 w-4" />
                  Upload Document
                </Button>
              </div>

              {/* Document Item 1 */}
              <div className="border rounded-xl p-4 flex flex-col md:flex-row md:items-start justify-between gap-4 bg-background shadow-sm">
                <div className="space-y-3">
                  <div>
                    <h4 className="font-bold text-[15px]">Bank Statement</h4>
                    <p className="text-[13px] text-muted-foreground mt-0.5">
                      Bank statement • #GB15323 • 18 Sept 2026 • Brixen Admin
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-green-50 text-green-600 border-green-200 hover:bg-green-50 rounded-md font-semibold px-2 py-0.5">Approved</Badge>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" className="rounded-full h-7 text-xs px-3">View</Button>
                    <Button className="rounded-full h-7 text-xs px-3 bg-blue-600 hover:bg-blue-700 text-white">Download</Button>
                    <Button variant="outline" className="rounded-full h-7 text-xs px-3">Delete</Button>
                  </div>
                  <Select defaultValue="approved">
                    <SelectTrigger className="h-8 w-[160px] text-[13px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="pending">Pending Review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Document Item 2 */}
              <div className="border rounded-xl p-4 flex flex-col md:flex-row md:items-start justify-between gap-4 bg-background shadow-sm">
                <div className="space-y-3">
                  <div>
                    <h4 className="font-bold text-[15px]">Transactions_1789155728923.pdf</h4>
                    <p className="text-[13px] text-muted-foreground mt-0.5">
                      Order Documents • #GB15323 • 18 Sept 2026 • Customer Upload
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-50 rounded-md font-semibold px-2 py-0.5">Pending Review</Badge>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" className="rounded-full h-7 text-xs px-3">View</Button>
                    <Button className="rounded-full h-7 text-xs px-3 bg-blue-600 hover:bg-blue-700 text-white">Download</Button>
                    <Button variant="outline" className="rounded-full h-7 text-xs px-3">Delete</Button>
                  </div>
                  <Select defaultValue="pending">
                    <SelectTrigger className="h-8 w-[160px] text-[13px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="pending">Pending Review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

              {/* Document Item 3 */}
              <div className="border rounded-xl p-4 flex flex-col md:flex-row md:items-start justify-between gap-4 bg-background shadow-sm">
                <div className="space-y-3">
                  <div>
                    <h4 className="font-bold text-[15px]">PHOTO-2026-09-12-00-39-57.jpg</h4>
                    <p className="text-[13px] text-muted-foreground mt-0.5">
                      Order Documents • #GB15323 • 18 Sept 2026 • Customer Upload
                    </p>
                  </div>
                  <Badge variant="outline" className="bg-orange-50 text-orange-600 border-orange-200 hover:bg-orange-50 rounded-md font-semibold px-2 py-0.5">Pending Review</Badge>
                </div>
                <div className="flex flex-col items-end gap-3">
                  <div className="flex items-center gap-2">
                    <Button variant="outline" className="rounded-full h-7 text-xs px-3">View</Button>
                    <Button className="rounded-full h-7 text-xs px-3 bg-blue-600 hover:bg-blue-700 text-white">Download</Button>
                    <Button variant="outline" className="rounded-full h-7 text-xs px-3">Delete</Button>
                  </div>
                  <Select defaultValue="pending">
                    <SelectTrigger className="h-8 w-[160px] text-[13px]">
                      <SelectValue placeholder="Status" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="approved">Approved</SelectItem>
                      <SelectItem value="pending">Pending Review</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
              </div>

            </TabsContent>

            {/* Support Tab */}
            <TabsContent value="support" className="m-0 py-12 text-center text-muted-foreground outline-none">
              No support tickets available for this customer.
            </TabsContent>

            {/* Activity Tab */}
            <TabsContent value="activity" className="m-0 py-12 text-center text-muted-foreground outline-none">
              No recent activity found.
            </TabsContent>

          </div>
        </Tabs>

        {/* Footer Section */}
        <div className="p-4 border-t flex justify-end bg-background">
          <Button variant="outline" onClick={onClose} className="rounded-full px-8">
            Close
          </Button>
        </div>

      </DialogContent>
    </Dialog>
  )
}

export default ViewCustomer
