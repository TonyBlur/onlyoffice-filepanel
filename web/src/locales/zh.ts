export default {
  // App
  'brand': 'OnlyOffice 文件面板',
  'OnlyOffice': 'OnlyOffice',
  'File Panel': '文件面板',
  'OnlyOffice File Panel': 'OnlyOffice 文件面板',
  'Language': '语言',
  'Theme': '主题',
  'Account': '账户',
  'Back': '返回',

  // Login Modal
  'login.title': '管理员登录',
  'login.password': '密码',
  'login.error': '登录失败，请检查密码',
  'login.cancel': '取消',
  'login.submit': '登录',

  // Auth labels (for menu)
  'auth.login': '登录',
  'auth.logout': '退出登录',
  'auth.loggedIn': '登录成功',
  'auth.loggedOut': '已退出登录',
  'auth.logoutFailed': '退出失败',

  // Theme labels (for menu)
  'theme.light': '浅色模式',
  'theme.dark': '深色模式',
  'theme.system': '跟随系统',

  // Theme / Auth (flat — react-i18next backward compat)
  'Light Mode': '浅色模式',
  'Dark Mode': '深色模式',
  'System': '跟随系统',
  'Admin Login': '管理员登录',
  'Login': '登录',
  'Password': '密码',
  'Login successful': '登录成功',
  'Login failed': '登录失败',
  'Logout': '退出登录',
  'Please input your password!': '请输入密码！',

  // Language
  '简体中文': '简体中文',
  'English': 'English',

  // Home page
  'New File': '新建文件',
  'Upload File': '上传文件',
  'Search files': '搜索文件',
  'File Name': '文件名',
  'Actions': '操作',
  'Edit': '编辑',
  'Delete': '删除',
  'Delete Selected': '删除所选',
  'Are you sure to delete selected files?': '确定要删除所选文件吗？',
  'Are you sure to delete {{name}}?': '确定要删除 {{name}} 吗？',
  'Yes': '是',
  'No': '否',
  'Cancel': '取消',
  'Confirm': '确认',

  // Create file modal
  'Create New File': '创建新文件',
  'Enter file name (without extension)': '输入文件名（不包含扩展名）',
  'Please enter a file name': '请输入文件名',
  'Format': '格式',
  'File created successfully': '文件创建成功',
  'Failed to create file': '文件创建失败',

  // Upload
  'Upload Files': '上传文件',
  'Uploading Files': '上传列表',
  'Drop files here to upload': '拖拽文件到此处以上传',
  'File uploaded successfully': '文件上传成功',
  'File upload failed': '文件上传失败',
  'files.uploadSuccess': '上传成功',
  'files.uploadFailed': '上传失败',
  'files.pause': '暂停',
  'files.resume': '继续',
  'File format not supported. Supported formats: ': '不支持的文件格式。支持格式：',
  'File size exceeds 2GB limit': '文件大小超过 2GB 限制',
  'Clear Finished': '清空已完成',
  'Finished': '已完成',
  'Error': '错误',

  // File operations
  'File deleted successfully': '文件删除成功',
  'Failed to delete file': '删除文件失败',
  'Selected files deleted': '所选文件已删除',
  'Failed to delete selected files': '删除所选文件失败',
  'Failed to fetch files': '获取文件失败',
  'Rename': '重命名',
  'Rename File': '重命名文件',
  'Enter new file name': '输入新文件名',
  'Please enter a new file name': '请输入新文件名',
  'File renamed successfully': '文件重命名成功',
  'Failed to rename file': '重命名文件失败',
  'A file with that name already exists': '该文件名已存在',
  'Duplicate': '复制',
  'File duplicated successfully': '文件复制成功',
  'Failed to duplicate file': '复制文件失败',
  'Download': '下载',
  'Failed to download file': '下载文件失败',
  'Warning': '警告',
  'Changing the file extension may make the file unusable. Are you sure you want to continue?': '修改文件扩展名可能导致文件无法使用。确定要继续吗？',
  'Continue': '继续',
  'More': '更多',
  'Modified (Newest)': '修改时间（最新）',
  'Modified (Oldest)': '修改时间（最早）',
  'Name (A-Z)': '名称（升序）',
  'Name (Z-A)': '名称（降序）',
  'Size (Largest)': '大小（最大）',
  'Size (Smallest)': '大小（最小）',
  'Sort': '排序',

  'Just now': '刚刚',
  '{{min}} minutes ago': '{{min}} 分钟前',
  '{{hour}} hours ago': '{{hour}} 小时前',
  '{{day}} days ago': '{{day}} 天前',

  // Hero section
  'Last Edited': '最近编辑',
  'Uploaded': '已上传',
  'Uploading': '上传中',
  'All': '全部',
  'Docs': '文档',
  'Sheets': '表格',
  'Slides': '幻灯片',
  'PDFs': 'PDF',
  'Other': '其他',

  // Editor page
  'Loading editor...': '正在加载编辑器...',
  'Editor error': '编辑器错误',
  'Failed to parse editor config': '无法解析编辑器配置',
  'Failed to load editor': '无法加载编辑器',
  'Failed to load OnlyOffice API script': '无法加载 OnlyOffice API 脚本',
  'Please confirm that the Document Server is accessible.': '请确认 OnlyOffice Document Server 在可访问的主机上（例如 http://localhost）。',
  'Failed to initialize editor': '初始化编辑器失败',

  // Hero section extended
  'Release to add documents to your workspace': '松开鼠标即可上传文件',
  'Create, upload and edit office documents in a calmer, polished workspace.': '在更优雅的工作空间中创建、上传和编辑办公文档。',
  'Please use a larger screen or window to view the file list': '请使用更大的屏幕或窗口查看文件列表',

  // Empty state
  'No files yet': '暂无文件',
  'Create or upload files to get started': '创建或上传文件以开始使用',
  'No files match your search': '没有匹配的文件',
  'Try a different keyword': '尝试其他关键词',
} as const;
