import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import App from './pages/App'
import EditorPage from './pages/EditorPage'
import './styles.css'

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
  <React.StrictMode>
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<App />} />
        <Route path="/editor/:name" element={<EditorPage />} />
      </Routes>
    </BrowserRouter>
  </React.StrictMode>
)
