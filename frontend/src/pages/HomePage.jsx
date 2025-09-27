import React, { useState, useEffect, useRef } from 'react';
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

  // use contextual message API to avoid static message warning
  const [messageApi, contextHolder] = message.useMessage();

  // pagination state
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const tableWrapperRef = useRef(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  useEffect(() => {
    fetchFiles(page, perPage);
    // NOTE: intentionally not listing fetchFiles in deps to control when it runs
  }, [page, perPage]);

  // calculate perPage based on available viewport height
  const resizeTimerRef = useRef(null);
  const calculatePerPage = (force = false) => {
    const wrapper = tableWrapperRef.current;
    if (!wrapper) return;
    const tableTop = wrapper.getBoundingClientRect().top;
    const availableHeight = window.innerHeight - tableTop;

    // try to measure header/pagination heights from DOM, with sensible fallbacks
    const headerEl = wrapper.querySelector('.ant-table-thead');
    const paginationEl = wrapper.querySelector('.ant-pagination');
    const headerHeight = headerEl ? headerEl.getBoundingClientRect().height : 48;
    const paginationHeight = paginationEl ? paginationEl.getBoundingClientRect().height : 64;

    // estimate a single row height (including row padding). tweak if needed.
    const estimatedRowHeight = 56;

    const usable = Math.max(200, availableHeight - headerHeight - paginationHeight - 24);
    // subtract 2 to avoid forcing user to scroll the page for controls/spacing
    const computed = Math.floor(usable / estimatedRowHeight);
    const newPerPage = Math.max(3, Math.max(0, computed - 2));

    // only update if changed to avoid re-renders
    if (newPerPage !== perPage || force) {
      setPerPage(newPerPage);
      setPage(1); // reset to first page when page size changes
    }
  };

  useEffect(() => {
    // initial calculation and on resize
    // run after next paint to allow table DOM to render
    const runOnce = () => requestAnimationFrame(() => calculatePerPage(true));
    runOnce();
    const onResize = () => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => calculatePerPage(), 120);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
    };
  }, []);

  // Recalculate perPage when files change (table height may have changed)
  useEffect(() => {
    // schedule after paint to allow table to update
    const id = requestAnimationFrame(() => calculatePerPage());
    return () => cancelAnimationFrame(id);
  }, [files]);

  const fetchFiles = async (p = 1, pp = perPage) => {
    try {
      setLoading(true);
      const resp = await axios.get(`/api/files?page=${p}&perPage=${pp}`);
      // backend may return either array (legacy) or { items, total, page, perPage }
      const data = resp.data;
      if (Array.isArray(data)) {
        setFiles(data);
        setTotal(data.length);
      } else if (data && data.items) {
        setFiles(data.items);
        setTotal(typeof data.total === 'number' ? data.total : data.items.length);
        // sync local pagination if backend provided
        if (typeof data.page === 'number' && data.page !== page) setPage(data.page);
        if (typeof data.perPage === 'number' && data.perPage !== perPage) setPerPage(data.perPage);
      } else {
        // fallback
        setFiles([]);
        setTotal(0);
      }
    } catch (error) {
      messageApi.error(t('Failed to fetch files'));
    } finally {
      setLoading(false);
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
        messageApi.error(t('Please enter a file name'));
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
      // refresh current page
      fetchFiles(page, perPage);
      messageApi.success(t('File created successfully'));
    } catch (error) {
      messageApi.error(t('Failed to create file'));
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
      // after upload, refresh first page to show new file
      setPage(1);
      fetchFiles(1, perPage);
      onSuccess && onSuccess(resp.data);
      messageApi.success(`${file.name} ${t('File uploaded successfully')}`);
    } catch (error) {
      onError && onError(error);
      messageApi.error(`${file.name} ${t('File upload failed')}`);
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
      // refresh current page
      fetchFiles(page, perPage);
      messageApi.success(t('File deleted successfully'));
    } catch (error) {
      messageApi.error(t('Failed to delete file'));
    }
  };

  const handleBulkDelete = async () => {
    if (!selectedRowKeys || selectedRowKeys.length === 0) return;
    try {
      setLoading(true);
      // delete in parallel
      await Promise.all(
        selectedRowKeys.map((name) => axios.delete(`/api/files/${encodeURIComponent(name)}`))
      );
      // refresh and clear selection
      setSelectedRowKeys([]);
      setPage(1);
      fetchFiles(1, perPage);
      messageApi.success(t('Selected files deleted'));
    } catch (error) {
      messageApi.error(t('Failed to delete selected files'));
    } finally {
      setLoading(false);
    }
  };

  const onTableChange = (pagination) => {
    const { current, pageSize } = pagination;
    if (current !== page) setPage(current);
    if (pageSize !== perPage) setPerPage(pageSize);
    // fetchFiles will be triggered by useEffect on state change
  };

  const rowSelection = isAdminLoggedIn
    ? {
        selectedRowKeys,
        onChange: (selectedKeys) => setSelectedRowKeys(selectedKeys),
      }
    : undefined;

  return (
    <div>
      {contextHolder}
      <Space style={{ marginBottom: 16 }}>
        <Button type="primary" icon={<PlusOutlined />} onClick={showModal}>
          {t('New File')}
        </Button>
        <Upload customRequest={handleUpload} showUploadList={false}>
          <Button icon={<UploadOutlined />}>{t('Upload File')}</Button>
        </Upload>
        {isAdminLoggedIn && (
          <Popconfirm
            title={t('Are you sure to delete selected files?')}
            onConfirm={handleBulkDelete}
            okText={t('Yes')}
            cancelText={t('No')}
            disabled={!selectedRowKeys || selectedRowKeys.length === 0}
          >
            <Button danger disabled={!selectedRowKeys || selectedRowKeys.length === 0}>
              {t('Delete Selected')}
            </Button>
          </Popconfirm>
        )}
      </Space>
      <div ref={tableWrapperRef}>
        <Table
          columns={columns}
          dataSource={files}
          rowKey="name"
          loading={loading}
          pagination={{ current: page, pageSize: perPage, total }}
          rowSelection={rowSelection}
          onChange={onTableChange}
        />
      </div>
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
