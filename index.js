const express = require('express');
const multer = require('multer');
const fs = require('fs');
const path = require('path');

const app = express();
const port = process.env.PORT || 3000;

// 设置静态文件目录
app.use(express.static('public'));
app.use(express.json());

// 使用内存存储替代磁盘存储，适应Vercel无服务器环境
const storage = multer.memoryStorage();
const upload = multer({ storage: storage });

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

// 上传文件的路由
app.post('/upload', upload.single('homeworkFile'), (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: '没有文件被上传' });
    }
    
    // 从内存中读取文件内容，不再依赖文件系统
    const fileContent = req.file.buffer.toString('utf8');
    const homeworkData = parseFileContent(fileContent);
    
    // 在内存存储模式下，不需要手动清理文件
    
    res.json({
      success: true,
      data: homeworkData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 保存进度的路由
app.post('/save-progress', (req, res) => {
  try {
    const data = req.body;
    
    // 这里可以扩展为保存到文件或数据库
    console.log('保存进度:', data);
    
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 启动服务器
app.listen(port, () => {
  console.log(`服务器运行在 http://localhost:${port}`);
});