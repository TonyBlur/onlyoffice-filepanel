import React, { useState, useEffect, useRef, useMemo, useCallback, useLayoutEffect } from 'react';
import { Button, Table, Modal, Input, Upload, message, Space, Popconfirm, Select, Progress, Card, Dropdown } from 'antd';
import { UploadOutlined, PlusOutlined, FileTextOutlined, FilePdfOutlined, FileExcelOutlined, FilePptOutlined, FileOutlined, CloudUploadOutlined, EditOutlined, DeleteOutlined, FormOutlined, MinusCircleOutlined, CopyOutlined, DownloadOutlined, MoreOutlined, SortAscendingOutlined } from '@ant-design/icons';
import axios from 'axios';
import { useTranslation } from 'react-i18next';
import { useOutletContext, useLocation } from 'react-router-dom';

const ROW_HEIGHT_ESTIMATE = 74;
const ROW_HEIGHT_PADDED = 82;
const TABLE_HEADER_H = 44;

/** Shared file extension classification constants */
const FILE_CATEGORIES = {
  doc: ['doc', 'docx', 'odt', 'rtf', 'txt'],
  sheet: ['xls', 'xlsx', 'ods', 'csv'],
  slide: ['ppt', 'pptx', 'odp'],
} as const;

interface FileItem {
  name: string;
  url?: string;
  mtime?: string;
  lastEdited?: string;
  mtimeMs?: number;
  size?: number;
}

interface UploadTask {
  uid: string;
  file: File;
  name: string;
  progress: number;
  status: 'uploading' | 'paused' | 'success' | 'error';
  isPaused: boolean;
  currentChunkIndex: number;
  totalChunks: number;
  abortCtrl: AbortController | null;
}

interface OutletContext {
  isAdminLoggedIn: boolean;
  loading: boolean;
}

const SUPPORTED_FORMATS = [
  ...FILE_CATEGORIES.doc,
  ...FILE_CATEGORIES.sheet,
  ...FILE_CATEGORIES.slide,
  'pdf',
];

const MAX_FILE_SIZE = 2 * 1024 * 1024 * 1024; // 2 GB

