using ScraperJuridico.Application.Dtos;

namespace ScraperJuridico.Application.Interfaces;

public interface IProcessoAppService
{
    /// <summary>
    /// Retorna todos os processos já salvos no banco para preencher a listagem da tela.
    /// </summary>
    Task<IEnumerable<ProcessoDto>> ListarTodosAsync();

    /// <summary>
    /// Consulta no banco de dados para verificar se o processo já foi coletado, evitando novos scrapes desnecessários[cite: 1].
    /// </summary>
    Task<ProcessoDto?> ObterPorNumeroAsync(string numeroProcesso);

    /// <summary>
    /// Executa o scraping via Playwright (TJSP ou PJe) para um único processo obtendo os dados estritamente em memória, integrado ao CancellationToken para cancelamento[cite: 1].
    /// </summary>
    Task<ResultadoColetaDto> ColetarApenasAsync(string numeroProcesso, CancellationToken cancellationToken = default);

    /// <summary>
    /// Persiste manualmente um processo DTO no banco de dados SQL após confirmação explícita do usuário.
    /// </summary>
    Task<ProcessoDto> SalvarProcessoAsync(ProcessoDto processoDto);

    /// <summary>
    /// Gerencia e executa o processamento da fila de múltiplos processos em lote, respeitando o sinal de cancelamento[cite: 1].
    /// </summary>
    Task<IEnumerable<ResultadoColetaDto>> ColetarEArmazenarProcessosAsync(IEnumerable<string> numerosProcessos, CancellationToken cancellationToken = default);

    /// <summary>
    /// Orquestra a exclusão de um processo e suas partes vinculadas da base de dados.
    /// </summary>
    Task<bool> ExcluirProcessoAsync(string numeroProcesso, string tribunal);
}