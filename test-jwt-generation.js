const jwt = require('jsonwebtoken');

// 模拟后端的JWT生成过程
const DOC_SERVER_JWT_SECRET = 'hUQTo541dF2UjKzO56Ux9jHOD62csevJ';
const configObj = {
  document: {
    key: '7f16d2ffe2aff7e2ddee5f23e59f9b02f4f5ed5b5196538297c3db3bafcb8840',
    url: 'http://host.docker.internal:4000/files/test-jwt-token.txt'
  },
  editorConfig: {
    callbackUrl: 'http://host.docker.internal:4000/onlyoffice/webhook',
    mode: 'edit'
  }
};

// 使用新的JWT payload格式
const jwtPayload = {
  document: {
    key: configObj.document.key,
    url: configObj.document.url,
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
    callbackUrl: configObj.editorConfig.callbackUrl,
    mode: configObj.editorConfig.mode
  }
};

console.log('JWT Payload:', JSON.stringify(jwtPayload, null, 2));

// 生成JWT token
const token = jwt.sign(jwtPayload, DOC_SERVER_JWT_SECRET, { algorithm: 'HS256', expiresIn: '1h' });
console.log('Generated JWT Token:', token);

// 验证token
try {
  const decoded = jwt.verify(token, DOC_SERVER_JWT_SECRET);
  console.log('Decoded Token:', JSON.stringify(decoded, null, 2));
} catch (error) {
  console.error('Token verification failed:', error.message);
}