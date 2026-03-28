using Advance_Batch_Loader.Services;
using OfficeOpenXml;
using System.IO;

var builder = WebApplication.CreateBuilder(args);

builder.WebHost.ConfigureKestrel(serverOptions =>
{
    serverOptions.ListenAnyIP(5000); // internal port
});

builder.WebHost.UseIISIntegration();

AppDomain.CurrentDomain.UnhandledException += (sender, eventArgs) =>
{
    try
    {
        var ex = (Exception)eventArgs.ExceptionObject;

        Directory.CreateDirectory("C:\\inetpub\\BatchLoaderAPI\\logs");
        File.WriteAllText("C:\\inetpub\\BatchLoaderAPI\\logs\\error.txt", ex.ToString());
    }
    catch { }
};

try
{
    ExcelPackage.License.SetNonCommercialPersonal("Advance Batch Loader");
}
catch (Exception ex)
{
    Console.WriteLine("EPPlus license error: " + ex.Message);
}

builder.Services.AddControllers();
builder.Services.AddScoped<ArasConnectionService>();
builder.Services.AddScoped<ExcelService>();
builder.Services.AddScoped<ImportService>();

builder.Services.AddCors(options =>
{
    options.AddPolicy("AllowAras", policy =>
    {
        policy
            .WithOrigins(
                "http://localhost",
                "http://localhost:80"
            )
            .AllowAnyHeader()
            .AllowAnyMethod()
            .AllowCredentials();
    });
});

var app = builder.Build();

/// app.UseHttpsRedirection();

app.UseStaticFiles();

app.UseCors("AllowAras");

app.UseAuthorization();

app.MapControllers();

app.MapGet("/", () => "Batch Loader API Running");

app.Run();