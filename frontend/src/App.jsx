import React, { useState, useEffect } from 'react';
import { Routes, Route, useLocation, useNavigate } from 'react-router-dom'; // Remove BrowserRouter
import { Layout, Space, Button, Dropdown, Menu } from 'antd';
import { GlobalToken, ThemeProvider, createStyles, useTheme } from 'antd-style';
import { MoonOutlined, SunOutlined, GlobalOutlined, UserOutlined, ArrowLeftOutlined } from '@ant-design/icons'; // Import ArrowLeftOutlined
import { useTranslation } from 'react-i18next';
import EditorPage from './pages/EditorPage';
import HomePage from './pages/HomePage';
import LoginPage from './components/LoginPage';
import './styles.css';

const { Header, Content, Footer } = Layout;

const useStyles = createStyles(({ token }) => ({
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: '0 20px',
    backgroundColor: 'var(--card)',
  },
  brand: {
    fontSize: 20,
    fontWeight: 'bold',
    color: token.colorPrimary,
  },
  content: {
    padding: 20,
    minHeight: 'calc(100vh - 64px)', // Adjust minHeight for full editor space (Header is 64px)
    display: 'flex',
    flexDirection: 'column',
  },
  fullHeightContent: {
    padding: 0, // Remove padding for full screen editor
    minHeight: 'calc(100vh - 64px)', // Adjust minHeight for full editor space
    display: 'flex',
    flexDirection: 'column',
  },
  footer: {
    textAlign: 'center',
    color: token.colorTextSecondary,
  },
}));

function App() {
  const { styles } = useStyles();
  const theme = useTheme();
  const { i18n, t } = useTranslation();
  const [isLoginModalVisible, setIsLoginModalVisible] = useState(false);
  const [isAdminLoggedIn, setIsAdminLoggedIn] = useState(false);
  const [currentTheme, setCurrentTheme] = useState(localStorage.getItem('theme') || 'light');
  const location = useLocation(); // Initialize useLocation
  const navigate = useNavigate(); // Initialize useNavigate

  const isEditorPage = location.pathname.startsWith('/editor');

  useEffect(() => {
    const loggedIn = localStorage.getItem('isAdminLoggedIn') === 'true';
    setIsAdminLoggedIn(loggedIn);
    document.documentElement.setAttribute('data-theme', currentTheme);
  }, [currentTheme]);

  const handleLanguageChange = ({ key }) => {
    i18n.changeLanguage(key);
  };

  const handleThemeChange = (newTheme) => {
    setCurrentTheme(newTheme);
    localStorage.setItem('theme', newTheme);
  };

  const showLoginModal = () => {
    setIsLoginModalVisible(true);
  };

  const handleLoginSuccess = () => {
    setIsAdminLoggedIn(true);
    setIsLoginModalVisible(false);
    localStorage.setItem('isAdminLoggedIn', 'true');
  };

  const handleLogout = () => {
    setIsAdminLoggedIn(false);
    localStorage.removeItem('isAdminLoggedIn');
  };

  const handleCancelLogin = () => {
    setIsLoginModalVisible(false);
  };

  const handleBack = () => {
    navigate('/');
  };

  const languageMenu = {
    items: [
      { key: 'zh-CN', label: t('简体中文'), onClick: handleLanguageChange },
      { key: 'en-US', label: t('English'), onClick: handleLanguageChange },
    ],
  };

  const themeMenu = {
    items: [
      { key: 'light', label: t('Light Mode'), onClick: () => handleThemeChange('light') },
      { key: 'dark', label: t('Dark Mode'), onClick: () => handleThemeChange('dark') },
      { key: 'system', label: t('System Mode'), onClick: () => handleThemeChange('system') },
    ],
  };

  const adminMenu = {
    items: isAdminLoggedIn
      ? [{ key: 'logout', label: t('Logout'), onClick: handleLogout }]
      : [{ key: 'login', label: t('Admin Login'), onClick: showLoginModal }],
  };

  return (
    <ThemeProvider appearance={currentTheme === 'system' ? (window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light') : currentTheme}>
        <Layout style={{ minHeight: '100vh' }}>
          <Header className={styles.header}>
            {isEditorPage ? (
              <Button icon={<ArrowLeftOutlined />} onClick={handleBack}>{t('返回')}</Button>
            ) : (
              <div className={styles.brand}>{t('OnlyOffice File Panel')}</div>
            )}
            <Space size="middle">
              <Dropdown menu={languageMenu} placement="bottomRight">
                <Button icon={<GlobalOutlined />} />
              </Dropdown>
              <Dropdown menu={themeMenu} placement="bottomRight">
                <Button icon={currentTheme === 'dark' ? <MoonOutlined /> : <SunOutlined />} />
              </Dropdown>
              <Dropdown menu={adminMenu} placement="bottomRight">
                <Button icon={<UserOutlined />} type={isAdminLoggedIn ? "primary" : "default"} />
              </Dropdown>
            </Space>
          </Header>
          <Content className={isEditorPage ? styles.fullHeightContent : styles.content}>
            <Routes>
              <Route path="/" element={<HomePage isAdminLoggedIn={isAdminLoggedIn} />} />
              <Route path="/editor/:name" element={<EditorPage />} />
            </Routes>
          </Content>
          {!isEditorPage && (
            <Footer className={styles.footer}>
              {t('OnlyOffice File Panel')} ©2025 Created by Your Name
            </Footer>
          )}
        </Layout>
        <LoginPage
          visible={isLoginModalVisible}
          onCancel={handleCancelLogin}
          onLoginSuccess={handleLoginSuccess}
        />
    </ThemeProvider>
  );
}

export default App;