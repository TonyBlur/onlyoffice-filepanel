import React, { useState, useRef } from 'react';
import { Modal, Button, App } from 'antd';
import { EyeOutlined, EyeInvisibleOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const LoginPage = ({ visible, onCancel, onLoginSuccess }) => {
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const inputRef = useRef(null);
  const { t } = useTranslation();
  const { message } = App.useApp();

  const handleLogin = async () => {
    if (!password.trim()) {
      message.error(t('Please input your password!'));
      inputRef.current?.focus();
      return;
    }
    try {
      const response = await axios.post('/api/login', { password: password.trim() });
      if (response.data && response.data.ok) {
        message.success(t('Login successful'));
        setPassword('');
        setShowPassword(false);
        onLoginSuccess && onLoginSuccess();
      } else {
        message.error(t('Login failed'));
      }
    } catch (error) {
      message.error(t('Login failed'));
    }
  };

  const handleCancel = () => {
    setPassword('');
    setShowPassword(false);
    onCancel && onCancel();
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      handleLogin();
    }
  };

  return (
    <Modal
      title={t('Admin Login')}
      open={visible}
      onCancel={handleCancel}
      footer={null}
    >
      <div className="login-form">
        <div className="login-input-wrap">
          <input
            ref={inputRef}
            type={showPassword ? 'text' : 'password'}
            className="login-input"
            placeholder={t('Password')}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={handleKeyDown}
          />
          <button
            type="button"
            className="login-eye-btn"
            onClick={() => setShowPassword(!showPassword)}
            tabIndex={-1}
          >
            {showPassword ? <EyeOutlined /> : <EyeInvisibleOutlined />}
          </button>
        </div>
        <div className="login-actions">
          <Button onClick={handleCancel}>
            {t('Cancel')}
          </Button>
          <Button type="primary" onClick={handleLogin}>
            {t('Login')}
          </Button>
        </div>
      </div>
    </Modal>
  );
};

export default LoginPage;
