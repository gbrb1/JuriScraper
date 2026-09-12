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
    /// Obtém as opções de grau de jurisdição disponíveis para um processo em andamento.
    /// </summary>
    /// <param name="sessionId">Identificador único da sessão (geralmente os dígitos do número do processo).</param>
    /// <response code="200">Retorna a lista de opções de grau encontradas.</response>
    [HttpGet("opcoes-grau/{sessionId}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    public IActionResult ObterOpcoesGrau(string sessionId)
    {
        var opcoes = _sessionManager.ObterOpcoesGrau(sessionId);
        return Ok(new { Opcoes = opcoes });
    }

    /// <summary>
    /// Registra a escolha de grau/instância selecionada pelo operador para continuar scrapando.
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
    /// Recupera os dados atuais do desafio de CAPTCHA para exibição na interface.
    /// </summary>
    /// <param name="sessionId">Identificador único da sessão.</param>
    /// <response code="200">Retorna a imagem em Base64 e os metadados do CAPTCHA.</response>
    /// <response code="404">Nenhum CAPTCHA ativo encontrado para a sessão informada.</response>
    [HttpGet("{sessionId}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status404NotFound)]
    public IActionResult ObterCaptcha(string sessionId)
    {
        var (imagemBase64, hash, houveErro, mensagemErro, versao) = _sessionManager.ObterDadosCaptcha(sessionId);
        if (imagemBase64 is null)
        {
            return NotFound(new { Mensagem = "Nenhum CAPTCHA ativo para esta sessão." });
        }

        return Ok(new
        {
            Imagem = $"data:image/png;base64,{imagemBase64}",
            Hash = hash,
            HouveErro = houveErro,
            MensagemErro = mensagemErro,
            Versao = versao
        });
    }

    /// <summary>
    /// Envia a resposta digitada pelo usuário para o desafio de CAPTCHA ativo.
    /// </summary>
    /// <param name="sessionId">Identificador único da sessão.</param>
    /// <param name="request">Objeto contendo o texto resolvido do CAPTCHA.</param>
    /// <response code="200">Resposta repassada ao scraper com sucesso.</response>
    /// <response code="400">Texto vazio ou sessão expirada/não encontrada.</response>
    [HttpPost("{sessionId}")]
    [ProducesResponseType(StatusCodes.Status200OK)]
    [ProducesResponseType(StatusCodes.Status400BadRequest)]
    public IActionResult ResponderCaptcha(string sessionId, [FromBody] RespostaCaptchaDto request)
    {
        if (string.IsNullOrWhiteSpace(request?.Texto))
        {
            return BadRequest(new { Mensagem = "O texto do CAPTCHA não pode ser vazio." });
        }

        var resolvido = _sessionManager.ResponderCaptcha(sessionId, request.Texto.Trim());
        if (!resolvido)
        {
            return BadRequest(new { Mensagem = "Sessão expirada ou não encontrada." });
        }

        return Ok(new { Mensagem = "Resposta repassada ao scraper com sucesso." });
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
public record RespostaCaptchaDto(string Texto);