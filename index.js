const express = require('express');
const multer = require('multer');

// 创建Express应用
const app = express();

// 动态端口设置，支持Vercel环境
const port = process.env.PORT || 3000;

// 配置CORS支持
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }
  next();
});

// 设置静态文件目录
app.use(express.static('public'));
// JSON解析中间件，一次性配置大小限制
app.use(express.json({ limit: '1mb' }));

// 添加请求日志中间件，帮助调试
app.use((req, res, next) => {
  console.log(`收到请求: ${req.method} ${req.url}`);
  next();
});

// 使用内存存储替代磁盘存储，适应Vercel无服务器环境
const storage = multer.memoryStorage();
// 配置multer，设置文件大小限制 - 更保守的配置以适应Vercel环境
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 5 * 1024 * 1024, // 降低到5MB以适应Vercel的限制
    parts: 10, // 限制parts数量
    files: 1   // 只允许上传一个文件
  },
  fileFilter: (req, file, cb) => {
    try {
      // 更健壮的文件类型检查
      const allowedExtensions = ['.txt', '.md'];
      const fileName = (file.originalname || '').toLowerCase();
      const hasValidExtension = allowedExtensions.some(ext => fileName.endsWith(ext));
      
      if (hasValidExtension) {
        cb(null, true);
      } else {
        cb(new Error('只支持.txt和.md文件'), false);
      }
    } catch (err) {
      console.error('文件过滤错误:', err);
      cb(new Error('文件类型验证失败'), false);
    }
  }
});

// 解析文件内容的函数
function parseFileContent(content) {
  try {
    const lines = content.split('\n');
    const result = [];
    let currentSubject = null;
    
    lines.forEach(line => {
      line = line.trim();
      if (line.startsWith('##')) {
        // 新的科目
        const subjectName = line.substring(2).trim();
        currentSubject = {
          name: subjectName,
          tasks: [],
          completed: 0,
          total: 0
        };
        result.push(currentSubject);
      } else if (line && currentSubject) {
        // 检查是否是Markdown任务列表格式: - [x] 或 - [ ]
        const markdownTaskRegex = /^-\s*\[(x| )\]\s*(.*)$/i;
        const match = line.match(markdownTaskRegex);
        
        let taskText = line;
        let completed = false;
        
        if (match) {
          // 是Markdown任务列表格式
          completed = match[1].toLowerCase() === 'x';
          taskText = match[2].trim();
        }
        
        currentSubject.tasks.push({
          text: taskText,
          completed: completed
        });
        currentSubject.total++;
        if (completed) {
          currentSubject.completed++;
        }
      }
    });
    
    return result;
  } catch (error) {
    console.error('解析文件错误:', error);
    throw error;
  }
}

// 为/upload路由添加OPTIONS预检处理
app.options('/upload', (req, res) => {
  console.log('接收到/upload的OPTIONS预检请求');
  res.status(200).end();
});

// 上传文件的路由 - 增强Vercel环境的错误处理
app.post('/upload', (req, res) => {
  console.log('接收到上传请求，准备处理文件...');
  
  // 手动处理multer，避免中间件链在Vercel环境的问题
  upload.single('homeworkFile')(req, res, (err) => {
    if (err) {
      console.error('Multer上传错误:', err);
      return res.status(400).json({ 
        success: false,
        error: err.message || '文件上传失败' 
      });
    }

    console.log('文件上传成功，开始处理内容...');
    
    if (!req.file) {
      console.error('没有收到文件');
      return res.status(400).json({ 
        success: false,
        error: '没有文件被上传' 
      });
    }
    
    try {
      // 确保文件大小合理
      if (req.file.buffer.length > 10 * 1024 * 1024) {
        throw new Error('文件过大');
      }
      
      // 从内存中读取文件内容，不再依赖文件系统
      const fileContent = req.file.buffer.toString('utf8');
      console.log('文件内容读取成功，长度:', fileContent.length);
      
      // 解析文件内容
      const homeworkData = parseFileContent(fileContent);
      console.log('文件解析成功，生成数据项数量:', homeworkData.length);
      
      // 成功响应
      res.status(200).json({
        success: true,
        data: homeworkData
      });
    } catch (error) {
      console.error('处理文件内容错误:', error);
      res.status(400).json({ 
        success: false,
        error: error.message || '文件处理失败' 
      });
    }
  });
});

// 保存进度的路由 - 优化Vercel环境支持
app.post('/save-progress', (req, res) => {
  console.log('接收到保存进度请求...');
  
  try {
    // 更健壮的请求体检查
    if (!req.body || typeof req.body !== 'object') {
      console.error('无效的请求数据格式');
      return res.status(400).json({ 
        success: false,
        error: '无效的请求数据格式' 
      });
    }
    
    // 在Vercel环境中，我们无法持久化保存数据，所以只记录日志
    const dataPreview = JSON.stringify(req.body).substring(0, 150) + '...';
    console.log('接收到的进度数据:', dataPreview);
    
    // 返回成功响应，确保格式与前端期望一致
    res.status(200).json({ 
      success: true,
      message: '进度已成功接收' 
    });
  } catch (error) {
    console.error('保存进度过程中发生错误:', error);
    res.status(500).json({ 
      success: false,
      error: '服务器处理进度时出错' 
    });
  }
});

// 404处理中间件 - 必须放在所有路由之后，但在错误处理中间件之前
app.use((req, res) => {
  console.log(`404错误：未找到路径 ${req.method} ${req.url}`);
  res.status(404).json({ error: '请求的资源不存在' });
});

// 错误处理中间件 - 必须放在所有路由和404处理中间件之后
app.use((err, req, res, next) => {
  console.error('Express错误:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

// 启动服务器
// 在Vercel环境中，这部分代码不会被直接使用，但保留以支持本地开发
if (require.main === module) {
  app.listen(port, () => {
    console.log(`服务器运行在 http://localhost:${port}`);
  });
}

// 导出app以支持Vercel的Serverless函数模式
module.exports = app;