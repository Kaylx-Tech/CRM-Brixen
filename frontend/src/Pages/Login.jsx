import React from 'react'
import { LoginForm } from '@/components/login-form'
import { FinstapLoginForm } from '@/components/finstap-login-form'
import { IS_FINSTAP } from '@/lib/workspace'

const Login = () => {
  return (
    <div className='min-h-screen w-full'>
        {/* Finstap signs in to a company workspace; the Brixen build keeps its own login */}
        {IS_FINSTAP ? <FinstapLoginForm /> : <LoginForm />}
    </div>
  )
}

export default Login