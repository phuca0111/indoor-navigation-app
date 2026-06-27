const path = require('path');

// WHY: Người dùng thường chạy `node server.js` từ thư mục gốc dự án.
// Chuyển cwd vào Backend_server để dotenv tự đọc đúng Backend_server/.env.
process.chdir(path.join(__dirname, 'Backend_server'));

require('./Backend_server/server');
