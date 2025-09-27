import React from 'react'
import ReactDOM from 'react-dom/client'
import { BrowserRouter, Routes, Route } from 'react-router-dom'
import { App as AntdApp } from 'antd'
import App from './pages/App'
import EditorPage from './pages/EditorPage'
import './styles.css'

const root = ReactDOM.createRoot(document.getElementById('root'))
root.render(
  <React.StrictMode>
    <AntdApp>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<App />} />
          <Route path="/editor/:name" element={<EditorPage />} />
        </Routes>
      </BrowserRouter>
    </AntdApp>
  </React.StrictMode>
)
