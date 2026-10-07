using System;
using System.Diagnostics;
using System.Drawing;
using System.IO;
using System.Net;
using System.Net.Sockets;
using System.Security.Cryptography;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Windows.Forms;

internal static class Launcher
{
    [STAThread]
    private static int Main(string[] args)
    {
        string dataDir = Path.GetFullPath(Environment.GetEnvironmentVariable("VAPE_SOCIETY_DATA_DIR") ??
            Path.Combine(Environment.GetFolderPath(Environment.SpecialFolder.LocalApplicationData), "VapeSociety"));
        string key;
        using (var hash = SHA256.Create())
            key = BitConverter.ToString(hash.ComputeHash(Encoding.UTF8.GetBytes(dataDir.ToLowerInvariant()))).Replace("-", "").Substring(0, 24);
        string name = @"Local\VapeSociety-" + key;
        bool created;
        using (var gate = new Mutex(true, name, out created))
        {
            if (!created)
            {
                bool stop = Array.IndexOf(args, "--stop") >= 0;
                try
                {
                    using (var signal = EventWaitHandle.OpenExisting(name + (stop ? "-stop" : "-open"))) signal.Set();
                    if (stop)
                    {
                        bool acquired;
                        try { acquired = gate.WaitOne(30000); }
                        catch (AbandonedMutexException) { acquired = true; }
                        if (!acquired) return 2;
                        gate.ReleaseMutex();
                    }
                    return 0;
                }
                catch (WaitHandleCannotBeOpenedException) { return 2; }
            }
            try
            {
                if (Array.IndexOf(args, "--stop") >= 0) return 0;
                Application.EnableVisualStyles();
                Application.SetCompatibleTextRenderingDefault(false);
                using (var context = new TrayContext(dataDir, name, Array.IndexOf(args, "--no-browser") >= 0))
                    Application.Run(context);
                return 0;
            }
            catch (Exception error)
            {
                MessageBox.Show(error.Message, "Vape Society", MessageBoxButtons.OK, MessageBoxIcon.Error);
                return 1;
            }
            finally { gate.ReleaseMutex(); }
        }
    }
}

internal sealed class TrayContext : ApplicationContext
{
    private readonly Control dispatcher = new Control();
    private readonly NotifyIcon tray;
    private readonly EventWaitHandle openEvent;
    private readonly EventWaitHandle stopEvent;
    private readonly RegisteredWaitHandle openWait;
    private readonly RegisteredWaitHandle stopWait;
    private readonly string dataDir;
    private readonly string installDir = AppDomain.CurrentDomain.BaseDirectory;
    private readonly string url;
    private readonly bool noBrowser;
    private readonly object logLock = new object();
    private Process server;
    private StreamWriter log;
    private bool ready;
    private bool closing;

    internal TrayContext(string dataDir, string name, bool noBrowser)
    {
        this.dataDir = dataDir;
        this.noBrowser = noBrowser;
        int port;
        if (!Int32.TryParse(Environment.GetEnvironmentVariable("VAPE_SOCIETY_PORT") ?? "43120", out port) || port < 1024 || port > 65535)
            throw new InvalidOperationException("El puerto local del sistema es inválido.");
        url = "http://127.0.0.1:" + port;
        var handle = dispatcher.Handle;
        var menu = new ContextMenuStrip();
        menu.Items.Add("Abrir sistema", null, delegate { OpenBrowser(); });
        menu.Items.Add("Abrir carpeta de backups", null, delegate { OpenPath(Path.Combine(dataDir, "backups")); });
        menu.Items.Add(new ToolStripSeparator());
        menu.Items.Add("Cerrar sistema", null, delegate { StopServer(); });
        tray = new NotifyIcon
        {
            Icon = Icon.ExtractAssociatedIcon(Application.ExecutablePath),
            Text = "Vape Society · Iniciando…",
            ContextMenuStrip = menu,
            Visible = true
        };
        tray.DoubleClick += delegate { OpenBrowser(); };
        openEvent = new EventWaitHandle(false, EventResetMode.AutoReset, name + "-open");
        stopEvent = new EventWaitHandle(false, EventResetMode.AutoReset, name + "-stop");
        openWait = ThreadPool.RegisterWaitForSingleObject(openEvent, delegate { Dispatch(OpenBrowser); }, null, Timeout.Infinite, false);
        stopWait = ThreadPool.RegisterWaitForSingleObject(stopEvent, delegate { Dispatch(StopServer); }, null, Timeout.Infinite, true);
        StartServer(port);
    }

    private void Dispatch(Action action)
    {
        if (!dispatcher.IsDisposed) dispatcher.BeginInvoke(action);
    }

