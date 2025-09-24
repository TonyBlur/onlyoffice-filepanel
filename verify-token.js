const jwt = require('jsonwebtoken');

// 从HTML页面提取的JWT token
const tokenFromHtml = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXkiOiI3ZjE2ZDJmZmUyYWZmN2UyZGRlZTVmMjNlNTlmOWIwMmY0ZjVlZDViNTE5NjUzODI5N2MzZGIzYmFmY2I4ODQwIiwidXJsIjoiaHR0cDovL2hvc3QuZG9ja2VyLmludGVybmFsOjQwMDAvZmlsZXMvdGVzdC1qd3QtdG9rZW4udHh0IiwiY2FsbGJhY2tVcmwiOiJodHRwOi8vaG9zdC5kb2NrZXIuaW50ZXJuYWw6NDAwMC9vbmx5b2ZmaWNlL3dlYmhvb2siLCJpYXQiOjE3NTgyNDAyOTZ9.hvJ6CaQ5SxZxF3ZQN6mu9KjR2x_ZifHmVXZOth8gf2o";

// JWT密钥
const jwtSecret = 'hUQTo541dF2UjKzO56Ux9jHOD62csevJ';

console.log('=== 验证HTML页面中的JWT Token ===');

try {
  const decoded = jwt.verify(tokenFromHtml, jwtSecret);
  console.log('✅ Token验证成功!');
  console.log('Decoded payload:');
  console.log(JSON.stringify(decoded, null, 2));
  
  // 检查payload结构
  if (decoded.document && decoded.editorConfig) {
    console.log('\n✅ Payload结构符合OnlyOffice官方文档格式!');
    console.log('- document.key存在:', !!decoded.document.key);
    console.log('- document.url存在:', !!decoded.document.url);
    console.log('- editorConfig.callbackUrl存在:', !!decoded.editorConfig.callbackUrl);
    console.log('- editorConfig.mode存在:', !!decoded.editorConfig.mode);
  } else {
    console.log('\n❌ Payload结构不符合OnlyOffice官方文档格式');
  }
} catch (error) {
  console.error('❌ Token验证失败:', error.message);
}