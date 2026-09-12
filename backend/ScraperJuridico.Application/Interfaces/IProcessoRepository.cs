using ScraperJuridico.Domain.Entities;

namespace ScraperJuridico.Domain.Interfaces;

public interface IProcessoRepository
{
    Task<IEnumerable<Processo>> ObterTodosAsync();
    Task<Processo?> ObterPorNumeroAsync(string numeroProcesso);
    Task SalvarOuAtualizarAsync(Processo processo);
    Task<bool> ExcluirAsync(string numeroProcesso, string tribunal);
}
