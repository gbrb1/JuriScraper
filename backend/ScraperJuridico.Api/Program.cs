using Microsoft.EntityFrameworkCore;
using ScraperJuridico.Application.Interfaces;
using ScraperJuridico.Application.Services;
using ScraperJuridico.Domain.Interfaces;
using ScraperJuridico.Infrastructure.Data;
using ScraperJuridico.Infrastructure.Factories;
using ScraperJuridico.Infrastructure.Repositories;
using ScraperJuridico.Infrastructure.Scrapers;
using ScraperJuridico.Infrastructure.Services;

var builder = WebApplication.CreateBuilder(args);

// Add services to the container
builder.Services.AddControllers();
builder.Services.AddEndpointsApiExplorer();
builder.Services.AddSwaggerGen();

// Configuração do PostgreSQL via EF Core
builder.Services.AddDbContext<ProcessoDbContext>(options =>
    options.UseNpgsql(builder.Configuration.GetConnectionString("DefaultConnection")));

// Registro do Repositório
builder.Services.AddScoped<IProcessoRepository, ProcessoRepository>();

// Registro do serviço de aplicação
builder.Services.AddScoped<IProcessoAppService, ProcessoAppService>();
builder.Services.AddScoped<IScraperFactory, ScraperFactory>();

// Gerenciador de Sessão (Graus de jurisdição e status das tentativas em memória)
builder.Services.AddSingleton<CaptchaSessionManager>();

// Solver local ONNX
string onnxPath = Path.Combine(AppContext.BaseDirectory, "MlModels", "trt.onnx");
builder.Services.AddSingleton<ICaptchaSolverService>(sp => new OnnxCaptchaSolverService(onnxPath));

builder.Services.AddScoped<IScraperService, TjspScraper>();
builder.Services.AddScoped<IScraperService, PjeTrtScraper>();

// libera requisições vindas do frontend
builder.Services.AddCors(options =>
{
    options.AddPolicy("Frontend", policy =>
    {
        policy
            .WithOrigins("http://localhost:5173",
                         "http://localhost:3000")
            .AllowAnyHeader()
            .AllowAnyMethod();
    });
});

var app = builder.Build();

// APLICAÇÃO AUTOMÁTICA DE MIGRATIONS
using (var scope = app.Services.CreateScope())
{
    var db = scope.ServiceProvider.GetRequiredService<ProcessoDbContext>();
    db.Database.Migrate();
}

// Configuração do Swagger
app.UseSwagger();
app.UseSwaggerUI();

app.UseCors("Frontend");
app.UseAuthorization();
app.MapControllers();

app.Run();