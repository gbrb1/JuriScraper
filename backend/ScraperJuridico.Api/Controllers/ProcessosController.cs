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
    /// Lista todos os processos coletados.
    /// </summary>
    [HttpGet]
    [ProducesResponseType(typeof(IEnumerable<ProcessoDto>), StatusCodes.Status200OK)]
    public async Task<IActionResult> ListarTodos()
    {
        _logger.LogInformation("[API] Solicitada listagem de todos os processos.");
        var processos = await _appService.ListarTodosAsync();
        return Ok(processos);
    }

    /// <summary>
    /// Consulta um processo específico pelo número.
    /// </summary>
    /// <param name="numeroProcesso">Número do processo a ser consultado.</param>
    /// <param name="cancellationToken">Token de cancelamento injetado automaticamente pelo .NET Core caso o cliente interrompa a requisição.</param>
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


        //var processoBanco = await _appService.ObterPorNumeroAsync(numeroProcesso.Trim());
        //if (processoBanco != null)
        //{
        //    _logger.LogInformation("[API] Processo {NumeroProcesso} retornado diretamente do banco.", numeroProcesso);
        //    return Ok(processoBanco);
        //}

        try
        {
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
    /// Recebe e persiste um processo coletado no banco de dados.
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
    /// Remove um processo específico do banco de dados e suas respectivas partes relacionadas.
    /// </summary>
    /// <param name="tribunal" example="TJ-SP">Sigla do tribunal de origem do processo.</param>
    /// <param name="numeroProcesso" example="1501983-25.2022.8.26.0022">Número do processo.</param>
    [HttpDelete("{tribunal}/{grau}/{numeroProcesso}")]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public async Task<IActionResult> Excluir(string tribunal, string numeroProcesso, int grau)
    {
        var excluido = await _appService.ExcluirProcessoAsync(numeroProcesso, tribunal, grau);

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