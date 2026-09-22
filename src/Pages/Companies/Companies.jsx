import React, { useState } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { IconUpload, IconBuildingPlus, IconSearch, IconAlertCircle } from '@tabler/icons-react'
import CompanyCard from './CompanyCard'
import AddCompany from './AddCompany'
import { Alert, AlertTitle } from '@/components/ui/alert'
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"

const Companies = () => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [error, setError] = useState(false)

  const companiesData = [
    { name: "SHAMIMAKHTAR 3340 LTD", number: "#17456855", director: "Shamim Akhtar", address: "Office 1828 85 Dunstall Hill, Wolverhampton, England", status: "Active" },
    { name: "H & Z TRADERS LTD", number: "#17456856", director: "John Doe", address: "123 Business Rd, London, England", status: "Active" },
    { name: "HEXA FALIR LTD", number: "#17456857", director: "Jane Smith", address: "456 Tech Park, Manchester, England", status: "Active" },
    { name: "LEADER TELECOMMUNICATION COMPANY LTD", number: "#17456858", director: "Alan Turing", address: "789 Comm St, Birmingham, England", status: "Inactive" },
  ];

  // Combine arrays to simulate the grid the user had, and filter by search term
  const allCompanies = [...companiesData, ...companiesData];
  const filteredCompanies = allCompanies.filter(company => 
    company.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    company.number.toLowerCase().includes(searchTerm.toLowerCase()) ||
    company.director.toLowerCase().includes(searchTerm.toLowerCase())
  );

  return (
    <div className="flex flex-col gap-6 w-full">
      
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Registered companies</h2>
          <p className="text-muted-foreground text-sm mt-1"> Official UK company records. Newest registrations first.</p>
        </div>
        <div className="flex items-center gap-3">
          <Button variant="outline">
            <IconUpload className="mr-2 h-4 w-4" />
            Import WebFiling
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)}>
            <IconBuildingPlus className="mr-2 h-4 w-4" />
            Add company
          </Button>
        </div>
      </div>

      {/* Alert Banner */}
      {error && (
        <Alert variant="destructive">
            <IconAlertCircle className="h-5 w-5 shrink-0 mt-0.5" />
            <AlertTitle>28 companies need attention at Companies House</AlertTitle>
        </Alert>
      )}

      {/* Stats/Tabs & Search */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        {/* Tabs */}
        <Tabs defaultValue="all" className="w-full md:w-auto">
          <TabsList className="flex-wrap h-auto justify-start">
            <TabsTrigger value="all" className="py-2">
              All
            </TabsTrigger>
            <TabsTrigger value="uk" className="py-2">
              UK
              <span className="ml-2 bg-muted-foreground/20 px-1.5 py-0.5 rounded-full text-xs">176</span>
            </TabsTrigger>
            <TabsTrigger value="attention" className="py-2 data-[state=active]:bg-destructive/10 data-[state=active]:text-destructive text-destructive">
              Attention
              <span className="ml-2 bg-destructive/20 px-1.5 py-0.5 rounded-full text-xs">28</span>
            </TabsTrigger>
            <TabsTrigger value="companies-house" className="py-2">
              Companies House
              <span className="ml-2 bg-muted-foreground/20 px-1.5 py-0.5 rounded-full text-xs">176</span>
            </TabsTrigger>
            <TabsTrigger value="not-registered" className="py-2">
              Not registered
              <span className="ml-2 bg-muted-foreground/20 px-1.5 py-0.5 rounded-full text-xs">2</span>
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        {/* Search */}
        <div className="relative w-full md:w-auto shrink-0">
          <IconSearch className="absolute left-2.5 top-1.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, number, director…"
            className="w-full md:w-[280px] pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

     {/* Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 pb-8">
        {filteredCompanies.map((company, i) => (
          <CompanyCard key={i} company={company} />
        ))}
      </div>

      <AddCompany isOpen={isAddModalOpen} onClose={() => setIsAddModalOpen(false)} />
    </div>
  )
}

export default Companies