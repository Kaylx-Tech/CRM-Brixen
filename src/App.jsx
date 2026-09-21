import React from 'react'
import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom'
import Login from './Pages/Login'
import SignUp from './Pages/SignUp'
import AdminLayout from './Layout/AdminLayout'
import Dashboard from './Pages/Dasboard'
import Customers from './Pages/Customer/Customers'
import Companies from './Pages/Companies/Companies'
import { TooltipProvider } from './components/ui/tooltip'
import { ThemeProvider } from './hooks/theme-provider'

const App = () => {
  return (
    <ThemeProvider defaultTheme="light" storageKey="vite-ui-theme">
      <TooltipProvider>
        <BrowserRouter>
          <Routes>
            <Route path="/" element={<Navigate to="/login" replace />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<SignUp />} />
            <Route path="/admin" element={<AdminLayout />}>
              <Route index element={<Navigate to="dashboard" replace />} />
              <Route path="dashboard" element={<Dashboard />} />
              <Route path="customers" element={<Customers />} />
              <Route path="companies" element={<Companies />} />
            </Route>
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </ThemeProvider>
  )
}

export default App