const jwt = require('jsonwebtoken');

// JWT密钥（与OnlyOffice配置一致）
const jwtSecret = 'hUQTo541dF2UjKzO56Ux9jHOD62csevJ';

// 新的JWT token格式（OnlyOffice官方文档格式）
const newJwtPayload = {
  document: {
    key: '7f16d2ffe2aff7e2ddee5f23e59f9b02f4f5ed5b5196538297c3db3bafcb8840',
    url: 'http://host.docker.internal:4000/files/test-jwt-token.txt',
    permissions: {
      comment: true,
      copy: true,
      download: true,
      edit: true,
      fillForms: true,
      modifyContentControl: true,
      modifyFilter: true,
      print: true,
      review: true
    }
  },
  editorConfig: {
    callbackUrl: 'http://host.docker.internal:4000/onlyoffice/webhook',
    mode: 'edit'
  }
};

console.log('=== OnlyOffice官方文档JWT格式验证 ===');
console.log('Payload结构:');
console.log(JSON.stringify(newJwtPayload, null, 2));

// 生成新的JWT token
const newToken = jwt.sign(newJwtPayload, jwtSecret, { algorithm: 'HS256', expiresIn: '1h' });
console.log('\n生成的JWT Token:');
console.log(newToken);

// 验证JWT token
try {
  const decoded = jwt.verify(newToken, jwtSecret);
  console.log('\n✅ Token验证成功!');
  console.log('Decoded payload:');
  console.log(JSON.stringify(decoded, null, 2));
  
  // 检查payload结构是否符合OnlyOffice要求
  if (decoded.document && decoded.editorConfig) {
    console.log('\n✅ Payload结构符合OnlyOffice官方文档格式!');
    console.log('- 包含document对象');
    console.log('- 包含editorConfig对象');
    console.log('- document.key存在:', !!decoded.document.key);
    console.log('- document.url存在:', !!decoded.document.url);
    console.log('- editorConfig.callbackUrl存在:', !!decoded.editorConfig.callbackUrl);
    console.log('- editorConfig.mode存在:', !!decoded.editorConfig.mode);
  } else {
    console.log('\n❌ Payload结构不符合OnlyOffice官方文档格式');
  }
} catch (error) {
  console.error('\n❌ Token验证失败:', error.message);
}