import React, { useState } from 'react';
import { Modal, Form, Input, Button, App } from 'antd'; // Import App from antd
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const LoginPage = ({ visible, onCancel, onLoginSuccess }) => {
  const [form] = Form.useForm();
  const { t } = useTranslation();
  const { message } = App.useApp(); // Use App.useApp() to get context-aware message

  const handleFinish = async (values) => {
    try {
      const response = await axios.post('/api/login', { password: values.password });
      if (response.data && response.data.ok) {
        message.success(t('Login successful'));
        form.resetFields();
        onLoginSuccess && onLoginSuccess();
      } else {
        message.error(t('Login failed'));
      }
    } catch (error) {
      message.error(t('Login failed'));
    }
  };

  const handleCancel = () => {
    form.resetFields();
    onCancel && onCancel();
  };

  return (
    <Modal
      title={t('Admin Login')}
      open={visible}
      onCancel={handleCancel}
      footer={null}
    >
      <Form
        form={form}
        name="login"
        onFinish={handleFinish}
        initialValues={{ remember: true }}
      >
        <Form.Item
          name="password"
          rules={[{ required: true, message: t('Please input your password!') }]}>
          <Input.Password placeholder={t('Password')} />
        </Form.Item>

        <Form.Item>
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
            <Button onClick={handleCancel}>
              {t('Cancel')}
            </Button>
            <Button type="primary" htmlType="submit">
              {t('Login')}
            </Button>
          </div>
        </Form.Item>
      </Form>
    </Modal>
  );
};

export default LoginPage;
