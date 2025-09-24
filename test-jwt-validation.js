// 测试JWT token验证
const jwt = require('jsonwebtoken');

// 从后端获取的JWT token
const token = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJrZXkiOiI3ZjE2ZDJmZmUyYWZmN2UyZGRlZTVmMjNlNTlmOWIwMmY0ZjVlZDViNTE5NjUzODI5N2MzZGIzYmFmY2I4ODQwIiwidXJsIjoiaHR0cDovL2hvc3QuZG9ja2VyLmludGVybmFsOjQwMDAvZmlsZXMvdGVzdC1qd3QtdG9rZW4udHh0IiwiY2FsbGJhY2tVcmwiOiJodHRwOi8vaG9zdC5kb2NrZXIuaW50ZXJuYWw6NDAwMC9vbmx5b2ZmaWNlL3dlYmhvb2siLCJpYXQiOjE3NTgyMzkxOTR9.y3HcgbbOymYh2oX7QLMfID5zPtxWQgNsCysnRctVqI8";

// OnlyOffice配置的JWT secret
const jwtSecret = "hUQTo541dF2UjKzO56Ux9jHOD62csevJ";

console.log('JWT Token验证测试');
console.log('================');
console.log('Token:', token);
console.log('');
console.log('验证Token...');

try {
    const decoded = jwt.verify(token, jwtSecret);
    console.log('✅ Token验证成功!');
    console.log('Decoded payload:', JSON.stringify(decoded, null, 2));
    
    // 检查payload结构
    if (decoded.payload) {
        console.log('\n✅ Payload结构正确 (OnlyOffice 7.1+ 格式)');
        console.log('Document key:', decoded.payload.document.key);
        console.log('Document URL:', decoded.payload.document.url);
        console.log('Editor config callbackUrl:', decoded.payload.editorConfig.callbackUrl);
        console.log('Editor config mode:', decoded.payload.editorConfig.mode);
    } else {
        console.log('\n❌ Payload结构不正确 - 缺少payload包装');
    }
    
} catch (error) {
    console.log('❌ Token验证失败:', error.message);
}

console.log('\n================');
console.log('测试完成');