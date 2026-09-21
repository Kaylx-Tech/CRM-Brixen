import React from 'react'
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover"
import { Button } from "@/components/ui/button"
import { IconBellRinging } from '@tabler/icons-react';

const Notification = () => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" className="relative">
          <IconBellRinging className="h-5 w-5" />
          <span className="absolute top-0 right-0 h-2 w-2 rounded-full bg-red-500" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end">
        <div className="flex flex-col gap-4">
          <div className="flex items-center justify-between">
            <h4 className="font-medium">Notifications</h4>
            <span className="text-sm text-muted-foreground">2 new</span>
          </div>
        </div>
      </PopoverContent>
    </Popover>
  )
}

export default Notification