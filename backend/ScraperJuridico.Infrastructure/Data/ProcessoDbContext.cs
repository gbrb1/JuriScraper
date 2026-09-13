using Microsoft.EntityFrameworkCore;
using ScraperJuridico.Domain.Entities;

namespace ScraperJuridico.Infrastructure.Data;

public class ProcessoDbContext : DbContext
{
    public DbSet<Processo> Processos { get; set; }
    public DbSet<ParteProcesso> Partes { get; set; }

    public ProcessoDbContext(DbContextOptions<ProcessoDbContext> options) : base(options) { }

    protected override void OnModelCreating(ModelBuilder modelBuilder)
    {
        base.OnModelCreating(modelBuilder);

        // Chave primária composta suportando múltiplas instâncias (1º, 2º grau)
        modelBuilder.Entity<Processo>()
            .HasKey(p => new { p.NumeroProcesso, p.Tribunal, p.Grau });

        // Relação 1 pra N com chave estrangeira composta de 3 colunas
        modelBuilder.Entity<Processo>()
            .HasMany(p => p.Partes)
            .WithOne(tp => tp.Processo)
            .HasForeignKey(tp => new { tp.ProcessoNumeroProcesso, tp.Tribunal, tp.Grau })
            .OnDelete(DeleteBehavior.Cascade);

        // Mapeamento para aceitar DateTime sem exigir fuso horário UTC (evita ArgumentException do Npgsql no PostgreSQL)
        modelBuilder.Entity<Processo>(entity =>
        {
            entity.Property(p => p.DataDistribuicao)
                  .HasColumnType("timestamp without time zone");

            entity.Property(p => p.DataUltimoAndamento)
                  .HasColumnType("timestamp without time zone");
        });
    }
}