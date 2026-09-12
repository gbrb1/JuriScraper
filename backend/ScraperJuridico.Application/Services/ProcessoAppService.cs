using ScraperJuridico.Application.Dtos;
using ScraperJuridico.Application.Interfaces;
using ScraperJuridico.Domain.Entities;
using ScraperJuridico.Domain.Interfaces;

namespace ScraperJuridico.Application.Services;

public class ProcessoAppService : IProcessoAppService
{
    private readonly IProcessoRepository _repository;
    private readonly IScraperFactory _scraperFactory;

    public ProcessoAppService(
        IProcessoRepository repository,
        IScraperFactory scraperFactory)
    {
        _repository = repository;
        _scraperFactory = scraperFactory;
    }

    public async Task<IEnumerable<ProcessoDto>> ListarTodosAsync()
    {
        var processos = await _repository.ObterTodosAsync();
        return processos.Select(MapearParaDto);
    }

    public async Task<ProcessoDto?> ObterPorNumeroAsync(string numeroProcesso)
    {
        var processo = await _repository.ObterPorNumeroAsync(numeroProcesso);
        return processo is null ? null : MapearParaDto(processo);
    }

    public async Task<ResultadoColetaDto> ColetarApenasAsync(string numeroProcesso, CancellationToken cancellationToken = default)
    {
        var numeroLimpo = numeroProcesso?.Trim() ?? string.Empty;

        if (string.IsNullOrWhiteSpace(numeroLimpo))
        {
            return new ResultadoColetaDto(
                NumeroProcesso: numeroLimpo,
                Sucesso: false,
                Mensagem: "Número de processo não informado."
            );
        }

        try
        {
            var scraper = _scraperFactory.ObterScraper(numeroLimpo);

            // Repassando o CancellationToken para o scraper (Playwright)
            var processoColetado = await scraper.ExtrairProcessoAsync(numeroLimpo, cancellationToken);

            if (processoColetado is null)
            {
                return new ResultadoColetaDto(
                    NumeroProcesso: numeroLimpo,
                    Sucesso: false,
                    Mensagem: "Processo não localizado no tribunal consultado."
                );
            }

            // Removido o salvamento automático para garantir que a persistência ocorra apenas sob demanda

            return new ResultadoColetaDto(
                NumeroProcesso: numeroLimpo,
                Sucesso: true,
                Mensagem: "Processo coletado com sucesso em memória.",
                Processo: MapearParaDto(processoColetado)
            );
        }
        catch (OperationCanceledException)
        {
            // Tratamento específico para quando o usuário cancela a execução
            return new ResultadoColetaDto(
                NumeroProcesso: numeroLimpo,
                Sucesso: false,
                Mensagem: "Operação cancelada pelo usuário."
            );
        }
        catch (NotSupportedException ex)
        {
            return new ResultadoColetaDto(
                NumeroProcesso: numeroLimpo,
                Sucesso: false,
                Mensagem: ex.Message
            );
        }
        catch (Exception ex)
        {
            return new ResultadoColetaDto(
                NumeroProcesso: numeroLimpo,
                Sucesso: false,
                Mensagem: $"Falha durante a extração: {ex.Message}"
            );
        }
    }

    public async Task<ProcessoDto> SalvarProcessoAsync(ProcessoDto processoDto)
    {
        var processoEntity = new Processo
        {
            NumeroProcesso = processoDto.NumeroProcesso,
            Tribunal = processoDto.Tribunal,
            Classe = processoDto.Classe,
            Assunto = processoDto.Assunto,
            Foro = processoDto.Foro,
            DataDistribuicao = processoDto.DataDistribuicao,
            UltimoAndamento = processoDto.UltimoAndamento,
            DataUltimoAndamento = processoDto.DataUltimoAndamento,
            Partes = processoDto.Partes?.Select(p => new ParteProcesso { Tipo = p.Tipo, Nome = p.Nome }).ToList() ?? new()
        };

        await _repository.SalvarOuAtualizarAsync(processoEntity);
        return MapearParaDto(processoEntity);
    }

    public async Task<IEnumerable<ResultadoColetaDto>> ColetarEArmazenarProcessosAsync(IEnumerable<string> numerosProcessos, CancellationToken cancellationToken = default)
    {
        var resultados = new List<ResultadoColetaDto>();

        foreach (var numero in numerosProcessos)
        {
            // Interrompe imediatamente o loop do lote se o usuário cancelar
            cancellationToken.ThrowIfCancellationRequested();

            var resultado = await ColetarApenasAsync(numero, cancellationToken);
            resultados.Add(resultado);
        }

        return resultados;
    }

    private static ProcessoDto MapearParaDto(Processo processo)
    {
        return new ProcessoDto(
            NumeroProcesso: processo.NumeroProcesso,
            Tribunal: processo.Tribunal,
            Classe: processo.Classe,
            Assunto: processo.Assunto,
            Foro: processo.Foro,
            DataDistribuicao: processo.DataDistribuicao,
            UltimoAndamento: processo.UltimoAndamento,
            DataUltimoAndamento: processo.DataUltimoAndamento,
            Partes: processo.Partes.Select(p => new ParteDto(p.Tipo, p.Nome)).ToList()
        );
    }
    public async Task<bool> ExcluirProcessoAsync(string numeroProcesso, string tribunal)
    {
        return await _repository.ExcluirAsync(numeroProcesso, tribunal);
    }
}