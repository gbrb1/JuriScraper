using ScraperJuridico.Domain.Entities;

namespace ScraperJuridico.Application.Interfaces;

public interface IScraperService
{
    bool SuportaTribunal(string numeroProcesso);
    Task<Processo> ExtrairProcessoAsync(string numeroProcesso, CancellationToken cancellationToken = default);
}