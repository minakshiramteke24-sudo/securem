import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.tsx'
import './index.css'
import { AuthProvider } from './context/AuthContext'
import { CryptoProvider } from './context/CryptoContext'

ReactDOM.createRoot(document.getElementById('root')!).render(
  <React.StrictMode>
    <AuthProvider>
      <CryptoProvider>
        <App />
      </CryptoProvider>
    </AuthProvider>
  </React.StrictMode>,
)
