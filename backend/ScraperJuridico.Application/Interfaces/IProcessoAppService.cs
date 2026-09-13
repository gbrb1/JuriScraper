using ScraperJuridico.Application.Dtos;

namespace ScraperJuridico.Application.Interfaces;

public interface IProcessoAppService
{
    /// <summary>
    /// Retorna todos os processos já salvos no banco para preencher a listagem da tela.
    /// </summary>
    Task<IEnumerable<ProcessoDto>> ListarTodosAsync();

    /// <summary>
    /// Consulta no banco de dados pelo processo.
    /// </summary>
    Task<ProcessoDto?> ObterPorNumeroAsync(string numeroProcesso);

    /// <summary>
    /// Executa o scraping via Playwright (TJSP ou PJe) para um único processo, também utilizando sinal de cancelamento.
    /// </summary>
    Task<ResultadoColetaDto> ColetarApenasAsync(string numeroProcesso, CancellationToken cancellationToken = default);

    /// <summary>
    /// Persiste manualmente um processo DTO no banco de dados após confirmação do usuário.
    /// </summary>
    Task<ProcessoDto> SalvarProcessoAsync(ProcessoDto processoDto);


    /// <summary>
    /// Orquestra a exclusão de um processo e suas partes vinculadas do banco.
    /// </summary>
    Task<bool> ExcluirProcessoAsync(string numeroProcesso, string tribunal, int grau);
}