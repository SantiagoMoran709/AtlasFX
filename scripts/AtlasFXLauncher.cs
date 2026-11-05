using System;
using System.Diagnostics;
using System.IO;
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

        if (!File.Exists(electron) || !File.Exists(renderer))
        {
            return ShowError("Conserva AtlasFX.exe junto a la carpeta apps. " +
                "Si faltan las dependencias o la compilación, consulta README.md.");
        }

        try
        {
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

    private static int ShowError(string message)
    {
        MessageBox.Show(message, "AtlasFX", MessageBoxButtons.OK, MessageBoxIcon.Error);
        return 1;
    }
}
