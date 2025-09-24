import React, { useEffect, useState, useRef } from 'react'
import axios from 'axios'
import { useNavigate } from 'react-router-dom'
import { useTranslation } from '../locales'

// 登录 Modal 组件
function LoginModal({ onClose, onLogin }) {
  const { t } = useTranslation()
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')

  const handleLogin = async (e) => {
    e.preventDefault()
    try {
      await axios.post('/api/login', { password })
      onLogin()
    } catch (err) {
      setError(t('login.error'))
      setPassword('')
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal-content" onClick={e => e.stopPropagation()}>
        <form onSubmit={handleLogin}>
          <h3>{t('login.title')}</h3>
          <input
            type="password"
            value={password}
            onChange={e => setPassword(e.target.value)}
            placeholder={t('login.password')}
            autoFocus
          />
          {error && <div className="error">{error}</div>}
          <div className="modal-actions">
            <button type="button" onClick={onClose}>{t('login.cancel')}</button>
            <button type="submit" className="primary">{t('login.submit')}</button>
          </div>
        </form>
      </div>
    </div>
  )
}

export default function App() {
  const { t, lang, toggleLang } = useTranslation()
  const [files, setFiles] = useState([])
  const [userMode, setUserMode] = useState('guest') // 'admin' | 'guest'
  const [menuOpen, setMenuOpen] = useState(false)
  const [showLoginModal, setShowLoginModal] = useState(false)
  const [theme, setTheme] = useState(() => localStorage.getItem('theme') || 'system') // 'light' | 'dark' | 'system'
  const [themeMenuOpen, setThemeMenuOpen] = useState(false)
  const [newMenuOpen, setNewMenuOpen] = useState(false)

  // Apply theme on mount and change
  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme)
    localStorage.setItem('theme', theme)
  }, [theme])
  const [uploadFile, setUploadFile] = useState(null)
  const fileInputRef = useRef(null)
  const [status, setStatus] = useState('')
  const [toasts, setToasts] = useState([])
  const [loading, setLoading] = useState(true)
  const navigate = useNavigate()

  // Check auth status on mount
  useEffect(() => {
    axios.get('/api/auth', { withCredentials: true })
      .then(r => {
        if (r.data.authenticated) setUserMode('admin')
      })
      .finally(() => setLoading(false))
  }, [])

  // Configure axios to include credentials
  useEffect(() => {
    axios.defaults.withCredentials = true
  }, [])

  // Fetch files with auth
  useEffect(() => {
    if (loading) return
    const roleQuery = userMode === 'admin' ? '?role=admin' : '';
    axios.get(`/api/files${roleQuery}`).then(r => setFiles(r.data)).catch(() => setFiles([]))
  }, [userMode, loading])

  const openLoginModal = () => {
    setMenuOpen(false)
    setShowLoginModal(true)
  }

  const closeLoginModal = () => {
    setShowLoginModal(false)
    setStatus('')
  }

  const handleLoginSuccess = () => {
    setUserMode('admin')
    setShowLoginModal(false)
    setStatus(t('auth.loggedIn'))
    addToast({ type: 'success', message: t('auth.loggedIn') })
  }
  const logout = async () => {
    try {
      await axios.post('/api/logout')
      setUserMode('guest')
      setStatus(t('auth.loggedOut'))
      addToast({ type: 'success', message: t('auth.loggedOut') })
    } catch (e) {
      setStatus(t('auth.logoutFailed'))
      addToast({ type: 'error', message: t('auth.logoutFailed') })
    }
    setMenuOpen(false)
  }

  const doUpload = async () => {
    const file = uploadFile
    if (!file) return;
    // convert ArrayBuffer to base64 in browser
    const buf = await file.arrayBuffer()
    let binary = '';
    const bytes = new Uint8Array(buf);
    const chunkSize = 0x8000;
    for (let i = 0; i < bytes.length; i += chunkSize) {
      const chunk = bytes.subarray(i, i + chunkSize);
      binary += String.fromCharCode.apply(null, chunk);
    }
    const base64 = btoa(binary);
    try {
      setStatus(t('files.uploading'))
      addToast({ type: 'info', message: t('files.uploading') })
      await axios.post('/api/upload-base64', { filename: uploadFile.name, data: base64 });
      const r = await axios.get('/api/files');
      setFiles(r.data);
      setStatus(t('files.uploadSuccess'))
      addToast({ type: 'success', message: t('files.uploadSuccess') })
      // reset input
      setUploadFile(null)
      if (fileInputRef.current) fileInputRef.current.value = ''
    } catch (e) {
      setStatus(t('files.uploadFailed'))
      addToast({ type: 'error', message: t('files.uploadFailed') })
    }
  }

  const handleFileSelect = async (e) => {
    const f = e.target.files && e.target.files[0]
    if (!f) return
    setUploadFile(f)
    // auto upload when selected
    await new Promise(r => setTimeout(r, 50))
    doUpload()
  }

  const handleUploadClick = () => {
    if (fileInputRef.current) fileInputRef.current.click()
  }

  const createNewFile = async (type) => {
    // type is the extension like 'docx','xlsx','pptx','txt', etc.
    const ts = Date.now();
    const ext = String(type).replace(/^\./, '')
    const name = `Untitled-${ts}.${ext}`
    // create empty content (base64 of empty string)
    const base64 = ''
    try {
      setStatus(t('files.creating'))
      addToast({ type: 'info', message: t('files.creating') })
      await axios.post('/api/upload-base64', { filename: name, data: base64 })
      const r = await axios.get('/api/files')
      setFiles(r.data)
      setStatus(t('files.createSuccess'))
      addToast({ type: 'success', message: t('files.createSuccess') })
      // open the newly created file in editor
      navigate(`/editor/${encodeURIComponent(name)}?user=${encodeURIComponent(userMode)}`)
    } catch (e) {
      setStatus(t('files.createFailed'))
      addToast({ type: 'error', message: t('files.createFailed') })
    }
    setNewMenuOpen(false)
  }

  const doDownload = (name) => {
    // open download in new tab
    window.open(`/files/${encodeURIComponent(name)}?download=1`, '_blank')
  }

  const doDelete = async (name) => {
    if (!confirm(t('files.deleteConfirm').replace('{name}', name))) return;
    try {
      setStatus(t('files.deleting'))
      addToast({ type: 'info', message: t('files.deleting') })
      await axios.delete(`/api/files/${encodeURIComponent(name)}`)
      const r = await axios.get('/api/files')
      setFiles(r.data)
      setStatus(t('files.deleteSuccess'))
      addToast({ type: 'success', message: t('files.deleteSuccess') })
    } catch (e) {
      setStatus(t('files.deleteFailed'))
      addToast({ type: 'error', message: t('files.deleteFailed') })
    }
  }

  // Toast helpers
  const addToast = (tobj) => {
    const id = Date.now() + Math.random()
    setToasts(s => [...s, { id, ...tobj }])
    // auto remove after 4s
    setTimeout(() => {
      setToasts(s => s.filter(x => x.id !== id))
    }, 4000)
  }
  const removeToast = (id) => setToasts(s => s.filter(x => x.id !== id))

  return (
    <div>
      <nav className="topbar">
        <div className="brand">{t('brand')}</div>
        <div className="controls">
          <div className="control-item">
            <div className="lang-toggle" onClick={toggleLang}>
              {lang === 'zh' ? '中' : 'En'}
            </div>
          </div>

          <div className="control-item">
            <div className="theme-toggle" onClick={() => setThemeMenuOpen(s => !s)}>
              {theme === 'light' ? '☀️' : theme === 'dark' ? '🌙' : '🌓'}
            </div>
            {themeMenuOpen && (
              <div className="theme-menu">
                <button onClick={() => { setTheme('light'); setThemeMenuOpen(false) }}>{t('theme.light')}</button>
                <button onClick={() => { setTheme('dark'); setThemeMenuOpen(false) }}>{t('theme.dark')}</button>
                <button onClick={() => { setTheme('system'); setThemeMenuOpen(false) }}>{t('theme.system')}</button>
              </div>
            )}
          </div>

          <div className="control-item">
            <div className="avatar" onClick={() => setMenuOpen(s => !s)}>{userMode === 'admin' ? 'A' : 'G'}</div>
            {menuOpen && (
              <div className="avatar-menu">
                {userMode !== 'admin' ? (
                  <button onClick={openLoginModal}>{t('auth.login')}</button>
                ) : (
                  <button onClick={logout}>{t('auth.logout')}</button>
                )}
              </div>
            )}
          </div>

          {showLoginModal && (
            <LoginModal onClose={closeLoginModal} onLogin={handleLoginSuccess} />
          )}
        </div>
      </nav>

      <main className="content">
        <section className="panel">
          <div className="panel-header">
            <h2>{t('files.title')}</h2>
            <div className="panel-actions">
              {/* hidden file input: clicking upload button will trigger this */}
              <input ref={fileInputRef} style={{display:'none'}} className="file-input" type="file" onChange={handleFileSelect} />

              {/* New file dropdown button */}
              <div style={{position:'relative'}}>
                <button className="btn" onClick={() => setNewMenuOpen(s => !s)}>{t('files.new')}</button>
                {newMenuOpen && (
                  <div style={{position:'absolute',right:0,top:'100%',background:'var(--card)',border:'1px solid var(--border)',boxShadow:'0 8px 24px var(--shadow)',borderRadius:8,zIndex:200,maxHeight:320,overflow:'auto'}}>
                    <button style={{display:'block',padding:'8px 12px',background:'transparent',border:0,color:'var(--text)',width:220,textAlign:'left'}} onClick={() => createNewFile('docx')}>{t('files.newWord')}</button>
                    <button style={{display:'block',padding:'8px 12px',background:'transparent',border:0,color:'var(--text)',width:220,textAlign:'left'}} onClick={() => createNewFile('xlsx')}>{t('files.newExcel')}</button>
                    <button style={{display:'block',padding:'8px 12px',background:'transparent',border:0,color:'var(--text)',width:220,textAlign:'left'}} onClick={() => createNewFile('pptx')}>{t('files.newPPT')}</button>
                    <button style={{display:'block',padding:'8px 12px',background:'transparent',border:0,color:'var(--text)',width:220,textAlign:'left'}} onClick={() => createNewFile('odt')}>{t('files.newODT')}</button>
                    <button style={{display:'block',padding:'8px 12px',background:'transparent',border:0,color:'var(--text)',width:220,textAlign:'left'}} onClick={() => createNewFile('ods')}>{t('files.newODS')}</button>
                    <button style={{display:'block',padding:'8px 12px',background:'transparent',border:0,color:'var(--text)',width:220,textAlign:'left'}} onClick={() => createNewFile('odp')}>{t('files.newODP')}</button>
                    <button style={{display:'block',padding:'8px 12px',background:'transparent',border:0,color:'var(--text)',width:220,textAlign:'left'}} onClick={() => createNewFile('txt')}>{t('files.newText')}</button>
                    <button style={{display:'block',padding:'8px 12px',background:'transparent',border:0,color:'var(--text)',width:220,textAlign:'left'}} onClick={() => createNewFile('md')}>{t('files.newMD')}</button>
                    <button style={{display:'block',padding:'8px 12px',background:'transparent',border:0,color:'var(--text)',width:220,textAlign:'left'}} onClick={() => createNewFile('csv')}>{t('files.newCSV')}</button>
                    <button style={{display:'block',padding:'8px 12px',background:'transparent',border:0,color:'var(--text)',width:220,textAlign:'left'}} onClick={() => createNewFile('rtf')}>{t('files.newRTF')}</button>
                  </div>
                )}
              </div>

              {/* Upload triggers file chooser */}
              <button className="btn primary" onClick={handleUploadClick}>{t('files.upload')}</button>
            </div>
          </div>

          { /* status-row removed — notifications now use floating toasts */ }

          <ul className="file-list">
            {files.map(f => (
              <li key={f.name} className="file-card">
                <div className="file-info">
                  <div className="file-name">{f.name}</div>
                </div>
                <div className="actions">
                  <button className="btn" onClick={() => navigate(`/editor/${encodeURIComponent(f.name)}?user=${encodeURIComponent(userMode)}`)}>{t('files.open')}</button>
                  <button className="btn" onClick={() => doDownload(f.name)}>{t('files.download')}</button>
                  <button className="btn danger" onClick={() => doDelete(f.name)}>{t('files.delete')}</button>
                </div>
              </li>
            ))}
          </ul>
        </section>
      </main>
        {/* Toast container */}
        <div className="toast-container">
          {toasts.map(tb => (
            <div key={tb.id} className={`toast-item ${tb.type || 'info'}`} onClick={() => removeToast(tb.id)}>
              {tb.message}
            </div>
          ))}
        </div>
    </div>
  )
}
