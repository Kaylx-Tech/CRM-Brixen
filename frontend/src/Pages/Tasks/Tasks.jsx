import React, { useState, useMemo } from 'react'
import { Button } from "@/components/ui/button"
import { Badge } from "@/components/ui/badge"
import { createColumnHelper } from "@tanstack/react-table"
import { DataTable } from "../../Layout/DataTable"
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const columnHelper = createColumnHelper()

const mockData = [
  {
    id: 1,
    formName: 'AD01 Form',
    formDesc: 'Change of registered office address.',
    type: 'UK Formfill'
  }
]

const Tasks = () => {
  const [data, setData] = useState(mockData)
  const [activeTab, setActiveTab] = useState('Tasks')

  const columns = useMemo(() => [
    columnHelper.accessor("formName", {
      header: "Form",
      cell: ({ row }) => (
        <div className="flex flex-col">
          <span className="font-medium text-foreground">{row.original.formName}</span>
          <span className="text-sm text-muted-foreground">{row.original.formDesc}</span>
        </div>
      ),
    }),
    columnHelper.accessor("type", {
      header: "Type",
      cell: ({ row }) => <Badge className="badge-purple">{row.getValue("type")}</Badge>,
    }),
    columnHelper.display({
      id: "actions",
      header: "Actions",
      cell: ({ row }) => (
        <Button size="sm" className="h-8">
          Start task
        </Button>
      ),
    }),
  ], [])

  return (
    <div className="flex flex-col gap-6 w-full pb-10">
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Tasks & Team</h2>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="h-9 bg-background">
          <TabsTrigger value="Tasks" className="text-xs rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Tasks</TabsTrigger>
          <TabsTrigger value="Team" className="text-xs rounded-full data-[state=active]:bg-primary data-[state=active]:text-primary-foreground">Team</TabsTrigger>
        </TabsList>
      </Tabs>

      {activeTab === 'Tasks' ? (
        <DataTable
          columns={columns}
          data={data}
          isLoading={false}
        />
      ) : (
        <div className="p-8 text-center text-muted-foreground border rounded-lg bg-card">
          Team management coming soon.
        </div>
      )}
    </div>
  )
}

export default Tasks
