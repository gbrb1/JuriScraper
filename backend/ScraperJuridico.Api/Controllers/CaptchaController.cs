using Microsoft.AspNetCore.Mvc;
using ScraperJuridico.Infrastructure.Services;

namespace ScraperJuridico.Api.Controllers;

[ApiController]
[Route("api/[controller]")]
public class CaptchaController : ControllerBase
{
    private readonly CaptchaSessionManager _sessionManager;
    private readonly ILogger<CaptchaController> _logger;

    public CaptchaController(CaptchaSessionManager sessionManager, ILogger<CaptchaController> logger)
    {
        _sessionManager = sessionManager;
        _logger = logger;
    }

    /// <summary>
    /// Consulta se há um desafio de CAPTCHA em resolução para a sessão indicada.
    /// </summary>
    /// <param name="sessionId">Identificador único da sessão (apenas dígitos do processo).</param>
    /// <response code="200">Retorna o estado da tentativa ativa de resolução.</response>
    /// <response code="204">Nenhum CAPTCHA ativo sendo resolvido no momento.</response>
    [HttpGet("status/{sessionId}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status204NoContent)]
    public IActionResult ObterStatus(string sessionId)
    {
        var status = _sessionManager.ObterStatusTentativa(sessionId);
        if (status is null)
        {
            return NoContent();
        }

        return Ok(status);
    }

    /// <summary>
    /// Obtém as opções de grau de jurisdição disponíveis para um processo em andamento.
    /// </summary>
    /// <param name="sessionId">Identificador único da sessão (apenas dígitos do processo).</param>
    /// <response code="200">Retorna a lista de opções de grau encontradas.</response>
    [HttpGet("opcoes-grau/{sessionId}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult ObterOpcoesGrau(string sessionId)
    {
        var opcoes = _sessionManager.ObterOpcoesGrau(sessionId);
        return Ok(new { opcoes });
    }

    /// <summary>
    /// Registra a escolha de grau/instância selecionada pelo operador para continuar a extração.
    /// </summary>
    /// <param name="sessionId">Identificador único da sessão.</param>
    /// <param name="request">Objeto contendo o índice da opção escolhida.</param>
    /// <response code="200">Grau selecionado com êxito.</response>
    /// <response code="400">Sessão não encontrada ou escolha já realizada.</response>
    [HttpPost("selecionar-grau/{sessionId}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public IActionResult SelecionarGrau(string sessionId, [FromBody] EscolhaGrauDto request)
    {
        var sucesso = _sessionManager.SelecionarGrau(sessionId, request.Indice);
        if (!sucesso)
        {
            return BadRequest(new { Mensagem = "Sessão não encontrada ou escolha já realizada." });
        }

        _logger.LogInformation("[SESSAO {SessionId}] Grau selecionado: {Indice}", sessionId, request.Indice);
        return Ok(new { Mensagem = "Grau selecionado com êxito." });
    }

    /// <summary>
    /// Força a limpeza da sessão ativa de CAPTCHA e encerra os rastros do processo em andamento.
    /// </summary>
    /// <param name="numeroProcesso">Número do processo correspondente à sessão que deve ser limpa.</param>
    /// <response code="200">Sessão limpa com sucesso.</response>
    /// <response code="400">Número do processo inválido ou em branco.</response>
    [HttpPost("limpar-sessao/{numeroProcesso}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public IActionResult LimparSessao(string numeroProcesso)
    {
        if (string.IsNullOrWhiteSpace(numeroProcesso))
        {
            return BadRequest(new { Mensagem = "Número do processo inválido." });
        }

        var apenasDigitos = System.Text.RegularExpressions.Regex.Replace(numeroProcesso, @"\D", "");

        _sessionManager.FinalizarSessao(apenasDigitos);

        _logger.LogInformation("[API] Sessão de CAPTCHA/Processo {Numero} limpa manualmente via front-end.", numeroProcesso);
        return Ok(new { Mensagem = "Sessão limpa com sucesso." });
    }
}

public record EscolhaGrauDto(int Indice);