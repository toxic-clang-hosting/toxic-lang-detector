const { app, BrowserWindow } = require('electron');
const { server, PORT } = require('./server');

let mainWindow;

// Start the shared Express server, then open the window
const serverReady = new Promise(resolve => server.listen(PORT, resolve));

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1200,
    height: 800,
    minWidth: 900,
    minHeight: 600,
    titleBarStyle: 'hiddenInset',
    backgroundColor: '#0f1117',
    title: 'Toxic Language Detector',
  });
  mainWindow.loadURL(`http://localhost:${PORT}`);
}

app.whenReady().then(async () => {
  await serverReady;
  createWindow();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
