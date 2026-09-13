using Microsoft.EntityFrameworkCore;
using ScraperJuridico.Domain.Entities;
using ScraperJuridico.Domain.Interfaces;
using ScraperJuridico.Infrastructure.Data;

namespace ScraperJuridico.Infrastructure.Repositories;

public class ProcessoRepository : IProcessoRepository
{
    private readonly ProcessoDbContext _context;

    public ProcessoRepository(ProcessoDbContext context)
    {
        _context = context;
    }

    public async Task<IEnumerable<Processo>> ObterTodosAsync()
    {
        return await _context.Processos
            .Include(p => p.Partes)
            .ToListAsync();
    }

    public async Task<Processo?> ObterPorNumeroAsync(string numeroProcesso)
    {
        return await _context.Processos
            .Include(p => p.Partes)
            .FirstOrDefaultAsync(p => p.NumeroProcesso == numeroProcesso);
    }

    public async Task SalvarOuAtualizarAsync(Processo processo)
    {
        var existente = await _context.Processos
            .Include(p => p.Partes)
            .FirstOrDefaultAsync(p => p.NumeroProcesso == processo.NumeroProcesso && p.Tribunal == processo.Tribunal && p.Grau == processo.Grau);

        if (existente is null)
        {
            _context.Processos.Add(processo);
        }
        else
        {
            existente.Classe = processo.Classe;
            existente.Assunto = processo.Assunto;
            existente.Foro = processo.Foro;
            existente.DataDistribuicao = processo.DataDistribuicao;
            existente.UltimoAndamento = processo.UltimoAndamento;
            existente.DataUltimoAndamento = processo.DataUltimoAndamento;
            _context.Partes.RemoveRange(existente.Partes);
            existente.Partes = processo.Partes;
        }

        await _context.SaveChangesAsync();
    }

    public async Task<bool> ExcluirAsync(string numeroProcesso, string tribunal, int grau)
    {
        var existente = await _context.Processos
            .Include(p => p.Partes)
            .FirstOrDefaultAsync(p => p.NumeroProcesso == numeroProcesso && p.Tribunal == tribunal && p.Grau == grau);

        if (existente is null)
            return false;

        _context.Processos.Remove(existente);
        await _context.SaveChangesAsync();
        return true;
    }
}