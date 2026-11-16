using System;
using System.Text;
using System.Windows.Forms;

class ClipGet
{
    [STAThread]
    static int Main()
    {
        Console.OutputEncoding = Encoding.UTF8;
        var stdin = Console.In;
        var stdout = Console.Out;
        string line;
        while ((line = stdin.ReadLine()) != null)
        {
            if (line == "quit") break;
            try
            {
                var files = Clipboard.GetFileDropList();
                for (int i = 0; i < files.Count; i++) stdout.WriteLine(files[i]);
            }
            catch
            {
                stdout.WriteLine("__PI_CLIPGET_ERROR__");
            }
            stdout.WriteLine("__PI_CLIPGET_END__");
            stdout.Flush();
        }
        return 0;
    }
}
