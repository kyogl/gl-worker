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
    let cacheDir = path.join(realPath, '.cache');
    fs.exists(cacheDir, (exists)=>{
      if (!exists) {
        fs.mkdirSync(cacheDir);
      };
    });
    event.reply('updateWorkspace', config.workspace);
  };
});

const getFiles = function (realPath, withUi) {
  let allFiles = [];
  function findFile(realPath) {
    let files = fs.readdirSync(realPath);
    files.forEach(function (item, index) {
      let fPath = path.join(realPath, item);
      let stat = fs.statSync(fPath);
      if (fPath.indexOf('.git')>0) {
        return;
      };
      if (stat.isDirectory() === true) {
        if (!withUi && fPath.indexOf('.cache')==(fPath.length-6)) {
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

ipcMain.on('getWorkspaceFileAndContent', (event, arg) => {
  const list = getFiles(arg, true);
  let fileList = _.filter(list, item=>{
    if (item.type=='dir') {
      return false;
    };
    if (item.path.indexOf('.svp')==(item.path.length-4)) {
      return true;
    };
    return false;
  });
  fileList = _.map(fileList, item=>{
    const str = fs.readFileSync(item.path,'utf-8');
    const fPath = item.path.replace(arg, '').replace(/\\/g, '/');
    return {
      path: fPath,
      data: str
    };
  });
  event.reply('getWorkspaceFileAndContentDone', fileList);
});

ipcMain.on('createWorkspaceNewFile', (event, arg)=>{
  const {
    workspacePath, fileName
  } = arg;
  let fName = fileName+'.svp';

  let pathArgs = fName.replace(/\\/g, '/').split('/');
  let testFpath = workspacePath;
  let testCacheFpath = path.join(workspacePath, '.cache');
  _.forEach(pathArgs, (p, index)=>{
    testFpath = path.join(testFpath, p);
    testCacheFpath = path.join(testCacheFpath, p);
    if (index<(pathArgs.length-1)) {
      if (!fs.existsSync(testFpath)) {
        fs.mkdirSync(testFpath);
      };
      if (!fs.existsSync(testCacheFpath)) {
        fs.mkdirSync(testCacheFpath);
      };
    };
  });

  let fPath = path.join(workspacePath, fName);
  let fUiPath = path.join(workspacePath, '.cache', fName);
  fs.writeFileSync(fPath, '');
  fs.writeFileSync(fUiPath, '');
  event.reply('createWorkspaceFileDone');
});

const getUiPath = function(arg) {
  const {
    workspacePath, fileName
  } = arg;

  let pathArgs = fileName.replace(/\\/g, '/').split('/');
  let uiArgs = [workspacePath, '.cache'];
  _.forEach(pathArgs, item=>{
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
    json.path = arg.fileName;
    event.reply('readWorkspaceFileDone', json);
  } catch(e) {
    console.log(e);
  }
});

ipcMain.on('saveWorkspaceFile', (event, arg)=>{
  const {
    workspacePath,
    fileName,
    ui,
    compile
  } = arg;
  let fPath = path.join(workspacePath, fileName);
  let fUiPath = getUiPath(arg);
  fs.writeFileSync(fPath, JSON.stringify(compile, null, 2));
  fs.writeFileSync(fUiPath, JSON.stringify(ui, null, 2));
  event.reply('saveWorkspaceFileDone');
});

ipcMain.on('deleteWorkspaceFile', (event, arg)=>{
  const {
    workspacePath, fileName
  } = arg;
  let fPath = path.join(workspacePath, fileName);
  let fUiPath = getUiPath(arg);
  fs.unlinkSync(fPath);
  fs.unlinkSync(fUiPath);
  event.reply('deleteWorkspaceFileDone');
});

ipcMain.on('renameWorkspaceFile', (event, arg)=>{
  const {
    workspacePath, fileName, fileNewName,
  } = arg;
  let fPath = path.join(workspacePath, fileName);
  let fUiPath = getUiPath(arg);
  let fPathNew = path.join(workspacePath, fileNewName+'.svp');
  let fUiPathNew = getUiPath({
    workspacePath,
    fileName: fileNewName+'.svp'
  });
  fs.renameSync(fPath, fPathNew);
  fs.renameSync(fUiPath, fUiPathNew);
  const list = getFiles(workspacePath);
  event.reply('updateWorkspaceFileList', list);
});

ipcMain.on('installSubgraph', (event, arg)=>{
  const {
    workspacePath, subgraphName, list,
  } = arg;
  _.forEach(list, item=>{
    let pathArgs
    let testFpath
    let fPath
    if (item.key.indexOf('/.cache')==0) {
      pathArgs = item.key.replace('/.cache', '').replace(/\\/g, '/').split('/');
      testFpath = path.join(workspacePath, '/.cache');
      fPath = path.join(workspacePath, '/.cache/subgraph/'+subgraphName, item.key.replace('/.cache', ''));
    } else {
      pathArgs = item.key.replace(/\\/g, '/').split('/');
      testFpath = workspacePath;
      fPath = path.join(workspacePath, '/subgraph/'+subgraphName, item.key);
    };
    pathArgs = _.concat('subgraph', subgraphName, pathArgs);
    _.forEach(pathArgs, (p, index)=>{
      testFpath = path.join(testFpath, p);
      if (index<(pathArgs.length-1)) {
        if (!fs.existsSync(testFpath)) {
          fs.mkdirSync(testFpath);
        };
      };
    });
    fs.writeFileSync(fPath, item.value);
  });
});