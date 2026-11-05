using System;
using System.Diagnostics;
using System.IO;
using System.Threading;
using System.Windows.Forms;

internal static class AtlasFXLauncher
{
    [STAThread]
    private static int Main()
    {
        string root = AppDomain.CurrentDomain.BaseDirectory;
        string desktopApp = Path.Combine(root, "apps", "desktop");
        string electron = Path.Combine(desktopApp, "node_modules", "electron", "dist", "electron.exe");
        string renderer = Path.Combine(root, "apps", "web", "dist", "index.html");

        if (!File.Exists(renderer))
        {
            return ShowError("No se encontró la compilación de AtlasFX. Conserva AtlasFX.exe en la " +
                "carpeta del proyecto y ejecuta pnpm build si falta apps/web/dist.");
        }

        try
        {
            if (!File.Exists(electron) && !RestoreElectron(root, desktopApp, electron))
            {
                return ShowError("No se pudo preparar Electron. Ejecuta pnpm install y luego " +
                    "node apps/desktop/node_modules/electron/install.js desde la carpeta de AtlasFX.");
            }

            var startup = new ProcessStartInfo(electron, "\"" + desktopApp + "\"");
            startup.WorkingDirectory = root;
            startup.UseShellExecute = false;
            startup.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
            using (Process.Start(startup)) { }
            return 0;
        }
        catch (System.ComponentModel.Win32Exception error)
        {
            return ShowError("Windows no pudo abrir AtlasFX. " + error.Message);
        }
    }

    private static bool RestoreElectron(string root, string desktopApp, string electron)
    {
        string installer = Path.Combine(desktopApp, "node_modules", "electron", "install.js");
        if (!File.Exists(installer)) return false;

        // Repeated clicks must not extract into the same directory concurrently.
        using (var setupLock = new Mutex(false, @"Local\AtlasFXElectronSetup"))
        {
            try { setupLock.WaitOne(); }
            catch (AbandonedMutexException) { }
            try
            {
                if (File.Exists(electron)) return true;
                string bundledNode = Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.UserProfile),
                    @".cache\codex-runtimes\codex-primary-runtime\dependencies\node\bin\node.exe");
                string node = File.Exists(bundledNode) ? bundledNode : "node.exe";
                var setup = new ProcessStartInfo(node, "\"" + installer + "\"");
                setup.WorkingDirectory = root;
                setup.UseShellExecute = false;
                setup.CreateNoWindow = true;
                setup.EnvironmentVariables.Remove("ELECTRON_RUN_AS_NODE");
                using (var process = Process.Start(setup))
                {
                    if (process == null) return false;
                    process.WaitForExit();
                    return process.ExitCode == 0 && File.Exists(electron);
                }
            }
            catch (System.ComponentModel.Win32Exception) { return false; }
            finally { setupLock.ReleaseMutex(); }
        }
    }

    private static int ShowError(string message)
    {
        MessageBox.Show(message, "AtlasFX", MessageBoxButtons.OK, MessageBoxIcon.Error);
        return 1;
    }
}
