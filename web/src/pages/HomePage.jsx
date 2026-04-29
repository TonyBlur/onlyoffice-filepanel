import React, { useState, useEffect, useRef, useMemo } from 'react';
import { Button, Table, Modal, Input, Upload, message, Space, Popconfirm, Select, Progress, Card, Dropdown } from 'antd';
import { UploadOutlined, PlusOutlined, FileTextOutlined, FilePdfOutlined, FileExcelOutlined, FilePptOutlined, FileOutlined, SearchOutlined, CloudUploadOutlined, EditOutlined, DeleteOutlined, FormOutlined, MinusCircleOutlined, CopyOutlined, DownloadOutlined, MoreOutlined, SortAscendingOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useTranslation } from 'react-i18next';

const HomePage = ({ isAdminLoggedIn }) => {
  const [files, setFiles] = useState([]);
  const [isModalVisible, setIsModalVisible] = useState(false);
  const [newFileName, setNewFileName] = useState('');
  const [newFileFormat, setNewFileFormat] = useState('docx');
  const [searchQuery, setSearchQuery] = useState('');
  const [typeFilter, setTypeFilter] = useState('all');
  const [isRenameModalVisible, setIsRenameModalVisible] = useState(false);
  const [renameTarget, setRenameTarget] = useState('');
  const [renameNewName, setRenameNewName] = useState('');
  const [sortBy, setSortBy] = useState('mtime');
  const [sortOrder, setSortOrder] = useState('desc');
  const [isExtWarningVisible, setIsExtWarningVisible] = useState(false);
  const [windowWidth, setWindowWidth] = useState(typeof window !== 'undefined' ? window.innerWidth : 1200);
  const { t } = useTranslation();

  // use contextual message API to avoid static message warning
  const [messageApi, contextHolder] = message.useMessage();

  // Upload tasks state
  const [uploadTasks, setUploadTasks] = useState([]);
  const uploadTasksRef = useRef([]);
  // persistent UI toggle
  const [isUploadListVisible, setIsUploadListVisible] = useState(false);

  const updateUploadTask = (uid, updates) => {
    const nextTasks = uploadTasksRef.current.map(t => 
      t.uid === uid ? { ...t, ...updates } : t
    );
    uploadTasksRef.current = nextTasks;
    setUploadTasks([...nextTasks]);
  };

  const addUploadTask = (task) => {
    uploadTasksRef.current = [...uploadTasksRef.current, task];
    setUploadTasks([...uploadTasksRef.current]);
    setIsUploadListVisible(true);
  };

  // Drag and drop state
  const [isDragging, setIsDragging] = useState(false);

  // Placeholder starter for queued uploads. Implement queue processing later.
  const maybeStartNext = () => {
    // No-op for now to avoid ReferenceError; when upload queue is implemented
    // this should start the next queued item if no active upload.
    return;
  };

  // pagination state
  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(5);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef(null);
  const tableWrapperRef = useRef(null);
  const [selectedRowKeys, setSelectedRowKeys] = useState([]);

  // calculate perPage and row height based on available viewport height
  const resizeTimerRef = useRef(null);
  const lastCalculatedPerPageRef = useRef(null);
  const fetchTimerRef = useRef();
  
  const calculatePerPage = (force = false) => {
    const container = containerRef.current;
    const wrapper = tableWrapperRef.current;
    if (!container || !wrapper) return;

    // Get the application header (top bar) height
    const appHeaderEl = document.querySelector('header') || document.querySelector('.ant-layout-header');
    const appHeaderHeight = appHeaderEl ? appHeaderEl.getBoundingClientRect().height : 56;

    // Get actual footer height from DOM (may be outside container)
    let footerHeight = 0;
    const footerEl = document.querySelector('footer') || document.querySelector('.ant-layout-footer');
    if (footerEl) {
      const rect = footerEl.getBoundingClientRect();
      footerHeight = rect.height;
    }

    // Table header and pagination heights (measured if present)
    const tableHeaderEl = wrapper.querySelector('.ant-table-thead');
    const paginationEl = wrapper.querySelector('.ant-pagination');
    const tableHeaderHeight = tableHeaderEl ? tableHeaderEl.getBoundingClientRect().height : 0;
    const paginationHeight = paginationEl ? paginationEl.getBoundingClientRect().height : 0;

    // Calculate available space more carefully
    // Container top is from Content element top (which includes header and any padding above)
    const containerTop = container.getBoundingClientRect().top;
    const containerBottom = container.getBoundingClientRect().bottom;
    const containerHeight = containerBottom - containerTop;
    
    // Total viewport height minus footer (which is outside the content container)
    const viewportHeight = window.innerHeight - footerHeight;
    
    // Space left for content after header (which is above container)
    const spaceForContent = viewportHeight - appHeaderHeight;
    
    // Wrapper is inside container, measure its own elements
    // Space for rows = spaceForContent - (container's internal layout height excluding table)
    // We need to account for container padding and button row height
    
    // Get all Space containers (buttons) height
    // Only count the direct Space child of container, not nested ones
    const buttonsEls = container.querySelectorAll(':scope > .ant-space');
    let buttonsHeight = 0;
    buttonsEls.forEach(el => {
      const rect = el.getBoundingClientRect();
      if (rect.height > 0) buttonsHeight += rect.height;
    });
    
    // If no direct Space found, try to find any Space
    if (buttonsHeight === 0) {
      const anySpace = container.querySelector('.ant-space');
      if (anySpace) {
        const rect = anySpace.getBoundingClientRect();
        buttonsHeight = rect.height;
      }
    }
    
    // Add extra margin for buttons container margins/spacing
    buttonsHeight += 16;

    // Total space available for the table wrapper
    const wrapperSpaceHeight = spaceForContent - buttonsHeight;
    
    // Inside wrapper: available for rows = wrapperHeight - table header - pagination
    const availableForRows = wrapperSpaceHeight - tableHeaderHeight - paginationHeight;

    // Calculate appropriate number of rows
    const rowHeight = 56; // fixed row height
    let rows = Math.floor(Math.max(0, availableForRows) / rowHeight) || 1;
    
    // Buffer for measurement errors and chrome (Ant Table padding/borders)
    const measurementBuffer = 24;

    // Calculate needed height with current row count
    let neededHeight = tableHeaderHeight + rows * rowHeight + paginationHeight + measurementBuffer;

    // Reduce rows if needed to fit without scroll
    while (neededHeight > wrapperSpaceHeight && rows > 1) {
      rows -= 1;
      neededHeight = tableHeaderHeight + rows * rowHeight + paginationHeight + measurementBuffer;
    }

    // Ensure at least one row
    if (rows < 1) rows = 1;

    // Apply safety buffer: show fewer rows than calculated to ensure no scroll
    // For example: if calculated 8, show 6; if calculated 6, show 5; if calculated 5, show 4
    let newPerPage = rows;
    if (rows >= 5) {
      // Reduce rows by approximately 25% (or at least by 1-2 rows)
      const safetyReduction = Math.max(1, Math.ceil(rows * 0.25)); // 25% reduction
      newPerPage = Math.max(4, rows - safetyReduction); // But keep at least 4 rows
    }

    // only update if changed to avoid re-renders
    if (newPerPage !== perPage || force) {
      // prevent rapid loops: only act if this perPage wasn't just applied
      if (lastCalculatedPerPageRef.current !== newPerPage) {
        lastCalculatedPerPageRef.current = newPerPage;
        setPerPage(newPerPage);
        setPage(1);
        // DO NOT call fetchFiles here — let separate useEffect(perPage) handle it to avoid loops
      }
    }

    // set wrapper to use all available space (flex will handle the layout)
    try {
      if (wrapper && wrapper.style) {
        wrapper.style.flex = '1 1 auto';
        wrapper.style.minHeight = '0';
        wrapper.style.display = 'flex';
        wrapper.style.flexDirection = 'column';
      }
    } catch (e) {
      // ignore
    }
  };

  useEffect(() => {
    // initial calculation and on resize
    // Use multiple frames to ensure DOM is fully ready
    const runOnce = () => {
      let frameCount = 0;
      const doCalc = () => {
        calculatePerPage(true);
        frameCount++;
        // Re-run calculation a few times to converge to correct values
        // This handles cases where Table header/pagination render async
        if (frameCount < 3) {
          requestAnimationFrame(doCalc);
        }
      };
      requestAnimationFrame(doCalc);
    };
    runOnce();
    
    const onResize = () => {
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      resizeTimerRef.current = setTimeout(() => calculatePerPage(), 120);
    };
    window.addEventListener('resize', onResize);
    window.addEventListener('orientationchange', onResize);
    
    // Only prevent overflow on the container, not the entire document
    const prevContainerOverflow = containerRef.current?.style.overflow;
    if (containerRef.current) {
      containerRef.current.style.overflow = 'hidden';
    }

    // Observe mutations inside the table wrapper so we re-run calculation when pagination/header mount
    let mo;
    try {
      if (window.MutationObserver && tableWrapperRef.current) {
        mo = new MutationObserver(() => {
          // DISABLED: This causes excessive recalculations and flickering
          // setTimeout(() => calculatePerPage(true), 60);
        });
        mo.observe(tableWrapperRef.current, { childList: true, subtree: true });
      }
    } catch (e) {
      // ignore
    }
    
    return () => {
      window.removeEventListener('resize', onResize);
      window.removeEventListener('orientationchange', onResize);
      if (resizeTimerRef.current) clearTimeout(resizeTimerRef.current);
      // restore overflow
      if (containerRef.current) {
        containerRef.current.style.overflow = prevContainerOverflow || '';
      }
      if (mo) mo.disconnect();
    };
  }, []);

  // Fetch files when page or perPage changes (separate from calculatePerPage to avoid loops)
  useEffect(() => {
    // Only fetch if calculatePerPage has run at least once (indicated by non-null lastCalculatedPerPageRef)
    // This ensures we use the calculated perPage value, not the initial default
    if (lastCalculatedPerPageRef.current !== null) {
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
      fetchTimerRef.current = setTimeout(() => {
        fetchFiles(page, perPage);
      }, 20);
    }
    // robust window drag-and-drop event handling
    let dragCounter = 0;
    const onDragEnter = (e) => {
      e.preventDefault();
      if (e.dataTransfer.types.includes('Files')) {
        dragCounter++;
        setIsDragging(true);
      }
    };
    const onDragOver = (e) => {
      e.preventDefault();
    };
    const onDragLeave = (e) => {
      e.preventDefault();
      if (e.dataTransfer.types.includes('Files')) {
        dragCounter--;
        if (dragCounter === 0) {
          setIsDragging(false);
        }
      }
    };
    const onDrop = (e) => {
      e.preventDefault();
      dragCounter = 0;
      setIsDragging(false);
      if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
        Array.from(e.dataTransfer.files).forEach(file => {
          handleUpload({ file });
        });
      }
    };

    window.addEventListener('dragenter', onDragEnter);
    window.addEventListener('dragover', onDragOver);
    window.addEventListener('dragleave', onDragLeave);
    window.addEventListener('drop', onDrop);

    return () => {
      if (fetchTimerRef.current) clearTimeout(fetchTimerRef.current);
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, [page, perPage, searchQuery, sortBy, sortOrder]);

  // Track window width for responsive action buttons
  useEffect(() => {
    const handleResize = () => setWindowWidth(window.innerWidth);
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);

  // Ensure files are loaded on first mount (after calculatePerPage completes)
  const firstLoadRef = useRef(false);
  useEffect(() => {
    // After mount, wait a bit for calculatePerPage to complete, then load files if not already loaded
    if (!firstLoadRef.current && files.length === 0 && lastCalculatedPerPageRef.current !== null) {
      firstLoadRef.current = true;
      fetchFiles(1, perPage);
    }
  }, [files.length, perPage]);

  const fetchFiles = async (p = 1, pp = perPage, q = searchQuery) => {
    try {
      setLoading(true);
      // Use the explicit pp parameter, not the state variable
      const actualPerPage = typeof pp === 'number' ? pp : perPage;
      const resp = await axios.get(`/api/files?page=${p}&perPage=${actualPerPage}&search=${encodeURIComponent(q)}&sortBy=${sortBy}&sortOrder=${sortOrder}`);
      // backend may return either array (legacy) or { items, total, page, perPage }
      const data = resp.data;
      if (Array.isArray(data)) {
        setFiles(data);
        setTotal(data.length);
      } else if (data && data.items) {
        setFiles(data.items);
        setTotal(typeof data.total === 'number' ? data.total : data.items.length);
        // DO NOT sync backend perPage back - we control perPage locally from calculatePerPage
      } else {
        // fallback
        setFiles([]);
        setTotal(0);
      }
      // DO NOT call calculatePerPage here - it causes infinite loops
      // Files update will trigger recalculation via useEffect([files])
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
      fetchFiles(page, perPage, searchQuery);
      messageApi.success(t('File created successfully'));
    } catch (error) {
      messageApi.error(t('Failed to create file'));
    }
  };

  const handleCancel = () => {
    setIsModalVisible(false);
  };

  const uploadChunks = async (taskUid, file, startIndex = 0, onSuccess, onError) => {
    const CHUNK_SIZE = 1024 * 1024 * 2; // 2MB per chunk
    const total = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
    updateUploadTask(taskUid, { totalChunks: total, currentChunkIndex: startIndex });

    try {
      for (let idx = startIndex; idx < total; idx++) {
        const task = uploadTasksRef.current.find(t => t.uid === taskUid);
        if (task && task.isPaused) break;
        if (!task) break; // task was removed
        
        updateUploadTask(taskUid, { currentChunkIndex: idx });

        const start = idx * CHUNK_SIZE;
        const end = Math.min(start + CHUNK_SIZE, file.size);
        const blob = file.slice(start, end);

        const fd = new FormData();
        fd.append('filename', file.name);
        fd.append('index', String(idx));
        fd.append('totalChunks', String(total));
        fd.append('chunk', blob, file.name);

        const ac = new AbortController();
        updateUploadTask(taskUid, { abortCtrl: ac });

        await axios.post('/api/files/upload-chunk', fd, {
          headers: { 'Content-Type': 'multipart/form-data' },
          signal: ac.signal,
          onUploadProgress: (ev) => {
            const prev = idx * CHUNK_SIZE;
            const loadedSoFar = prev + (ev.loaded || 0);
            const percent = Math.min(100, Math.round((loadedSoFar * 100) / file.size));
            updateUploadTask(taskUid, { progress: percent });
          }
        });

        const boundaryPercent = Math.min(100, Math.round(((idx + 1) * CHUNK_SIZE * 100) / file.size));
        updateUploadTask(taskUid, { progress: boundaryPercent });
      }

      const endTask = uploadTasksRef.current.find(t => t.uid === taskUid);
      if (endTask && endTask.isPaused) {
        return;
      }

      setPage(1);
      fetchFiles(1, perPage, searchQuery);
      onSuccess && onSuccess({ ok: true });
      messageApi.success(`${file.name} ${t('files.uploadSuccess')}`);
      updateUploadTask(taskUid, { status: 'success', progress: 100 });
      // Remove auto-hide logic to let it stay resident
    } catch (error) {
      const task = uploadTasksRef.current.find(t => t.uid === taskUid);
      if (task && task.isPaused) {
        return;
      }

      if (axios.isCancel && axios.isCancel(error)) {
        // typically means canceled by user, status updated elsewhere
      } else {
        messageApi.error(`${file.name} ${t('files.uploadFailed')}`);
        updateUploadTask(taskUid, { status: 'error' });
      }
      onError && onError(error);
    } finally {
      updateUploadTask(taskUid, { abortCtrl: null });
    }
  };

  const handleUpload = async (options) => {
    const { file, onSuccess, onError } = options;

    const SUPPORTED_FORMATS = ['doc', 'docx', 'odt', 'rtf', 'txt', 'xls', 'xlsx', 'ods', 'csv', 'ppt', 'pptx', 'odp', 'pdf'];
    const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2GB

    const fileExt = file.name.split('.').pop()?.toLowerCase();
    if (!fileExt || !SUPPORTED_FORMATS.includes(fileExt)) {
      messageApi.error(`${file.name} ${t('File format not supported. Supported formats: ')} ${SUPPORTED_FORMATS.join(', ')}`);
      onError && onError(new Error('Unsupported file format'));
      return;
    }
    if (file.size > MAX_FILE_SIZE) {
      messageApi.error(`${file.name} ${t('File size exceeds 2GB limit')}`);
      onError && onError(new Error('File size exceeds limit'));
      return;
    }

    // init task object
    const taskUid = Date.now().toString() + Math.floor(Math.random()*1000);
    const task = {
      uid: taskUid,
      file,
      name: file.name,
      progress: 0,
      status: 'uploading', // uploading, paused, error, success
      isPaused: false,
      currentChunkIndex: 0,
      totalChunks: 0,
      abortCtrl: null
    };
    addUploadTask(task);

    await uploadChunks(taskUid, file, 0, onSuccess, onError);
  };

  const pauseUpload = (uid) => {
    updateUploadTask(uid, { isPaused: true, status: 'paused' });
    const task = uploadTasksRef.current.find(t => t.uid === uid);
    if (task && task.abortCtrl) {
      task.abortCtrl.abort();
    }
  };

  const resumeUpload = (uid) => {
    updateUploadTask(uid, { isPaused: false, status: 'uploading' });
    const task = uploadTasksRef.current.find(t => t.uid === uid);
    if (task) {
      const resumeIndex = Math.max(0, task.currentChunkIndex);
      uploadChunks(uid, task.file, resumeIndex, null, null);
    }
  };

  const cancelUpload = async (uid) => {
    const task = uploadTasksRef.current.find(t => t.uid === uid);
    if (task) {
      if (task.abortCtrl) {
        try { task.abortCtrl.abort(); } catch(e) {}
      }
      try {
        await axios.post('/api/files/upload-chunk/cancel', { filename: task.name });
      } catch (e) {}
    }
    const remaining = uploadTasksRef.current.filter(t => t.uid !== uid);
    uploadTasksRef.current = remaining;
    setUploadTasks([...remaining]);
    messageApi.error(t('files.uploadFailed'));
    if (remaining.length === 0) {
      setIsUploadListVisible(false);
    }
  };

  const clearFinishedUploads = () => {
    const remaining = uploadTasksRef.current.filter(t => t.status !== 'success' && t.status !== 'error');
    uploadTasksRef.current = remaining;
    setUploadTasks([...remaining]);
    if (remaining.length === 0) {
      setIsUploadListVisible(false);
    }
  };

  const getFileType = (name = '') => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const docTypes = ['doc', 'docx', 'odt', 'rtf', 'txt'];
    const sheetTypes = ['xls', 'xlsx', 'ods', 'csv'];
    const slideTypes = ['ppt', 'pptx', 'odp'];
    if (ext === 'pdf') return 'pdf';
    if (sheetTypes.includes(ext)) return 'sheet';
    if (slideTypes.includes(ext)) return 'slide';
    if (docTypes.includes(ext)) return 'doc';
    return 'other';
  };

  const typeFilterCounts = useMemo(() => {
    const counts = { all: files.length, doc: 0, sheet: 0, slide: 0, pdf: 0, other: 0 };
    files.forEach(f => { counts[getFileType(f.name)]++; });
    return counts;
  }, [files]);

  const filteredFiles = useMemo(() => {
    if (typeFilter === 'all') return files;
    return files.filter(f => getFileType(f.name) === typeFilter);
  }, [files, typeFilter]);

  const getFileMeta = (name = '') => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    const docTypes = ['doc', 'docx', 'odt', 'rtf', 'txt'];
    const sheetTypes = ['xls', 'xlsx', 'ods', 'csv'];
    const slideTypes = ['ppt', 'pptx', 'odp'];
    if (ext === 'pdf') return { ext: 'PDF', type: 'pdf', icon: <FilePdfOutlined /> };
    if (sheetTypes.includes(ext)) return { ext: ext.toUpperCase(), type: 'sheet', icon: <FileExcelOutlined /> };
    if (slideTypes.includes(ext)) return { ext: ext.toUpperCase(), type: 'slide', icon: <FilePptOutlined /> };
    if (docTypes.includes(ext)) return { ext: ext.toUpperCase(), type: 'doc', icon: <FileTextOutlined /> };
    return { ext: ext ? ext.toUpperCase() : 'FILE', type: 'file', icon: <FileOutlined /> };
  };

  const formatTimeAgo = (isoString) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now - date;
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return t('Just now');
    if (diffMin < 60) return t('{{min}} minutes ago', { min: diffMin });
    if (diffHour < 24) return t('{{hour}} hours ago', { hour: diffHour });
    if (diffDay < 7) return t('{{day}} days ago', { day: diffDay });
    return date.toLocaleDateString();
  };

  const columns = [
    {
      title: t('File Name'),
      dataIndex: 'name',
      key: 'name',
      render: (text, record) => {
        const meta = getFileMeta(text);
        return (
          <a className="file-name-link" href={`/editor/${text}`} title={text}>
            <span className={`file-type-icon ${meta.type}`}>{meta.icon}</span>
            <span className="file-title-block">
              <span className="file-title">{text}</span>
              <span className="file-subtitle">{meta.ext} · {formatTimeAgo(record.mtime)}</span>
            </span>
          </a>
        );
      },
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (text, record) => {
        const canShowAll = windowWidth >= 1200;
        const canShowDelete = windowWidth >= 768;
        const moreItems = [];
        if (!canShowAll) {
          moreItems.push({ key: 'duplicate', label: t('Duplicate'), icon: <CopyOutlined />, onClick: () => handleDuplicate(record.name) });
          moreItems.push({ key: 'rename', label: t('Rename'), icon: <EditOutlined />, onClick: () => { setRenameTarget(record.name); setRenameNewName(record.name); setIsRenameModalVisible(true); } });
          moreItems.push({ key: 'download', label: t('Download'), icon: <DownloadOutlined />, onClick: () => handleDownload(record.name) });
        }
        if (!canShowDelete && isAdminLoggedIn) {
          moreItems.push({ key: 'delete', label: t('Delete'), icon: <DeleteOutlined />, danger: true, onClick: () => handleDelete(record.name) });
        }
        return (
          <Space size="small" wrap>
            <Button className="action-btn action-btn-primary" icon={<FormOutlined />} href={`/editor/${record.name}`}>
              {t('Edit')}
            </Button>
            {canShowAll && (
              <>
                <Button className="action-btn action-btn-secondary" icon={<CopyOutlined />} onClick={() => handleDuplicate(record.name)}>
                  {t('Duplicate')}
                </Button>
                <Button className="action-btn action-btn-secondary" icon={<EditOutlined />} onClick={() => {
                  setRenameTarget(record.name);
                  setRenameNewName(record.name);
                  setIsRenameModalVisible(true);
                }}>
                  {t('Rename')}
                </Button>
                <Button className="action-btn action-btn-secondary" icon={<DownloadOutlined />} onClick={() => handleDownload(record.name)}>
                  {t('Download')}
                </Button>
              </>
            )}
            {canShowDelete && isAdminLoggedIn && (
              <Popconfirm
                title={t('Are you sure to delete {{name}}?', { name: record.name })}
                onConfirm={() => handleDelete(record.name)}
                okText={t('Yes')}
                cancelText={t('No')}
              >
                <Button className="action-btn action-btn-danger" icon={<DeleteOutlined />} danger>
                  {t('Delete')}
                </Button>
              </Popconfirm>
            )}
            {moreItems.length > 0 && (
              <Dropdown
                menu={{
                  items: moreItems.map(item => ({
                    key: item.key,
                    label: (
                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 8, color: item.danger ? 'var(--danger)' : 'inherit' }}>
                        {item.icon}
                        {item.label}
                      </span>
                    ),
                    onClick: item.onClick
                  }))
                }}
                placement="bottomRight"
              >
                <Button className="action-btn action-btn-secondary" icon={<MoreOutlined />}>
                  {t('More')}
                </Button>
              </Dropdown>
            )}
          </Space>
        );
      },
    },
  ];

  const handleDelete = async (fileName) => {
    try {
      await axios.delete(`/api/files/${fileName}`);
      // refresh current page
      fetchFiles(page, perPage, searchQuery);
      messageApi.success(t('File deleted successfully'));
    } catch (error) {
      messageApi.error(t('Failed to delete file'));
    }
  };

  const doRename = async () => {
    try {
      setIsExtWarningVisible(false);
      const newName = renameNewName.trim();
      await axios.put(`/api/files/${encodeURIComponent(renameTarget)}/rename`, { newName });
      setIsRenameModalVisible(false);
      setRenameTarget('');
      setRenameNewName('');
      fetchFiles(page, perPage, searchQuery);
      messageApi.success(t('File renamed successfully'));
    } catch (error) {
      if (error.response?.status === 409) {
        messageApi.error(t('A file with that name already exists'));
      } else {
        messageApi.error(t('Failed to rename file'));
      }
    }
  };

  const handleRename = () => {
    const newName = renameNewName.trim();
    if (!newName) {
      messageApi.error(t('Please enter a new file name'));
      return;
    }
    if (newName === renameTarget) {
      setIsRenameModalVisible(false);
      return;
    }
    const getExt = (fn) => {
      const dot = fn.lastIndexOf('.');
      return dot > 0 ? fn.slice(dot).toLowerCase() : '';
    };
    if (getExt(newName) !== getExt(renameTarget)) {
      setIsExtWarningVisible(true);
      return;
    }
    doRename();
  };

  const handleDuplicate = async (fileName) => {
    try {
      await axios.post(`/api/files/${encodeURIComponent(fileName)}/duplicate`);
      fetchFiles(page, perPage, searchQuery);
      messageApi.success(t('File duplicated successfully'));
    } catch (error) {
      messageApi.error(t('Failed to duplicate file'));
    }
  };

  const handleDownload = async (fileName) => {
    try {
      const resp = await axios.get(`/api/files/${encodeURIComponent(fileName)}/download`, {
        responseType: 'blob'
      });
      const blob = new Blob([resp.data]);
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = fileName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
      window.URL.revokeObjectURL(url);
    } catch (error) {
      messageApi.error(t('Failed to download file'));
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
      fetchFiles(1, perPage, searchQuery);
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
    <div
      ref={containerRef}
      className="home-workspace"
    >
      {isDragging && (
        <div className="drag-overlay">
          <div className="drag-card">
            <CloudUploadOutlined />
            <h2>{t('Drop files here to upload')}</h2>
            <p>{t('Release to add documents to your workspace')}</p>
          </div>
        </div>
      )}
      {contextHolder}
      <section className="workspace-hero">
        <div className="hero-filters">
          {[
            { key: 'all', label: t('All'), count: typeFilterCounts.all },
            { key: 'doc', label: t('Docs'), count: typeFilterCounts.doc },
            { key: 'sheet', label: t('Sheets'), count: typeFilterCounts.sheet },
            { key: 'slide', label: t('Slides'), count: typeFilterCounts.slide },
            { key: 'pdf', label: t('PDFs'), count: typeFilterCounts.pdf },
            { key: 'other', label: t('Other'), count: typeFilterCounts.other },
          ].map(item => (
            <button
              key={item.key}
              className={`filter-pill ${typeFilter === item.key ? 'active' : ''}`}
              onClick={() => { setTypeFilter(item.key); setPage(1); }}
            >
              <span className="filter-label">{item.label}</span>
              <span className="filter-count">{item.count}</span>
            </button>
          ))}
        </div>
        <div className="hero-stats" aria-label="workspace statistics">
          <div className="stat-card">
            <span>{total}</span>
            <small>{t('Total files')}</small>
          </div>
          <div className="stat-card accent">
            <span>{uploadTasks.filter(t => t.status === 'uploading').length}</span>
            <small>{t('Uploading')}</small>
          </div>
        </div>
      </section>

      <section className="file-panel-shell">
        <div className="panel-toolbar">
          <Space className="toolbar-actions" wrap>
            <Button className="premium-primary" type="primary" icon={<PlusOutlined />} onClick={showModal}>
              {t('New File')}
            </Button>
            <Upload customRequest={handleUpload} showUploadList={false}>
              <Button className="soft-button" icon={<UploadOutlined />}>{t('Upload File')}</Button>
            </Upload>
            {isAdminLoggedIn && (
              <Popconfirm
                title={t('Are you sure to delete selected files?')}
                onConfirm={handleBulkDelete}
                okText={t('Yes')}
                cancelText={t('No')}
                disabled={!selectedRowKeys || selectedRowKeys.length === 0}
              >
                <Button className="soft-button danger-soft" icon={<MinusCircleOutlined />} danger disabled={!selectedRowKeys || selectedRowKeys.length === 0}>
                  {t('Delete Selected')}
                </Button>
              </Popconfirm>
            )}

          </Space>
          <Dropdown
            menu={{
              items: [
                { key: 'mtime-desc', label: t('Modified (Newest)'), onClick: () => { setSortBy('mtime'); setSortOrder('desc'); setPage(1); } },
                { key: 'mtime-asc', label: t('Modified (Oldest)'), onClick: () => { setSortBy('mtime'); setSortOrder('asc'); setPage(1); } },
                { key: 'name-asc', label: t('Name (A-Z)'), onClick: () => { setSortBy('name'); setSortOrder('asc'); setPage(1); } },
                { key: 'name-desc', label: t('Name (Z-A)'), onClick: () => { setSortBy('name'); setSortOrder('desc'); setPage(1); } },
                { key: 'size-desc', label: t('Size (Largest)'), onClick: () => { setSortBy('size'); setSortOrder('desc'); setPage(1); } },
                { key: 'size-asc', label: t('Size (Smallest)'), onClick: () => { setSortBy('size'); setSortOrder('asc'); setPage(1); } },
              ].map(item => ({ key: item.key, label: item.label, onClick: item.onClick })),
            }}
            placement="bottomRight"
          >
            <Button className="soft-button" icon={<SortAscendingOutlined />}>
              {t('Sort')}
            </Button>
          </Dropdown>
          <Input.Search
            className="file-search"
            placeholder={t('Search files')}
            allowClear
            onSearch={(val) => {
              setSearchQuery(val);
              setPage(1);
            }}
          />
        </div>
        <div
          ref={tableWrapperRef}
          className="table-shell"
        >
          <Table
            className="premium-table"
            columns={columns}
            dataSource={filteredFiles}
            rowKey="name"
            loading={loading}
            pagination={{ current: page, pageSize: perPage, total: filteredFiles.length }}
            rowSelection={rowSelection}
            onChange={onTableChange}
            style={{ flex: '1 1 auto' }}
          />
        </div>
      </section>
      <Modal
        title={t('Rename File')}
        open={isRenameModalVisible}
        onOk={handleRename}
        onCancel={() => { setIsRenameModalVisible(false); setRenameTarget(''); setRenameNewName(''); }}
        destroyOnClose
      >
        <Input
          placeholder={t('Enter new file name')}
          value={renameNewName}
          onChange={(e) => setRenameNewName(e.target.value)}
          onPressEnter={handleRename}
        />
      </Modal>
      <Modal
        title={t('Warning')}
        open={isExtWarningVisible}
        onOk={() => { setIsExtWarningVisible(false); doRename(); }}
        onCancel={() => setIsExtWarningVisible(false)}
        okText={t('Continue')}
        cancelText={t('Cancel')}
      >
        <p>{t('Changing the file extension may make the file unusable. Are you sure you want to continue?')}</p>
      </Modal>
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
      {isUploadListVisible && uploadTasks.length > 0 && (
        <Card 
          className="upload-dock"
          title={`${t('Uploading Files')} (${uploadTasks.filter(t => t.status === 'uploading').length})`}
          extra={<Button type="link" size="small" onClick={clearFinishedUploads}>{t('Clear Finished')}</Button>}
          bodyStyle={{ padding: '0 14px', maxHeight: 300, overflowY: 'auto' }}
        >
          {uploadTasks.map(task => (
            <div key={task.uid} style={{ padding: '12px 0', borderBottom: '1px solid var(--ant-color-split, #f0f0f0)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
                <span style={{ fontSize: 13, textOverflow: 'ellipsis', overflow: 'hidden', whiteSpace: 'nowrap', maxWidth: 200 }} title={task.name}>
                  {task.name}
                </span>
                <span style={{ fontSize: 12, color: task.status === 'error' ? 'red' : 'inherit' }}>
                  {task.status === 'success' ? t('Finished') : task.status === 'error' ? t('Error') : `${task.progress}%`}
                </span>
              </div>
              <Progress percent={task.progress} showInfo={false} status={task.status === 'success' ? 'success' : task.status === 'error' ? 'exception' : 'active'} size="small" />
              {task.status !== 'success' && task.status !== 'error' && (
                <div style={{ marginTop: 8, display: 'flex', gap: 8, justifyContent: 'flex-end' }}>
                  {!task.isPaused ? (
                    <Button size="small" onClick={() => pauseUpload(task.uid)}>{t('files.pause')}</Button>
                  ) : (
                    <Button size="small" onClick={() => resumeUpload(task.uid)}>{t('files.resume')}</Button>
                  )}
                  <Button size="small" danger onClick={() => cancelUpload(task.uid)}>{t('Cancel')}</Button>
                </div>
              )}
            </div>
          ))}
        </Card>
      )}
    </div>
  );
};

export default HomePage;
