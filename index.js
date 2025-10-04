const express = require('express');
const multer = require('multer');

// 创建Express应用
const app = express();

// 动态端口设置，支持Vercel环境
const port = process.env.PORT || 3000;

// 添加错误处理中间件
app.use((err, req, res, next) => {
  console.error('Express错误:', err);
  res.status(500).json({ error: '服务器内部错误' });
});

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
// JSON解析中间件
app.use(express.json());
// 安全起见，限制JSON体大小
app.use(express.json({ limit: '1mb' }));

// 使用内存存储替代磁盘存储，适应Vercel无服务器环境
const storage = multer.memoryStorage();
// 配置multer，设置文件大小限制
const upload = multer({
  storage: storage,
  limits: {
    fileSize: 10 * 1024 * 1024, // 10MB限制
  },
  fileFilter: (req, file, cb) => {
    // 只接受.txt和.md文件
    if (file.mimetype === 'text/plain' || file.mimetype === 'text/markdown' || 
        file.originalname.endsWith('.txt') || file.originalname.endsWith('.md')) {
      cb(null, true);
    } else {
      cb(new Error('只支持.txt和.md文件'), false);
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

// 上传文件的路由 - 添加try-catch保护整个路由处理
app.post('/upload', (req, res) => {
  try {
    upload.single('homeworkFile')(req, res, async (err) => {
      if (err) {
        return res.status(400).json({ 
          error: err.message || '文件上传失败' 
        });
      }

      if (!req.file) {
        return res.status(400).json({ error: '没有文件被上传' });
      }
      
      try {
        // 从内存中读取文件内容，不再依赖文件系统
        const fileContent = req.file.buffer.toString('utf8');
        const homeworkData = parseFileContent(fileContent);
        
        // 成功响应
        res.status(200).json({
          success: true,
          data: homeworkData
        });
      } catch (parseError) {
        console.error('解析文件错误:', parseError);
        res.status(400).json({ 
          error: '文件解析失败: ' + parseError.message 
        });
      }
    });
  } catch (error) {
    console.error('路由处理错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
});

// 保存进度的路由
app.post('/save-progress', (req, res) => {
  try {
    // 检查请求体
    if (!req.body) {
      return res.status(400).json({ error: '无效的请求数据' });
    }
    
    // 在Vercel环境中，我们无法持久化保存数据，所以只记录日志
    console.log('接收到的进度数据:', JSON.stringify(req.body).substring(0, 100) + '...');
    
    // 返回成功响应
    res.status(200).json({ 
      success: true,
      message: '进度已接收' 
    });
  } catch (error) {
    console.error('保存进度错误:', error);
    res.status(500).json({ error: '服务器内部错误' });
  }
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