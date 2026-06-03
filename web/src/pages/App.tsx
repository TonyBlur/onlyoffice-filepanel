import { useEffect, useState } from 'react';
import { Outlet, useNavigate, useLocation } from 'react-router-dom';
import { Dropdown, App as AntdApp } from 'antd';
import { GlobalOutlined, ArrowLeftOutlined, UserOutlined, SunOutlined, MoonOutlined, DesktopOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import i18n from '../i18n';
import pkg from '../../package.json';

const LANG_KEY = 'preferred_language';

// Login Modal
function LoginModal({ onClose, onLogin }: { onClose: () => void; onLogin: () => void }): React.ReactElement {
  const { t } = useTranslation();
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await axios.post('/api/login', { password });
      onLogin();
    } catch {
      setError(t('login.error'));
      setPassword('');
    }
  };

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
            aria-label={t('login.password')}
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
  );
}

export default function App(): React.ReactElement {
  const { t } = useTranslation();
  const { message } = AntdApp.useApp();
  const [userMode, setUserMode] = useState<'admin' | 'guest'>('guest');
  const [menuOpen, setMenuOpen] = useState(false);
  const [showLoginModal, setShowLoginModal] = useState(false);
  const [themePref, setThemePref] = useState<string>(() => localStorage.getItem('theme') || 'system');
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();
  const location = useLocation();

  function getSystemIsDark(): boolean {
    return window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false;
  }

  function resolveTheme(pref: string): 'light' | 'dark' {
    if (pref === 'system') return getSystemIsDark() ? 'dark' : 'light';
    return pref === 'dark' ? 'dark' : 'light';
  }

  const theme = resolveTheme(themePref);

  useEffect(() => {
    document.documentElement.setAttribute('data-theme', theme);
  }, [theme]);

  // Listen for system theme changes when preference is 'system'
  useEffect(() => {
    const mq = window.matchMedia?.('(prefers-color-scheme: dark)');
    if (!mq) return;
    const handler = () => {
      if (themePref === 'system') {
        document.documentElement.setAttribute('data-theme', getSystemIsDark() ? 'dark' : 'light');
      }
    };
    mq.addEventListener('change', handler);
    return () => mq.removeEventListener('change', handler);
  }, [themePref]);

  useEffect(() => {
    axios.get('/api/auth', { withCredentials: true })
      .then(r => { if (r.data.authenticated) setUserMode('admin'); })
      .finally(() => setLoading(false));
  }, []);

  useEffect(() => { axios.defaults.withCredentials = true; }, []);

  // Restore saved language preference on mount
  useEffect(() => {
    const savedLang = localStorage.getItem(LANG_KEY);
    if (savedLang) {
      i18n.changeLanguage(savedLang === 'zh' ? 'zh-CN' : 'en-US');
    }
  }, []);

  const handleLangChange = (l: string) => {
    localStorage.setItem(LANG_KEY, l);
    i18n.changeLanguage(l === 'zh' ? 'zh-CN' : 'en-US');
  };

  const handleLoginSuccess = () => {
    setUserMode('admin');
    setShowLoginModal(false);
    message.success(t('auth.loggedIn'));
  };

  const logout = async () => {
    try {
      await axios.post('/api/logout');
      setUserMode('guest');
      message.success(t('auth.loggedOut'));
    } catch {
      message.error(t('auth.logoutFailed'));
    }
    setMenuOpen(false);
  };

  const handleBackClick = () => {
    // Just navigate back.  OnlyOffice will auto-save on editor destroy
    // (triggered by component unmount) ONLY if the document was actually edited.
    // No need to force-save — that was causing false "last edited" timestamps
    // for files that were merely opened without any changes.
    navigate('/');
  };

  const isEditorPage = location.pathname.startsWith('/editor/');

  const themeIcon = theme === 'dark' ? <MoonOutlined /> : <SunOutlined />;

  const setTheme = (pref: string) => {
    setThemePref(pref);
    localStorage.setItem('theme', pref);
  };

  const languageMenuItems = [
    { key: 'zh', label: '简体中文', onClick: () => handleLangChange('zh') },
    { key: 'en', label: 'English', onClick: () => handleLangChange('en') },
  ];

  const themeMenuItems = [
    { key: 'light', label: t('theme.light'), icon: <SunOutlined />, onClick: () => setTheme('light') },
    { key: 'dark', label: t('theme.dark'), icon: <MoonOutlined />, onClick: () => setTheme('dark') },
    { key: 'system', label: t('theme.system'), icon: <DesktopOutlined />, onClick: () => setTheme('system') },
  ];

  const userMenuItems = [
    userMode !== 'admin'
      ? { key: 'login', label: t('auth.login'), icon: <UserOutlined />, onClick: () => { setMenuOpen(false); setShowLoginModal(true); } }
      : { key: 'logout', label: t('auth.logout'), icon: <UserOutlined />, onClick: logout },
  ];

  return (
    <div className="app-shell">
      <nav className="app-topbar">
        {isEditorPage ? (
          <button className="glass-icon-btn back-btn" onClick={handleBackClick} aria-label={t('Back')}>
            <ArrowLeftOutlined /> <span className="back-label">{t('Back')}</span>
          </button>
        ) : (
          <div className="brand-text" onClick={() => navigate('/')}>
            {t('OnlyOffice')} <span>{t('File Panel')}</span>
          </div>
        )}
        <div className="topbar-controls">
          {!isEditorPage && (
            <Dropdown menu={{ items: languageMenuItems }} placement="bottomRight">
              <button className="glass-icon-btn" title={t('Language')} aria-label={t('Language')}>
                <GlobalOutlined />
              </button>
            </Dropdown>
          )}
          <Dropdown menu={{ items: themeMenuItems }} placement="bottomRight">
            <button className="glass-icon-btn" title={t('Theme')} aria-label={t('Theme')}>
              {themeIcon}
            </button>
          </Dropdown>
          <Dropdown menu={{ items: userMenuItems }} placement="bottomRight" open={menuOpen} onOpenChange={setMenuOpen}>
            <button className={`glass-icon-btn${userMode === 'admin' ? ' logged-in' : ''}`} title={t('Account')} aria-label={t('Account')}>
              <UserOutlined />
            </button>
          </Dropdown>
        </div>
      </nav>

      <main className="app-main">
        <Outlet context={{ isAdminLoggedIn: userMode === 'admin', loading }} />
      </main>

      {!isEditorPage && (
        <footer className="app-footer">
          {t('OnlyOffice File Panel')} v{pkg.version} &copy;{new Date().getFullYear()} Created by TonyBlu
        </footer>
      )}

      {showLoginModal && (
        <LoginModal onClose={() => setShowLoginModal(false)} onLogin={handleLoginSuccess} />
      )}
    </div>
  );
}
