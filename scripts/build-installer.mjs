import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';

const ROOT_DIR = path.resolve('.');
const RUNTIME_DIR = path.join(ROOT_DIR, 'runtime/installer-build');
const PUBLIC_DOWNLOADS = path.join(ROOT_DIR, 'public/downloads');
const TARGET_EXE = path.join(PUBLIC_DOWNLOADS, 'HouseAndLife-Agent-Setup.exe');

async function main() {
  console.log('=== [1/5] Building Desktop Agent Frontend & Main Bundle ===');
  execSync('npm run build:desktop', { stdio: 'inherit', cwd: ROOT_DIR });

  console.log('=== [2/5] Staging Electron Runtime and App Payload ===');
  if (fs.existsSync(RUNTIME_DIR)) {
    fs.rmSync(RUNTIME_DIR, { recursive: true, force: true });
  }
  fs.mkdirSync(RUNTIME_DIR, { recursive: true });

  const appStage = path.join(RUNTIME_DIR, 'app');
  const electronDist = path.join(ROOT_DIR, 'node_modules/electron/dist');
  
  if (!fs.existsSync(electronDist)) {
    throw new Error('Electron runtime not found in node_modules/electron/dist. Run npm install first.');
  }

  // Copy electron runtime
  fs.cpSync(electronDist, appStage, { recursive: true });

  // Rename electron.exe to HouseAndLife-Agent.exe
  const origExe = path.join(appStage, 'electron.exe');
  const renamedExe = path.join(appStage, 'HouseAndLife-Agent.exe');
  if (fs.existsSync(origExe)) {
    fs.renameSync(origExe, renamedExe);
  }

  // Remove default_app.asar
  const defaultAsar = path.join(appStage, 'resources/default_app.asar');
  if (fs.existsSync(defaultAsar)) {
    fs.unlinkSync(defaultAsar);
  }

  // Place bundled desktop app into resources/app
  const appResources = path.join(appStage, 'resources/app');
  fs.mkdirSync(appResources, { recursive: true });
  fs.cpSync(path.join(ROOT_DIR, 'desktop/dist'), appResources, { recursive: true });

  // Create package.json for Electron
  fs.writeFileSync(
    path.join(appResources, 'package.json'),
    JSON.stringify(
      {
        name: 'houseandlife-desktop-agent',
        productName: 'House & Life Desktop Agent',
        version: '1.0.0',
        main: 'main/index.cjs',
        author: 'House & Life Real Estate AI',
        description: 'Desktop Agent - Quét tin BĐS Đa Kênh & Đồng bộ Lead tự động',
      },
      null,
      2
    )
  );

  console.log('=== [3/5] Compressing Payload into Zip Archive ===');
  const zipFile = path.join(RUNTIME_DIR, 'payload.zip');
  execSync(
    `powershell -Command "Compress-Archive -Path '${appStage}\\*' -DestinationPath '${zipFile}' -CompressionLevel Fastest"`,
    { stdio: 'inherit' }
  );

  const zipStats = fs.statSync(zipFile);
  console.log(`Payload zip ready: ${(zipStats.size / (1024 * 1024)).toFixed(2)} MB`);

  console.log('=== [4/5] Writing Native C# Windows Installer Source ===');
  const csSource = `
using System;
using System.IO;
using System.IO.Compression;
using System.Reflection;
using System.Diagnostics;
using System.Threading;
using System.Windows.Forms;
using System.Drawing;

namespace HouseAndLifeInstaller
{
    static class Program
    {
        [STAThread]
        static void Main(string[] args)
        {
            Application.EnableVisualStyles();
            Application.SetCompatibleTextRenderingDefault(false);
            Application.Run(new InstallerForm());
        }
    }

    public class InstallerForm : Form
    {
        private ProgressBar progressBar;
        private Label statusLabel;
        private Label titleLabel;
        private Label subTitleLabel;

        public InstallerForm()
        {
            this.Text = "Cài đặt House & Life Desktop Agent";
            this.Size = new Size(540, 260);
            this.StartPosition = FormStartPosition.CenterScreen;
            this.FormBorderStyle = FormBorderStyle.FixedDialog;
            this.MaximizeBox = false;
            this.MinimizeBox = false;
            this.BackColor = Color.FromArgb(15, 23, 42); // slate-900

            titleLabel = new Label();
            titleLabel.Text = "House & Life Desktop Agent";
            titleLabel.Font = new Font("Segoe UI", 14F, FontStyle.Bold);
            titleLabel.ForeColor = Color.White;
            titleLabel.Location = new Point(30, 25);
            titleLabel.AutoSize = true;
            this.Controls.Add(titleLabel);

            subTitleLabel = new Label();
            subTitleLabel.Text = "Hệ thống AI quét tin BĐS đa kênh (Facebook, Zalo) & đồng bộ Lead";
            subTitleLabel.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            subTitleLabel.ForeColor = Color.FromArgb(148, 163, 184); // slate-400
            subTitleLabel.Location = new Point(32, 60);
            subTitleLabel.AutoSize = true;
            this.Controls.Add(subTitleLabel);

            progressBar = new ProgressBar();
            progressBar.Location = new Point(32, 105);
            progressBar.Size = new Size(460, 26);
            progressBar.Style = ProgressBarStyle.Continuous;
            this.Controls.Add(progressBar);

            statusLabel = new Label();
            statusLabel.Text = "Đang chuẩn bị cài đặt...";
            statusLabel.Font = new Font("Segoe UI", 9F, FontStyle.Regular);
            statusLabel.ForeColor = Color.FromArgb(52, 211, 153); // emerald-400
            statusLabel.Location = new Point(32, 145);
            statusLabel.Size = new Size(460, 40);
            this.Controls.Add(statusLabel);

            this.Shown += (s, e) =>
            {
                Thread worker = new Thread(DoInstall);
                worker.IsBackground = true;
                worker.Start();
            };
        }

        private void SetStatus(string text, int progress)
        {
            if (this.InvokeRequired)
            {
                this.Invoke(new Action(() => SetStatus(text, progress)));
                return;
            }
            statusLabel.Text = text;
            if (progress >= 0 && progress <= 100)
            {
                progressBar.Value = progress;
            }
        }

        private void DoInstall()
        {
            try
            {
                SetStatus("Đang kiểm tra tiến trình đang chạy...", 10);
                Thread.Sleep(300);

                // Terminate any running instance of the agent
                foreach (var p in Process.GetProcessesByName("HouseAndLife-Agent"))
                {
                    try { p.Kill(); p.WaitForExit(2000); } catch { }
                }

                string localAppData = Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData);
                string installDir = Path.Combine(localAppData, "HouseAndLife-Agent");

                SetStatus("Đang chuẩn bị thư mục cài đặt...", 20);
                if (!Directory.Exists(installDir))
                {
                    Directory.CreateDirectory(installDir);
                }

                SetStatus("Đang giải nén tài nguyên ứng dụng...", 30);
                Assembly asm = Assembly.GetExecutingAssembly();
                using (Stream stream = asm.GetManifestResourceStream("AppPayload"))
                {
                    if (stream == null)
                    {
                        throw new Exception("Không tìm thấy gói cài đặt nhúng (AppPayload stream null).");
                    }

                    using (ZipArchive archive = new ZipArchive(stream, ZipArchiveMode.Read))
                    {
                        int total = archive.Entries.Count;
                        int current = 0;

                        foreach (ZipArchiveEntry entry in archive.Entries)
                        {
                            current++;
                            int pct = 30 + (int)((float)current / total * 50); // 30% -> 80%

                            string fullPath = Path.Combine(installDir, entry.FullName);
                            if (string.IsNullOrEmpty(entry.Name))
                            {
                                // Directory
                                Directory.CreateDirectory(fullPath);
                            }
                            else
                            {
                                string parent = Path.GetDirectoryName(fullPath);
                                if (!Directory.Exists(parent))
                                {
                                    Directory.CreateDirectory(parent);
                                }
                                entry.ExtractToFile(fullPath, true);
                            }

                            if (current % 15 == 0 || current == total)
                            {
                                SetStatus(string.Format("Đang cài đặt tệp tin ({0}/{1})...", current, total), pct);
                            }
                        }
                    }
                }

                SetStatus("Đang tạo Shortcut ngoài Desktop...", 85);
                string exePath = Path.Combine(installDir, "HouseAndLife-Agent.exe");
                CreateShortcuts(installDir, exePath);

                SetStatus("Hoàn tất cài đặt! Đang khởi động House & Life Agent...", 100);
                Thread.Sleep(800);

                // Launch agent
                if (File.Exists(exePath))
                {
                    Process.Start(new ProcessStartInfo
                    {
                        FileName = exePath,
                        WorkingDirectory = installDir
                    });
                }

                Thread.Sleep(1000);
                this.Invoke(new Action(() => this.Close()));
            }
            catch (Exception ex)
            {
                if (this.InvokeRequired)
                {
                    this.Invoke(new Action(() =>
                    {
                        MessageBox.Show(this, "Lỗi cài đặt: " + ex.Message, "House & Life Installer", MessageBoxButtons.OK, MessageBoxIcon.Error);
                        this.Close();
                    }));
                }
                else
                {
                    MessageBox.Show(this, "Lỗi cài đặt: " + ex.Message, "House & Life Installer", MessageBoxButtons.OK, MessageBoxIcon.Error);
                    this.Close();
                }
            }
        }

        private void CreateShortcuts(string installDir, string exePath)
        {
            try
            {
                Type shellType = Type.GetTypeFromProgID("WScript.Shell");
                if (shellType == null) return;
                dynamic shell = Activator.CreateInstance(shellType);

                // Desktop shortcut
                string desktop = Environment.GetFolderPath(Environment.SpecialFolder.DesktopDirectory);
                string desktopShortcut = Path.Combine(desktop, "House & Life Desktop Agent.lnk");
                dynamic s1 = shell.CreateShortcut(desktopShortcut);
                s1.TargetPath = exePath;
                s1.WorkingDirectory = installDir;
                s1.Description = "House & Life Desktop Agent";
                s1.Save();

                // Start Menu shortcut
                string startMenu = Environment.GetFolderPath(Environment.SpecialFolder.Programs);
                string startShortcut = Path.Combine(startMenu, "House & Life Desktop Agent.lnk");
                dynamic s2 = shell.CreateShortcut(startShortcut);
                s2.TargetPath = exePath;
                s2.WorkingDirectory = installDir;
                s2.Description = "House & Life Desktop Agent";
                s2.Save();
            }
            catch
            {
                // Non-fatal if shortcut creation fails
            }
        }
    }
}
`;

  const csFile = path.join(RUNTIME_DIR, 'Installer.cs');
  fs.writeFileSync(csFile, csSource, 'utf8');

  console.log('=== [5/5] Compiling HouseAndLife-Agent-Setup.exe with csc.exe ===');
  if (!fs.existsSync(PUBLIC_DOWNLOADS)) {
    fs.mkdirSync(PUBLIC_DOWNLOADS, { recursive: true });
  }

  const cscPath = 'C:\\Windows\\Microsoft.NET\\Framework64\\v4.0.30319\\csc.exe';
  const compileCmd = [
    `"${cscPath}"`,
    '/target:winexe',
    '/platform:x64',
    '/r:System.dll',
    '/r:System.Drawing.dll',
    '/r:System.Windows.Forms.dll',
    '/r:System.IO.Compression.dll',
    '/r:System.IO.Compression.FileSystem.dll',
    '/r:Microsoft.CSharp.dll',
    `/resource:"${zipFile}",AppPayload`,
    `/out:"${TARGET_EXE}"`,
    `"${csFile}"`,
  ].join(' ');

  execSync(compileCmd, { stdio: 'inherit' });

  if (fs.existsSync(TARGET_EXE)) {
    const exeStats = fs.statSync(TARGET_EXE);
    console.log('================================================================');
    console.log(' SUCCESS: HouseAndLife-Agent-Setup.exe created successfully!');
    console.log(` Location: ${TARGET_EXE}`);
    console.log(` File Size: ${(exeStats.size / (1024 * 1024)).toFixed(2)} MB`);
    console.log('================================================================');
  } else {
    throw new Error('Compilation finished but target EXE not found.');
  }
}

main().catch((err) => {
  console.error('FATAL BUILD ERROR:', err);
  process.exit(1);
});
