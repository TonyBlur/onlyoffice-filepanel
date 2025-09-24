import React, { useState, useEffect } from 'react';
import { Button, Table, Modal, Input, Upload, message, Space, Popconfirm, Select } from 'antd';
import { UploadOutlined, PlusOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const HomePage = ({ isAdminLoggedIn }) => {
  const [files, setFiles] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileFormat, setNewFileFormat] = useState('docx');
  const { t } = useTranslation();

  useEffect(() => {
    fetchFiles();
  }, []);

  const fetchFiles = async () => {
    try {
      const response = await axios.get('/api/files');
      setFiles(response.data);
    } catch (error) {
      message.error(t('Failed to fetch files'));
    }
  };

  const showModal = () => {
    setIsModalVisible(true);
  };

  const handleOk = async () => {
    try {
      // Ensure filename has selected extension
      let finalName = newFileName.trim();
      if (!finalName) {
        message.error(t('Please enter a file name'));
        return;
      }
      const ext = newFileFormat.startsWith('.') ? newFileFormat : `.${newFileFormat}`;
      if (!finalName.toLowerCase().endsWith(ext)) {
        finalName = `${finalName}${ext}`;
      }

      await axios.post('/api/files/create', { name: finalName, format: newFileFormat });
      setIsModalVisible(false);
      setNewFileName('');
      setNewFileFormat('docx');
      fetchFiles();
      message.success(t('File created successfully'));
    } catch (error) {
      message.error(t('Failed to create file'));
    }
  };

  const handleCancel = () => {
    setIsModalVisible(false);
  };

  const handleUpload = async (options) => {
    const { file, onSuccess, onError } = options;
    const formData = new FormData();
    formData.append('file', file);

    try {
      const resp = await axios.post('/api/files/upload', formData, {
        headers: {
          'Content-Type': 'multipart/form-data',
        },
      });
      fetchFiles();
      // Notify Upload component of success with server response
      onSuccess && onSuccess(resp.data);
      message.success(`${file.name} ${t('File uploaded successfully')}`);
    } catch (error) {
      onError && onError(error);
      message.error(`${file.name} ${t('File upload failed')}`);
    }
  };

  const columns = [
    {
      title: t('File Name'),
      dataIndex: 'name',
      key: 'name',
      render: (text) => <a href={`/editor/${text}`}>{text}</a>,
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (text, record) => (
        <Space size="middle">
          <Button type="primary" href={`/editor/${record.name}`}>
            {t('Edit')}
          </Button>
          {isAdminLoggedIn && (
            <Popconfirm
              title={t('Are you sure to delete {{name}}?', { name: record.name })}
              onConfirm={() => handleDelete(record.name)}
              okText={t('Yes')}
              cancelText={t('No')}
            >
              <Button danger>
                {t('Delete')}
              </Button>
            </Popconfirm>
          )}
        </Space>
      ),
    },
  ];

  const handleDelete = async (fileName) => {
    try {
      await axios.delete(`/api/files/${fileName}`);
      fetchFiles();
      message.success(t('File deleted successfully'));
    } catch (error) {
      message.error(t('Failed to delete file'));
    }
  };

  return (
    <div>
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={showModal}>
          {t('New File')}
        </Button>
        <Upload customRequest={handleUpload} showUploadList={false}>
          <Button icon={<UploadOutlined />}>{t('Upload File')}</Button>
        </Upload>
      </Space>
      <Table columns={columns} dataSource={files} rowKey="name" />
      <Modal
        title={t('Create New File')}
        open={isModalVisible}
        onOk={handleOk}
        onCancel={handleCancel}
      >
        <Input
          placeholder={t('Enter file name (without extension)')}
          value={newFileName}
          onChange={(e) => setNewFileName(e.target.value)}
        />
        <div style={{ marginTop: 12 }}>
          <span style={{ marginRight: 8 }}>{t('Format')}:</span>
          <Select value={newFileFormat} onChange={setNewFileFormat} style={{ width: 160 }}>
            <Select.Option value="docx">DOCX (.docx)</Select.Option>
            <Select.Option value="pptx">PPTX (.pptx)</Select.Option>
            <Select.Option value="xlsx">XLSX (.xlsx)</Select.Option>
            <Select.Option value="pdf">PDF (.pdf)</Select.Option>
          </Select>
        </div>
      </Modal>
    </div>
  );
};

export default HomePage;
