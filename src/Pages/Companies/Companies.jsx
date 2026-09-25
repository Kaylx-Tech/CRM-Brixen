import React, { useState, useEffect } from 'react'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Card, CardHeader, CardContent, CardFooter } from '@/components/ui/card'
import { Skeleton } from '@/components/ui/skeleton'
import { IconUpload, IconBuildingPlus, IconSearch, IconRefresh } from '@tabler/icons-react'
import CompanyCard from './CompanyCard'
import AddCompany from './AddCompany'
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs"

const fallbackCompanies = [
  { name: "SHAMIMAKHTAR 3340 LTD", number: "17456855", director: "Shamim Akhtar", address: "Office 1828 85 Dunstall Hill, Wolverhampton, England", status: "Active", countryName: "UK", countryFlag: "🇬🇧" },
  { name: "H & Z TRADERS LTD", number: "17456856", director: "John Doe", address: "123 Business Rd, London, England", status: "Active", countryName: "UK", countryFlag: "🇬🇧" },
  { name: "HEXA FALIR LTD", number: "17456857", director: "Jane Smith", address: "456 Tech Park, Manchester, England", status: "Active", countryName: "UK", countryFlag: "🇬🇧" },
  { name: "LEADER TELECOMMUNICATION COMPANY LTD", number: "17456858", director: "Alan Turing", address: "789 Comm St, Birmingham, England", status: "Inactive", countryName: "UK", countryFlag: "🇬🇧" },
]

const Companies = () => {
  const [isAddModalOpen, setIsAddModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const [companies, setCompanies] = useState([])
  const [isLoading, setIsLoading] = useState(true)
  const [activeTab, setActiveTab] = useState('all')

  const fetchCompanies = async () => {
    setIsLoading(true)
    try {
      const apiUrl = import.meta.env.VITE_API_URL || '/api'
      const res = await fetch(`${apiUrl}/admin/companies`, {
        credentials: "include",
      })
      if (res.ok) {
        const data = await res.json()
        if (data.status === "success" && Array.isArray(data.companies) && data.companies.length > 0) {
          setCompanies(data.companies.map(c => ({
            id: c.id,
            name: c.company_name || c.name || "Unnamed Company",
            number: c.company_number || c.number || "#00000000",
            director: c.director_name || c.director || "Director",
            address: c.registered_office_address || c.address || "United Kingdom",
            status: c.status || "Active",
            countryFlag: "🇬🇧",
            countryName: "UK",
            deadlineText: c.accounts_next_due ? `Accounts due: ${c.accounts_next_due}` : "Compliant with Companies House"
          })))
          return
        }
      }
      setCompanies(fallbackCompanies)
    } catch (err) {
      console.error("Failed to load companies:", err)
      setCompanies(fallbackCompanies)
    } finally {
      setIsLoading(false)
    }
  }

  useEffect(() => {
    fetchCompanies()
  }, [])

  const filteredCompanies = companies.filter(company => {
    const term = searchTerm.toLowerCase()
    const matchesSearch = 
      (company.name && company.name.toLowerCase().includes(term)) ||
      (company.number && company.number.toLowerCase().includes(term)) ||
      (company.director && company.director.toLowerCase().includes(term))

    if (!matchesSearch) return false

    if (activeTab === 'attention') {
      return company.status === 'Overdue' || company.status === 'Inactive'
    }
    if (activeTab === 'not-registered') {
      return company.status === 'Pending' || company.status === 'Draft'
    }
    return true
  })

  return (
    <div className="flex flex-col gap-6 w-full">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-2xl font-bold tracking-tight">Registered Companies</h2>
          <p className="text-muted-foreground text-sm mt-1">
            Official UK company records & direct portfolio monitoring.
          </p>
        </div>
        <div className="flex items-center gap-3">
          <Button 
            variant="outline" 
            size="icon"
            onClick={fetchCompanies}
            disabled={isLoading}
            title="Refresh list"
          >
            <IconRefresh className={`h-4 w-4 ${isLoading ? 'animate-spin' : ''}`} />
          </Button>
          <Button variant="outline">
            <IconUpload className="mr-2 h-4 w-4" />
            Import WebFiling
          </Button>
          <Button onClick={() => setIsAddModalOpen(true)}>
            <IconBuildingPlus className="mr-2 h-4 w-4" />
            Add Company
          </Button>
        </div>
      </div>

      {/* Stats/Tabs & Search */}
      <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
        {/* Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full md:w-auto">
          <TabsList className="flex-wrap h-auto justify-start">
            <TabsTrigger value="all" className="py-2">
              All
              <span className="ml-2 bg-muted-foreground/20 px-1.5 py-0.5 rounded-full text-xs min-w-[20px] text-center inline-flex items-center justify-center">
                {isLoading ? <Skeleton className="h-3 w-4 rounded-xs" /> : companies.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="uk" className="py-2">
              UK Portfolio
              <span className="ml-2 bg-muted-foreground/20 px-1.5 py-0.5 rounded-full text-xs min-w-[20px] text-center inline-flex items-center justify-center">
                {isLoading ? <Skeleton className="h-3 w-4 rounded-xs" /> : companies.length}
              </span>
            </TabsTrigger>
            <TabsTrigger value="attention" className="py-2 data-[state=active]:bg-destructive/10 data-[state=active]:text-destructive text-destructive">
              Attention
            </TabsTrigger>
            <TabsTrigger value="not-registered" className="py-2">
              Draft / Pending
            </TabsTrigger>
          </TabsList>
        </Tabs>
        
        {/* Search */}
        <div className="relative w-full md:w-auto shrink-0">
          <IconSearch className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search name, number, director…"
            className="w-full md:w-[280px] pl-9"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
          />
        </div>
      </div>

      {/* Grid / Skeletons */}
      {isLoading ? (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 pb-8">
          {Array.from({ length: 6 }).map((_, i) => (
            <Skeleton key={i} className="w-full h-[270px] rounded-xl" />
          ))}
        </div>
      ) : filteredCompanies.length === 0 ? (
        <div className="text-center py-12 text-muted-foreground">
          No companies found matching your query.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-3 gap-4 pb-8">
          {filteredCompanies.map((company, i) => (
            <CompanyCard key={company.id || i} company={company} />
          ))}
        </div>
      )}

      <AddCompany 
        isOpen={isAddModalOpen} 
        onClose={() => {
          setIsAddModalOpen(false)
          fetchCompanies()
        }} 
      />
    </div>
  )
}

export default Companies