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

        // chave composta p caso tenha + de 1 instancia
        modelBuilder.Entity<Processo>()
            .HasKey(p => new { p.NumeroProcesso, p.Tribunal });

        // relação 1 pra N usando as colunas compostas
        modelBuilder.Entity<Processo>()
            .HasMany(p => p.Partes)
            .WithOne(tp => tp.Processo)
            .HasForeignKey(tp => new { tp.ProcessoNumeroProcesso, tp.Tribunal })
            .OnDelete(DeleteBehavior.Cascade);

        // Mapeamento para aceitar DateTime sem exigir fuso horário UTC (evita o ArgumentException do Npgsql)
        modelBuilder.Entity<Processo>(entity =>
        {
            entity.Property(p => p.DataDistribuicao)
                  .HasColumnType("timestamp without time zone");

            entity.Property(p => p.DataUltimoAndamento)
                  .HasColumnType("timestamp without time zone");
        });
    }
}