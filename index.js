const express = require('express');
const multer = require('multer');

// 创建Express应用
const app = express();
const PORT = process.env.PORT || 3000;

// 配置CORS
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  
  next();
});

// 静态文件服务 - Vercel会自动处理静态文件，这仅用于本地开发
app.use(express.static('public'));

// JSON解析
app.use(express.json({ limit: '1mb' }));

// 日志中间件
app.use((req, res, next) => {
  console.log(`[Server] ${new Date().toISOString()} - ${req.method} ${req.url}`);
  next();
});

// 配置multer内存存储，确保不使用任何文件系统写入操作
// 直接在multer配置中使用memoryStorage()，不创建中间变量
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 5 * 1024 * 1024, // 5MB限制
    files: 1,
    parts: 10
  },
  fileFilter: (req, file, cb) => {
    try {
      // 安全的文件类型检查
      const ext = (file.originalname || '').toLowerCase().split('.').pop();
      if (['txt', 'md'].includes(ext)) {
        return cb(null, true);
      }
      return cb(new Error('只支持.txt和.md文件'), false);
    } catch (err) {
      console.error('[Error] 文件验证:', err);
      return cb(new Error('文件验证失败'), false);
    }
  }
});

// 解析文件内容的函数 - 纯内存操作，不涉及文件系统
function parseFileContent(content) {
  try {
    const lines = content.split('\n');
    const result = [];
    let currentSubject = null;
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      
      if (line.startsWith('##')) {
        // 新科目
        const subjectName = line.substring(2).trim();
        if (subjectName) {
          currentSubject = {
            name: subjectName,
            tasks: [],
            completed: 0,
            total: 0
          };
          result.push(currentSubject);
        }
      } else if (line && currentSubject) {
        // 解析任务行
        const taskRegex = /^-\s*\[(x| )\]\s*(.*)$/i;
        const match = line.match(taskRegex);
        
        let taskText = line;
        let isCompleted = false;
        
        if (match) {
          isCompleted = match[1].toLowerCase() === 'x';
          taskText = match[2].trim();
        }
        
        currentSubject.tasks.push({
          text: taskText,
          completed: isCompleted
        });
        currentSubject.total++;
        if (isCompleted) {
          currentSubject.completed++;
        }
      }
    }
    
    return result;
  } catch (error) {
    console.error('[Error] 解析内容:', error);
    throw error;
  }
}

// OPTIONS预检请求处理
app.options('/upload', (req, res) => {
  console.log('[Server] 收到/upload的OPTIONS预检请求');
  res.status(200).end();
});

// 文件上传端点 - 完全在内存中处理，不使用任何文件系统操作
app.post('/upload', (req, res) => {
  console.log('[Server] 开始处理文件上传请求');
  
  // 使用multer处理上传，全部在内存中完成
  upload.single('homeworkFile')(req, res, (err) => {
    if (err) {
      console.error('[Error] 上传处理:', err);
      return res.status(400).json({
        success: false,
        error: err.message || '文件上传失败'
      });
    }
    
    if (!req.file || !req.file.buffer) {
      console.error('[Error] 未接收到文件');
      return res.status(400).json({
        success: false,
        error: '未收到上传文件'
      });
    }
    
    try {
      // 安全地将文件缓冲区转换为字符串
      const fileContent = req.file.buffer.toString('utf8');
      console.log(`[Server] 文件内容读取成功，大小: ${fileContent.length} 字符`);
      
      // 解析文件内容
      const parsedData = parseFileContent(fileContent);
      console.log(`[Server] 解析完成，生成 ${parsedData.length} 个数据项`);
      
      // 返回成功响应
      return res.status(200).json({
        success: true,
        data: parsedData
      });
    } catch (error) {
      console.error('[Error] 内容处理:', error);
      return res.status(400).json({
        success: false,
        error: error.message || '文件处理失败'
      });
    }
  });
});

// 保存进度端点
app.post('/save-progress', (req, res) => {
  console.log('[Server] 收到保存进度请求');
  
  try {
    if (!req.body || typeof req.body !== 'object') {
      return res.status(400).json({
        success: false,
        error: '无效的数据格式'
      });
    }
    
    console.log('[Server] 进度数据已接收');
    
    return res.status(200).json({
      success: true,
      message: '进度已接收'
    });
  } catch (error) {
    console.error('[Error] 保存进度:', error);
    return res.status(500).json({
      success: false,
      error: '处理进度时出错'
    });
  }
});

// 404处理
app.use((req, res) => {
  console.log(`[Warning] 404 - ${req.method} ${req.url}`);
  res.status(404).json({ error: '请求的资源不存在' });
});

// 全局错误处理
app.use((err, req, res, next) => {
  console.error('[Critical] 服务器错误:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

// 本地开发服务器启动
if (require.main === module) {
  const server = app.listen(PORT, () => {
    console.log(`[Info] 本地服务器运行在 http://localhost:${PORT}`);
  });
  
  // 优雅关闭服务器
  process.on('SIGINT', () => {
    console.log('[Info] 服务器正在关闭...');
    server.close(() => {
      console.log('[Info] 服务器已关闭');
      process.exit(0);
    });
  });
}

// 导出app供Vercel使用
module.exports = app;