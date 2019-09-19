const { 
  ipcMain,
  dialog,
} = require('electron');

const fs = require('fs');
const path = require("path");
const _ = require('lodash');

const configPath = path.join(__dirname, '../config.json');

const writeConfig = function(data) {
  fs.writeFileSync(configPath, JSON.stringify(data, null, 2));
};

const readConfig = function() {
  return JSON.parse(fs.readFileSync(configPath,'utf-8'));
};

fs.exists(configPath, (exists)=>{
  if (!exists) {
    const config = {
      workspace: [],
    };
    writeConfig(config);
  };
});

ipcMain.on('getWorkspace', (event) => {
  let config = readConfig();
  event.reply('updateWorkspace', config.workspace);
});

ipcMain.on('removeWorkspace', (event, arg) => {
  let config = readConfig();
  config.workspace = _.filter(config.workspace, n=>{
    return n.path!=arg;
  });
  writeConfig(config);
  event.reply('updateWorkspace', config.workspace);
});

ipcMain.on('createWorkspace', (event) => {
  let config = readConfig();
  const dir = dialog.showOpenDialogSync({
    properties: ['openDirectory'],
    title: '选择workspace目录'
  });
  if (dir) {
    let realPath = path.join(dir[0]);
    let inws = _.find(config.workspace, n=>{
      return n.path==realPath;
    });
    if (_.isObject(inws)) {
      return;
    };
    let ws = {
      path: realPath,
    };
    config.workspace.push(ws);
    writeConfig(config);
    let cacheDir = path.join(realPath, './.cache');
    fs.exists(cacheDir, (exists)=>{
      if (!exists) {
        fs.mkdirSync(cacheDir);
      };
    });
    event.reply('updateWorkspace', config.workspace);
  };
});

const getFiles = function (realPath) {
  let allFiles = [];
  function findFile(realPath) {
    let files = fs.readdirSync(realPath);
    files.forEach(function (item, index) {
      let fPath = path.join(realPath, item);
      let stat = fs.statSync(fPath);
      if (stat.isDirectory() === true) {
        if (fPath.indexOf('.cache')==(fPath.length-6)) {
          return;
        };
        allFiles.push({
          type: 'dir',
          path: fPath
        });
        findFile(fPath);
      }
      if (stat.isFile() === true) {
        allFiles.push({
          type: 'file',
          path: fPath
        });
      }
    });
  }
  findFile(realPath);
  return allFiles;
};

ipcMain.on('getWorkspaceFileList', (event, arg) => {
  const list = getFiles(arg);
  event.reply('updateWorkspaceFileList', list);
});

ipcMain.on('createWorkspaceNewFile', (event, arg)=>{
  const {
    workspacePath, fileName
  } = arg;
  let fName = fileName+'.gl';
  let fPath = path.join(workspacePath, fName);
  let fUiPath = path.join(workspacePath, './.cache/', fName);
  fs.writeFileSync(fPath, '');
  fs.writeFileSync(fUiPath, '');
  event.reply('createWorkspaceFileDone');
});

const getUiPath = function(fPath) {
  let pathArgs = fPath.replace(/\\/g, '/').split('/');
  let uiArgs = [];
  _.forEach(pathArgs, (item, index)=>{
    if (index==pathArgs.length-1) {
      uiArgs.push('.cache');
    };
    uiArgs.push(item);
  });
  return path.join(...uiArgs);
};

ipcMain.on('readWorkspaceFile', (event, arg)=>{
  let fUiPath = getUiPath(arg);
  const str = fs.readFileSync(fUiPath,'utf-8');
  if (!str) {
    event.reply('readWorkspaceFileDone', {
      nodes: [],
      edges: [],
    });
    return;
  };
  try {
    let json = JSON.parse(str);
    event.reply('readWorkspaceFileDone', json);
  } catch(e) {
    console.log(e);
  }
});

ipcMain.on('saveWorkspaceFile', (event, arg)=>{
  const {
    path: fPath,
    ui,
    compile
  } = arg;
  let fUiPath = getUiPath(fPath);
  fs.writeFileSync(fPath, JSON.stringify(compile));
  fs.writeFileSync(fUiPath, JSON.stringify(ui));
  event.reply('saveWorkspaceFileDone');
});

ipcMain.on('deleteWorkspaceFile', (event, arg)=>{
  let fUiPath = getUiPath(arg);
  fs.unlinkSync(arg);
  fs.unlinkSync(fUiPath);
  event.reply('deleteWorkspaceFileDone');
});
