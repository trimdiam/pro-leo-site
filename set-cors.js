const { Storage } = require('@google-cloud/storage');

const storage = new Storage({ projectId: 'st-francis-school-a3e7e' });
const bucket  = storage.bucket('st-francis-school-a3e7e.firebasestorage.app');

const corsConfig = [
  {
    origin:          ['https://st-francis-school-a3e7e.web.app', 'http://localhost'],
    method:          ['GET', 'PUT', 'POST', 'DELETE', 'HEAD', 'OPTIONS'],
    responseHeader:  ['Content-Type', 'Authorization', 'Content-Length', 'X-Requested-With'],
    maxAgeSeconds:   3600
  }
];

bucket.setCorsConfiguration(corsConfig)
  .then(() => console.log('✅ CORS set on Firebase Storage bucket.'))
  .catch(e => console.error('❌', e.message));