const HomePage: React.FC = () => {
  const { isAdminLoggedIn } = useOutletContext<OutletContext>();
  const location = useLocation();
  // ---- State ----
  const [allFiles, setAllFiles] = useState<FileItem[]>([]);
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
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);
  const { t } = useTranslation();

  const [messageApi, contextHolder] = message.useMessage();
  const tRef = useRef(t);
  tRef.current = t;
  const messageApiRef = useRef(messageApi);
  messageApiRef.current = messageApi;

  const [uploadTasks, setUploadTasks] = useState<UploadTask[]>([]);
  const uploadTasksRef = useRef<UploadTask[]>([]);
  const [isUploadListVisible, setIsUploadListVisible] = useState(false);

  const updateUploadTask = (uid: string, updates: Partial<UploadTask>) => {
    const nextTasks = uploadTasksRef.current.map(t =>
      t.uid === uid ? { ...t, ...updates } : t
    );
    uploadTasksRef.current = nextTasks;
    setUploadTasks([...nextTasks]);
  };

  const addUploadTask = (task: UploadTask) => {
    uploadTasksRef.current = [...uploadTasksRef.current, task];
    setUploadTasks([...uploadTasksRef.current]);
    setIsUploadListVisible(true);
  };

  const [isDragging, setIsDragging] = useState(false);

  // Warn user when closing tab/window with active uploads
  const hasActiveUploads = uploadTasks.some(t => t.status === 'uploading' || t.status === 'paused');
  useEffect(() => {
    if (!hasActiveUploads) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [hasActiveUploads]);

  const [page, setPage] = useState(1);
  const [perPage, setPerPage] = useState(10);
  const [loading, setLoading] = useState(false);
  const [selectedRowKeys, setSelectedRowKeys] = useState<React.Key[]>([]);

  const tableShellRef = useRef<HTMLDivElement>(null);
  const measuredRowHRef = useRef(ROW_HEIGHT_PADDED); // measured from DOM, starts at padded fallback

  // ---- Fetch all files ----
  const fetchFiles = useCallback(async () => {
    try {
      setLoading(true);
      const resp = await axios.get('/api/files?perPage=9999');
      const data = resp.data;
      if (Array.isArray(data)) {
        setAllFiles(data);
      } else if (data && data.items) {
        setAllFiles(data.items);
      } else {
        setAllFiles([]);
      }
    } catch (error) {
      messageApiRef.current.error(tRef.current('Failed to fetch files'));
    } finally {
      setLoading(false);
    }
  }, []);

  // ---- Client-side type classification (uses shared FILE_CATEGORIES) ----
  const getFileType = (name = '') => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf') return 'pdf';
    if (FILE_CATEGORIES.sheet.includes(ext as typeof FILE_CATEGORIES.sheet[number])) return 'sheet';
    if (FILE_CATEGORIES.slide.includes(ext as typeof FILE_CATEGORIES.slide[number])) return 'slide';
    if (FILE_CATEGORIES.doc.includes(ext as typeof FILE_CATEGORIES.doc[number])) return 'doc';
    return 'other';
  };

  // ---- Type filter counts ----
  const typeFilterCounts = useMemo(() => {
    const counts = { all: allFiles.length, doc: 0, sheet: 0, slide: 0, pdf: 0, other: 0 };
    allFiles.forEach(f => { counts[getFileType(f.name)]++; });
    return counts;
  }, [allFiles]);

  // ---- File size formatting ----
  const formatFileSize = (bytes?: number): string => {
    if (bytes === undefined || bytes === null) return '';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
    return `${(bytes / (1024 * 1024 * 1024)).toFixed(1)} GB`;
  };

  // ---- Time formatting ----
  const formatTimeAgo = useCallback((isoString: string) => {
    if (!isoString) return '';
    const date = new Date(isoString);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffSec = Math.floor(diffMs / 1000);
    const diffMin = Math.floor(diffSec / 60);
    const diffHour = Math.floor(diffMin / 60);
    const diffDay = Math.floor(diffHour / 24);

    if (diffSec < 60) return t('Just now');
    if (diffMin < 60) return t('{{min}} minutes ago', { min: diffMin });
    if (diffHour < 24) return t('{{hour}} hours ago', { hour: diffHour });
    if (diffDay < 7) return t('{{day}} days ago', { day: diffDay });
    return date.toLocaleDateString();
  }, [t]);

  // Last edited time
  const lastEditedAgo = useMemo(() => {
    if (allFiles.length === 0) return '-';
    const latest = allFiles.reduce((max, f) => {
      const ms = f.mtimeMs || 0;
      return ms > max ? ms : max;
    }, 0);
    if (!latest) return '-';
    const latestFile = allFiles.find(f => (f.mtimeMs || 0) === latest);
    return formatTimeAgo(latestFile?.lastEdited || latestFile?.mtime || '');
  }, [allFiles, formatTimeAgo]);

  // Upload stats
  const uploadStats = useMemo(() => {
    const active = uploadTasks.filter(t => t.status === 'uploading' || t.status === 'paused').length;
    const completed = uploadTasks.filter(t => t.status === 'success').length;
    return { active, completed, total: uploadTasks.length };
  }, [uploadTasks]);

  // ---- Client-side filtering + sorting ----
  const filteredAndSortedFiles = useMemo(() => {
    let result = [...allFiles];

    if (typeFilter !== 'all') {
      result = result.filter(f => getFileType(f.name) === typeFilter);
    }

    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      result = result.filter(f => f.name.toLowerCase().includes(q));
    }

    result.sort((a, b) => {
      let cmp = 0;
      switch (sortBy) {
        case 'name': cmp = a.name.localeCompare(b.name); break;
        case 'size': cmp = (a.size || 0) - (b.size || 0); break;
        case 'mtime': default: cmp = (a.mtimeMs || 0) - (b.mtimeMs || 0); break;
      }
      return sortOrder === 'desc' ? -cmp : cmp;
    });

    return result;
  }, [allFiles, typeFilter, searchQuery, sortBy, sortOrder]);

  const totalCount = filteredAndSortedFiles.length;

  const paginatedFiles = useMemo(() => {
    const start = (page - 1) * perPage;
    return filteredAndSortedFiles.slice(start, start + perPage);
  }, [filteredAndSortedFiles, page, perPage]);

  // ---- Dynamic perPage based on viewport (stable, no feedback loop) ----
  const lastPerPageRef = useRef(0);
  const [tooSmall, setTooSmall] = useState(false);

  useEffect(() => {
    const calcPerPage = () => {
      const vh = window.innerHeight;
      setWindowWidth(window.innerWidth);
      // Fixed heights that don't depend on table content
      const topbarH = 56;
      const heroH = 86;
      const toolbarH = 56;
      const footerH = 24;
      const paginationH = 56;
      const panelPadding = 4; // border + shadow
      const homePadding = 48; // 24 top + 24 bottom
      const safetyMargin = 4;
      // Reserve table header + row height buffer — no row may be clipped by even 1px
      const reserved = topbarH + heroH + toolbarH + footerH + paginationH + panelPadding + homePadding + TABLE_HEADER_H + safetyMargin;

      const rowH = ROW_HEIGHT_ESTIMATE; // close to actual for accurate count
      const available = vh - reserved;
      const rows = Math.floor(available / rowH);

      if (rows < 1) {
        setTooSmall(true);
        setPerPage(1);
      } else {
        setTooSmall(false);
        if (rows !== lastPerPageRef.current) {
          lastPerPageRef.current = rows;
          setPerPage(rows);
        }
      }
    };

    calcPerPage();
    window.addEventListener('resize', calcPerPage);
    return () => window.removeEventListener('resize', calcPerPage);
  }, []);

  // Fetch files on mount
  useEffect(() => {
    fetchFiles();
  }, [fetchFiles]);

  // Reset page when filters change
  useEffect(() => {
    setPage(1);
  }, [typeFilter, searchQuery, sortBy, sortOrder]);

  // Re-fetch files when returning from editor (path changed back to home)
  const prevPathRef = useRef(location.pathname);
  useEffect(() => {
    if (prevPathRef.current.startsWith('/editor/') && location.pathname === '/') {
      fetchFiles();
    }
    prevPathRef.current = location.pathname;
  }, [location.pathname, fetchFiles]);

  // Adjust page when perPage changes to avoid out-of-range page
  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(totalCount / perPage));
    if (page > maxPage) {
      setPage(maxPage);
    }
  }, [perPage, totalCount, page]);

  // Lock table body height — set CSS variable + directly on table body for reliability
  useLayoutEffect(() => {
    const shell = tableShellRef.current;
    if (!shell) return;

    // Measure actual row height from DOM (skip Ant Design's measure row)
    const row = shell.querySelector('.ant-table-tbody tr:not(.ant-table-measure-row)') as HTMLElement | null;
    if (row && row.offsetHeight > 0) {
      measuredRowHRef.current = row.offsetHeight;
    }

    const h = `${perPage * measuredRowHRef.current}px`;
    shell.style.setProperty('--table-body-h', h);

    // Also set max-height directly on the table body to avoid CSS variable timing issues
    const tableBody = shell.querySelector('.ant-table-body') as HTMLElement | null;
    if (tableBody) {
      tableBody.style.maxHeight = h;
    }
  }, [perPage, paginatedFiles]);

  // Global drag-and-drop
  useEffect(() => {
    let dragCounter = 0;
    const onDragEnter = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes('Files')) {
        dragCounter++;
        setIsDragging(true);
      }
    };
    const onDragOver = (e: DragEvent) => { e.preventDefault(); };
    const onDragLeave = (e: DragEvent) => {
      e.preventDefault();
      if (e.dataTransfer?.types.includes('Files')) {
        dragCounter--;
        if (dragCounter === 0) setIsDragging(false);
      }
    };
    const onDrop = (e: DragEvent) => {
      e.preventDefault();
      dragCounter = 0;
      setIsDragging(false);
      if (e.dataTransfer?.files && e.dataTransfer.files.length > 0) {
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
      window.removeEventListener('dragenter', onDragEnter);
      window.removeEventListener('dragover', onDragOver);
      window.removeEventListener('dragleave', onDragLeave);
      window.removeEventListener('drop', onDrop);
    };
  }, []);

  // ---- File operations ----
  const showModal = () => { setIsModalVisible(true); };

  const handleOk = async () => {
    try {
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
      fetchFiles();
      messageApi.success(t('File created successfully'));
    } catch (error) {
      messageApi.error(t('Failed to create file'));
    }
  };

  const handleCancel = () => { setIsModalVisible(false); };

  const uploadChunks = async (taskUid: string, file: File, startIndex = 0, onSuccess?: () => void, onError?: (err: unknown) => void) => {
    const CHUNK_SIZE = 1024 * 1024 * 2;
    const total = Math.max(1, Math.ceil(file.size / CHUNK_SIZE));
    updateUploadTask(taskUid, { totalChunks: total, currentChunkIndex: startIndex });

    try {
      for (let idx = startIndex; idx < total; idx++) {
        const task = uploadTasksRef.current.find(t => t.uid === taskUid);
        if (task && task.isPaused) break;
        if (!task) break;

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
      if (endTask && endTask.isPaused) return;

      fetchFiles();
      onSuccess && onSuccess();
      messageApi.success(`${file.name} ${t('files.uploadSuccess')}`);
      updateUploadTask(taskUid, { status: 'success', progress: 100 });
    } catch (error) {
      const task = uploadTasksRef.current.find(t => t.uid === taskUid);
      if (task && task.isPaused) return;

      if (axios.isCancel && axios.isCancel(error)) {
        // canceled by user
      } else {
        messageApi.error(`${file.name} ${t('files.uploadFailed')}`);
        updateUploadTask(taskUid, { status: 'error' });
      }
      onError && onError(error);
    } finally {
      updateUploadTask(taskUid, { abortCtrl: null });
    }
  };

  const handleUpload = async (options: { file: File | string | Blob; onSuccess?: () => void; onError?: (err: unknown) => void }) => {
    const { file, onSuccess, onError } = options;

    if (!(file instanceof File)) return;

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

    const taskUid = Date.now().toString() + Math.floor(Math.random() * 1000);
    const task: UploadTask = {
      uid: taskUid,
      file,
      name: file.name,
      progress: 0,
      status: 'uploading',
      isPaused: false,
      currentChunkIndex: 0,
      totalChunks: 0,
      abortCtrl: null
    };
    addUploadTask(task);
    await uploadChunks(taskUid, file, 0, onSuccess, onError);
  };

  const pauseUpload = (uid: string) => {
    updateUploadTask(uid, { isPaused: true, status: 'paused' });
    const task = uploadTasksRef.current.find(t => t.uid === uid);
    if (task && task.abortCtrl) task.abortCtrl.abort();
  };

  const resumeUpload = (uid: string) => {
    updateUploadTask(uid, { isPaused: false, status: 'uploading' });
    const task = uploadTasksRef.current.find(t => t.uid === uid);
    if (task) {
      const resumeIndex = Math.max(0, task.currentChunkIndex);
      uploadChunks(uid, task.file, resumeIndex, undefined, undefined);
    }
  };

  const cancelUpload = async (uid: string) => {
    const task = uploadTasksRef.current.find(t => t.uid === uid);
    if (task) {
      if (task.abortCtrl) {
        try { task.abortCtrl.abort(); } catch (e) { /* ignore */ }
      }
      try {
        await axios.post('/api/files/upload-chunk/cancel', { filename: task.name });
      } catch (e) { /* ignore */ }
    }
    const remaining = uploadTasksRef.current.filter(t => t.uid !== uid);
    uploadTasksRef.current = remaining;
    setUploadTasks([...remaining]);
    messageApi.error(t('files.uploadFailed'));
    if (remaining.length === 0) setIsUploadListVisible(false);
  };

  const clearFinishedUploads = () => {
    const remaining = uploadTasksRef.current.filter(t => t.status !== 'success' && t.status !== 'error');
    uploadTasksRef.current = remaining;
    setUploadTasks([...remaining]);
    if (remaining.length === 0) setIsUploadListVisible(false);
  };

  const getFileMeta = (name = '') => {
    const ext = name.split('.').pop()?.toLowerCase() || '';
    if (ext === 'pdf') return { ext: 'PDF', type: 'pdf', icon: <FilePdfOutlined /> };
    if (FILE_CATEGORIES.sheet.includes(ext as typeof FILE_CATEGORIES.sheet[number])) return { ext: ext.toUpperCase(), type: 'sheet', icon: <FileExcelOutlined /> };
    if (FILE_CATEGORIES.slide.includes(ext as typeof FILE_CATEGORIES.slide[number])) return { ext: ext.toUpperCase(), type: 'slide', icon: <FilePptOutlined /> };
    if (FILE_CATEGORIES.doc.includes(ext as typeof FILE_CATEGORIES.doc[number])) return { ext: ext.toUpperCase(), type: 'doc', icon: <FileTextOutlined /> };
    return { ext: ext ? ext.toUpperCase() : 'FILE', type: 'file', icon: <FileOutlined /> };
  };

  const columns = [
    {
      title: t('File Name'),
      dataIndex: 'name',
      key: 'name',
      ellipsis: false,
      render: (text: string, record: FileItem) => {
        const meta = getFileMeta(text);
        return (
          <a className="file-name-link" href={`/editor/${text}`} title={text}>
            <span className={`file-type-icon ${meta.type}`}>{meta.icon}</span>
            <span className="file-title-block">
              <span className="file-title">{text}</span>
              <span className="file-subtitle">{meta.ext}{record.size ? ` · ${formatFileSize(record.size)}` : ''} · {formatTimeAgo(record.lastEdited || record.mtime || '')}</span>
            </span>
          </a>
        );
      },
    },
    {
      title: t('Actions'),
      key: 'actions',
      render: (_text: string, record: FileItem) => {
        const showEdit = true;
        const showDuplicate = windowWidth >= 900;
        const showRename = windowWidth >= 1100;
        const showDownload = windowWidth >= 1100;
        const showDelete = isAdminLoggedIn && windowWidth >= 900;

        const moreItems: Array<{ key: string; label: string; icon: React.ReactNode; danger?: boolean; onClick: () => void }> = [];
        if (!showDuplicate) {
          moreItems.push({ key: 'duplicate', label: t('Duplicate'), icon: <CopyOutlined />, onClick: () => handleDuplicate(record.name) });
        }
        if (!showRename) {
          moreItems.push({ key: 'rename', label: t('Rename'), icon: <EditOutlined />, onClick: () => { setRenameTarget(record.name); setRenameNewName(record.name); setIsRenameModalVisible(true); } });
        }
        if (!showDownload) {
          moreItems.push({ key: 'download', label: t('Download'), icon: <DownloadOutlined />, onClick: () => handleDownload(record.name) });
        }
        if (!showDelete && isAdminLoggedIn) {
          moreItems.push({ key: 'delete', label: t('Delete'), icon: <DeleteOutlined />, danger: true, onClick: () => handleDelete(record.name) });
        }

        return (
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 4, flexWrap: 'nowrap' }}>
            {showEdit && (
              <Button className="action-btn action-btn-primary" icon={<FormOutlined />} href={`/editor/${record.name}`}>
                {t('Edit')}
              </Button>
            )}
            {showDuplicate && (
              <Button className="action-btn action-btn-secondary" icon={<CopyOutlined />} onClick={() => handleDuplicate(record.name)}>
                {t('Duplicate')}
              </Button>
            )}
            {showRename && (
              <Button className="action-btn action-btn-secondary" icon={<EditOutlined />} onClick={() => {
                setRenameTarget(record.name);
                setRenameNewName(record.name);
                setIsRenameModalVisible(true);
              }}>
                {t('Rename')}
              </Button>
            )}
            {showDownload && (
              <Button className="action-btn action-btn-secondary" icon={<DownloadOutlined />} onClick={() => handleDownload(record.name)}>
                {t('Download')}
              </Button>
            )}
            {showDelete && (
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
                <Button className="action-btn action-btn-secondary" icon={<MoreOutlined />} />
              </Dropdown>
            )}
          </div>
        );
      },
    },
  ];

  const handleDelete = async (fileName: string) => {
    try {
      setSelectedRowKeys([]);
      await axios.delete(`/api/files/${fileName}`);
      fetchFiles();
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
      fetchFiles();
      messageApi.success(t('File renamed successfully'));
    } catch (error) {
      if ((error as { response?: { status: number } }).response?.status === 409) {
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
    const getExt = (fn: string) => {
      const dot = fn.lastIndexOf('.');
      return dot > 0 ? fn.slice(dot).toLowerCase() : '';
    };
    if (getExt(newName) !== getExt(renameTarget)) {
      setIsExtWarningVisible(true);
      return;
    }
    doRename();
  };

  const handleDuplicate = async (fileName: string) => {
    try {
      await axios.post(`/api/files/${encodeURIComponent(fileName)}/duplicate`);
      fetchFiles();
      messageApi.success(t('File duplicated successfully'));
    } catch (error) {
      messageApi.error(t('Failed to duplicate file'));
    }
  };

  const handleDownload = async (fileName: string) => {
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
      await Promise.all(
        selectedRowKeys.map((name) => axios.delete(`/api/files/${encodeURIComponent(String(name))}`))
      );
      setSelectedRowKeys([]);
      fetchFiles();
      messageApi.success(t('Selected files deleted'));
    } catch (error) {
      messageApi.error(t('Failed to delete selected files'));
    } finally {
      setLoading(false);
    }
  };

  const rowSelection = isAdminLoggedIn
    ? {
        selectedRowKeys,
        onChange: (selectedKeys: React.Key[]) => setSelectedRowKeys(selectedKeys),
      }
    : undefined;

  // Custom empty state — matches glass-card design system
  const customEmpty = (
    <div className="table-empty-custom">
      <svg className="table-empty-icon" viewBox="0 0 64 64" fill="none" xmlns="http://www.w3.org/2000/svg">
        <rect x="8" y="14" width="48" height="40" rx="4" stroke="currentColor" strokeWidth="1.5" />
        <path d="M8 24h48" stroke="currentColor" strokeWidth="1.5" />
        <rect x="14" y="8" width="36" height="8" rx="3" stroke="currentColor" strokeWidth="1.5" />
        <path d="M22 34h20M22 40h14" stroke="currentColor" strokeWidth="1.2" strokeLinecap="round" opacity="0.5" />
      </svg>
      <span className="table-empty-title">{searchQuery ? t('No files match your search') : t('No files yet')}</span>
      <span className="table-empty-desc">{searchQuery ? t('Try a different keyword') : t('Create or upload files to get started')}</span>
    </div>
  );

  return (
    <div className="home-workspace">
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
              className={`filter-card ${typeFilter === item.key ? 'active' : ''}`}
              onClick={() => { setTypeFilter(item.key); setPage(1); }}
            >
              <span className="filter-card-count">{item.count}</span>
              <span className="filter-card-label">{item.label}</span>
            </button>
          ))}
        </div>
        <div className="hero-stats" aria-label="workspace statistics">
          <div className="stat-card">
            <span className="stat-card-time">{lastEditedAgo}</span>
            <small>{t('Last Edited')}</small>
          </div>
          <button
            className={`stat-card accent ${uploadStats.active > 0 ? 'uploading' : ''}`}
            onClick={() => {
              if (uploadTasks.length > 0) setIsUploadListVisible(!isUploadListVisible);
            }}
            style={{ cursor: uploadTasks.length > 0 ? 'pointer' : 'default' }}
          >
            {uploadStats.active > 0 ? (
              <>
                <span>{uploadStats.active}</span>
                <small>{t('Uploading')}</small>
              </>
            ) : (
              <>
                <span>{uploadStats.completed || 0}</span>
                <small>{t('Uploaded')}</small>
              </>
            )}
          </button>
        </div>
      </section>

      <section className="file-panel-shell">
        <div className="panel-toolbar">
          <Space className="toolbar-actions" wrap>
            <Button className="premium-primary" type="primary" icon={<PlusOutlined />} onClick={showModal}>
              {t('New File')}
            </Button>
            <Upload customRequest={handleUpload as never} showUploadList={false}>
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
          <div className="toolbar-search-group">
            <Dropdown
              menu={{
                items: [
                  { key: 'mtime-desc', label: t('Modified (Newest)'), onClick: () => { setSortBy('mtime'); setSortOrder('desc'); } },
                  { key: 'mtime-asc', label: t('Modified (Oldest)'), onClick: () => { setSortBy('mtime'); setSortOrder('asc'); } },
                  { key: 'name-asc', label: t('Name (A-Z)'), onClick: () => { setSortBy('name'); setSortOrder('asc'); } },
                  { key: 'name-desc', label: t('Name (Z-A)'), onClick: () => { setSortBy('name'); setSortOrder('desc'); } },
                  { key: 'size-desc', label: t('Size (Largest)'), onClick: () => { setSortBy('size'); setSortOrder('desc'); } },
                  { key: 'size-asc', label: t('Size (Smallest)'), onClick: () => { setSortBy('size'); setSortOrder('asc'); } },
                ],
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
        </div>
        <div
          ref={tableShellRef}
          className="table-shell"
        >
          {tooSmall ? (
            <div className="table-too-small">{t('Please use a larger screen or window to view the file list')}</div>
          ) : (
          <Table
            className="premium-table"
            columns={columns}
            dataSource={paginatedFiles}
            rowKey="name"
            loading={loading}
            scroll={{ y: perPage * ROW_HEIGHT_PADDED }}
            pagination={{
              current: page,
              pageSize: perPage,
              total: totalCount,
              onChange: (p) => setPage(p),
              showSizeChanger: false,
              hideOnSinglePage: false,
            }}
            rowSelection={rowSelection}
            locale={{ emptyText: customEmpty }}
          />
          )}
        </div>
      </section>

      <Modal
        title={t('Rename File')}
        open={isRenameModalVisible}
        onOk={handleRename}
        onCancel={() => { setIsRenameModalVisible(false); setRenameTarget(''); setRenameNewName(''); }}
        okText={t('Confirm')}
        cancelText={t('Cancel')}
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
        okText={t('Confirm')}
        cancelText={t('Cancel')}
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
          styles={{ body: { padding: '0 14px', maxHeight: 300, overflowY: 'auto' } }}
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

      <div style={{ flex: '1 1 auto', minHeight: 0 }} />
    </div>
  );
};

export default HomePage;