    private async void StartServer(int port)
    {
        try
        {
            var listener = new TcpListener(IPAddress.Loopback, port);
            try { listener.Start(); }
            catch (SocketException) { throw new InvalidOperationException("El puerto " + port + " está en uso. Cerrá la otra instancia y volvé a abrir Vape Society."); }
            finally { listener.Stop(); }
            Directory.CreateDirectory(Path.Combine(dataDir, "logs"));
            Directory.CreateDirectory(Path.Combine(dataDir, "backups"));
            string logPath = Path.Combine(dataDir, "logs", "inicio-" + DateTime.Now.ToString("yyyy-MM-dd") + ".log");
            log = new StreamWriter(logPath, true, new UTF8Encoding(false)) { AutoFlush = true };
            var start = new ProcessStartInfo
            {
                FileName = Path.Combine(installDir, "runtime", "node.exe"),
                Arguments = "\"" + Path.Combine(installDir, "runtime.cjs") + "\"",
                WorkingDirectory = Path.Combine(installDir, "backend"),
                UseShellExecute = false,
                CreateNoWindow = true,
                RedirectStandardOutput = true,
                RedirectStandardError = true,
                RedirectStandardInput = true,
                StandardOutputEncoding = Encoding.UTF8,
                StandardErrorEncoding = Encoding.UTF8
            };
            start.EnvironmentVariables["VAPE_SOCIETY_DATA_DIR"] = dataDir;
            start.EnvironmentVariables["VAPE_SOCIETY_PORT"] = port.ToString();
            server = new Process { StartInfo = start, EnableRaisingEvents = true };
            server.OutputDataReceived += delegate(object sender, DataReceivedEventArgs e) { WriteLog(e.Data); };
            server.ErrorDataReceived += delegate(object sender, DataReceivedEventArgs e) { WriteLog(e.Data); };
            server.Exited += delegate { Dispatch(OnServerExited); };
            server.Start();
            server.BeginOutputReadLine();
            server.BeginErrorReadLine();
            await Task.Run(async delegate
            {
                var elapsed = Stopwatch.StartNew();
                while (elapsed.Elapsed.TotalSeconds < 90)
                {
                    if (server.HasExited) throw new InvalidOperationException("El sistema no pudo iniciarse.");
                    try
                    {
                        var request = (HttpWebRequest)WebRequest.Create(url + "/health/ready");
                        request.Proxy = null;
                        request.Timeout = 1000;
                        using (var response = request.GetResponse())
                        using (var reader = new StreamReader(response.GetResponseStream()))
                        {
                            string body = reader.ReadToEnd();
                            if (body.Contains("\"status\":\"ready\"") && body.Contains("retail-core-backend") && !server.HasExited) return;
                        }
                    }
                    catch (WebException) { }
                    await Task.Delay(250);
                }
                throw new TimeoutException("El sistema tardó demasiado en iniciarse.");
            });
            if (closing) return;
            ready = true;
            tray.Text = "Vape Society · En ejecución";
            OpenBrowser();
        }
        catch (Exception error)
        {
            WriteLog(error.ToString());
            if (!closing)
            {
                MessageBox.Show(error.Message + "\n\nRegistro de inicio: " + Path.Combine(dataDir, "logs"),
                    "Vape Society", MessageBoxButtons.OK, MessageBoxIcon.Error);
                StopServer();
            }
        }
    }

    private void WriteLog(string text)
    {
        if (text == null) return;
        lock (logLock) { if (log != null) log.WriteLine(text); }
    }

    private void OpenBrowser()
    {
        if (ready && !closing && !noBrowser) OpenPath(url);
    }

    private void OpenPath(string path)
    {
        try { Process.Start(new ProcessStartInfo(path) { UseShellExecute = true }); }
        catch (Exception error) { MessageBox.Show(error.Message, "Vape Society", MessageBoxButtons.OK, MessageBoxIcon.Error); }
    }

    private void OnServerExited()
    {
        if (!closing && ready)
        {
            ready = false;
            MessageBox.Show("El sistema se cerró. Podés abrirlo nuevamente desde el acceso directo.\n\nRegistro: " + Path.Combine(dataDir, "logs"),
                "Vape Society", MessageBoxButtons.OK, MessageBoxIcon.Warning);
            StopServer();
        }
    }

    private async void StopServer()
    {
        if (closing) return;
        closing = true;
        ready = false;
        tray.Text = "Vape Society · Cerrando…";
        await Task.Run(delegate
        {
            if (server == null) return;
            try
            {
                if (!server.HasExited)
                {
                    server.StandardInput.WriteLine("shutdown");
                    server.StandardInput.Flush();
                    if (!server.WaitForExit(20000)) { server.Kill(); server.WaitForExit(); }
                }
            }
            catch (InvalidOperationException) { }
            catch (IOException) { if (!server.HasExited) server.Kill(); }
        });
        tray.Visible = false;
        ExitThread();
    }

    protected override void Dispose(bool disposing)
    {
        if (disposing)
        {
            openWait.Unregister(null);
            stopWait.Unregister(null);
            openEvent.Dispose();
            stopEvent.Dispose();
            tray.Dispose();
            dispatcher.Dispose();
            if (server != null) server.Dispose();
            lock (logLock) { if (log != null) { log.Dispose(); log = null; } }
        }
        base.Dispose(disposing);
    }
}
