import React from "react"
import { IconBell, IconBellRinging, IconRefresh, IconTrash } from "@tabler/icons-react"
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from "@/components/ui/popover"
import { Card } from "@/components/ui/card"
import { Badge } from "@/components/ui/badge"
import { Button } from "./ui/button"
import { ScrollArea } from "./ui/scroll-area"

// Define default notifications
const defaultNotifications = [
  {
    id: "1",
    title: "Welcome 🎉",
    description: "Thanks for checking out the notifications component!",
    time: "just now",
  },
  {
    id: "2",
    title: "System Update",
    description: "We’ve rolled out a new feature for you.",
    time: "1h ago",
  },
  {
    id: "3",
    title: "Reminder",
    description: "Don’t forget to finish your profile setup.",
    time: "3h ago",
  },
   {
    id: "1",
    title: "Welcome 🎉",
    description: "Thanks for checking out the notifications component!",
    time: "just now",
  },
  {
    id: "2",
    title: "System Update",
    description: "We’ve rolled out a new feature for you.",
    time: "1h ago",
  },
  {
    id: "3",
    title: "Reminder",
    description: "Don’t forget to finish your profile setup.",
    time: "3h ago",
  },
   {
    id: "1",
    title: "Welcome 🎉",
    description: "Thanks for checking out the notifications component!",
    time: "just now",
  },
  {
    id: "2",
    title: "System Update",
    description: "We’ve rolled out a new feature for you.",
    time: "1h ago",
  },
  {
    id: "3",
    title: "Reminder",
    description: "Don’t forget to finish your profile setup.",
    time: "3h ago",
  },
   {
    id: "1",
    title: "Welcome 🎉",
    description: "Thanks for checking out the notifications component!",
    time: "just now",
  },
  {
    id: "2",
    title: "System Update",
    description: "We’ve rolled out a new feature for you.",
    time: "1h ago",
  },
  {
    id: "3",
    title: "Reminder",
    description: "Don’t forget to finish your profile setup.",
    time: "3h ago",
  },
]

export default function Notifications({ items = defaultNotifications }) {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button className="relative inline-flex items-center justify-center rounded-md p-1.5 hover:bg-muted">
          {items.length > 0 ? (
            <IconBellRinging className="h-4 w-4"/>
          ) : (
            <IconBell className="h-4 w-4" />
          )}
          {items.length > 0 && (
            <Badge
              variant="default"
              className="absolute -top-1.5 -right-1.5 font-sm text-[9px] px-1.5 py-0"
            >
              {items.length}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-0 flex justify-center items-center" align="end">
       
          {items.length === 0 ? (
            <div className="w-70 text-sm py-8 flex flex-col items-center justify-between gap-2 text-muted-foreground text-center">
              <div className="bg-muted p-1.5 rounded-lg">
              <IconBell className="h-7 w-7 "/>
              </div>
             <h3 className="text-md font-medium">No Notifications</h3> 
             <p className="text-xs">You're all caught up. New notifications will appear here.</p>
             <Button>
                <IconRefresh className="h-5 w-5"/>
                Refresh
             </Button>
            </div>
          ) : (
              <div>
              <div className="bg-muted flex items-center justify-between rounded-t-md py-3 px-4">
                <h3 className="text-sm font-medium">Notifications</h3>
                <Button variant="destructive">
                  <IconTrash />
                  Clear
                </Button>
              </div>
            <ul className="divide-y divide-border">
              <ScrollArea className="h-[60vh]">
              {items.map((item) => (
                <li key={item.id} className="p-4 hover:bg-muted/50 transition">
                  <div className="flex justify-between items-center mb-1">
                    <span className="font-medium text-sm">{item.title}</span>
                    <span className="text-xs text-muted-foreground">{item.time}</span>
                  </div>
                  <p className="text-xs text-muted-foreground leading-relaxed">
                    {item.description}
                  </p>
                </li>
              ))}
              </ScrollArea>
            </ul>
             </div>
          )}
        
      </PopoverContent>
    </Popover>
  )
}


// Example usage
// <Notifications
//   items={[
//     { id: "1", title: "New Message", description: "You have a new message from John.", time: "2h ago" },
//     { id: "2", title: "System Alert", description: "Server downtime scheduled at midnight.", time: "5h ago" },
//     { id: "3", title: "Meeting Reminder", description: "Project sync meeting at 3 PM.", time: "1d ago" },
//   ]}
// />
