using Microsoft.AspNetCore.Mvc;
using ScraperJuridico.Application.Dtos;
using ScraperJuridico.Application.Interfaces;

namespace ScraperJuridico.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class ProcessosController : ControllerBase
{
    private readonly IProcessoAppService _appService;
    private readonly ILogger<ProcessosController> _logger;

    public ProcessosController(IProcessoAppService appService, ILogger<ProcessosController> logger)
    {
        _appService = appService;
        _logger = logger;
    }

    /// <summary>
    /// Lista todos os processos coletados e persistidos no banco SQL.
    /// Atende ao requisito do teste: GET /processos
    /// </summary>
    /// <response code="200">Retorna a lista de processos cadastrados no banco.</response>
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<ProcessoDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> ListarTodos()
    {
        _logger.LogInformation("[API] Solicitada listagem de todos os processos persistidos.");
        var processos = await _appService.ListarTodosAsync();
        return Ok(processos);
    }

    /// <summary>
    /// Consulta um processo específico pelo número CNJ.
    /// Se já existir no banco, retorna os dados persistidos; caso contrário, executa a coleta apenas em memória.
    /// Atende ao requisito do teste: GET /processos/{numeroProcesso}
    /// </summary>
    /// <param name="numeroProcesso">Número CNJ do processo a ser consultado.</param>
    /// <param name="cancellationToken">Token de cancelamento injetado automaticamente pelo ASP.NET Core caso o cliente interrompa a requisição.</param>
    /// <response code="200">Retorna os dados detalhados do processo (via banco ou após raspagem em memória).</response>
    /// <response code="400">O número do processo é inválido ou ocorreu erro de validação.</response>
    /// <response code="404">Processo não encontrado ou inexistente no tribunal.</response>
    /// <response code="499">Operação cancelada pelo cliente (front-end).</response>
    /// <response code="500">Erro interno no servidor durante o processamento.</response>
    [HttpGet("{numeroProcesso}")]
    [ProducesResponseType(typeof(ProcessoDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    [ProducesResponseType(StatusCodes.Status500InternalServerError)]
    public async Task<IActionResult> ConsultarPorNumero(string numeroProcesso, CancellationToken cancellationToken)
    {
        if (string.IsNullOrWhiteSpace(numeroProcesso))
        {
            return BadRequest(new { Mensagem = "O número do processo não pode ser vazio." });
        }

        _logger.LogInformation("[API] Consultando processo: {NumeroProcesso}", numeroProcesso);

        // 1. Tenta buscar no banco primeiro
        var processoBanco = await _appService.ObterPorNumeroAsync(numeroProcesso.Trim());
        if (processoBanco != null)
        {
            _logger.LogInformation("[API] Processo {NumeroProcesso} retornado diretamente do banco.", numeroProcesso);
            return Ok(processoBanco);
        }

        try
        {
            // 2. Se não estiver no banco, executa a extração via tribunal estritamente em memória
            var resultadoColeta = await _appService.ColetarApenasAsync(numeroProcesso.Trim(), cancellationToken);

            if (!resultadoColeta.Sucesso)
            {
                return BadRequest(new { Mensagem = resultadoColeta.Mensagem });
            }

            return Ok(resultadoColeta.Processo);
        }
        catch (KeyNotFoundException ex)
        {
            _logger.LogWarning("[API] Processo {NumeroProcesso} não localizado: {Mensagem}", numeroProcesso, ex.Message);
            return NotFound(new { Mensagem = ex.Message });
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("[API] A extração do processo {NumeroProcesso} foi cancelada pelo usuário.", numeroProcesso);
            return StatusCode(499, new { Mensagem = "Operação cancelada pelo cliente." });
        }
        catch (Exception ex)
        {
            _logger.LogError(ex, "[API] Erro inesperado ao consultar o processo {NumeroProcesso}.", numeroProcesso);
            return StatusCode(StatusCodes.Status500InternalServerError, new { Mensagem = ex.Message });
        }
    }

    /// <summary>
    /// Recebe e persiste manualmente um processo coletado no banco de dados SQL através da ação do usuário.
    /// Atende ao requisito do teste: POST /processos/salvar
    /// </summary>
    [HttpPost("salvar")]
    [ProducesResponseType(typeof(ProcessoDto), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> SalvarProcesso([FromBody] ProcessoDto dto)
    {
        if (dto == null || string.IsNullOrWhiteSpace(dto.NumeroProcesso))
        {
            return BadRequest(new { Mensagem = "Dados do processo inválidos para salvamento." });
        }

        _logger.LogInformation("[API] Solicitação manual para salvar o processo: {NumeroProcesso}", dto.NumeroProcesso);
        var processoSalvo = await _appService.SalvarProcessoAsync(dto);
        return Ok(processoSalvo);
    }

    /// <summary>
    /// Executa coleta em lote para uma lista de números processuais.
    /// </summary>
    /// <param name="numerosProcessos">Lista contendo os números CNJ dos processos que devem ser processados na fila.</param>
    /// <param name="cancellationToken">Token de cancelamento para interromper o lote caso o operador solicite.</param>
    /// <response code="200">Retorna o resultado consolidado da extração de cada item da fila.</response>
    /// <response code="400">A lista de processos enviada é nula ou vazia.</response>
    /// <response code="499">Processamento em lote cancelado pelo cliente.</response>
    [HttpPost("consultar-lote")]
    [ProducesResponseType(typeof(IEnumerable<ResultadoColetaDto>), StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public async Task<IActionResult> ConsultarLote([FromBody] List<string> numerosProcessos, CancellationToken cancellationToken)
    {
        if (numerosProcessos == null || numerosProcessos.Count == 0)
        {
            return BadRequest(new { Mensagem = "A lista de processos não pode ser vazia." });
        }

        _logger.LogInformation("[API LOTE] Processando lote com {Total} processos via Application Service.", numerosProcessos.Count);

        try
        {
            var resultados = await _appService.ColetarEArmazenarProcessosAsync(numerosProcessos, cancellationToken);
            return Ok(resultados);
        }
        catch (OperationCanceledException)
        {
            _logger.LogWarning("[API LOTE] O processamento em lote foi cancelado pelo usuário.");
            return StatusCode(499, new { Mensagem = "Operação em lote cancelada pelo cliente." });
        }
    }

    /// <summary>
    /// Remove um processo específico do banco de dados e suas respectivas partes relacionadas.
    /// </summary>
    /// <param name="tribunal" example="TJ-SP">Sigla do tribunal de origem do processo judicial.</param>
    /// <param name="numeroProcesso" example="1501983-25.2022.8.26.0022">Número identificador único CNJ do processo.</param>
    /// <response code="204">Processo e partes excluídos com sucesso.</response>
    /// <response code="404">Processo não localizado para os parâmetros informados.</response>
    [HttpDelete("{tribunal}/{numeroProcesso}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Excluir(string tribunal, string numeroProcesso)
    {
        var excluido = await _appService.ExcluirProcessoAsync(numeroProcesso, tribunal);

        if (!excluido)
        {
            return NotFound(new
            {
                mensagem = $"Nenhum registro encontrado para o processo '{numeroProcesso}' no tribunal '{tribunal}'."
            });
        }

        return NoContent();
    }
}